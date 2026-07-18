import { Router } from 'express'
import { queryAll, queryOne, execute } from '../db.js'
import { scrapeGameById, getScrapeCandidates, applyScrapeCandidate } from '../scraper.js'

const router = Router()

const autoScrapeStatus = {
  running: false,
  stopRequested: false,
  startedAt: '',
  finishedAt: '',
  restingUntil: '',
  batchSize: 100,
  delayMs: 1500,
  restMs: 900000,
  source: '',
  totalDone: 0,
  totalSuccess: 0,
  totalFailed: 0,
  batchNo: 0,
  current: null,
  lastError: '',
  message: '',
  results: [],
  idsOnly: [],
}


const batchScrapeStatus = {
  running: false,
  startedAt: '',
  finishedAt: '',
  total: 0,
  done: 0,
  success: 0,
  failed: 0,
  current: null,
  lastError: '',
  results: [],
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
async function sleepUntil(ms, shouldStop) {
  const end = Date.now() + Math.max(0, ms)
  while (Date.now() < end) {
    if (shouldStop && shouldStop()) return false
    await sleep(Math.min(1000, end - Date.now()))
  }
  return true
}
function pendingRows(limit, onlyIds = []) {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 100))
  if (onlyIds.length) {
    const ids = onlyIds.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0).slice(0, safeLimit)
    if (!ids.length) return []
    return queryAll("SELECT id, name FROM games WHERE active=1 AND (scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='') AND id IN (" + ids.map(() => '?').join(',') + ") ORDER BY id DESC LIMIT " + safeLimit, ids)
  }
  return queryAll("SELECT id, name FROM games WHERE active=1 AND (scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='') ORDER BY id DESC LIMIT " + safeLimit)
}
function resetBatchStatus(total) {
  batchScrapeStatus.running = true
  batchScrapeStatus.startedAt = new Date().toISOString()
  batchScrapeStatus.finishedAt = ''
  batchScrapeStatus.total = total
  batchScrapeStatus.done = 0
  batchScrapeStatus.success = 0
  batchScrapeStatus.failed = 0
  batchScrapeStatus.current = null
  batchScrapeStatus.lastError = ''
  batchScrapeStatus.results = []
}

// 转义 HTML 特殊字符（防 XSS）
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 允许的排序字段白名单
const ALLOWED_SORTS = new Set([
  'id_asc', 'id_desc',
  'name_asc', 'name_desc',
  'size_asc', 'size_desc',
  'date_asc', 'date_desc',
])

/**
 * GET /api/games - 获取游戏列表
 * 支持: keyword, category (匹配 tags), ids (逗号分隔ID列表), sort, page, limit
 */
router.get('/', (req, res) => {
  const {
    keyword = '',
    category = '',
    metadataStatus = '',
    ids = '',
    sort = 'id_desc',
    page = 1,
    limit = 100,
  } = req.query

  // 参数校验
  const pageNum = Math.max(1, parseInt(page) || 1)
  const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 30))
  const sortStr = ALLOWED_SORTS.has(sort) ? sort : 'name_asc'
  const keywordStr = String(keyword).trim().slice(0, 100)
  const categoryStr = String(category).trim().slice(0, 50)
  const metadataStatusStr = String(metadataStatus).trim().toLowerCase()

  const conditions = ['active = 1']
  const params = []

  if (keywordStr) {
    conditions.push('name LIKE ?')
    params.push(`%${keywordStr}%`)
  }

  if (categoryStr) {
    conditions.push('tags LIKE ?')
    params.push(`%${categoryStr}%`)
  }

  if (metadataStatusStr === 'scraped') {
    conditions.push("((cover_url IS NOT NULL AND cover_url!='') OR (description IS NOT NULL AND description!='') OR scrape_status='scraped')")
  } else if (metadataStatusStr === 'pending') {
    conditions.push("(scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='')")
  } else if (metadataStatusStr === 'failed') {
    conditions.push("scrape_status='failed'")
  }

  // 收藏/指定ID查询
  const idList = String(ids).trim()
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
  if (idList.length > 0) {
    const placeholders = idList.map(() => '?').join(',')
    conditions.push(`id IN (${placeholders})`)
    params.push(...idList)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  let orderBy = 'id DESC'
  switch (sortStr) {
    case 'id_asc':    orderBy = 'id ASC'; break
    case 'id_desc':   orderBy = 'id DESC'; break
    case 'name_desc': orderBy = 'name DESC'; break
    case 'size_desc': orderBy = 'size DESC'; break
    case 'size_asc':  orderBy = 'size ASC'; break
    case 'date_desc': orderBy = 'created_at DESC'; break
    case 'date_asc':  orderBy = 'created_at ASC'; break
	// name_asc, id_desc (default) → already handled
  }

  const countResult = queryOne(`SELECT COUNT(*) as total FROM games ${where}`, params)
  const total = countResult ? countResult.total : 0

  const offset = (pageNum - 1) * limitNum
  // 使用参数化查询，LIMIT/OFFSET 经过 parseInt 验证后安全拼接
  const dataSql = `SELECT id, filename, filepath, name, category, tags, size, md5, active, created_at, updated_at, cover_url, description, controls, source_name, source_url, scraped_at, scrape_status, scrape_error FROM games ${where} ORDER BY ${orderBy} LIMIT ${limitNum} OFFSET ${offset}`
  const games = queryAll(dataSql, params)

  // XSS 过滤输出
  const safeGames = games.map(g => ({
    ...g,
    name: escapeHtml(g.name),
    tags: escapeHtml(g.tags),
    category: escapeHtml(g.category),
    filename: escapeHtml(g.filename),
  }))

  res.json({ games: safeGames, total, page: pageNum, limit: limitNum })
})



