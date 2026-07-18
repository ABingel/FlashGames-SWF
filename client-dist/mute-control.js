// ======= Flash Games 一键静音 v1 =======
// 目标：给 Ruffle/Flash 游戏提供独立静音按钮，兼容 HTMLMediaElement + WebAudio。
(function () {
  'use strict';

  var STORAGE_KEY = 'fg-audio-muted';
  var isMuted = localStorage.getItem(STORAGE_KEY) === '1';
  var muteBtn = null;
  var pollTimer = null;
  var patchedAudio = false;
  var originalConnect = null;
  var knownContexts = [];
  var masterGains = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function isGamePage() {
    return /\/(?:game|play)\/\d+/.test(window.location.pathname) || !!document.querySelector('ruffle-player');
  }

  function rememberContext(ctx) {
    if (ctx && knownContexts.indexOf(ctx) < 0) knownContexts.push(ctx);
  }

  function getMasterGain(ctx) {
    if (!ctx || !ctx.createGain || !masterGains) return null;
    var gain = masterGains.get(ctx);
    if (!gain) {
      try {
        gain = ctx.createGain();
        gain.gain.value = isMuted ? 0 : 1;
        // 用原始 connect 避免被我们自己的重定向逻辑递归。
        (originalConnect || gain.connect).call(gain, ctx.destination);
        masterGains.set(ctx, gain);
        rememberContext(ctx);
      } catch (_) { return null; }
    }
    return gain;
  }

  function setContextMuted(ctx, muted) {
    rememberContext(ctx);
    var gain = getMasterGain(ctx);
    if (!gain || !gain.gain) return;
    try { gain.gain.value = muted ? 0 : 1; } catch (_) {}
  }

  function patchAudioContextCtor(name) {
    var Native = window[name];
    if (!Native || Native.__fgMuteWrapped) return;
    function WrappedAudioContext() {
      var ctx = new (Function.prototype.bind.apply(Native, [null].concat([].slice.call(arguments))))();
      rememberContext(ctx);
      setContextMuted(ctx, isMuted);
      return ctx;
    }
    try {
      WrappedAudioContext.prototype = Native.prototype;
      Object.setPrototypeOf && Object.setPrototypeOf(WrappedAudioContext, Native);
      WrappedAudioContext.__fgMuteWrapped = true;
      window[name] = WrappedAudioContext;
    } catch (_) {}
  }

  function installWebAudioPatch() {
    try {
      if (!originalConnect && window.AudioNode && window.AudioNode.prototype && window.AudioNode.prototype.connect) {
        originalConnect = window.AudioNode.prototype.connect;
        window.AudioNode.prototype.connect = function (destination) {
          try {
            var ctx = this.context;
            rememberContext(ctx);
            if (ctx && destination === ctx.destination) {
              var gain = getMasterGain(ctx);
              if (gain) {
                if (arguments.length >= 2) return originalConnect.call(this, gain, arguments[1], 0);
                return originalConnect.call(this, gain);
              }
            }
          } catch (_) {}
          return originalConnect.apply(this, arguments);
        };
      }
      patchAudioContextCtor('AudioContext');
      patchAudioContextCtor('webkitAudioContext');
      patchedAudio = true;
    } catch (_) {}
  }

  function eachMediaElement(fn) {
    var roots = [document];
    try {
      document.querySelectorAll('ruffle-player').forEach(function (player) {
        if (player.shadowRoot) roots.push(player.shadowRoot);
      });
    } catch (_) {}
    roots.forEach(function (root) {
      try {
        root.querySelectorAll('audio,video').forEach(fn);
      } catch (_) {}
    });
  }

  function applyMediaMute() {
    eachMediaElement(function (el) {
      try {
        el.muted = isMuted;
        if (isMuted) {
          if (el.dataset && el.dataset.fgPrevVolume == null) el.dataset.fgPrevVolume = String(el.volume);
          el.volume = 0;
        } else if (el.dataset && el.dataset.fgPrevVolume != null) {
          var v = Number(el.dataset.fgPrevVolume);
          el.volume = isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
          delete el.dataset.fgPrevVolume;
        } else if (!isMuted && el.volume === 0) {
          el.volume = 1;
        }
      } catch (_) {}
    });
  }

  function applyRuffleMute() {
    try {
      document.querySelectorAll('ruffle-player').forEach(function (player) {
        try { player.muted = isMuted; } catch (_) {}
        try { if ('volume' in player) player.volume = isMuted ? 0 : 1; } catch (_) {}
        try { if (typeof player.setVolume === 'function') player.setVolume(isMuted ? 0 : 1); } catch (_) {}
        try { if (typeof player.set_volume === 'function') player.set_volume(isMuted ? 0 : 1); } catch (_) {}
      });
    } catch (_) {}
  }

  function applyAudioMute() {
    if (!patchedAudio) installWebAudioPatch();
    for (var i = 0; i < knownContexts.length; i++) setContextMuted(knownContexts[i], isMuted);
    applyMediaMute();
    applyRuffleMute();
    updateButton();
  }

  function updateButton() {
    if (!muteBtn) return;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.title = isMuted ? '已静音，点击恢复声音' : '点击一键静音';
    muteBtn.setAttribute('aria-label', muteBtn.title);
    muteBtn.classList.toggle('fg-muted', !!isMuted);
  }

  function toggleMute(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); }
    isMuted = !isMuted;
    localStorage.setItem(STORAGE_KEY, isMuted ? '1' : '0');
    applyAudioMute();
  }

  function createStyles() {
    if (document.getElementById('fg-mute-style')) return;
    var style = document.createElement('style');
    style.id = 'fg-mute-style';
    style.textContent = '#fg-mute-btn{position:fixed;right:228px;top:calc(env(safe-area-inset-top,0px) + 72px);bottom:auto;z-index:99999;width:46px;height:46px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.72);color:#fff;font-size:21px;display:none;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;-webkit-tap-highlight-color:transparent;padding:0}#fg-mute-btn:hover{background:rgba(37,99,235,.88);transform:translateY(-1px) scale(1.04)}#fg-mute-btn.fg-muted{background:rgba(220,38,38,.82);border-color:rgba(254,202,202,.8)}@media (max-width:520px){#fg-mute-btn{right:212px!important;top:calc(env(safe-area-inset-top,0px) + 72px)!important;width:42px!important;height:42px!important;font-size:19px!important}}';
    document.head.appendChild(style);
  }

  function createButton() {
    if (muteBtn || !document.body) return;
    createStyles();
    muteBtn = document.createElement('button');
    muteBtn.id = 'fg-mute-btn';
    muteBtn.type = 'button';
    muteBtn.addEventListener('click', toggleMute, { passive: false });
    muteBtn.addEventListener('pointerup', toggleMute, { passive: false });
    muteBtn.addEventListener('touchend', toggleMute, { passive: false });
    ['pointerdown','touchstart','contextmenu','selectstart','dragstart'].forEach(function (name) {
      muteBtn.addEventListener(name, function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); return false; }, { passive: false });
    });
    document.body.appendChild(muteBtn);
    updateButton();
  }

  var lastToggleAt = 0;
  var rawToggleMute = toggleMute;
  toggleMute = function (ev) {
    var now = Date.now();
    if (now - lastToggleAt < 500) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); }
      return;
    }
    lastToggleAt = now;
    rawToggleMute(ev);
  };

  function updateUi() {
    createButton();
    if (muteBtn) muteBtn.style.display = isGamePage() ? 'flex' : 'none';
    applyAudioMute();
  }

  function start() {
    installWebAudioPatch();
    createButton();
    updateUi();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(updateUi, 1200);
    var oldPush = history.pushState;
    history.pushState = function () { oldPush.apply(this, arguments); setTimeout(updateUi, 100); };
    var oldReplace = history.replaceState;
    history.replaceState = function () { oldReplace.apply(this, arguments); setTimeout(updateUi, 100); };
    window.addEventListener('popstate', function () { setTimeout(updateUi, 100); });
  }

  installWebAudioPatch();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
