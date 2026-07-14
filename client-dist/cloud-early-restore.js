// Tiny early restore: must run before ruffle.js. Full UI stays in cloud-save.js later.
(function () {
  'use strict';
  var PENDING_RESTORE_KEY = 'fgCloudPendingRestore';

  function hosts() {
    var out = [];
    function add(h) { if (h && out.indexOf(h) < 0) out.push(h); }
    add(location.host);
    add(location.hostname);
    return out;
  }

  function normalize(ls) {
    if (!ls || typeof ls !== 'object') return ls;
    var hs = hosts();
    var groups = {};
    Object.keys(ls).forEach(function (key) {
      if (!/\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(key)) return;
      var m = key.match(/^(.*?)(\/game\/.*\/game\.swf(?:\?.*)?\/SavedData)$/);
      if (!m) return;
      var canonicalPath = m[2].replace(/game\.swf\?[^/]+\/SavedData$/, 'game.swf/SavedData');
      (groups[canonicalPath] || (groups[canonicalPath] = [])).push({ key: key, value: ls[key] });
    });
    Object.keys(groups).forEach(function (canonicalPath) {
      var counts = {}, sourceValue = null, sourceCount = -1;
      groups[canonicalPath].forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
      Object.keys(counts).forEach(function (val) { if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; } });
      if (!sourceValue && groups[canonicalPath][0]) sourceValue = groups[canonicalPath][0].value;
      if (!sourceValue) return;
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf(canonicalPath) >= 0 && /\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(k)) localStorage.removeItem(k);
        }
      } catch (_) {}
      hs.forEach(function (h) { ls[h + canonicalPath] = sourceValue; });
    });
    return ls;
  }

  try {
    var raw = sessionStorage.getItem(PENDING_RESTORE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_RESTORE_KEY);
    var data = JSON.parse(raw);
    var ls = normalize(data && data.localStorage);
    if (!ls || typeof ls !== 'object') return;
    Object.keys(ls).forEach(function (key) {
      if (/token|password|auth|jwt|admin|lock|credential|secret/i.test(key)) return;
      localStorage.setItem(key, ls[key]);
    });
    console.log('[cloud-early-restore] pending cloud restore applied before ruffle');
  } catch (e) {
    console.warn('[cloud-early-restore] failed', e);
  }
})();
