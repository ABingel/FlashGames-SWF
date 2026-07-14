#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)

echo "[1/5] 备份当前文件"
docker cp flash-games:/app/client/dist/index.html "/tmp/index.html.pre-earlyfix.$TS.html"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.pre-earlyfix.$TS.js"

echo "[2/5] 生成 cloud-early-restore.js（只负责在 Ruffle 前写入 pending restore）"
cat > /tmp/cloud-early-restore.js <<'JS'
// Tiny early restore: must run before ruffle.js. Full UI stays in cloud-save.js later.
(function () {
  'use strict';
  var CODE_KEY = '***';
  var LAST_HASH_KEY = '***';
  var RELOAD_PROMPT_HASH_KEY = '***';
  var PENDING_RESTORE_KEY = '***';

  function hosts() {
    var out = [];
    function add(h) { if (h && out.indexOf(h) < 0) out.push(h); }
    add(location.host);
    add(location.hostname);
    add('192.168.31.99');
    add('192.168.31.99:3000');
    add('fg.223727.xyz');
    add('fg.223727.xyz:8848');
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
      if (!key || key === CODE_KEY || key === LAST_HASH_KEY || key === RELOAD_PROMPT_HASH_KEY) return;
      if (/token|password|auth|jwt|admin|lock|credential|secret/i.test(key)) return;
      localStorage.setItem(key, ls[key]);
    });
    console.log('[cloud-early-restore] pending cloud restore applied before ruffle');
  } catch (e) {
    console.warn('[cloud-early-restore] failed', e);
  }
})();
JS
docker cp /tmp/cloud-early-restore.js flash-games:/app/client/dist/cloud-early-restore.js

echo "[3/5] 调整 index.html：early restore 在 ruffle 前，完整 cloud-save 放回后面"
docker cp flash-games:/app/client/dist/index.html /tmp/index.html.earlyfix.$TS.html
python3 - "/tmp/index.html.earlyfix.$TS.html" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
s = p.read_text()
# remove all early/full cloud save script refs first
s = re.sub(r'\n\s*<script src="/cloud-save\.js\?[^\"]*"></script>', '', s)
s = re.sub(r'\n\s*<script src="/cloud-save\.js"></script>', '', s)
s = re.sub(r'\n\s*<script src="/cloud-early-restore\.js\?[^\"]*"></script>', '', s)
s = re.sub(r'\n\s*<script src="/cloud-early-restore\.js"></script>', '', s)
# put tiny early restore before ruffle
needle = '<script src="/ruffle/ruffle.js"></script>'
if needle not in s:
    raise SystemExit('未找到 ruffle.js script 标签')
s = s.replace(needle, '<script src="/cloud-early-restore.js?v=20260712"></script>\n <script src="/ruffle/ruffle.js"></script>', 1)
# put full cloud-save after virtual-controls
vc = '<script src="/virtual-controls.js?v=20260711-dirlock"></script>'
if vc in s:
    s = s.replace(vc, vc + '\n <script src="/cloud-save.js?v=20260712-panel"></script>', 1)
else:
    s = s.replace('<script src="/pause-protect.js"></script>', '<script src="/pause-protect.js"></script>\n <script src="/cloud-save.js?v=20260712-panel"></script>', 1)
p.write_text(s)
PY
docker cp /tmp/index.html.earlyfix.$TS.html flash-games:/app/client/dist/index.html

echo "[4/5] 验证 index.html"
docker exec flash-games head -22 /app/client/dist/index.html

echo "[5/5] 完成：请 Edge Ctrl+F5 后再测。"
