// ======= Flash Games 手机虚拟按键 v1 =======
// 通用方向键 + 动作键，给 Ruffle/Flash 游戏在手机端用。
(function () {
  'use strict';

  var isVisible = false;
  var isEnabled = localStorage.getItem('fg-vkeys-enabled') === '1';
  var moveMode = localStorage.getItem('fg-vkeys-move-mode') || 'both'; // both | arrows | wasd
  var root = null;
  var toggleBtn = null;
  var saveBtn = null;
  var configToolbarBtn = null;
  var touchGuard = null;
  var activeKeys = Object.create(null);
  var suppressBrowserMenuUntil = 0;
  var pollTimer = null;
  var keyKeepAliveTimer = null;

  var KEY_INFO = {
    ArrowUp:    { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38, which: 38 },
    ArrowDown:  { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40, which: 40 },
    ArrowLeft:  { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37, which: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39 },
    KeyW:       { key: 'w', code: 'KeyW', keyCode: 87, which: 87 },
    KeyA:       { key: 'a', code: 'KeyA', keyCode: 65, which: 65 },
    KeyS:       { key: 's', code: 'KeyS', keyCode: 83, which: 83 },
    KeyD:       { key: 'd', code: 'KeyD', keyCode: 68, which: 68 },
    KeyJ:       { key: 'j', code: 'KeyJ', keyCode: 74, which: 74 },
    KeyK:       { key: 'k', code: 'KeyK', keyCode: 75, which: 75 },
    KeyL:       { key: 'l', code: 'KeyL', keyCode: 76, which: 76 },
    KeyU:       { key: 'u', code: 'KeyU', keyCode: 85, which: 85 },
    KeyI:       { key: 'i', code: 'KeyI', keyCode: 73, which: 73 },
    KeyO:       { key: 'o', code: 'KeyO', keyCode: 79, which: 79 },
    Space:      { key: ' ', code: 'Space', keyCode: 32, which: 32 }
  };
  // fg-full-keyboard-info: 补全 A-Z、0-9，给自定义按键使用。
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) {
    KEY_INFO['Key' + ch] = { key: ch.toLowerCase(), code: 'Key' + ch, keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0) };
  });
  '0123456789'.split('').forEach(function (n) {
    KEY_INFO['Digit' + n] = { key: n, code: 'Digit' + n, keyCode: 48 + Number(n), which: 48 + Number(n) };
  });

  var ACTION_SLOTS = [
    { id: 'j', cls: 'fg-vkey-j', defaultCode: 'KeyJ', name: '按键1' },
    { id: 'k', cls: 'fg-vkey-k', defaultCode: 'KeyK', name: '按键2' },
    { id: 'l', cls: 'fg-vkey-l', defaultCode: 'KeyL', name: '按键3' },
    { id: 'u', cls: 'fg-vkey-u', defaultCode: 'KeyU', name: '按键4' },
    { id: 'i', cls: 'fg-vkey-i', defaultCode: 'KeyI', name: '按键5' },
    { id: 'space', cls: 'fg-vkey-space', defaultCode: 'Space', name: '按键6' }
  ];
  var KEY_CHOICES = (function () {
    var list = [];
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) { list.push('Key' + ch); });
    '0123456789'.split('').forEach(function (n) { list.push('Digit' + n); });
    return list.concat(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  })();
  var CONFIG_KEY = 'fg-vkey-game-configs';
  var configPanel = null;

  function currentGameId() {
    var parts = window.location.pathname.split('/');
    var idx = parts.indexOf('play');
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : 'default';
  }
  function readConfigs() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writeConfigs(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg || {}));
  }
  function currentGameConfig() {
    var all = readConfigs();
    return all[currentGameId()] || {};
  }
  function slotCode(slot) {
    var cfg = currentGameConfig();
    return (cfg.actions && cfg.actions[slot.id]) || slot.defaultCode;
  }
  function codeLabel(code) {
    var map = { Space: '空格', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    if (map[code]) return map[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return code || '?';
  }
  function saveSlotCode(slotId, code) {
    var all = readConfigs();
    var id = currentGameId();
    all[id] = all[id] || {};
    all[id].actions = all[id].actions || {};
    all[id].actions[slotId] = code;
    all[id].updatedAt = new Date().toISOString();
    writeConfigs(all);
    refreshActionLabels();
  }
  function resetCurrentGameConfig() {
    var all = readConfigs();
    delete all[currentGameId()];
    writeConfigs(all);
    refreshActionLabels();
    if (configPanel) { configPanel.remove(); configPanel = null; }
    openConfigPanel();
  }
  function refreshActionLabels() {
    ACTION_SLOTS.forEach(function (slot) {
      var btn = document.querySelector('[data-fg-slot="' + slot.id + '"]');
      if (btn) {
        var code = slotCode(slot);
        btn.textContent = codeLabel(code);
        btn.title = slot.name + '：' + codeLabel(code) + '（双点锁定长按）';
      }
    });
  }

  function isTouchLike() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 900;
  }

  function isGamePage() {
    return /\/(?:game|play)\/\d+/.test(window.location.pathname) || !!document.querySelector('ruffle-player');
  }

  function keyInfo(code) {
    return KEY_INFO[code] || KEY_INFO.Space;
  }

  function focusPlayer() {
    var player = document.querySelector('ruffle-player');
    if (!player) return;
    try { if (!player.hasAttribute('tabindex')) player.setAttribute('tabindex', '0'); } catch (e) {}
    try { player.focus && player.focus({ preventScroll: true }); } catch (e) { try { player.focus && player.focus(); } catch (_) {} }
    try {
      if (player.shadowRoot) {
        var focusTarget = player.shadowRoot.querySelector('canvas, .player, [tabindex], object, embed');
        if (focusTarget) {
          if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '0');
          focusTarget.focus && focusTarget.focus({ preventScroll: true });
        }
      }
    } catch (e) {}
  }

  function makeKeyboardEvent(type, code) {
    var info = keyInfo(code);
    var evt;
    try {
      evt = new KeyboardEvent(type, {
        key: info.key,
        code: info.code,
        keyCode: info.keyCode,
        charCode: type === 'keypress' ? info.which : 0,
        which: info.which,
        location: 0,
        repeat: false,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      try { Object.defineProperty(evt, 'keyCode', { configurable: true, get: function () { return info.keyCode; } }); } catch (_) {}
      try { Object.defineProperty(evt, 'which', { configurable: true, get: function () { return info.which; } }); } catch (_) {}
      try { Object.defineProperty(evt, 'charCode', { configurable: true, get: function () { return type === 'keypress' ? info.which : 0; } }); } catch (_) {}
    } catch (e) {
      evt = document.createEvent('KeyboardEvent');
      evt.initKeyboardEvent(type, true, true, window, info.key, 0, '', false, '');
    }
    return evt;
  }

  function keyboardTargets() {
    var targets = [];
    function add(t) { if (t && targets.indexOf(t) < 0) targets.push(t); }
    var player = document.querySelector('ruffle-player');
    add(document.activeElement);
    add(player);
    if (player && player.shadowRoot) {
      add(player.shadowRoot);
      add(player.shadowRoot.getElementById('container'));
      add(player.shadowRoot.getElementById('virtual-keyboard'));
      var nodes = player.shadowRoot.querySelectorAll('#container, #container *, canvas, .player, [tabindex], object, embed');
      for (var i = 0; i < nodes.length; i++) add(nodes[i]);
    }
    add(document.body);
    add(document.documentElement);
    add(document);
    add(window);
    return targets;
  }

  function fireKeyboard(type, code) {
    var targets = keyboardTargets();
    for (var i = 0; i < targets.length; i++) {
      try { targets[i].dispatchEvent(makeKeyboardEvent(type, code)); } catch (e) {}
    }
  }

  function codeList(codeOrList) {
    return Array.isArray(codeOrList) ? codeOrList : [codeOrList];
  }

  function press(code) {
    focusPlayer();
    codeList(code).forEach(function (c) {
      if (activeKeys[c]) return;
      activeKeys[c] = true;
      fireKeyboard('keydown', c);
      // 一些 AS2 游戏只在 keypress/charCode 上处理字母动作键，补发一次。
      if (/^Key/.test(c) || c === 'Space') fireKeyboard('keypress', c);
    });
  }

  function release(code) {
    codeList(code).forEach(function (c) {
      if (!activeKeys[c]) return;
      delete activeKeys[c];
      fireKeyboard('keyup', c);
    });
  }

  function releaseAll() {
    Object.keys(activeKeys).forEach(release);
    try {
      document.querySelectorAll('.fg-vkey-locked').forEach(function (el) { el.classList.remove('fg-vkey-locked', 'fg-vkey-active'); });
    } catch (_) {}
    try { document.documentElement.classList.remove('fg-vkey-suppress-callout'); document.body.classList.remove('fg-vkey-suppress-callout'); } catch (_) {}
  }

  function suppressBrowserMenu(ms) {
    suppressBrowserMenuUntil = Date.now() + (ms || 1200);
    try { document.documentElement.classList.add('fg-vkey-suppress-callout'); document.body.classList.add('fg-vkey-suppress-callout'); } catch (_) {}
  }

  function shouldSuppressBrowserMenu() {
    return isVisible && (Date.now() < suppressBrowserMenuUntil || Object.keys(activeKeys).length > 0);
  }

  function globalSuppressHandler(ev, stopFlow) {
    if (!shouldSuppressBrowserMenu()) return;
    try {
      ev.preventDefault();
      // pointer/touch 事件不能阻断传播，否则虚拟按键自身收不到按下事件；菜单/选择类事件才彻底拦截。
      if (stopFlow) { ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); }
    } catch (_) {}
    return false;
  }

  function installGamePageLongPressGuard() {
    try {
      document.documentElement.classList.add('fg-game-no-callout');
      document.body && document.body.classList.add('fg-game-no-callout');
    } catch (_) {}
    function blockPageMenu(ev) {
      if (!isGamePage()) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      return false;
    }
    ['contextmenu','selectstart','dragstart','gesturestart'].forEach(function (name) {
      document.addEventListener(name, blockPageMenu, true);
      window.addEventListener(name, blockPageMenu, true);
    });
    // 很多手机/微信 WebView 的长按菜单不是等 contextmenu 才决定，而是在 touchstart/touchmove 阶段开始计时。
    // 这里全局 preventDefault，但不阻断传播，避免再次把虚拟按键自己的事件拦掉。
    ['touchstart','touchmove','pointerdown','pointermove'].forEach(function (name) {
      document.addEventListener(name, function (ev) {
        if (!isGamePage()) return;
        var t = ev.target;
        try {
          if (t && t.closest && t.closest('#fg-vkey-config-panel,input,textarea,select')) return;
        } catch (_) {}
        try { ev.preventDefault(); } catch (_) {}
      }, { capture: true, passive: false });
    });
  }

  function effectiveMoveMode() {
    // 《冒险王之神兵传奇》移动键是 WASD，方向键无效；按游戏 id 强制映射。
    if (/\/play\/14754(?:\b|$)/.test(window.location.pathname)) return 'wasd';
    return moveMode;
  }

  function moveCode(dir) {
    var arrows = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    var wasd = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
    var mode = effectiveMoveMode();
    if (mode === 'wasd') return wasd[dir];
    if (mode === 'arrows') return arrows[dir];
    // 默认 both：同时发方向键和 WASD，兼容不同 Flash 游戏。
    return [arrows[dir], wasd[dir]];
  }

  function bindButton(el, getCode) {
    var isDirectionButton = /fg-vkey-(up|down|left|right)/.test(el.className || '');
    if (isDirectionButton) {
      var dirActive = false;
      var dirCode = null;
      var dirPointerId = null;
      function currentDirCode() { return typeof getCode === 'function' ? getCode() : getCode; }
      function preventDir(ev) { suppressBrowserMenu(1600); if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } }
      function startDir(ev) {
        preventDir(ev);
        if (ev && ev.pointerId != null && el.setPointerCapture) {
          try { el.setPointerCapture(ev.pointerId); dirPointerId = ev.pointerId; } catch (_) {}
        }
        if (dirActive) return;
        dirActive = true;
        dirCode = currentDirCode();
        el.classList.add('fg-vkey-active');
        press(dirCode);
      }
      function endDir(ev) {
        preventDir(ev);
        if (dirPointerId != null && el.releasePointerCapture) {
          try { el.releasePointerCapture(dirPointerId); } catch (_) {}
          dirPointerId = null;
        }
        if (!dirActive) return;
        dirActive = false;
        el.classList.remove('fg-vkey-active');
        release(dirCode || currentDirCode());
        dirCode = null;
        suppressBrowserMenu(700);
        setTimeout(function () { if (!Object.keys(activeKeys).length) { try { document.documentElement.classList.remove('fg-vkey-suppress-callout'); document.body.classList.remove('fg-vkey-suppress-callout'); } catch (_) {} } }, 750);
      }
      // 方向键必须支持“第二次按住=冲刺”，所以不用双击锁定；同时用 pointer capture + 全量阻止默认行为避免手机长按菜单。
      if (window.PointerEvent) {
        el.addEventListener('pointerdown', startDir, { passive: false });
        el.addEventListener('pointerup', endDir, { passive: false });
        el.addEventListener('pointercancel', endDir, { passive: false });
        el.addEventListener('lostpointercapture', endDir, { passive: false });
      }
      el.addEventListener('touchstart', startDir, { passive: false });
      el.addEventListener('touchmove', preventDir, { passive: false });
      el.addEventListener('touchend', endDir, { passive: false });
      el.addEventListener('touchcancel', endDir, { passive: false });
      el.addEventListener('contextmenu', function (ev) { preventDir(ev); return false; }, { passive: false });
      return;
    }

    var lastTapAt = 0;
    var locked = false;
    var codeForLock = null;
    var tapTimer = null;

    function currentCode() {
      return typeof getCode === 'function' ? getCode() : getCode;
    }
    function prevent(ev) {
      if (!ev) return;
      ev.preventDefault();
      ev.stopPropagation();
    }
    function shortPress(code) {
      press(code);
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { release(code); }, 140);
    }
    function lockPress(code) {
      locked = true;
      codeForLock = code;
      el.classList.add('fg-vkey-active', 'fg-vkey-locked');
      press(code);
    }
    function unlockPress() {
      locked = false;
      el.classList.remove('fg-vkey-active', 'fg-vkey-locked');
      if (codeForLock) release(codeForLock);
      codeForLock = null;
    }
    function handleTap(ev) {
      prevent(ev);
      var now = Date.now();
      var code = currentCode();
      if (locked) {
        unlockPress();
        lastTapAt = 0;
        return;
      }
      if (now - lastTapAt < 420) {
        clearTimeout(tapTimer);
        lockPress(code);
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      el.classList.add('fg-vkey-active');
      shortPress(code);
      setTimeout(function () { if (!locked) el.classList.remove('fg-vkey-active'); }, 160);
    }

    // 新交互：单点=短按；连续点两次=锁定长按；锁定后再点一次=释放。
    // 这样避免手机浏览器因手指长时间按住屏幕而弹出系统菜单。
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', function (ev) { prevent(ev); focusPlayer(); }, { passive: false });
      el.addEventListener('pointerup', handleTap, { passive: false });
      el.addEventListener('pointercancel', function (ev) { prevent(ev); if (!locked) el.classList.remove('fg-vkey-active'); }, { passive: false });
      el.addEventListener('pointerleave', function (ev) { if (!locked) el.classList.remove('fg-vkey-active'); }, { passive: false });
    } else {
      el.addEventListener('touchstart', function (ev) { prevent(ev); focusPlayer(); }, { passive: false });
      el.addEventListener('touchend', handleTap, { passive: false });
      el.addEventListener('click', handleTap, { passive: false });
    }
  }

  function makeBtn(label, cls, codeOrFn, title) {
    // 手机/微信 WebView 对 <button> 长按常会强制弹出系统菜单；游戏内虚拟键改用 div，避免原生按钮长按行为。
    var b = document.createElement('div');
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', title || label);
    b.setAttribute('tabindex', '-1');
    b.draggable = false;
    b.className = 'fg-vkey ' + cls;
    b.textContent = label;
    b.title = title || label;
    try {
      b.style.webkitTouchCallout = 'none';
      b.style.webkitUserSelect = 'none';
      b.style.userSelect = 'none';
      b.style.touchAction = 'none';
      b.style.webkitTapHighlightColor = 'transparent';
    } catch (_) {}
    bindButton(b, codeOrFn);
    ['contextmenu','selectstart','dragstart','mousedown','mouseup','click'].forEach(function (name) {
      b.addEventListener(name, function (ev) {
        if (name !== 'click') { ev.preventDefault(); ev.stopPropagation(); return false; }
      }, { passive: false });
    }); // fg-vkey-anti-longpress
    return b;
  }

  function ensureTouchGuard() {
    if (touchGuard || document.getElementById('fg-touch-guard')) {
      touchGuard = document.getElementById('fg-touch-guard');
      return touchGuard;
    }
    touchGuard = document.createElement('div');
    touchGuard.id = 'fg-touch-guard';
    touchGuard.setAttribute('aria-hidden', 'true');
    try {
      touchGuard.style.webkitTouchCallout = 'none';
      touchGuard.style.webkitUserSelect = 'none';
      touchGuard.style.userSelect = 'none';
      touchGuard.style.touchAction = 'none';
      touchGuard.style.webkitTapHighlightColor = 'transparent';
    } catch (_) {}
    function block(ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      return false;
    }
    ['contextmenu','selectstart','dragstart','gesturestart','touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel','mousedown','mouseup','click'].forEach(function (name) {
      touchGuard.addEventListener(name, block, { passive: false });
    });
    document.body.appendChild(touchGuard);
    return touchGuard;
  }

  function createStyles() {
    if (document.getElementById('fg-vkeys-style')) return;
    var style = document.createElement('style');
    style.id = 'fg-vkeys-style';
    style.textContent = '\
html.fg-game-no-callout,body.fg-game-no-callout,body.fg-game-no-callout *{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent!important;}\
#fg-touch-guard{position:fixed;inset:0;z-index:99995;display:none;background:transparent!important;touch-action:none!important;-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent!important;}\
body.fg-vkey-touchguard-on #fg-touch-guard{display:block;}\
#fg-vkey-config-toggle{position:fixed;right:120px;top:calc(env(safe-area-inset-top,0px) + 72px);bottom:auto;z-index:99998;width:46px;height:46px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.72);color:#fff;font-size:21px;display:none;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;}\
#fg-vkey-toggle{position:fixed;right:66px;top:calc(env(safe-area-inset-top,0px) + 72px);bottom:auto;z-index:99997;width:46px;height:46px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.72);color:#fff;font-size:21px;display:none;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;}\
#fg-pause-btn{right:174px!important;top:calc(env(safe-area-inset-top,0px) + 72px)!important;bottom:auto!important;width:46px!important;height:46px!important;z-index:99999!important;background:rgba(15,23,42,.72)!important;border:1px solid rgba(255,255,255,.25)!important;box-shadow:0 4px 16px rgba(0,0,0,.28)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;font-size:21px!important;}\
#fg-save-btn{display:none!important;}\
#fg-vkey-toggle:hover,#fg-vkey-config-toggle:hover,#fg-save-btn:hover,#fg-pause-btn:hover,#fg-cloud-btn:hover{background:rgba(37,99,235,.88)!important;transform:translateY(-1px) scale(1.04)!important;}\
html.fg-vkey-suppress-callout,body.fg-vkey-suppress-callout,body.fg-vkey-suppress-callout *{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;touch-action:none!important;}\
#fg-vkey-root{position:fixed;inset:0;z-index:99996;display:none;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}\
#fg-vkey-root.fg-vkey-show{display:block;}\
#fg-vkey-root button,#fg-vkey-root .fg-vkey{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}\
.fg-vkey-panel{position:absolute;pointer-events:auto;}\
.fg-vkey-dpad{left:14px;bottom:18px;width:168px;height:168px;}\
.fg-vkey-actions{right:12px;bottom:18px;width:214px;height:178px;}\
.fg-vkey{position:absolute;display:flex;align-items:center;justify-content:center;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;touch-action:none!important;-webkit-tap-highlight-color:transparent;border:1px solid rgba(255,255,255,.28);background:rgba(0,0,0,.45);color:#fff;border-radius:18px;font-weight:800;font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,.25);backdrop-filter:blur(4px);touch-action:none;}\
.fg-vkey-active{background:rgba(80,160,255,.82)!important;transform:scale(.96);}.fg-vkey-locked{background:rgba(34,197,94,.88)!important;border-color:rgba(187,247,208,.95)!important;box-shadow:0 0 0 3px rgba(34,197,94,.22),0 2px 12px rgba(0,0,0,.28)!important;}\
.fg-vkey-up{left:56px;top:0;width:58px;height:58px;}\
.fg-vkey-left{left:0;top:56px;width:58px;height:58px;}\
.fg-vkey-mid{left:56px;top:56px;width:58px;height:58px;border-radius:999px;font-size:13px;background:rgba(0,0,0,.35);}\
.fg-vkey-right{left:112px;top:56px;width:58px;height:58px;}\
.fg-vkey-down{left:56px;top:112px;width:58px;height:58px;}\
.fg-vkey-j{right:76px;bottom:74px;width:62px;height:62px;border-radius:999px;}\
.fg-vkey-k{right:8px;bottom:108px;width:62px;height:62px;border-radius:999px;}\
.fg-vkey-l{right:8px;bottom:40px;width:62px;height:62px;border-radius:999px;}\
.fg-vkey-u{right:144px;bottom:108px;width:52px;height:52px;border-radius:999px;font-size:15px;}\
.fg-vkey-i{right:144px;bottom:50px;width:52px;height:52px;border-radius:999px;font-size:15px;}\
.fg-vkey-space{right:76px;bottom:8px;width:62px;height:48px;border-radius:16px;font-size:14px;}\
.fg-vkey-config{right:144px;bottom:8px;width:52px;height:36px;border-radius:14px;font-size:17px;}\
#fg-vkey-config-panel{position:fixed;right:12px;bottom:210px;z-index:100000;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 260px);overflow:auto;background:rgba(15,23,42,.97);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,.38);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}\
.fg-vkey-config-title{font-weight:800;font-size:16px;margin-bottom:4px;}\
.fg-vkey-config-sub{font-size:12px;color:#cbd5e1;margin-bottom:10px;}\
.fg-vkey-config-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;}\
.fg-vkey-config-row select{min-width:110px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff;padding:6px 8px;}\
.fg-vkey-config-actions{margin-top:12px;text-align:right;}\
.fg-vkey-config-actions button{margin-left:8px;border:0;border-radius:9px;background:#334155;color:#fff;padding:8px 10px;}\
.fg-vkey-mode{left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:999px;font-size:12px;color:rgba(255,255,255,.88);}\
@media (max-width:520px){#fg-pause-btn{right:162px!important;}#fg-vkey-config-toggle{right:112px!important;}#fg-save-btn{display:none!important;}#fg-vkey-toggle{right:62px!important;}#fg-cloud-btn{right:12px!important;}#fg-pause-btn,#fg-vkey-toggle,#fg-vkey-config-toggle,#fg-cloud-btn{top:calc(env(safe-area-inset-top,0px) + 72px)!important;width:42px!important;height:42px!important;font-size:19px!important;}.fg-vkey-dpad{transform:scale(.86);transform-origin:left bottom;}.fg-vkey-actions{transform:scale(.86);transform-origin:right bottom;right:4px;}.fg-vkey{background:rgba(0,0,0,.42);}}\
';
    document.head.appendChild(style);
  }

  function openRuffleSaveManager() {
    var player = document.querySelector('ruffle-player');
    if (!player) {
      alert('还没有找到游戏播放器，请等游戏加载完成后再试。');
      return;
    }
    try {
      if (typeof player.openSaveManager === 'function') {
        player.openSaveManager();
        return;
      }
      if (player.shadowRoot) {
        var modal = player.shadowRoot.getElementById('save-manager');
        if (modal) {
          if (typeof player.populateSaves === 'function') player.populateSaves();
          modal.classList.remove('hidden');
          return;
        }
      }
    } catch (e) {
      console.warn('[save-manager] open failed', e);
    }
    alert('当前 Ruffle 没有暴露存档管理入口。游戏内正常保存仍会保存在本浏览器里。');
  }

  window.FlashGamesOpenSaveManager = openRuffleSaveManager;

  function makeActionBtn(slot) {
    var b = makeBtn(codeLabel(slotCode(slot)), slot.cls, function () { return slotCode(slot); }, slot.name);
    b.dataset.fgSlot = slot.id;
    b.title = slot.name + '：' + codeLabel(slotCode(slot)) + '（双点锁定长按）';
    return b;
  }

  function openConfigPanel() {
    if (configPanel) { configPanel.remove(); configPanel = null; return; }
    var panel = document.createElement('div');
    panel.id = 'fg-vkey-config-panel';
    var html = '<div class="fg-vkey-config-title">🎮 按键设置</div>' +
      '<div class="fg-vkey-config-sub">当前游戏：' + currentGameId() + '。方向键固定；右侧动作键可选 A-Z、0-9、空格和方向键，配置会随云存档同步。</div>';
    ACTION_SLOTS.forEach(function (slot) {
      html += '<label class="fg-vkey-config-row"><span>' + slot.name + '</span><select data-slot="' + slot.id + '">';
      KEY_CHOICES.forEach(function (code) {
        html += '<option value="' + code + '"' + (slotCode(slot) === code ? ' selected' : '') + '>' + codeLabel(code) + '</option>';
      });
      html += '</select></label>';
    });
    html += '<div class="fg-vkey-config-actions"><button id="fg-vkey-config-reset">恢复默认</button><button id="fg-vkey-config-close">完成</button></div>';
    panel.innerHTML = html;
    document.body.appendChild(panel);
    configPanel = panel;
    panel.querySelectorAll('select[data-slot]').forEach(function (sel) {
      sel.onchange = function () { saveSlotCode(sel.getAttribute('data-slot'), sel.value); };
    });
    panel.querySelector('#fg-vkey-config-reset').onclick = function (ev) { ev.preventDefault(); resetCurrentGameConfig(); };
    panel.querySelector('#fg-vkey-config-close').onclick = function (ev) { ev.preventDefault(); panel.remove(); configPanel = null; };
    ['contextmenu','selectstart','dragstart'].forEach(function (name) {
      panel.addEventListener(name, function (ev) { ev.stopPropagation(); }, { passive: false });
    });
  }

  function createUi() {
    if (root) return;
    createStyles();

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'fg-vkey-toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '🎮';
    toggleBtn.title = '显示/隐藏手机虚拟按键';
    var lastToggleAt = 0;
    function toggleVirtualKeys(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      var now = Date.now();
      if (now - lastToggleAt < 300) return;
      lastToggleAt = now;
      isEnabled = !isEnabled;
      localStorage.setItem('fg-vkeys-enabled', isEnabled ? '1' : '0');
      updateUi();
    }
    toggleBtn.onclick = toggleVirtualKeys;
    toggleBtn.addEventListener('pointerup', toggleVirtualKeys, { passive: false });
    toggleBtn.addEventListener('touchend', toggleVirtualKeys, { passive: false });
    document.body.appendChild(toggleBtn);

    saveBtn = document.createElement('button');
    saveBtn.id = 'fg-save-btn';
    saveBtn.type = 'button';
    saveBtn.textContent = '💾';
    saveBtn.title = '打开存档管理（下载/替换/删除 .sol 存档）';
    saveBtn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openRuffleSaveManager();
    };
    document.body.appendChild(saveBtn);

    configToolbarBtn = document.createElement('button');
    configToolbarBtn.id = 'fg-vkey-config-toggle';
    configToolbarBtn.type = 'button';
    configToolbarBtn.textContent = '⚙';
    configToolbarBtn.title = '自定义当前游戏按键';
    configToolbarBtn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openConfigPanel();
    };
    ['contextmenu','selectstart','dragstart'].forEach(function (name) {
      configToolbarBtn.addEventListener(name, function (ev) { ev.preventDefault(); ev.stopPropagation(); return false; }, { passive: false });
    });
    document.body.appendChild(configToolbarBtn);

    root = document.createElement('div');
    root.id = 'fg-vkey-root';

    var dpad = document.createElement('div');
    dpad.className = 'fg-vkey-panel fg-vkey-dpad';
    dpad.appendChild(makeBtn('▲', 'fg-vkey-up', function () { return moveCode('up'); }, '上'));
    dpad.appendChild(makeBtn('◀', 'fg-vkey-left', function () { return moveCode('left'); }, '左'));
    dpad.appendChild(makeBtn('▶', 'fg-vkey-right', function () { return moveCode('right'); }, '右'));
    dpad.appendChild(makeBtn('▼', 'fg-vkey-down', function () { return moveCode('down'); }, '下'));

    var mode = document.createElement('button');
    mode.type = 'button';
    mode.className = 'fg-vkey fg-vkey-mid';
    mode.textContent = effectiveMoveMode() === 'wasd' ? 'WASD' : (moveMode === 'both' ? '双向' : (moveMode === 'wasd' ? 'WASD' : '方向'));
    mode.title = '切换方向键/WASD';
    mode.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      releaseAll();
      moveMode = moveMode === 'both' ? 'arrows' : (moveMode === 'arrows' ? 'wasd' : 'both');
      localStorage.setItem('fg-vkeys-move-mode', moveMode);
      mode.textContent = effectiveMoveMode() === 'wasd' ? 'WASD' : (moveMode === 'both' ? '双向' : (moveMode === 'wasd' ? 'WASD' : '方向'));
    };
    dpad.appendChild(mode);

    var actions = document.createElement('div');
    actions.className = 'fg-vkey-panel fg-vkey-actions';
    ACTION_SLOTS.forEach(function (slot) { actions.appendChild(makeActionBtn(slot)); });

    root.appendChild(dpad);
    root.appendChild(actions);
    ensureTouchGuard();
    document.body.appendChild(root);
    installGamePageLongPressGuard();
    ['contextmenu','selectstart','dragstart'].forEach(function (name) {
      root.addEventListener(name, function (ev) { ev.preventDefault(); ev.stopPropagation(); return false; }, { passive: false });
    }); // fg-vkey-root-contextmenu-guard

    ['contextmenu','selectstart','dragstart','gesturestart'].forEach(function (name) {
      document.addEventListener(name, function (ev) { return globalSuppressHandler(ev, true); }, true);
      window.addEventListener(name, function (ev) { return globalSuppressHandler(ev, true); }, true);
    });
    ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel'].forEach(function (name) {
      document.addEventListener(name, function (ev) {
        var t = ev.target;
        var inVkey = false;
        try { inVkey = !!(t && t.closest && t.closest('#fg-vkey-root,#fg-vkey-toggle,#fg-vkey-config-toggle,#fg-vkey-config-panel')); } catch (_) {}
        if (inVkey) suppressBrowserMenu(1600);
        if (shouldSuppressBrowserMenu() && inVkey) globalSuppressHandler(ev, false);
      }, { capture: true, passive: false });
    });

    window.addEventListener('blur', releaseAll);
    document.addEventListener('keydown', function (ev) {
      if (!isVisible) return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(ev.key) >= 0) ev.preventDefault();
    }, { passive: false }); // fg-vkeys-global-key-guard
    document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });
  }

  function updateUi() {
    if (!root || !toggleBtn) return;
    var onGame = isGamePage();
    var shouldShowToggle = onGame;
    toggleBtn.style.display = shouldShowToggle ? 'flex' : 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    if (configToolbarBtn) configToolbarBtn.style.display = onGame ? 'flex' : 'none';
    refreshActionLabels();
    if (!shouldShowToggle || !isEnabled) {
      root.classList.remove('fg-vkey-show');
      try { document.body.classList.remove('fg-vkey-touchguard-on'); } catch (_) {}
      isVisible = false;
      releaseAll();
      return;
    }
    root.classList.add('fg-vkey-show');
    isVisible = true;
  }

  function startKeyKeepAlive() {
    if (keyKeepAliveTimer) clearInterval(keyKeepAliveTimer);
    keyKeepAliveTimer = setInterval(function () {
      var keys = Object.keys(activeKeys);
      if (!isVisible || keys.length === 0) return;
      focusPlayer();
      // 手机浏览器/Ruffle 偶尔会丢焦点或漏掉一次 keydown。
      // 对处于按下/锁定状态的键持续补发 keydown，相当于真实键盘长按的 repeat。
      keys.forEach(function (code) {
        fireKeyboard('keydown', code);
      });
    }, 180);
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(updateUi, 1200);
  }

  function init() {
    createUi();
    updateUi();
    startPoll();
    startKeyKeepAlive();

    var oldPush = history.pushState;
    history.pushState = function () { oldPush.apply(this, arguments); setTimeout(updateUi, 100); };
    var oldReplace = history.replaceState;
    history.replaceState = function () { oldReplace.apply(this, arguments); setTimeout(updateUi, 100); };
    window.addEventListener('popstate', function () { setTimeout(updateUi, 100); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
