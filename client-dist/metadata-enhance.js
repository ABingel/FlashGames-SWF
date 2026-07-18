// Flash Games metadata enhancement: covers + introductions + one-click scraping
// Loaded as an independent patch to avoid rebuilding the bundled Vue app.
(function () {
  'use strict'
  const STYLE_ID = 'fg-meta-enhance-style'
  const CACHE_MS = 10 * 60 * 1000
  let gamesCache = { at: 0, list: [] }
  let busy = false

  function css () {
    if (document.getElementById(STYLE_ID)) return
    const s = document.createElement('style')
    s.id = STYLE_ID
    s.textContent = `
      .game-card .card-header{position:relative;overflow:hidden;min-height:76px}.fg-cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.game-card .card-header .card-emoji{position:relative;z-index:2;text-shadow:0 2px 8px rgba(0,0,0,.65)}.game-card.has-cover .card-header:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.42));z-index:1}.fg-card-desc{font-size:12px;line-height:1.35;color:var(--el-text-color-secondary,#666);margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.fg-scrape-card{position:absolute;right:42px;top:8px;z-index:8;border:0;border-radius:12px;padding:3px 8px;font-size:12px;background:rgba(0,0,0,.45);color:#fff;backdrop-filter:blur(4px)}.fg-pick-card{right:90px;background:rgba(64,158,255,.72)}.fg-scrape-card:active{transform:scale(.96)}.fg-meta-panel{margin:10px auto 0;max-width:980px;border-radius:14px;padding:12px 14px;background:var(--el-bg-color-overlay,rgba(255,255,255,.9));box-shadow:0 4px 18px rgba(0,0,0,.08);color:var(--el-text-color-primary,#333)}.fg-meta-head{display:flex;align-items:center;gap:12px}.fg-meta-cover{width:82px;height:62px;object-fit:cover;border-radius:10px;background:#222;flex:none}.fg-meta-title{font-weight:700;margin-bottom:4px}.fg-meta-text{font-size:14px;line-height:1.55;color:var(--el-text-color-regular,#444);white-space:pre-wrap}.fg-meta-source{font-size:12px;color:var(--el-text-color-secondary,#888);margin-top:6px}.fg-meta-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}.fg-meta-btn{border:0;border-radius:16px;padding:6px 12px;background:#409eff;color:#fff;font-size:13px}.fg-meta-btn.secondary{background:#909399}.fg-meta-mask{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:14px}.fg-meta-dialog{width:min(760px,96vw);max-height:88vh;overflow:auto;border-radius:16px;background:var(--el-bg-color,#fff);color:var(--el-text-color-primary,#222);box-shadow:0 14px 40px rgba(0,0,0,.28);padding:16px}.fg-game-detail{width:min(900px,96vw);padding:0;overflow:hidden}.fg-detail-hero{display:grid;grid-template-columns:260px 1fr;gap:18px;padding:18px;background:linear-gradient(135deg,rgba(64,158,255,.16),rgba(103,194,58,.08))}.fg-detail-cover{width:100%;aspect-ratio:4/3;border-radius:16px;object-fit:cover;background:#2d3436;box-shadow:0 8px 24px rgba(0,0,0,.20)}.fg-detail-cover.empty{display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px}.fg-detail-title{font-size:24px;font-weight:900;margin:4px 0 8px}.fg-detail-meta{font-size:12px;color:var(--el-text-color-secondary,#777);margin-bottom:12px}.fg-detail-sections{padding:0 18px 18px;display:grid;gap:12px}.fg-detail-section{border-top:1px solid rgba(127,127,127,.14);padding-top:12px}.fg-detail-section h4{margin:0 0 6px;font-size:14px}.fg-detail-text{white-space:pre-wrap;line-height:1.65;color:var(--el-text-color-regular,#444);font-size:14px}.fg-start-btn{border:0;border-radius:22px;padding:10px 20px;background:#67c23a;color:#fff;font-weight:800;font-size:15px;box-shadow:0 5px 16px rgba(103,194,58,.32)}.fg-meta-dialog-head{display:flex;gap:10px;align-items:center;margin-bottom:12px}.fg-meta-dialog-title{font-weight:800;font-size:17px;flex:1}.fg-meta-x{border:0;background:transparent;font-size:22px;color:inherit}.fg-meta-search{display:flex;gap:8px;margin:8px 0 12px}.fg-meta-input,.fg-meta-select{border:1px solid #dcdfe6;border-radius:10px;padding:8px 10px;background:var(--el-bg-color,#fff);color:inherit;min-width:0}.fg-meta-input{flex:1}.fg-candidate{display:grid;grid-template-columns:92px 1fr auto;gap:10px;padding:10px 0;border-top:1px solid rgba(127,127,127,.18);align-items:start}.fg-candidate img{width:92px;height:68px;object-fit:cover;border-radius:8px;background:#222}.fg-cand-title{font-weight:700;margin-bottom:4px}.fg-cand-desc{font-size:13px;color:var(--el-text-color-regular,#555);line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.fg-cand-meta{font-size:12px;color:var(--el-text-color-secondary,#888);margin-top:4px}.fg-url-row{display:flex;gap:8px;margin:10px 0 4px}.fg-meta-filter{max-width:1180px;margin:10px auto 12px;display:flex;align-items:center}.fg-meta-tabs{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:rgba(127,127,127,.10);box-shadow:inset 0 0 0 1px rgba(127,127,127,.10)}.fg-meta-tabs button{border:0;border-radius:999px;padding:7px 13px;background:transparent;color:var(--el-text-color-regular,#555);font-size:13px;transition:background .18s,color .18s,box-shadow .18s;white-space:nowrap}.fg-meta-tabs button.active{background:var(--el-bg-color-overlay,#fff);color:#409eff;box-shadow:0 2px 8px rgba(0,0,0,.10)}.fg-meta-tabs .num{opacity:.68;margin-left:4px;font-variant-numeric:tabular-nums}.fg-status-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}.fg-status-card{position:relative;border-radius:14px;overflow:hidden;background:var(--el-bg-color-overlay,#fff);box-shadow:0 4px 14px rgba(0,0,0,.08);cursor:pointer}.fg-status-cover{height:88px;background:#636e72;position:relative;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;overflow:hidden}.fg-status-cover img{width:100%;height:100%;object-fit:cover}.fg-status-body{padding:10px}.fg-status-title{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fg-status-desc{font-size:12px;color:var(--el-text-color-secondary,#666);line-height:1.35;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.fg-status-msg{max-width:1180px;margin:8px auto;color:var(--el-text-color-secondary,#666);font-size:13px}.fg-meta-filtering .game-grid,.fg-meta-filtering .pagination{display:none!important}.fg-batch-fab{position:fixed;right:14px;bottom:74px;z-index:9990;border:0;border-radius:18px;padding:8px 12px;background:#67c23a;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.22);font-size:13px}.fg-batch-panel{position:fixed;right:14px;bottom:116px;z-index:9991;width:min(340px,calc(100vw - 28px));border-radius:16px;background:var(--el-bg-color,#fff);color:var(--el-text-color-primary,#222);box-shadow:0 12px 32px rgba(0,0,0,.28);padding:14px;display:none}.fg-batch-panel.open{display:block}.fg-batch-row{display:flex;gap:8px;align-items:center;margin:8px 0}.fg-batch-row label{min-width:64px;font-size:13px;color:var(--el-text-color-secondary,#666)}.fg-batch-row input,.fg-batch-row select{flex:1;border:1px solid #dcdfe6;border-radius:10px;padding:7px 9px;background:var(--el-bg-color,#fff);color:inherit}.fg-batch-status{font-size:12px;line-height:1.45;color:var(--el-text-color-secondary,#666);max-height:120px;overflow:auto;margin-top:8px;white-space:pre-wrap}.fg-batch-actions{display:flex;gap:8px;margin-top:10px}.fg-batch-actions button{flex:1}@media(max-width:700px){.fg-card-desc{display:none}.fg-scrape-card{right:38px;top:6px;padding:2px 7px}.fg-pick-card{right:82px}.fg-meta-panel{margin:8px 8px 0;padding:10px}.fg-meta-cover{width:72px;height:54px}.fg-meta-text{font-size:13px;max-height:7.8em;overflow:auto}.fg-meta-actions{flex-direction:column;margin-left:0}.fg-meta-btn{padding:5px 9px}.fg-meta-head{align-items:flex-start}.fg-meta-dialog{padding:12px}.fg-meta-search,.fg-url-row{flex-direction:column}.fg-candidate{grid-template-columns:70px 1fr}.fg-candidate img{width:70px;height:54px}.fg-candidate .fg-meta-btn{grid-column:1/3}.fg-batch-fab{bottom:64px}.fg-batch-panel{bottom:104px}.fg-detail-hero{grid-template-columns:1fr;padding:14px}.fg-detail-title{font-size:20px}.fg-detail-sections{padding:0 14px 14px}}
    `
    document.head.appendChild(s)
  }
  function esc (s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])) }
  async function api (url, opts) {
    const r = await fetch(url, opts)
    if (!r.ok) {
      let msg = 'HTTP ' + r.status
      try { const j = await r.json(); msg = j.error || j.message || msg } catch {}
      throw new Error(msg)
    }
    return r.json()
  }
  async function postJson (url, body) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
  }
  async function loadGames () {
    const now = Date.now()
    if (gamesCache.list.length && now - gamesCache.at < CACHE_MS) return gamesCache.list
    const data = await api('/api/games?limit=500&sort=id_desc')
    gamesCache = { at: now, list: data.games || [] }
    return gamesCache.list
  }
  function byTitle (games) {
    const map = new Map()
    for (const g of games) if (g && g.name && !map.has(g.name)) map.set(g.name, g)
    return map
  }
  function openManualDialog (game, afterApply) {
    css()
    document.querySelector('.fg-meta-mask')?.remove()
    const mask = document.createElement('div')
    mask.className = 'fg-meta-mask'
    const guessedName = (game.name && !/^game$/i.test(game.name)) ? game.name : (String(game.filepath || '').split('/').slice(-2, -1)[0] || game.name || '')
    mask.innerHTML = `
      <div class="fg-meta-dialog" role="dialog" aria-modal="true">
        <div class="fg-meta-dialog-head"><div class="fg-meta-dialog-title">手动选择元数据</div><button class="fg-meta-x" data-act="close">×</button></div>
        <div class="fg-meta-search">
          <input class="fg-meta-input" data-role="keyword" value="${esc(guessedName)}" placeholder="搜索游戏名，可手动改关键词">
          <select class="fg-meta-select" data-role="source"><option value="">4399 + 7k7k + oldswf</option><option value="4399">只搜4399</option><option value="7k7k">只搜7k7k</option><option value="oldswf">只搜oldswf</option></select>
          <button class="fg-meta-btn" data-act="search">搜索候选</button>
        </div>
        <div class="fg-url-row">
          <input class="fg-meta-input" data-role="url" placeholder="粘贴详情页URL，或直接填7k7k编号如 98413">
          <button class="fg-meta-btn secondary" data-act="apply-url">应用URL</button>
        </div>
        <div data-role="status" class="fg-cand-meta">点击搜索后选择一个结果。</div>
        <div data-role="list"></div>
      </div>`
    document.body.appendChild(mask)
    const close = () => mask.remove()
    mask.addEventListener('click', ev => { if (ev.target === mask || ev.target.dataset.act === 'close') close() })
    const status = mask.querySelector('[data-role="status"]')
    const list = mask.querySelector('[data-role="list"]')
    async function applySource (sourceUrl, sourceName) {
      status.textContent = '正在应用并下载封面…'
      await postJson(`/api/games/${game.id}/scrape/apply`, { sourceUrl, sourceName, name: mask.querySelector('[data-role="keyword"]').value.trim() })
      gamesCache.at = 0
      status.textContent = '已应用，正在刷新…'
      setTimeout(() => { close(); afterApply && afterApply() }, 400)
    }
    async function search () {
      const name = mask.querySelector('[data-role="keyword"]').value.trim()
      const source = mask.querySelector('[data-role="source"]').value
      status.textContent = '正在搜索候选…'
      list.innerHTML = ''
      try {
        const qs = new URLSearchParams()
        if (name) qs.set('name', name)
        if (source) qs.set('source', source)
        const data = await api(`/api/games/${game.id}/scrape/candidates?${qs}`)
        const items = data.candidates || []
        status.textContent = items.length ? `搜索名：${data.searchedName || name}，找到 ${items.length} 个候选` : `没找到候选。可以换关键词，或直接粘贴详情页URL。`
        list.innerHTML = items.map((c, i) => `
          <div class="fg-candidate" data-i="${i}">
            ${c.coverRemoteUrl ? `<img src="${esc(c.coverRemoteUrl)}" loading="lazy">` : '<div></div>'}
            <div><div class="fg-cand-title">${esc(c.title || '(无标题)')}</div><div class="fg-cand-desc">${esc(c.description || c.controls || '')}</div><div class="fg-cand-meta">${esc(c.sourceName)} · 匹配 ${c.matchScore || 0}${c.searchedName ? ' · 搜索名：' + esc(c.searchedName) : ''} · ${esc(c.sourceUrl)}</div></div>
            <button class="fg-meta-btn" data-act="apply" data-i="${i}">选这个</button>
          </div>`).join('')
        list.querySelectorAll('[data-act="apply"]').forEach(btn => btn.addEventListener('click', async () => {
          const c = items[Number(btn.dataset.i)]
          if (!c) return
          btn.textContent = '应用中…'
          try { await applySource(c.sourceUrl, c.sourceName) } catch (e) { status.textContent = '应用失败：' + e.message; btn.textContent = '选这个' }
        }))
      } catch (e) { status.textContent = '搜索失败：' + e.message }
    }
    mask.querySelector('[data-act="search"]').addEventListener('click', search)
    mask.querySelector('[data-act="apply-url"]').addEventListener('click', async () => {
      const url = mask.querySelector('[data-role="url"]').value.trim()
      if (!url) return
      try { await applySource(url) } catch (e) { status.textContent = '应用URL失败：' + e.message }
    })
    search()
  }
  function openGameDetail (game) {
    css()
    document.querySelector('.fg-meta-mask')?.remove()
    const mask = document.createElement('div')
    mask.className = 'fg-meta-mask'
    const desc = game.description || '还没有游戏介绍，可以先刮削元数据。'
    const controls = game.controls || '还没有玩法说明，可以先刮削元数据。'
    mask.innerHTML = `<div class="fg-meta-dialog fg-game-detail">
      <div class="fg-detail-hero">
        ${game.cover_url ? `<img class="fg-detail-cover" src="${esc(game.cover_url)}" alt="cover">` : `<div class="fg-detail-cover empty">🎮</div>`}
        <div>
          <div class="fg-meta-dialog-head"><div class="fg-detail-title">${esc(game.name)}</div><button class="fg-meta-x" data-act="close">×</button></div>
          <div class="fg-detail-meta">${esc(game.category || game.tags || '')}${game.source_name ? ' · 来源：' + esc(game.source_name) : ''}${game.scraped_at ? ' · ' + esc(game.scraped_at) : ''}</div>
          <button class="fg-start-btn" data-act="start">开始游戏</button>
          <button class="fg-meta-btn secondary" data-act="scrape" style="margin-left:8px">${game.cover_url || game.description ? '重新刮削' : '刮削元数据'}</button>
          <button class="fg-meta-btn secondary" data-act="manual" style="margin-left:8px">手动选择</button>
        </div>
      </div>
      <div class="fg-detail-sections">
        <div class="fg-detail-section"><h4>游戏介绍</h4><div class="fg-detail-text">${esc(desc)}</div></div>
        <div class="fg-detail-section"><h4>游戏玩法</h4><div class="fg-detail-text">${esc(controls)}</div></div>
      </div>
    </div>`
    document.body.appendChild(mask)
    const close = () => mask.remove()
    mask.addEventListener('click', ev => { if (ev.target === mask || ev.target.dataset.act === 'close') close() })
    mask.querySelector('[data-act="start"]')?.addEventListener('click', () => { location.href = `/play/${game.id}` })
    mask.querySelector('[data-act="manual"]')?.addEventListener('click', () => openManualDialog(game, async () => { close(); gamesCache.at = 0; const fresh = await api('/api/games/' + game.id); openGameDetail(fresh) }))
    mask.querySelector('[data-act="scrape"]')?.addEventListener('click', async ev => {
      const btn = ev.currentTarget; if (busy) return; busy = true; btn.textContent = '刮削中…'
      try { await api(`/api/games/${game.id}/scrape`, { method: 'POST' }); gamesCache.at = 0; const fresh = await api('/api/games/' + game.id); close(); openGameDetail(fresh) }
      catch { btn.textContent = '刮削失败' }
      finally { busy = false }
    })
  }
  function applyCardMeta (card, game) {
    if (!card || !game || card.dataset.fgMetaId === String(game.id)) return
    card.dataset.fgMetaId = String(game.id)
    if (!card.dataset.fgDetailBound) {
      card.dataset.fgDetailBound = '1'
      card.addEventListener('click', ev => {
        if (ev.target.closest('button,.fg-scrape-card,.fg-pick-card')) return
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation()
        openGameDetail(game)
      }, true)
    }
    const header = card.querySelector('.card-header')
    if (header && game.cover_url && !header.querySelector('.fg-cover-img')) {
      const img = document.createElement('img')
      img.className = 'fg-cover-img'
      img.loading = 'lazy'
      img.src = game.cover_url
      img.onerror = () => { img.remove(); card.classList.remove('has-cover') }
      header.prepend(img)
      card.classList.add('has-cover')
    }
    const body = card.querySelector('.card-body')
    if (body && (game.description || game.controls) && !body.querySelector('.fg-card-desc')) {
      const p = document.createElement('p')
      p.className = 'fg-card-desc'
      p.textContent = game.description || game.controls
      const title = body.querySelector('.card-title')
      if (title && title.nextSibling) body.insertBefore(p, title.nextSibling)
      else body.appendChild(p)
    }
    if (!card.querySelector('.fg-scrape-card')) {
      const btn = document.createElement('button')
      btn.className = 'fg-scrape-card'
      btn.textContent = game.cover_url || game.description ? '重刮' : '刮削'
      btn.addEventListener('click', async ev => {
        ev.preventDefault(); ev.stopPropagation()
        if (busy) return
        busy = true
        btn.textContent = '刮中…'
        try {
          await api(`/api/games/${game.id}/scrape`, { method: 'POST' })
          gamesCache.at = 0
          btn.textContent = '完成'
          setTimeout(enhanceHome, 700)
        } catch (e) {
          btn.textContent = '失败'
          console.warn('[fg-meta] scrape failed', e)
        } finally {
          setTimeout(() => { busy = false; btn.textContent = '重刮' }, 1200)
        }
      }, true)
      card.appendChild(btn)
    }
    if (!card.querySelector('.fg-pick-card')) {
      const pick = document.createElement('button')
      pick.className = 'fg-scrape-card fg-pick-card'
      pick.textContent = '选择'
      pick.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation()
        openManualDialog(game, () => enhanceHome())
      }, true)
      card.appendChild(pick)
    }
  }
  async function enhanceHome () {
    css()
    const cards = [...document.querySelectorAll('.game-card')]
    if (!cards.length) return
    try {
      const games = await loadGames()
      const map = byTitle(games)
      for (const card of cards) {
        const title = card.querySelector('.card-title')?.textContent?.trim()
        applyCardMeta(card, map.get(title))
      }
    } catch (e) { console.warn('[fg-meta] enhance home failed', e) }
  }
  async function enhancePlay () {
    css()
    const m = location.pathname.match(/\/play\/(\d+)/)
    if (!m) return
    const stage = document.querySelector('.game-stage')
    if (!stage) return
    let panel = document.querySelector('.fg-meta-panel')
    if (!panel) {
      panel = document.createElement('section')
      panel.className = 'fg-meta-panel'
      stage.insertAdjacentElement('afterend', panel)
    }
    async function render () {
      const g = await api('/api/games/' + m[1])
      panel.innerHTML = `
        <div class="fg-meta-head">
          ${g.cover_url ? `<img class="fg-meta-cover" src="${esc(g.cover_url)}" alt="cover">` : `<div class="fg-meta-cover"></div>`}
          <div style="min-width:0;flex:1">
            <div class="fg-meta-title">${esc(g.name || '游戏介绍')}</div>
            <div class="fg-meta-text">${esc(g.description || g.controls || '还没有玩法介绍，可以点右侧按钮从 4399 / 7k7k 刮削。')}</div>
            ${g.source_name ? `<div class="fg-meta-source">来源：${esc(g.source_name)} ${g.scraped_at ? ' · ' + esc(g.scraped_at) : ''}</div>` : ''}
          </div>
          <div class="fg-meta-actions"><button class="fg-meta-btn" data-act="scrape">${g.description || g.cover_url ? '重新刮削' : '刮削元数据'}</button><button class="fg-meta-btn secondary" data-act="manual">手动选择</button></div>
        </div>`
      panel.querySelector('[data-act="scrape"]')?.addEventListener('click', async () => {
        const btn = panel.querySelector('[data-act="scrape"]')
        if (busy) return
        busy = true; btn.textContent = '刮削中…'
        try { await api(`/api/games/${m[1]}/scrape`, { method: 'POST' }); gamesCache.at = 0; await render() }
        catch (e) { btn.textContent = '刮削失败'; console.warn('[fg-meta] scrape failed', e) }
        finally { busy = false }
      })
      panel.querySelector('[data-act="manual"]')?.addEventListener('click', () => openManualDialog(g, render))
    }
    try { await render() } catch (e) { console.warn('[fg-meta] enhance play failed', e) }
  }
  async function ensureStatusFilterUi () {
    css()
    const home = document.querySelector('.home')
    const grid = document.querySelector('.game-grid')
    if (!home || !grid) return
    let bar = document.querySelector('.fg-meta-filter')
    if (!bar) {
      bar = document.createElement('div')
      bar.className = 'fg-meta-filter'
      bar.innerHTML = `<div class="fg-meta-tabs">
        <button data-status="">全部 <span class="num" data-num="total">…</span></button>
        <button data-status="pending">待刮削 <span class="num" data-num="pending">…</span></button>
        <button data-status="scraped">已刮削 <span class="num" data-num="scraped">…</span></button>
        <button data-status="failed">刮削失败 <span class="num" data-num="failed">…</span></button>
      </div>`
      const searchBar = document.querySelector('.search-bar')
      ;(searchBar || home.firstElementChild || home).insertAdjacentElement('afterend', bar)
      bar.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
        localStorage.setItem('fg-meta-status-filter', btn.dataset.status || '')
        renderStatusGrid()
      }))
    }
    const current = localStorage.getItem('fg-meta-status-filter') || ''
    bar.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', (btn.dataset.status || '') === current))
    const now = Date.now()
    if (!ensureStatusFilterUi._countsAt || now - ensureStatusFilterUi._countsAt > 10000) {
      try {
        const counts = await api('/api/games/scrape/status-counts')
        ensureStatusFilterUi._countsAt = now
        for (const [k, v] of Object.entries(counts)) {
          const el = bar.querySelector(`[data-num="${k}"]`)
          if (el && el.textContent !== String(v)) el.textContent = String(v)
        }
      } catch {}
    }
    if (current && !document.querySelector('.fg-status-grid')) renderStatusGrid()
    if (!current) clearStatusGrid()
  }
  function clearStatusGrid () {
    document.body.classList.remove('fg-meta-filtering')
    document.querySelector('.fg-status-grid')?.remove()
    document.querySelector('.fg-status-msg')?.remove()
  }
  async function renderStatusGrid () {
    const status = localStorage.getItem('fg-meta-status-filter') || ''
    document.querySelectorAll('.fg-meta-filter button').forEach(b => b.classList.toggle('active', (b.dataset.status || '') === status))
    if (!status) return clearStatusGrid()
    document.body.classList.add('fg-meta-filtering')
    const grid = document.querySelector('.game-grid')
    if (!grid) return
    let msg = document.querySelector('.fg-status-msg')
    if (!msg) { msg = document.createElement('div'); msg.className = 'fg-status-msg'; grid.insertAdjacentElement('beforebegin', msg) }
    let custom = document.querySelector('.fg-status-grid')
    if (!custom) { custom = document.createElement('div'); custom.className = 'fg-status-grid'; msg.insertAdjacentElement('afterend', custom) }
    msg.textContent = '正在加载状态分类…'
    try {
      const data = await api(`/api/games?metadataStatus=${encodeURIComponent(status)}&limit=100&sort=id_desc`)
      const games = data.games || []
      msg.textContent = `${status === 'pending' ? '待刮削' : status === 'scraped' ? '已刮削' : '刮削失败'}：显示 ${games.length} / ${data.total || games.length} 个。批量刮削会自动把成功项移到“已刮削”，失败项移到“刮削失败”。`
      custom.innerHTML = games.map(g => `
        <div class="fg-status-card" data-id="${g.id}">
          <div class="fg-status-cover">${g.cover_url ? `<img src="${esc(g.cover_url)}" loading="lazy">` : '🎮'}</div>
          <div class="fg-status-body"><div class="fg-status-title" title="${esc(g.name)}">${esc(g.name)}</div><div class="fg-status-desc">${esc(g.scrape_error || g.description || g.controls || '暂无元数据')}</div></div>
          <button class="fg-scrape-card fg-pick-card" data-act="pick">选择</button>
          <button class="fg-scrape-card" data-act="scrape">刮削</button>
        </div>`).join('') || '<div class="fg-status-msg">这个分类空了。</div>'
      custom.querySelectorAll('.fg-status-card').forEach(card => {
        const g = games.find(x => String(x.id) === String(card.dataset.id))
        card.addEventListener('click', ev => { if (ev.target.tagName === 'BUTTON') return; openGameDetail(g) })
        card.querySelector('[data-act="pick"]')?.addEventListener('click', ev => { ev.stopPropagation(); openManualDialog(g, renderStatusGrid) })
        card.querySelector('[data-act="scrape"]')?.addEventListener('click', async ev => {
          ev.stopPropagation(); const btn = ev.currentTarget; btn.textContent = '刮中…'
          try { await api(`/api/games/${g.id}/scrape`, { method: 'POST' }); gamesCache.at = 0; await ensureStatusFilterUi(); await renderStatusGrid() }
          catch { btn.textContent = '失败' }
        })
      })
    } catch (e) { msg.textContent = '加载失败：' + e.message }
  }
  function ensureBatchUi () {
    css()
    if (document.querySelector('.fg-batch-fab')) return
    const fab = document.createElement('button')
    fab.className = 'fg-batch-fab'
    fab.textContent = '批量刮削'
    const panel = document.createElement('div')
    panel.className = 'fg-batch-panel'
    panel.innerHTML = `
      <div class="fg-meta-dialog-head"><div class="fg-meta-dialog-title">批量刮削</div><button class="fg-meta-x" data-act="close">×</button></div>
      <div class="fg-batch-row"><label>数量</label><input data-role="limit" type="number" min="1" max="100" value="20"></div>
      <div class="fg-batch-row"><label>来源</label><select data-role="source"><option value="">自动</option><option value="4399">4399</option><option value="7k7k">7k7k</option><option value="oldswf">oldswf</option></select></div>
      <div class="fg-batch-row"><label>间隔ms</label><input data-role="delay" type="number" min="500" max="10000" value="1500"></div>
      <div class="fg-batch-row"><label>范围</label><select data-role="missing"><option value="true">只刮待刮削</option><option value="false">全部/允许重刮</option></select></div>
      <div class="fg-batch-actions"><button class="fg-meta-btn" data-act="start">刮一批</button><button class="fg-meta-btn" data-act="auto">自动连续刮</button><button class="fg-meta-btn secondary" data-act="stop-auto">停止</button></div>
      <div class="fg-batch-actions"><button class="fg-meta-btn secondary" data-act="refresh">刷新状态</button></div>
      <div class="fg-batch-status" data-role="status">默认后台执行；自动连续刮每批最多100个，批间会安全静置。</div>`
    document.body.appendChild(fab)
    document.body.appendChild(panel)
    fab.addEventListener('click', () => panel.classList.toggle('open'))
    panel.querySelector('[data-act="close"]').addEventListener('click', () => panel.classList.remove('open'))
    const statusEl = panel.querySelector('[data-role="status"]')
    function formatStatus (s) {
      const pct = s.total ? Math.round((s.done || 0) / s.total * 100) : 0
      const current = s.current ? `\n当前：#${s.current.id} ${s.current.name}` : ''
      const recent = (s.results || []).slice(-5).map(r => `${r.success ? '✓' : '×'} #${r.id} ${r.name || ''} ${r.message || r.sourceUrl || ''}`).join('\n')
      return `单批：${s.running ? '运行中' : '空闲/完成'} ${s.done || 0}/${s.total || 0} (${pct}%)\n成功：${s.success || 0} 失败：${s.failed || 0}${current}${s.lastError ? '\n错误：' + s.lastError : ''}${recent ? '\n\n最近：\n' + recent : ''}`
    }
    function formatAutoStatus (s) {
      const rest = s.restingUntil ? `\n静置到：${new Date(s.restingUntil).toLocaleString()}` : ''
      const current = s.current ? `\n当前：#${s.current.id} ${s.current.name}` : ''
      const recent = (s.results || []).slice(-5).map(r => `${r.success ? '✓' : '×'} #${r.id} ${r.name || ''} ${r.message || r.sourceUrl || ''}`).join('\n')
      return `自动：${s.running ? '运行中' : '空闲/完成'}  第${s.batchNo || 0}批\n总处理：${s.totalDone || 0} 成功：${s.totalSuccess || 0} 失败：${s.totalFailed || 0}\n${s.message || ''}${current}${rest}${s.lastError ? '\n错误：' + s.lastError : ''}${recent ? '\n\n最近：\n' + recent : ''}`
    }
    async function refresh () {
      try {
        const [s, a] = await Promise.all([api('/api/games/scrape/batch/status'), api('/api/games/scrape/auto/status')])
        statusEl.textContent = formatStatus(s) + '\n\n' + formatAutoStatus(a)
        if (!s.running && !a.running) { gamesCache.at = 0; ensureStatusFilterUi._countsAt = 0; ensureStatusFilterUi(); renderStatusGrid() }
      }
      catch (e) { statusEl.textContent = '状态获取失败：' + e.message }
    }
    panel.querySelector('[data-act="refresh"]').addEventListener('click', refresh)
    function batchBody () { return {
      limit: Number(panel.querySelector('[data-role="limit"]').value || 20),
      batchSize: Number(panel.querySelector('[data-role="limit"]').value || 100),
      source: panel.querySelector('[data-role="source"]').value || undefined,
      delayMs: Number(panel.querySelector('[data-role="delay"]').value || 1500),
      missingOnly: panel.querySelector('[data-role="missing"]').value !== 'false',
    } }
    panel.querySelector('[data-act="start"]').addEventListener('click', async () => {
      statusEl.textContent = '正在启动单批刮削…'
      try {
        const r = await postJson('/api/games/scrape/batch', batchBody())
        statusEl.textContent = formatStatus(r.status || {})
        clearInterval(ensureBatchUi._timer)
        ensureBatchUi._timer = setInterval(refresh, 2500)
      } catch (e) { statusEl.textContent = '启动失败：' + e.message }
    })
    panel.querySelector('[data-act="auto"]').addEventListener('click', async ev => {
      const btn = ev.currentTarget
      const oldText = btn.textContent
      btn.textContent = '启动中…'
      btn.disabled = true
      statusEl.textContent = '正在启动自动连续刮削…'
      try {
        const body = batchBody(); body.restMs = 15 * 60 * 1000
        const r = await postJson('/api/games/scrape/auto', body)
        statusEl.textContent = formatAutoStatus(r.status || {})
        clearInterval(ensureBatchUi._timer)
        ensureBatchUi._timer = setInterval(refresh, 5000)
        setTimeout(refresh, 800)
      } catch (e) { statusEl.textContent = '启动自动失败：' + e.message }
      finally { setTimeout(() => { btn.disabled = false; btn.textContent = oldText }, 1500) }
    })
    panel.querySelector('[data-act="stop-auto"]').addEventListener('click', async () => {
      try { await postJson('/api/games/scrape/auto/stop', {}); await refresh() }
      catch (e) { statusEl.textContent = '停止失败：' + e.message }
    })
  }
  function run () { enhanceHome(); enhancePlay(); ensureStatusFilterUi(); ensureBatchUi() }
  const mo = new MutationObserver(() => { clearTimeout(run._t); run._t = setTimeout(run, 250) })
  window.addEventListener('DOMContentLoaded', run)
  window.addEventListener('popstate', () => setTimeout(run, 250))
  mo.observe(document.documentElement, { childList: true, subtree: true })
  setInterval(() => { enhanceHome(); enhancePlay(); ensureStatusFilterUi(); ensureBatchUi() }, 10000)
})()
