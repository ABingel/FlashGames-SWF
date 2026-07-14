#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)

echo "[1/5] 备份当前 cloud-save / early-restore / index"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.pre-queryalias.$TS.js"
docker cp flash-games:/app/client/dist/index.html "/tmp/index.pre-queryalias.$TS.html"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.pre-queryalias.$TS.js" 2>/dev/null || true

echo "[2/5] 先应用 early-restore 安全加载顺序修复"
bash /vol1/@apphome/trim.openclaw/data/workspace/fix-flash-early-restore.sh >/tmp/fix-flash-early-restore.$TS.log
cat /tmp/fix-flash-early-restore.$TS.log | tail -25

echo "[3/5] 拉取文件到 /tmp 做补丁"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.queryalias.$TS.js"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.queryalias.$TS.js"

python3 - "/tmp/cloud-save.queryalias.$TS.js" "/tmp/cloud-early-restore.queryalias.$TS.js" <<'PY'
from pathlib import Path
import sys
helper = r'''

 function fgSavedDataPathVariants(canonicalPath) {
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

 function fgSavedDataCleanupBase(canonicalPath) {
 return String(canonicalPath || '').replace(/\/game\.swf(?:\?.*)?\/SavedData$/, '/');
 }
'''

def patch(path: Path):
    s = path.read_text()
    if 'function fgSavedDataPathVariants' not in s:
        # insert after strict/use strict block or before first saved-data hosts fn
        marker = " function earlySavedDataHosts()"
        if marker in s:
            s = s.replace(marker, helper + "\n" + marker, 1)
        else:
            marker = "  function hosts()"
            s = s.replace(marker, helper.replace('\n function ', '\n  function ') + "\n" + marker, 1)
    # broaden cleanup matching: delete same game folder, including query-versioned keys
    s = s.replace("k.indexOf(canonicalPath) >= 0 && /\\/game\\/.*\\/game\\.swf(?:\\?.*)?\\/SavedData$/.test(k)", "k.indexOf(fgSavedDataCleanupBase(canonicalPath)) >= 0 && /SavedData$/.test(k)")
    # write all path variants, not only canonical no-query path
    s = s.replace("hosts.forEach(function (h) { obj[h + canonicalPath] = sourceValue; });", "hosts.forEach(function (h) { fgSavedDataPathVariants(canonicalPath).forEach(function (p) { obj[h + p] = sourceValue; }); });")
    s = s.replace("hosts.forEach(function (h) {\n var nk = h + canonicalPath;\n if (obj[nk] !== sourceValue) { obj[nk] = sourceValue; changed++; }\n });", "hosts.forEach(function (h) {\n fgSavedDataPathVariants(canonicalPath).forEach(function (p) {\n var nk = h + p;\n if (obj[nk] !== sourceValue) { obj[nk] = sourceValue; changed++; }\n });\n });")
    s = s.replace("hs.forEach(function (h) { ls[h + canonicalPath] = sourceValue; });", "hs.forEach(function (h) { fgSavedDataPathVariants(canonicalPath).forEach(function (p) { ls[h + p] = sourceValue; }); });")
    path.write_text(s)

for p in map(Path, sys.argv[1:]):
    patch(p)
    print('patched', p)
PY

echo "[4/5] 拷回容器"
docker cp "/tmp/cloud-save.queryalias.$TS.js" flash-games:/app/client/dist/cloud-save.js
docker cp "/tmp/cloud-early-restore.queryalias.$TS.js" flash-games:/app/client/dist/cloud-early-restore.js

echo "[5/5] 验证关键片段"
docker exec flash-games grep -n "fgSavedDataPathVariants\|cloud-early-restore\|cloud-save.js" /app/client/dist/cloud-save.js /app/client/dist/cloud-early-restore.js /app/client/dist/index.html | head -30

echo "完成。Edge 请 Ctrl+F5；再输入码 2s1k6p2k334h1o443a → 拉取云端 → 确认刷新 → 继续游戏。"