/**
 * GET /api/games/scrape/status-counts - 元数据刮削状态计数
 */
router.get('/scrape/status-counts', (req, res) => {
  const total = queryOne("SELECT COUNT(*) as n FROM games WHERE active=1")?.n || 0
  const scraped = queryOne("SELECT COUNT(*) as n FROM games WHERE active=1 AND (((cover_url IS NOT NULL AND cover_url!='') OR (description IS NOT NULL AND description!='') OR scrape_status='scraped'))")?.n || 0
  const failed = queryOne("SELECT COUNT(*) as n FROM games WHERE active=1 AND scrape_status='failed'")?.n || 0
  const pending = queryOne("SELECT COUNT(*) as n FROM games WHERE active=1 AND (scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='')")?.n || 0
  res.json({ total, scraped, pending, failed })
})


/**
 * GET /api/games/scrape/auto/status - 获取自动连续刮削状态
 */
router.get('/scrape/auto/status', (req, res) => {
  res.json(autoScrapeStatus)
})

/**
 * POST /api/games/scrape/auto/stop - 停止自动连续刮削
 */
router.post('/scrape/auto/stop', (req, res) => {
  autoScrapeStatus.stopRequested = true
  autoScrapeStatus.restingUntil = ''
  autoScrapeStatus.message = autoScrapeStatus.current ? '已请求停止，当前游戏处理完后停止' : '已请求停止，正在退出'
  res.json({ success: true, status: autoScrapeStatus })
})

/**
 * POST /api/games/scrape/auto - 自动连续刮削待刮削队列
 * Body: { batchSize?: number, delayMs?: number, restMs?: number, source?: string }
 */
