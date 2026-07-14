// FlashGames-SWF virtual controls
// Direction keys use real hold behavior so games can detect double-tap + hold dash.
// Action keys keep double-tap lock. The whole control layer blocks mobile long-press menus.
(function () {
  'use strict';

  if (window.__FlashGamesSwfVirtualControlsLoaded) return;
  window.__FlashGamesSwfVirtualControlsLoaded = true;

  var ROOT_ID = 'fg-virtual-controls';
  var DOUBLE_TAP_MS = 300;
  var directionKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  var actionKeys = [
    { label: 'J', key: 'j', code: 'KeyJ' },
    { label: 'K', key: 'k', code: 'KeyK' },
    { label: 'L', key: 'l', code: 'KeyL' },
    { label: 'U', key: 'u', code: 'KeyU' },
    { label: 'I', key: 'i', code: 'KeyI' },
    { label: 'O', key: 'o', code: 'KeyO' },
    { label: '空格', key: ' ', code: 'Space' }
  ];

  var state = Object.create(null);

  function isPlayPage() {
    return /^\/play(?:\/|$)/.test(location.pathname);
  }

  function keyInfo(key) {
    if (key === 'ArrowUp') return { key: 'ArrowUp', code: 'ArrowUp' };
    if (key === 'ArrowDown') return { key: 'ArrowDown', code: 'ArrowDown' };
    if (key === 'ArrowLeft') return { key: 'ArrowLeft', code: 'ArrowLeft' };
    if (key === 'ArrowRight') return { key: 'ArrowRight', code: 'ArrowRight' };
    var found = actionKeys.find(function (it) { return it.key === key; });
    return found || { key: key, code: key };
  }

  function keyCodeFor(info) {
    if (info.code === 'Space') return 32;
    if (info.code === 'ArrowLeft') return 37;
    if (info.code === 'ArrowUp') return 38;
    if (info.code === 'ArrowRight') return 39;
    if (info.code === 'ArrowDown') return 40;
    if (/^Key[A-Z]$/.test(info.code)) return info.code.charCodeAt(3);
    return 0;
  }

  function dispatch(type, key) {
    var info = keyInfo(key);
    var eventInit = {
      key: info.key,
      code: info.code,
      keyCode: keyCodeFor(info),
      which: keyCodeFor(info),
      bubbles: true,
      cancelable: true
    };
    try {
      window.dispatchEvent(new KeyboardEvent(type, eventInit));
      document.dispatchEvent(new KeyboardEvent(type, eventInit));
    } catch (_) {
      var ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
      ev.key = info.key;
      ev.code = info.code;
      ev.keyCode = eventInit.keyCode;
      ev.which = eventInit.which;
      document.dispatchEvent(ev);
      window.dispatchEvent(ev);
    }
  }

  function ensureState(key) {
    if (!state[key]) state[key] = { down: false, locked: false, lastTap: 0, pointerId: null };
    return state[key];
  }

  function keyDown(key) {
    var s = ensureState(key);
    if (s.down) return;
    s.down = true;
    dispatch('keydown', key);
  }

  function keyUp(key) {
    var s = ensureState(key);
    if (!s.down) return;
    s.down = false;
    dispatch('keyup', key);
  }

  function stop(ev) {
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  function releaseAll() {
    Object.keys(state).forEach(function (key) {
      state[key].locked = false;
      state[key].pointerId = null;
      keyUp(key);
      var btn = document.querySelector('[data-fg-key="' + cssEscape(key) + '"]');
      if (btn) btn.classList.remove('fg-vkey-locked', 'fg-vkey-active');
    });
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
  }

  function bindButton(btn, key, isDirection) {
    var s = ensureState(key);

    btn.addEventListener('pointerdown', function (ev) {
      stop(ev);
      try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
      s.pointerId = ev.pointerId;

      if (isDirection) {
        // Direction keys: real keyboard behavior.
        // Tap once, release, then tap+hold again => the game itself can detect dash.
        keyDown(key);
        btn.classList.add('fg-vkey-active');
        return;
      }

      var now = Date.now();
      if (s.locked) {
        s.locked = false;
        btn.classList.remove('fg-vkey-locked');
        keyUp(key);
        return;
      }

      if (now - s.lastTap <= DOUBLE_TAP_MS) {
        s.locked = true;
        s.lastTap = 0;
        keyDown(key);
        btn.classList.add('fg-vkey-locked');
        return;
      }

      s.lastTap = now;
      keyDown(key);
      btn.classList.add('fg-vkey-active');
    }, { passive: false });

    function end(ev) {
      stop(ev);
      try { btn.releasePointerCapture(ev.pointerId); } catch (_) {}
      s.pointerId = null;
      btn.classList.remove('fg-vkey-active');
      if (isDirection) {
        keyUp(key);
      } else if (!s.locked) {
        keyUp(key);
      }
    }

    btn.addEventListener('pointerup', end, { passive: false });
    btn.addEventListener('pointercancel', end, { passive: false });
    btn.addEventListener('lostpointercapture', function () {
      btn.classList.remove('fg-vkey-active');
      if (!s.locked) keyUp(key);
    }, { passive: false });
  }

  function createButton(label, key, cls, isDirection) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fg-vkey ' + (cls || '');
    btn.textContent = label;
    btn.setAttribute('data-fg-key', key);
    bindButton(btn, key, isDirection);
    return btn;
  }

  function createUi() {
    if (!isPlayPage()) return;
    if (document.getElementById(ROOT_ID)) return;

    var style = document.createElement('style');
    style.textContent = `
#${ROOT_ID}, #${ROOT_ID} * {
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  touch-action: none !important;
}
#${ROOT_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#${ROOT_ID} .fg-pad, #${ROOT_ID} .fg-actions {
  position: absolute;
  pointer-events: auto;
}
#${ROOT_ID} .fg-pad {
  left: max(14px, env(safe-area-inset-left));
  bottom: max(18px, env(safe-area-inset-bottom));
  width: 168px;
  height: 168px;
}
#${ROOT_ID} .fg-actions {
  right: max(14px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(3, 54px);
  grid-auto-rows: 54px;
  gap: 10px;
}
#${ROOT_ID} .fg-vkey {
  position: absolute;
  border: 1px solid rgba(255,255,255,.35);
  border-radius: 16px;
  background: rgba(15,23,42,.48);
  color: white;
  font-weight: 700;
  font-size: 18px;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(0,0,0,.22);
  width: 54px;
  height: 54px;
  padding: 0;
}
#${ROOT_ID} .fg-actions .fg-vkey { position: relative; }
#${ROOT_ID} .fg-dir-up { left: 57px; top: 0; }
#${ROOT_ID} .fg-dir-left { left: 0; top: 57px; }
#${ROOT_ID} .fg-dir-right { right: 0; top: 57px; }
#${ROOT_ID} .fg-dir-down { left: 57px; bottom: 0; }
#${ROOT_ID} .fg-vkey-active { background: rgba(59,130,246,.72); }
#${ROOT_ID} .fg-vkey-locked { background: rgba(34,197,94,.76); border-color: rgba(187,247,208,.9); }
@media (max-width: 700px) {
  #${ROOT_ID} .fg-pad { transform: scale(.92); transform-origin: left bottom; }
  #${ROOT_ID} .fg-actions { transform: scale(.92); transform-origin: right bottom; }
}
`;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = ROOT_ID;

    ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
      root.addEventListener(name, stop, { passive: false });
    });

    var pad = document.createElement('div');
    pad.className = 'fg-pad';
    pad.appendChild(createButton('▲', 'ArrowUp', 'fg-dir-up', true));
    pad.appendChild(createButton('◀', 'ArrowLeft', 'fg-dir-left', true));
    pad.appendChild(createButton('▶', 'ArrowRight', 'fg-dir-right', true));
    pad.appendChild(createButton('▼', 'ArrowDown', 'fg-dir-down', true));

    var actions = document.createElement('div');
    actions.className = 'fg-actions';
    actionKeys.forEach(function (it) {
      actions.appendChild(createButton(it.label, it.key, '', false));
    });

    root.appendChild(pad);
    root.appendChild(actions);
    document.body.appendChild(root);

    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) releaseAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUi);
  } else {
    createUi();
  }
})();
