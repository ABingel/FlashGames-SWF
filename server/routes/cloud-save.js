/**
 * Cloud Save API Route
 * Add these endpoints to your Express server (in vue-flash's server/src/index.js)
 *
 * Dependencies:
 * - express
 * - fs
 * - path
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Cloud save data directory (host-mounted volume)
const DATA_DIR = process.env.CLOUD_SAVE_DIR || '/app/data/cloud-saves';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// GET /api/cloud-save/:code — Download cloud save
router.get('/api/cloud-save/:code', (req, res) => {
  const code = req.params.code;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  const filePath = path.join(DATA_DIR, `${code}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Save not found' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read save' });
  }
});

// PUT /api/cloud-save/:code — Upload cloud save
router.put('/api/cloud-save/:code', express.json({ limit: '10mb' }), (req, res) => {
  const code = req.params.code;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid save data' });
  }
  try {
    const data = {
      ...req.body,
      savedAt: new Date().toISOString(),
      ip: req.ip,
    };
    const filePath = path.join(DATA_DIR, `${code}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, savedAt: data.savedAt });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

// Cloud save listing (admin only - restrict in production)
router.get('/api/cloud-saves', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) return res.json([]);
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        code: f.replace('.json', ''),
        size: fs.statSync(path.join(DATA_DIR, f)).size,
        mtime: fs.statSync(path.join(DATA_DIR, f)).mtime,
      }));
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list saves' });
  }
});

module.exports = router;
