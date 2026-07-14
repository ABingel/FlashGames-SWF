import fs from 'fs'
import path from 'path'

// SWF relative resource proxy.
// Some Flash games load files like /play/music/xxx.mp3 or /play/mapPic/xxx.swf
// while the real files live next to game.swf inside /app/game/**.
const GAME_DIR = process.env.GAME_DIR || '/app/game'

let gameCache = null
let gameCacheTime = 0

function scanGameDirectories() {
  const now = Date.now()
  if (gameCache && now - gameCacheTime < 60_000) return gameCache

  const games = []
  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) scan(full)
        else if (entry.name.toLowerCase() === 'game.swf') games.push(dir)
      }
    } catch (_) {
      // skip unreadable directories
    }
  }

  if (fs.existsSync(GAME_DIR)) scan(GAME_DIR)
  gameCache = games
  gameCacheTime = now
  return games
}

function safeJoin(base, rel) {
  const full = path.resolve(base, rel)
  const normalizedBase = path.resolve(base)
  if (!full.startsWith(normalizedBase + path.sep) && full !== normalizedBase) return null
  return full
}

export default function swfResourceProxy(req, res, next) {
  if (!req.path.startsWith('/play/')) return next()

  // Skip main play pages, e.g. /play/123
  if (req.path === '/play/' || /^\/play\/\d+\/?$/.test(req.path)) return next()

  const relativePath = decodeURIComponent(req.path.replace(/^\/play\//, ''))
  if (!relativePath || relativePath.includes('\0') || relativePath.includes('..')) return next()

  const games = scanGameDirectories()
  for (const dir of games) {
    const fullPath = safeJoin(dir, relativePath)
    if (fullPath && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return res.sendFile(fullPath)
    }
  }

  return next()
}
