import express from 'express'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// Cloud save data directory (host-mounted volume)
const DATA_DIR = process.env.CLOUD_SAVE_DIR || '/app/data/cloud-saves'

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function validCode(code) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(code || ''))
}

function savePath(code) {
  return path.join(DATA_DIR, `${code}.json`)
}

ensureDataDir()

// GET /api/cloud-save/:code — download cloud save
router.get('/cloud-save/:code', (req, res) => {
  const code = req.params.code
  if (!validCode(code)) {
    return res.status(400).json({ error: 'Invalid code format' })
  }

  const filePath = savePath(code)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ exists: false, error: 'Save not found' })
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    res.json({ exists: true, ...data })
  } catch (e) {
    console.error('Failed to read cloud save:', e)
    res.status(500).json({ error: 'Failed to read save' })
  }
})

// PUT /api/cloud-save/:code — upload cloud save
router.put('/cloud-save/:code', (req, res) => {
  const code = req.params.code
  if (!validCode(code)) {
    return res.status(400).json({ error: 'Invalid code format' })
  }
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid save data' })
  }

  try {
    ensureDataDir()
    const data = {
      ...req.body,
      savedAt: new Date().toISOString(),
    }
    fs.writeFileSync(savePath(code), JSON.stringify(data, null, 2), 'utf8')
    res.json({ ok: true, savedAt: data.savedAt })
  } catch (e) {
    console.error('Failed to write cloud save:', e)
    res.status(500).json({ error: 'Failed to save' })
  }
})

export default router
