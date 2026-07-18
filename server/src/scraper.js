import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { queryOne, execute } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data')
const COVER_DIR = path.join(DATA_DIR, 'covers')

function ensureDirs() { fs.mkdirSync(COVER_DIR, { recursive: true }) }
function normalizeName(name = '') {
  return String(name)
    .replace(/\.swf$/i, '')
    .replace(/[【】\[\]()（）_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function cleanName(name = '') {
  return normalizeName(name)
    .replace(/幸运无敌版|无敌版|变态版|修改版|增强版|终极版|中文版|双人版|小游戏|豪华版|正式版|完美版|\d+(\.\d+)?版/gi, '')
    .replace(/幸运|无敌|变态|修改|增强|终极|豪华|完美/gi, '')
    .replace(/版$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function searchNameVariants(name = '') {
  const raw = normalizeName(name)
  const cleaned = cleanName(raw)
  const variants = [raw, cleaned]
  // 再做一轮保守降噪：常见“版本/难度/福利”词去掉，但保留数字编号，例如 Q版泡泡堂4。
  variants.push(cleanName(raw.replace(/幸运无敌版|无敌版|变态版|修改版|增强版|终极版|中文版|双人版|豪华版|正式版|完美版/gi, '')))
  variants.push(cleanName(raw.replace(/幸运|无敌|变态|修改|增强|终极|豪华|完美/gi, '')))
  return uniq(variants).filter(v => v && v.length >= 2)
}
function gameSearchName(game) {
  const raw = String(game?.name || '').trim()
  if (raw && !/^game$/i.test(raw) && !/^index$/i.test(raw)) return raw
  const fp = String(game?.filepath || game?.filename || '')
  const parts = fp.split('/').filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return raw || fp.replace(/\.swf$/i, '')
}
function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
function absUrl(url, base) {
  if (!url) return ''
  try { return new URL(url, base).href } catch { return '' }
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))] }
function scoreTitle(title, name) {
  const a = cleanName(title).toLowerCase()
  const b = cleanName(name).toLowerCase()
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80
  let hit = 0
  for (const ch of b) if (a.includes(ch)) hit++
  return Math.round(hit / Math.max(1, b.length) * 60)
}
async function fetchBuffer(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 FlashGamesScraper/1.0',
      'accept': 'text/html,image/*,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.5',
      ...extraHeaders,
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  const ab = await res.arrayBuffer()
  return { buffer: Buffer.from(ab), contentType: res.headers.get('content-type') || '', finalUrl: res.url }
}
function decodeHtml(buffer, contentType = '') {
  const head = buffer.slice(0, 2000).toString('latin1')
  const m = /charset=["']?([^"'\s/>;]+)/i.exec(contentType) || /charset=["']?([^"'\s/>;]+)/i.exec(head)
  const enc = (m && m[1] || 'utf-8').toLowerCase().replace('gb2312', 'gb18030').replace('gbk', 'gb18030')
  try { return new TextDecoder(enc).decode(buffer) } catch { return new TextDecoder('utf-8').decode(buffer) }
}
async function fetchHtml(url) {
  const r = await fetchBuffer(url)
  return { html: decodeHtml(r.buffer, r.contentType), finalUrl: r.finalUrl }
}
async function searchCandidates(name, site) {
  const keyword = cleanName(name)
  const out = []
  const directUrls = site.includes('4399')
    ? ['https://so2.4399.com/search/search.php?k=' + encodeURIComponent(keyword)]
    : site.includes('7k7k')
      ? ['https://www.7k7k.com/s.php?keyword=' + encodeURIComponent(keyword), 'https://www.7k7k.com/search/?keyword=' + encodeURIComponent(keyword), 'https://www.7k7k.com/search/' + encodeURIComponent(keyword) + '/']
      : ['https://oldswf.com/?s=' + encodeURIComponent(keyword), 'https://oldswf.com/search?q=' + encodeURIComponent(keyword)]
  for (const u of directUrls) {
    try {
      const { html } = await fetchHtml(u)
      const re = site.includes('4399')
        ? /(?:https?:)?\/\/www\.4399\.com\/flash\/\d+\.htm|www\.4399\.com\/flash\/\d+\.htm/g
        : site.includes('7k7k')
          ? /(?:https?:)?\/\/(?:www\.)?7k7k\.com\/flash\/\d+\.htm|(?:www\.)?7k7k\.com\/flash\/\d+\.htm/g
          : /(?:https?:)?\/\/oldswf\.com\/[^"'<>\s]+|oldswf\.com\/[^"'<>\s]+/g
      for (const m of html.matchAll(re)) {
        let link = m[0]
        const ctx = stripHtml(html.slice(Math.max(0, m.index - 350), Math.min(html.length, m.index + 650)))
        if ((site.includes('4399') || site.includes('7k7k') || site.includes('oldswf')) && scoreTitle(ctx, keyword) < 30) continue
        if (link.startsWith('//')) link = 'https:' + link
        if (!link.startsWith('http')) link = 'https://' + link
        out.push(link.split('#')[0])
      }
    } catch (e) {
      console.warn('[scraper] direct search failed', u, e.message)
    }
    if (out.length) return uniq(out).slice(0, 8)
  }

  const q = encodeURIComponent('site:' + site + ' ' + keyword + ' 小游戏')
  const urls = ['https://www.bing.com/search?q=' + q, 'https://cn.bing.com/search?q=' + q]
  for (const u of urls) {
    try {
      const { html } = await fetchHtml(u)
      const re = site.includes('4399')
        ? /https?:\/\/www\.4399\.com\/flash\/\d+\.htm/g
        : site.includes('7k7k')
          ? /https?:\/\/(?:www\.)?7k7k\.com\/flash\/\d+\.htm/g
          : /https?:\/\/oldswf\.com\/[^"'<>\s]+/g
      out.push(...(html.match(re) || []))
    } catch (e) {
      console.warn('[scraper] search failed', u, e.message)
    }
    if (out.length) break
  }
  return uniq(out).slice(0, 8)
}
function metaContent(html, name) {
  const target = String(name).toLowerCase()
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    const attrs = {}
    tag.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_, key, _q, value) => {
      attrs[key.toLowerCase()] = value
      return ''
    })
    if ((attrs.name || attrs.property || '').toLowerCase() === target && attrs.content) {
      return stripHtml(attrs.content)
    }
  }
  return ''
}
function parseCommon(html, url, sourceName) {
  const title = stripHtml((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [,''])[1])
    .replace(/_?4399.*$/i, '')
    .replace(/_?7k7k.*$/i, '')
    .trim()
  let description = metaContent(html, 'description') || metaContent(html, 'og:description')
  let image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
  if (!image) {
    const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m => m[1])
    image = imgs.find(x => /(?:upload|pic|img|game|flash).*\.(?:jpg|jpeg|png|webp)/i.test(x)) || imgs.find(x => /\.(?:jpg|jpeg|png|webp)/i.test(x)) || ''
  }
  const controlsBlock = (/(?:操作指南|操作方法|玩法|游戏目标|如何开始)[\s\S]{0,1200}/i.exec(html) || [''])[0]
  const controls = stripHtml(controlsBlock).slice(0, 500)
  description = description.replace(/在4399小游戏.*$/i, '').replace(/更多.*?小游戏.*$/i, '').slice(0, 800)
  return { title, description, controls, coverRemoteUrl: absUrl(image, url), sourceName, sourceUrl: url }
}
async function parseCandidate(url, name, sourceName) {
  const { html, finalUrl } = await fetchHtml(url)
  const meta = parseCommon(html, finalUrl, sourceName)
  meta.matchScore = scoreTitle(meta.title || meta.description, name)
  return meta
}
function sourceFromUrl(url) {
  const s = String(url)
  if (s.includes('oldswf.com')) return 'oldswf'
  return s.includes('7k7k') ? '7k7k' : '4399'
}
function siteFromSource(sourceName) {
  if (sourceName === 'oldswf') return 'oldswf.com'
  return sourceName === '7k7k' ? '7k7k.com' : 'www.4399.com/flash'
}
function publicCandidate(meta) {
  return {
    title: meta.title || '',
    description: meta.description || '',
    controls: meta.controls || '',
    coverRemoteUrl: meta.coverRemoteUrl || '',
    sourceName: meta.sourceName || '',
    sourceUrl: meta.sourceUrl || '',
    matchScore: meta.matchScore || 0,
    searchedName: meta.searchedName || '',
  }
}
async function downloadCover(remoteUrl, gameId, referer = '') {
  if (!remoteUrl) return ''
  ensureDirs()
  try {
    const headers = {}
    if (referer) headers.referer = referer
    else if (/7k7k/i.test(remoteUrl)) headers.referer = 'https://www.7k7k.com/'
    else if (/oldswf/i.test(remoteUrl)) headers.referer = 'https://oldswf.com/'
    const { buffer, contentType } = await fetchBuffer(remoteUrl, headers)
    if (!contentType.startsWith('image/') && !/\.(jpg|jpeg|png|webp)(?:$|\?)/i.test(remoteUrl)) return ''
    const ext = (/\.(jpg|jpeg|png|webp)(?:$|\?)/i.exec(remoteUrl)?.[1] || (contentType.split('/')[1] || 'jpg')).replace('jpeg', 'jpg')
    const hash = crypto.createHash('md5').update(remoteUrl).digest('hex').slice(0, 8)
    const filename = gameId + '-' + hash + '.' + ext
    fs.writeFileSync(path.join(COVER_DIR, filename), buffer)
    return '/covers/' + filename
  } catch (e) {
    console.warn('[scraper] cover download failed', e.message)
    return ''
  }
}

async function collectCandidates(game, opts = {}) {
  const name = opts.name || gameSearchName(game)
  const variants = opts.exact ? [normalizeName(name)] : searchNameVariants(name)
  const sourceFilter = String(opts.source || '').toLowerCase()
  const sites = [
    { site: 'www.4399.com/flash', sourceName: '4399' },
    { site: '7k7k.com', sourceName: '7k7k' },
    { site: 'oldswf.com', sourceName: 'oldswf' },
  ].filter(s => !sourceFilter || s.sourceName.toLowerCase() === sourceFilter)
  const tried = []
  const candidates = []
  const seen = new Set()
  for (const searchName of variants) {
    for (const site of sites) {
      const urls = await searchCandidates(searchName, site.site)
      for (const url of urls) {
        if (seen.has(url)) continue
        seen.add(url)
        tried.push(url)
        try {
          const meta = await parseCandidate(url, searchName, site.sourceName)
          meta.searchedName = searchName
          // 用当前降级搜索名评分；这样“变态版”可合理匹配基础版，但本地标题不被覆盖。
          meta.matchScore = Math.max(meta.matchScore || 0, scoreTitle(meta.title || meta.description, searchName))
          if ((meta.description || meta.controls || meta.coverRemoteUrl) && (meta.matchScore || 0) >= 25) candidates.push(meta)
        } catch (e) {
          console.warn('[scraper] parse failed', url, e.message)
        }
      }
      if (!opts.all && candidates.some(c => c.matchScore >= 60 && (c.description || c.coverRemoteUrl))) break
    }
    if (!opts.all && candidates.some(c => c.matchScore >= 60 && (c.description || c.coverRemoteUrl))) break
  }
  candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  return { searchedName: name, searchNames: variants, tried, candidates }
}

async function applyMetadata(game, meta) {
  const localCover = await downloadCover(meta.coverRemoteUrl, game.id, meta.sourceUrl)
  const coverUrl = localCover || meta.coverRemoteUrl || game.cover_url || ''
  execute(
    'UPDATE games SET cover_url=?, description=?, controls=?, source_name=?, source_url=?, scraped_at=datetime(\'now\',\'localtime\'), scrape_status=\'scraped\', scrape_error=\'\', updated_at=datetime(\'now\',\'localtime\') WHERE id=?',
    [coverUrl, meta.description || '', meta.controls || '', meta.sourceName || '', meta.sourceUrl || '', game.id]
  )
  return { success: true, gameId: game.id, matchScore: meta.matchScore || 0, coverUrl, metadata: { ...meta, coverUrl } }
}

export async function getScrapeCandidates(gameId, opts = {}) {
  const game = queryOne('SELECT id, name, filename, filepath, cover_url, description FROM games WHERE id=?', [parseInt(gameId)])
  if (!game) throw new Error('游戏不存在')
  const result = await collectCandidates(game, { ...opts, all: true })
  return { ...result, candidates: result.candidates.slice(0, 20).map(publicCandidate) }
}

export async function applyScrapeCandidate(gameId, sourceUrl, opts = {}) {
  const game = queryOne('SELECT id, name, filename, filepath, cover_url, description FROM games WHERE id=?', [parseInt(gameId)])
  if (!game) throw new Error('游戏不存在')
  let url = String(sourceUrl || '').trim()
  if (/^\d{3,8}$/.test(url)) url = `https://www.7k7k.com/flash/${url}.htm`
  if (/^7k7k:\d{3,8}$/i.test(url)) url = `https://www.7k7k.com/flash/${url.replace(/^7k7k:/i, '')}.htm`
  if (!/^https?:\/\//i.test(url)) throw new Error('sourceUrl 无效，请填写详情页URL或7k7k编号')
  const name = opts.name || gameSearchName(game)
  const sourceName = opts.sourceName || sourceFromUrl(url)
  const meta = await parseCandidate(url, name, sourceName)
  return applyMetadata(game, meta)
}

export async function scrapeGameById(gameId, opts = {}) {
  const game = queryOne('SELECT id, name, filename, filepath, cover_url, description FROM games WHERE id=?', [parseInt(gameId)])
  if (!game) throw new Error('游戏不存在')
  const result = await collectCandidates(game, opts)
  const best = result.candidates[0]
  if (!best || (best.matchScore || 0) < 45) {
    const message = '未找到可信的同名刮削结果'
    execute('UPDATE games SET scrape_status=\'failed\', scrape_error=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?', [message, game.id])
    return { success: false, message, searchedName: result.searchedName, bestScore: best?.matchScore || 0, tried: result.tried, candidates: result.candidates.slice(0, 8).map(publicCandidate) }
  }
  return { ...(await applyMetadata(game, best)), tried: result.tried }
}