router.post('/scrape/auto', (req, res) => {
  if (autoScrapeStatus.running) return res.status(409).json({ error: '自动刮削正在运行', status: autoScrapeStatus })
  if (batchScrapeStatus.running) return res.status(409).json({ error: '批量刮削正在运行', status: batchScrapeStatus })
  const body = req.body || {}
  const batchSize = Math.min(100, Math.max(1, parseInt(body.batchSize || body.limit) || 100))
  const delayMs = Math.min(10000, Math.max(800, parseInt(body.delayMs) || 1800))
  const restMs = Math.min(3600000, Math.max(60000, parseInt(body.restMs) || 900000))
  const source = String(body.source || '').trim().toLowerCase()
  Object.assign(autoScrapeStatus, {
    running: true,
    stopRequested: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    restingUntil: '',
    batchSize,
    delayMs,
    restMs,
    source,
    totalDone: 0,
    totalSuccess: 0,
    totalFailed: 0,
    batchNo: 0,
    current: null,
    lastError: '',
    message: '自动刮削已启动',
    results: [],
    idsOnly: Array.isArray(body.ids) ? body.ids.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0).slice(0, 1000) : [],
  })
  res.json({ success: true, message: '自动刮削已启动', status: autoScrapeStatus })
  ;(async () => {
    try {
      while (!autoScrapeStatus.stopRequested) {
        const rows = pendingRows(batchSize, autoScrapeStatus.idsOnly)
        if (!rows.length) { autoScrapeStatus.message = autoScrapeStatus.idsOnly.length ? '新增游戏待刮削队列已清空' : '待刮削队列已清空'; break }
        autoScrapeStatus.batchNo++
        let batchDone = 0, batchSuccess = 0, batchFailed = 0, streakFailed = 0
        const processedIds = new Set()
        for (const row of rows) {
          if (autoScrapeStatus.stopRequested) break
          autoScrapeStatus.current = { id: row.id, name: row.name }
          try {
            const result = await scrapeGameById(row.id, { source: source || undefined })
            batchDone++; autoScrapeStatus.totalDone++
            if (result.success) { batchSuccess++; autoScrapeStatus.totalSuccess++; streakFailed = 0 }
            else { batchFailed++; autoScrapeStatus.totalFailed++; streakFailed++ }
            autoScrapeStatus.results.push({ id: row.id, name: row.name, success: !!result.success, message: result.message || '', sourceUrl: result.metadata?.sourceUrl || '', coverUrl: result.coverUrl || '' })
          } catch (err) {
            batchDone++; batchFailed++; streakFailed++; autoScrapeStatus.totalDone++; autoScrapeStatus.totalFailed++
            autoScrapeStatus.lastError = err.message || String(err)
            try { execute('UPDATE games SET scrape_status=\'failed\', scrape_error=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?', [autoScrapeStatus.lastError, row.id]) } catch {}
            autoScrapeStatus.results.push({ id: row.id, name: row.name, success: false, message: autoScrapeStatus.lastError })
          }
          processedIds.add(row.id)
          if (autoScrapeStatus.results.length > 80) autoScrapeStatus.results.shift()
          const failRate = batchDone >= 10 ? batchFailed / batchDone : 0
          if (streakFailed >= 8 || failRate >= 0.8) {
            autoScrapeStatus.message = '失败率异常，疑似被限制，自动静置后继续'
            autoScrapeStatus.restingUntil = new Date(Date.now() + restMs).toISOString()
            autoScrapeStatus.current = null
            await sleepUntil(restMs, () => autoScrapeStatus.stopRequested)
            autoScrapeStatus.restingUntil = ''
            break
          }
          await sleep(delayMs)
        }
        autoScrapeStatus.current = null
        if (autoScrapeStatus.stopRequested) break
        if (autoScrapeStatus.idsOnly.length) {
          autoScrapeStatus.idsOnly = autoScrapeStatus.idsOnly.filter(id => !processedIds.has(id))
          if (!autoScrapeStatus.idsOnly.length) { autoScrapeStatus.message = '新增游戏自动刮削完成'; break }
        }
        if (batchDone === rows.length) {
          autoScrapeStatus.message = '本批完成，安全静置后继续下一批'
          autoScrapeStatus.restingUntil = new Date(Date.now() + restMs).toISOString()
          await sleepUntil(restMs, () => autoScrapeStatus.stopRequested)
          autoScrapeStatus.restingUntil = ''
        }
      }
    } finally {
      autoScrapeStatus.running = false
      autoScrapeStatus.current = null
      autoScrapeStatus.finishedAt = new Date().toISOString()
      if (autoScrapeStatus.stopRequested) autoScrapeStatus.message = '已停止自动刮削'
    }
  })()
})

/**
 * GET /api/games/scrape/batch/status - 获取批量刮削状态
 */
router.get('/scrape/batch/status', (req, res) => {
  res.json(batchScrapeStatus)
})

/**
 * POST /api/games/scrape/batch - 后台批量刮削
 * Body: { ids?: number[], limit?: number, missingOnly?: boolean, source?: '4399'|'7k7k'|'oldswf', delayMs?: number }
 */
