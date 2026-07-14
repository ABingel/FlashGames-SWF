#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)

echo "[1/4] 备份当前文件"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.pre-existing-query.$TS.js"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.pre-existing-query.$TS.js"

echo "[2/4] 拉取文件并补丁：从现有 localStorage 旧 key 中提取 game.swf?v=.../SavedData 别名"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.existing-query.$TS.js"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.existing-query.$TS.js"

python3 - "/tmp/cloud-save.existing-query.$TS.js" "/tmp/cloud-early-restore.existing-query.$TS.js" <<'PY'
from pathlib import Path
import re, sys

old_block = r''' function fgSavedDataPathVariants(canonicalPath) {
 var out = [];
 function add(p) { if (p && out.indexOf(p) < 0) out.push(p); }
 add(canonicalPath);
 try {
 var m = canonicalPath.match(/^(\/game\/.*\/)game\.swf\/SavedData$/);
 var folder = m && m[1];
 if (folder && window.performance && performance.getEntriesByType) {
 var entries = performance.getEntriesByType('resource') || [];
 entries.forEach(function (entry) {
 try {
 var u = new URL(entry.name, location.href);
 if (u.pathname.indexOf(folder) >= 0 && /\/game\.swf$/.test(u.pathname)) {
 add(u.pathname + (u.search || '') + '/SavedData');
 }
 } catch (_) {}
 });
 }
 } catch (_) {}
 return out;
 }
'''

new_block = r''' function fgSavedDataPathVariants(canonicalPath) {
 var out = [];
 function add(p) { if (p && out.indexOf(p) < 0) out.push(p); }
 add(canonicalPath);
 try {
 var m = canonicalPath.match(/^(\/game\/.*\/)game\.swf(?:\?.*)?\/SavedData$/);
 var folder = m && m[1];
 if (folder) {
 // 关键：early restore 在 Ruffle 前执行，performance 里还没有 SWF 资源；
 // 所以必须先扫描当前浏览器旧 localStorage，找到 Ruffle 实际读过的 game.swf?v=.../SavedData key。
 try {
 for (var i = 0; i < localStorage.length; i++) {
 var k = localStorage.key(i);
 if (!k || k.indexOf(folder) < 0 || !/\/game\.swf(?:\?.*)?\/SavedData$/.test(k)) continue;
 var mm = k.match(/^(?:[^/]+)(\/game\/.*\/game\.swf(?:\?.*)?\/SavedData)$/);
 if (mm && mm[1]) add(mm[1]);
 }
 } catch (_) {}
 if (window.performance && performance.getEntriesByType) {
 var entries = performance.getEntriesByType('resource') || [];
 entries.forEach(function (entry) {
 try {
 var u = new URL(entry.name, location.href);
 if (u.pathname.indexOf(folder) >= 0 && /\/game\.swf$/.test(u.pathname)) {
 add(u.pathname + (u.search || '') + '/SavedData');
 }
 } catch (_) {}
 });
 }
 }
 } catch (_) {}
 return out;
 }
'''

for arg in sys.argv[1:]:
    p = Path(arg)
    s = p.read_text()
    if old_block in s:
        s = s.replace(old_block, new_block)
    elif 'function fgSavedDataPathVariants(canonicalPath)' in s and '扫描当前浏览器旧 localStorage' not in s:
        # fallback: regex replace function body
        s = re.sub(r" function fgSavedDataPathVariants\(canonicalPath\) \{.*?\n \}\n\n function fgSavedDataCleanupBase",
                   new_block + "\n function fgSavedDataCleanupBase", s, count=1, flags=re.S)
        s = re.sub(r"  function fgSavedDataPathVariants\(canonicalPath\) \{.*?\n  \}\n\n  function fgSavedDataCleanupBase",
                   new_block.replace('\n function ', '\n  function ').replace('\n var ', '\n  var ').replace('\n return ', '\n  return ') + "\n  function fgSavedDataCleanupBase", s, count=1, flags=re.S)
    p.write_text(s)
    print('patched', p)
PY

echo "[3/4] 拷回容器"
docker cp "/tmp/cloud-save.existing-query.$TS.js" flash-games:/app/client/dist/cloud-save.js
docker cp "/tmp/cloud-early-restore.existing-query.$TS.js" flash-games:/app/client/dist/cloud-early-restore.js

echo "[4/4] 验证"
docker exec flash-games grep -n "扫描当前浏览器旧 localStorage\|fgSavedDataPathVariants" /app/client/dist/cloud-save.js /app/client/dist/cloud-early-restore.js | head -20

echo "完成。Edge 先不要清 localStorage；Ctrl+F5 后输入码→拉取云端→确认刷新。"
