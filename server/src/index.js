import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import bcrypt from 'bcryptjs'
import { initDb, queryAll, getSetting, isSetupComplete } from './db.js'
import gamesRouter from './routes/games.js'
import adminRouter from './routes/admin.js'
import setupRouter from './routes/setup.js'
import { scanGames, startWatcher, getCategories, getScanStatus } from './scanner.js'
import cloudSaveRouter from './routes/cloud-save.js'
import swfResourceProxy from './routes/swf-resource-proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3000
const GAME_DIR = process.env.GAME_DIR || path.resolve(__dirname, '..', '..', 'game')

// 全局游戏统计
let gameTotal = 0

function triggerNewGameAutoScrape(result) {
  const ids = Array.isArray(result?.addedIds) ? result.addedIds.filter(Boolean) : []
  if (!ids.length) return
  setTimeout(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/games/scrape/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, batchSize: Math.min(100, ids.length), delayMs: 1800, restMs: 15 * 60 * 1000 }),
      })
      if (r.status === 409) console.log('新增游戏自动刮削跳过：已有刮削任务在运行')
      else console.log(`新增游戏自动刮削已触发: ${ids.length} 个`)
    } catch (err) {
      console.warn('新增游戏自动刮削触发失败:', err.message)
    }
  }, 5000)
}

// ============ 安全中间件 ============

// Helmet：安全响应头（防 XSS、点击劫持、MIME 嗅探等）
app.use(helmet({
  contentSecurityPolicy: false, // CSP 由前端 Vite 处理，避免冲突
  crossOriginEmbedderPolicy: false,
}))

// CORS：允许常见来源（本地开发 + 局域网 + 反向代理）
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true // 默认允许所有（Docker 部署时通过反向代理控制）
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  maxAge: 86400,
}))

// 请求体大小限制（防大包 DOS）
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false, limit: '10mb' }))

// 全局限流：每个 IP 每分钟最多 600 次请求
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
})
app.use(globalLimiter)

// 登录/解锁接口限流：每分钟最多 10 次（防暴力破解）
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '尝试次数过多，请1分钟后再试' },
})

// 管理接口限流：每分钟最多 100 次
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试' },
})

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
  next()
})

// ============ 静态文件服务 ============

// SWF 游戏文件服务
app.use('/game', express.static(GAME_DIR, {
  setHeaders: (res) => {
    res.set('Content-Type', 'application/x-shockwave-flash')
    res.set('Cache-Control', 'public, max-age=86400')
  },
}))

// 刮削封面静态文件
app.use('/covers', express.static(path.resolve(__dirname, '..', '..', 'data', 'covers'), {
  setHeaders: (res) => { res.set('Cache-Control', 'public, max-age=2592000') },
}))

// 生产环境：前端静态文件
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  console.log(`前端静态文件: ${clientDist}`)
}

// ============ API 路由 ============

// 游戏查询 API（公网暴露）
app.use('/api/games', gamesRouter)

// 安装引导（限流 + 防止重复安装）
app.use('/api/setup', authLimiter, setupRouter)

// 公开：获取前端锁状态（含 lockHash 用于检测密码变更）
app.get('/api/settings/lock', (req, res) => {
  const lockEnabled = getSetting('lock_enabled') === '1'
  const lockPasswordHash = getSetting('lock_password_hash') || ''
  // 取 bcrypt 哈希前 20 位作为版本标识，密码变更后哈希完全不同，前端旧解锁自动失效
  const lockHash = lockPasswordHash ? lockPasswordHash.substring(0, 20) : ''
  res.json({ lockEnabled, lockHash })
})

// 公开：前端锁密码验证（限流防爆破）
app.post('/api/unlock', authLimiter, async (req, res) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ error: '请输入密码' })

    const hash = getSetting('lock_password_hash')
    if (!hash) return res.status(400).json({ error: '系统未配置前端锁密码' })

    const valid = await bcrypt.compare(password, hash)
    if (valid) {
      res.json({ success: true })
    } else {
      res.status(401).json({ error: '密码错误' })
    }
  } catch (err) {
    console.error('解锁验证失败:', err)
    res.status(500).json({ error: '验证失败' })
  }
})

// 分类查询（categories 表 + 游戏 tags 合并去重）
app.get('/api/categories', (req, res) => {
  const fromTags = getCategories() // 来自游戏标签
  const fromTable = queryAll('SELECT name FROM categories ORDER BY name')

  const catSet = new Set()
  fromTable.forEach(r => catSet.add(r.name))
  fromTags.forEach(r => catSet.add(r.name))

  res.json(Array.from(catSet).sort())
})

// 扫描状态（前端轮询，显示进度条）
app.get('/api/scan/status', (req, res) => {
  res.json(getScanStatus())
})

// 统计信息
app.get('/api/stats', (req, res) => {
  const categories = getCategories()
  const catMap = {}
  categories.forEach(c => { catMap[c.name] = c.count })
  res.json({ total: gameTotal, categories: catMap })
})

// 管理 API（JWT 鉴权 + 接口限流）
app.use('/api/admin', adminLimiter, adminRouter)

// 云存档 API
app.use('/api', cloudSaveRouter)

// SWF 相对资源兼容代理
app.use(swfResourceProxy)

// ============ SPA fallback ============
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/game')) return
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ============ 启动 ============
async function start() {
  console.log('='.repeat(50))
  console.log('  Flash Games Server')
  console.log('='.repeat(50))

  // 初始化数据库
  await initDb()

  // ===== 先启动 HTTP 服务，确保外部立即可访问 =====
  const server = app.listen(PORT, () => {
    console.log(`API 服务已启动: http://localhost:${PORT}`)
    console.log(`游戏目录: ${GAME_DIR}`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ 端口 ${PORT} 已被占用，请先关闭占用进程：`)
      console.error(`   Windows: netstat -ano | findstr :${PORT}`)
      console.error(`   然后:   taskkill /F /PID <PID>`)
    } else {
      console.error('服务器错误:', err)
    }
    process.exit(1)
  })

  // ===== 异步扫描游戏目录（分批处理，不阻塞 HTTP） =====
  console.log('\n正在扫描游戏目录...')
  scanGames((result) => {
    gameTotal = result.total
    console.log(`扫描完成: 共 ${result.total} 个可用游戏`)
    console.log(`新增 ${result.added} 个, 缺失 ${result.removed} 个\n`)
    triggerNewGameAutoScrape(result)

    // 扫描完成后启动文件监听
    startWatcher((res) => {
      gameTotal = res.total
      triggerNewGameAutoScrape(res)
    })
  })
}

start().catch(err => {
  console.error('启动失败:', err)
  process.exit(1)
})
