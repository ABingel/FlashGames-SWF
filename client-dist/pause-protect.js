// ======= Flash Games 暂停防丢保护 v3 =======
// v3 新增：放宽网络限制修复外部游戏画面闪烁问题
// - 暂停/继续 + 关闭页面警告
// - 拦截 Ruffle config 允许联网
(function () {
  'use strict';

  // ===== 拦截 Ruffle 配置，允许外部游戏联网 =====
  function interceptConfigSetter(ruffle) {
    var _origConfig = ruffle.config || {};
    if (_origConfig && typeof _origConfig === 'object') {
      _origConfig.allowNetworking = 'all';
      _origConfig.allowScriptAccess = true;
      _origConfig.openUrlMode = 'allow';
    }
    Object.defineProperty(ruffle, 'config', {
      configurable: true,
      enumerable: true,
      get: function () { return _origConfig; },
      set: function (val) {
        if (val && typeof val === 'object') {
          val.allowNetworking = 'all';
          val.allowScriptAccess = true;
          val.openUrlMode = 'allow';
        }
        _origConfig = val;
      }
    });
  }

  // ===== 暂停功能 =====
  var isPaused = false, pauseBtn = null, overlay = null, isOnGamePage = false, pollTimer = null;

  function findPlayers() {
    var list = document.querySelectorAll('ruffle-player'), result = [];
    for (var i = 0; i < list.length; i++) { if (list[i].isConnected) result.push(list[i]); }
    return result;
  }

  function createPauseButton() {
    if (pauseBtn) return;
    pauseBtn = document.createElement('div');
    pauseBtn.id = 'fg-pause-btn';
    pauseBtn.innerHTML = '⏸';
    pauseBtn.title = '暂停游戏';
    pauseBtn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;font-size:24px;display:none;align-items:center;justify-content:center;cursor:pointer;transition:all .25s;user-select:none;box-shadow:0 2px 12px rgba(0,0,0,.3);border:2px solid rgba(255,255,255,.15);backdrop-filter:blur(4px);';
    pauseBtn.onmouseenter = function () { pauseBtn.style.background = 'rgba(0,0,0,0.85)'; pauseBtn.style.transform = 'scale(1.1)'; };
    pauseBtn.onmouseleave = function () { pauseBtn.style.background = 'rgba(0,0,0,0.65)'; pauseBtn.style.transform = 'scale(1)'; };
    pauseBtn.onclick = togglePause;
    document.body.appendChild(pauseBtn);
  }

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'fg-pause-overlay';
    overlay.innerHTML = '<div style="text-align:center;color:#fff"><div style="font-size:64px;line-height:1.4">⏸️</div><div style="font-size:28px;font-weight:bold;margin:16px 0 8px">游戏已暂停</div><div style="font-size:14px;color:rgba(255,255,255,.55)">点击右下角 ▶️ 按钮恢复</div></div>';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998;background:rgba(0,0,0,0.72);display:none;justify-content:center;align-items:center;flex-direction:column;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    document.body.appendChild(overlay);
  }

  function doPause() {
    var players = findPlayers();
    for (var i = 0; i < players.length; i++) { try { if (typeof players[i].pause === 'function') players[i].pause(); } catch (e) {} }
    isPaused = true;
  }

  function doResume() {
    var players = findPlayers();
    for (var i = 0; i < players.length; i++) { try { if (typeof players[i].play === 'function') players[i].play(); } catch (e) {} }
    isPaused = false;
  }

  function togglePause() {
    if (isPaused) { doResume(); if (overlay) overlay.style.display = 'none'; if (pauseBtn) { pauseBtn.innerHTML = '⏸'; pauseBtn.title = '暂停游戏'; } }
    else { doPause(); if (overlay) overlay.style.display = 'flex'; if (pauseBtn) { pauseBtn.innerHTML = '▶'; pauseBtn.title = '继续游戏'; } }
  }

  function isGameRoute() {
    if (/\/game\/\d+/.test(window.location.pathname)) return true;
    if (document.querySelector('.game-stage, .game-player, [class*="game-container"]')) return true;
    if (document.querySelector('ruffle-player')) return true;
    return false;
  }

  function onEnterGame() {
    if (isOnGamePage) return;
    isOnGamePage = true;
    if (pauseBtn) pauseBtn.style.display = 'flex';
    if (isPaused) { doResume(); isPaused = false; }
    if (pauseBtn) pauseBtn.innerHTML = '⏸';
    if (overlay) overlay.style.display = 'none';
  }

  function onLeaveGame() {
    if (!isOnGamePage) return;
    isOnGamePage = false;
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (isPaused) { doResume(); isPaused = false; }
  }

  function refreshGameState() {
    var onGame = isGameRoute();
    if (onGame && !isOnGamePage) onEnterGame();
    else if (!onGame && isOnGamePage) onLeaveGame();
  }

  var _lastUrl = window.location.href;
  function checkUrlChange() {
    var url = window.location.href;
    if (url !== _lastUrl) { _lastUrl = url; setTimeout(refreshGameState, 100); }
  }

  function setupBeforeUnload() {
    window.addEventListener('beforeunload', function (e) {
      if (!document.querySelector('ruffle-player')) return;
      e.preventDefault();
      e.returnValue = '⚠️ 游戏进度尚未保存，确定要离开吗？';
      return e.returnValue;
    });
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { refreshGameState(); }, 1500);
  }

  function init() {
    if (window.RufflePlayer) interceptConfigSetter(window.RufflePlayer);
    createPauseButton();
    createOverlay();
    setupBeforeUnload();
    refreshGameState();
    startPoll();
    var _ps = history.pushState;
    history.pushState = function () { _ps.apply(this, arguments); checkUrlChange(); };
    var _rs = history.replaceState;
    history.replaceState = function () { _rs.apply(this, arguments); checkUrlChange(); };
    window.addEventListener('popstate', checkUrlChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