router.post('/scrape/batch', (req, res) => {
  if (batchScrapeStatus.running) return res.status(409).json({ error: '批量刮削正在运行', status: batchScrapeStatus })
  if (autoScrapeStatus.running) return res.status(409).json({ error: '自动刮削正在运行', status: autoScrapeStatus })
  const body = req.body || {}
  const limit = Math.min(100, Math.max(1, parseInt(body.limit) || 20))
  const delayMs = Math.min(10000, Math.max(500, parseInt(body.delayMs) || 1500))
  const missingOnly = body.missingOnly !== false
  const source = String(body.source || '').trim().toLowerCase()
  const rawIds = Array.isArray(body.ids) ? body.ids : []
  let rows
  if (rawIds.length) {
    const ids = rawIds.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0).slice(0, limit)
    if (!ids.length) return res.status(400).json({ error: 'ids 为空' })
    const conditions = [`id IN (${ids.map(() => '?').join(',')})`]
    const params = [...ids]
    if (missingOnly) conditions.push("(scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='')")
    rows = queryAll(`SELECT id, name FROM games WHERE active=1 AND ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`, params)
  } else {
    const where = missingOnly ? "WHERE active=1 AND (scrape_status IS NULL OR scrape_status!='failed') AND (cover_url IS NULL OR cover_url='') AND (description IS NULL OR description='')" : 'WHERE active=1'
    rows = queryAll(`SELECT id, name FROM games ${where} ORDER BY id DESC LIMIT ${limit}`)
  }
  resetBatchStatus(rows.length)
  res.json({ success: true, message: '批量刮削已启动', status: batchScrapeStatus })
  ;(async () => {
    try {
      for (const row of rows) {
        batchScrapeStatus.current = { id: row.id, name: row.name }
        try {
          const result = await scrapeGameById(row.id, { source: source || undefined })
          if (result.success) batchScrapeStatus.success++
          else batchScrapeStatus.failed++
          batchScrapeStatus.results.push({ id: row.id, name: row.name, success: !!result.success, message: result.message || '', sourceUrl: result.metadata?.sourceUrl || '', coverUrl: result.coverUrl || '' })
        } catch (err) {
          batchScrapeStatus.failed++
          batchScrapeStatus.lastError = err.message || String(err)
          try { execute('UPDATE games SET scrape_status=\'failed\', scrape_error=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?', [batchScrapeStatus.lastError, row.id]) } catch {}
          batchScrapeStatus.results.push({ id: row.id, name: row.name, success: false, message: batchScrapeStatus.lastError })
        }
        batchScrapeStatus.done++
        if (batchScrapeStatus.results.length > 50) batchScrapeStatus.results.shift()
        await sleep(delayMs)
      }
    } finally {
      batchScrapeStatus.running = false
      batchScrapeStatus.current = null
      batchScrapeStatus.finishedAt = new Date().toISOString()
    }
  })()
})

/**
 * GET /api/games/metadata?ids=1,2,3 - 批量获取刮削元数据
 */
router.get('/metadata', (req, res) => {
  const idList = String(req.query.ids || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0).slice(0, 200)
  if (!idList.length) return res.json({ items: [] })
  const rows = queryAll(`SELECT id, cover_url, description, controls, source_name, source_url, scraped_at FROM games WHERE id IN (${idList.map(() => '?').join(',')})`, idList)
  res.json({ items: rows })
})

/**
 * GET /api/games/:id/scrape/candidates - 获取可手动选择的刮削候选
 */
router.get('/:id/scrape/candidates', async (req, res) => {
  try {
    const result = await getScrapeCandidates(parseInt(req.params.id), {
      source: req.query.source,
      name: req.query.name,
    })
    res.json(result)
  } catch (err) {
    console.error('获取刮削候选失败:', err)
    res.status(500).json({ error: err.message || '获取候选失败' })
  }
})

/**
 * POST /api/games/:id/scrape/apply - 手动应用一个刮削候选
 * Body: { sourceUrl, sourceName?, name? }
 */
router.post('/:id/scrape/apply', async (req, res) => {
  try {
    const { sourceUrl, sourceName, name } = req.body || {}
    const result = await applyScrapeCandidate(parseInt(req.params.id), sourceUrl, { sourceName, name })
    res.json(result)
  } catch (err) {
    console.error('应用刮削候选失败:', err)
    res.status(500).json({ error: err.message || '应用候选失败' })
  }
})

/**
 * POST /api/games/:id/scrape - 刮削单个游戏元数据
 */
router.post('/:id/scrape', async (req, res) => {
  try {
    const result = await scrapeGameById(parseInt(req.params.id))
    res.json(result)
  } catch (err) {
    console.error('刮削失败:', err)
    res.status(500).json({ error: err.message || '刮削失败' })
  }
})

/**
 * GET /api/games/:id - 获取单个游戏详情
 */
router.get('/:id', (req, res) => {
  const game = queryOne('SELECT * FROM games WHERE id=?', [parseInt(req.params.id)])
  if (!game) {
    return res.status(404).json({ error: '游戏不存在' })
  }
  // XSS 过滤
  game.name = escapeHtml(game.name)
  game.tags = escapeHtml(game.tags)
  game.category = escapeHtml(game.category)
  game.filename = escapeHtml(game.filename)
  res.json(game)
})

export default router
