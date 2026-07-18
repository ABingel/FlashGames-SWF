import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'flash.db')

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

let db = null
let SQL = null

/**
 * 初始化数据库（启动时调用一次）
 */
export async function initDb() {
  SQL = await initSqlJs()

  // 尝试从文件加载
  try {
    const buf = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buf)
    console.log(`数据库已加载: ${DB_PATH}`)
  } catch {
    db = new SQL.Database()
    console.log('创建新数据库')
  }

  // 建表
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT NOT NULL UNIQUE,
      filepath    TEXT DEFAULT '',
      name        TEXT NOT NULL,
      category    TEXT DEFAULT '未分类',
      tags        TEXT DEFAULT '未分类',
      size        INTEGER DEFAULT 0,
      md5         TEXT DEFAULT '',
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // 兼容旧表：尝试添加新列（不存在则忽略）
  try { db.run('ALTER TABLE games ADD COLUMN filepath TEXT DEFAULT \'\'') } catch {}
  try { db.run('ALTER TABLE games ADD COLUMN tags TEXT DEFAULT \'未分类\'') } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN cover_url TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN description TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN controls TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN source_name TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN source_url TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN scraped_at TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN scrape_status TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE games ADD COLUMN scrape_error TEXT DEFAULT ''") } catch {}

  // 把旧数据的 tags 初始化为 category
  db.run("UPDATE games SET tags = category WHERE tags IS NULL OR tags = ''")
  // 把旧数据的 filepath 初始化为 filename（根目录游戏）
  db.run("UPDATE games SET filepath = filename WHERE filepath IS NULL OR filepath = ''")

  // ============ 数据库迁移 v1 → v2: UNIQUE 约束从 filename 改为 filepath ============
  try {
    const tableInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='games'")
    if (tableInfo.length > 0 && tableInfo[0].values.length > 0) {
      const createSql = tableInfo[0].values[0][0]
      if (createSql.includes('filename') && (createSql.includes('UNIQUE') || createSql.includes('unique'))) {
        // 检查 UNIQUE 是否在 filename 上（而不是 filepath）
        const hasFilenameUnique = /filename\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(createSql)
        const hasFilepathUnique = /filepath\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(createSql)
        if (hasFilenameUnique && !hasFilepathUnique) {
          console.log('正在迁移数据库 v1 → v2：UNIQUE 约束从 filename 移至 filepath...')

          // 删重：同名同路径只保留最早记录
          db.run('DELETE FROM games WHERE id NOT IN (SELECT MIN(id) FROM games GROUP BY filepath)')

          db.run(`
            CREATE TABLE games_new (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              filename    TEXT NOT NULL,
              filepath    TEXT NOT NULL UNIQUE,
              name        TEXT NOT NULL,
              category    TEXT DEFAULT '未分类',
              tags        TEXT DEFAULT '未分类',
              size        INTEGER DEFAULT 0,
              md5         TEXT DEFAULT '',
              active      INTEGER DEFAULT 1,
              created_at  TEXT DEFAULT (datetime('now', 'localtime')),
              updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
            )
          `)
          db.run('INSERT OR IGNORE INTO games_new SELECT * FROM games')
          db.run('DROP TABLE games')
          db.run('ALTER TABLE games_new RENAME TO games')
          // 重建索引
          db.run('CREATE INDEX IF NOT EXISTS idx_games_name ON games(name)')
          db.run('CREATE INDEX IF NOT EXISTS idx_games_category ON games(category)')
          db.run('CREATE INDEX IF NOT EXISTS idx_games_active ON games(active)')
          db.run('CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at)')
          console.log('数据库迁移完成 ✓')
        }
      }
    }
  } catch (e) {
    console.log('数据库迁移跳过:', e.message)
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)

  // 用户表（管理员账号）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT DEFAULT 'admin',
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  // 系统设置表（前端锁配置、JWT密钥、首次安装标记等）
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 索引
  db.run('CREATE INDEX IF NOT EXISTS idx_games_name ON games(name)')
  db.run('CREATE INDEX IF NOT EXISTS idx_games_category ON games(category)')
  db.run('CREATE INDEX IF NOT EXISTS idx_games_active ON games(active)')
  db.run('CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at)')

  saveDb()
  return db
}

/**
 * 检查是否已完成首次安装（是否存在管理员用户）
 */
export function isSetupComplete() {
  if (!db) return false
  const row = db.exec("SELECT COUNT(*) as cnt FROM users")
  if (row.length === 0) return false
  const cnt = row[0]?.values?.[0]?.[0] || 0
  return cnt > 0
}

/**
 * 获取设置值
 */
export function getSetting(key) {
  if (!db) return null
  const row = db.exec("SELECT value FROM settings WHERE key = ?", [key])
  if (row.length === 0 || row[0].values.length === 0) return null
  return row[0].values[0][0] || null
}

/**
 * 设置/更新设置值
 */
export function setSetting(key, value) {
  if (!db) return
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value])
  saveDb()
}

/**
 * 保存数据库到文件
 */
export function saveDb() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

/**
 * 执行查询并返回数组格式的结果
 * sql.js db.exec() 返回 [{columns, values}]，这里统一转为 [{col: val}]
 */
export function queryAll(sql, params = []) {
  if (!db) throw new Error('数据库未初始化')
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

/**
 * 执行查询并返回单行
 */
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）
 * 返回 { changes, lastInsertRowid }
 */
export function execute(sql, params = []) {
  if (!db) throw new Error('数据库未初始化')
  db.run(sql, params)
  const result = {
    changes: db.getRowsModified(),
  }
  // post-commit 自动保存
  saveDb()
  return result
}

/**
 * 执行写操作但不自动保存（用于批量写入场景，最后手动 saveDb）
 */
export function executeWithoutSave(sql, params = []) {
  if (!db) throw new Error('数据库未初始化')
  db.run(sql, params)
  return { changes: db.getRowsModified() }
}

/**
 * 获取数据库实例（用于高级操作）
 */
export function getDb() {
  if (!db) throw new Error('数据库未初始化')
  return db
}

export default { initDb, saveDb, queryAll, queryOne, execute, executeWithoutSave, getDb, isSetupComplete, getSetting, setSetting }
