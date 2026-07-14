/**
 * SWF Relative Resource Proxy
 * Fix games that request relative resources (e.g., /play/music/musicBegin.mp3)
 * by redirecting to the actual game directory.
 *
 * Add this AFTER the static file middleware in your Express server.
 */

const path = require('path');
const fs = require('fs');

// Game base directory
const GAME_DIR = process.env.GAME_DIR || '/app/game';

// Cache of active game paths
let gameCache = null;
let gameCacheTime = 0;

function scanGameDirectories() {
  const now = Date.now();
  if (gameCache && now - gameCacheTime < 60000) return gameCache;
  
  const games = [];
  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scan(path.join(dir, entry.name));
        } else if (entry.name === 'game.swf') {
          games.push(dir);
        }
      }
    } catch (e) { /* skip unreadable dirs */ }
  }
  if (fs.existsSync(GAME_DIR)) scan(GAME_DIR);
  
  gameCache = games;
  gameCacheTime = now;
  return games;
}

function findGameByReferer(referer) {
  // Extract game ID from /play/:id
  const match = referer && referer.match(/\/play\/(\d+)/);
  if (!match) return null;
  const gameId = match[1];
  // In a real setup, you'd look up the game path by ID from your database
  return null; // Returns null - override with your lookup logic
}

module.exports = function swfResourceProxy(req, res, next) {
  // Only handle /play/* resource requests
  if (!req.path.startsWith('/play/')) return next();
  
  // Skip if it's the main play page
  if (req.path === '/play/' || /^\/play\/\d+$/.test(req.path)) return next();
  
  const referer = req.headers.referer;
  let gameDir = null;
  
  // Try to find by referer
  if (referer) {
    const id = findGameByReferer(referer);
    // If you have a lookup, set gameDir here
  }
  
  // Fallback: scan for the resource in all game directories
  if (!gameDir) {
    const relativePath = req.path.replace(/^\/play\//, '');
    const games = scanGameDirectories();
    for (const dir of games) {
      const fullPath = path.join(dir, relativePath);
      if (fs.existsSync(fullPath)) {
        return res.sendFile(fullPath);
      }
    }
  }
  
  next();
};
