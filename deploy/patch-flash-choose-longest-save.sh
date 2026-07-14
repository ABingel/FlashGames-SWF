#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)

echo "[1/4] 备份当前 cloud-save / early-restore"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.pre-longest.$TS.js"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.pre-longest.$TS.js"

echo "[2/4] 拉取文件并补丁：同一游戏 SavedData 选最长值作为权威存档"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.longest.$TS.js"
docker cp flash-games:/app/client/dist/cloud-early-restore.js "/tmp/cloud-early-restore.longest.$TS.js"

python3 - "/tmp/cloud-save.longest.$TS.js" "/tmp/cloud-early-restore.longest.$TS.js" <<'PY'
from pathlib import Path
import re, sys

HELPER = r'''
 function fgChooseBestSavedDataValue(items) {
 var best = null;
 (items || []).forEach(function (it) {
 var v = it && it.value;
 if (!v) return;
 // 冒险王新进度 SavedData 通常更长；之前出现过 952 新档 vs 632 旧档。
 if (!best || String(v).length > String(best).length) best = v;
 });
 if (best) return best;
 var counts = {}, sourceValue = null, sourceCount = -1;
 (items || []).forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
 Object.keys(counts).forEach(function (val) { if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; } });
 return sourceValue;
 }
'''

def ensure_helper(s):
    if 'function fgChooseBestSavedDataValue' in s:
        return s
    marker = ' function normalizeSavedDataForUpload(obj)'
    if marker in s:
        return s.replace(marker, HELPER + '\n' + marker, 1)
    marker2 = ' function earlyApplyPendingRestore()'
    if marker2 in s:
        return s.replace(marker2, HELPER + '\n' + marker2, 1)
    return s

def patch_cloud_save(s):
    s = ensure_helper(s)
    old_upload = '''var source = null;
 [location.host, location.hostname].some(function (h) {
 source = items.find(function (it) { return it.host === h && it.value; });
 return !!source;
 });
 if (!source) source = items.find(function (it) { return it.value; });
 if (!source) return;
 hosts.forEach(function (h) {
 [canonicalPath, source.path].forEach(function (pathPart) {
 var nk = h + pathPart;
 if (obj[nk] !== source.value) { obj[nk] = source.value; changed++; }
 });
 });'''
    new_upload = '''var sourceValue = fgChooseBestSavedDataValue(items);
 if (!sourceValue) return;
 hosts.forEach(function (h) {
 fgSavedDataPathVariants(canonicalPath).forEach(function (pathPart) {
 var nk = h + pathPart;
 if (obj[nk] !== sourceValue) { obj[nk] = sourceValue; changed++; }
 });
 });'''
    if old_upload in s:
        s = s.replace(old_upload, new_upload, 1)
    else:
        print('WARN: cloud-save upload exact block not found; trying regex')
        s = re.sub(r'''var source = null;\n \[location\.host, location\.hostname\][\s\S]*?if \(!source\) return;\n hosts\.forEach\(function \(h\) \{\n \[canonicalPath, source\.path\]\.forEach\(function \(pathPart\) \{\n var nk = h \+ pathPart;\n if \(obj\[nk\] !== source\.value\) \{ obj\[nk\] = source\.value; changed\+\+; \}\n \}\);\n \}\);''', new_upload, s, count=1)

    old_restore = '''var counts = {};
 items.forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
 var sourceValue = null, sourceCount = -1;
 Object.keys(counts).forEach(function (val) {
 if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; }
 });
 if (!sourceValue) {
 var first = items.find(function (it) { return it.value; });
 sourceValue = first && first.value;
 }
 if (!sourceValue) return;'''
    new_restore = '''var sourceValue = fgChooseBestSavedDataValue(items);
 if (!sourceValue) return;'''
    s = s.replace(old_restore, new_restore)
    return s

def patch_early(s):
    s = ensure_helper(s)
    old = '''var counts = {}, sourceValue = null, sourceCount = -1;
      groups[canonicalPath].forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
      Object.keys(counts).forEach(function (val) { if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; } });
      if (!sourceValue && groups[canonicalPath][0]) sourceValue = groups[canonicalPath][0].value;
      if (!sourceValue) return;'''
    new = '''var sourceValue = fgChooseBestSavedDataValue(groups[canonicalPath]);
      if (!sourceValue) return;'''
    if old in s:
        s = s.replace(old, new)
    else:
        # variant without 6 spaces
        s = re.sub(r'''var counts = \{\}, sourceValue = null, sourceCount = -1;\n\s*groups\[canonicalPath\][\s\S]*?if \(!sourceValue\) return;''', new, s, count=1)
    return s

for arg in sys.argv[1:]:
    p = Path(arg)
    s = p.read_text()
    if 'cloud-early-restore' in s or 'Tiny early restore' in s:
        s = patch_early(s)
    else:
        s = patch_cloud_save(s)
    p.write_text(s)
    print('patched', p)
PY

echo "[3/4] 拷回容器"
docker cp "/tmp/cloud-save.longest.$TS.js" flash-games:/app/client/dist/cloud-save.js
docker cp "/tmp/cloud-early-restore.longest.$TS.js" flash-games:/app/client/dist/cloud-early-restore.js

echo "[4/4] 验证"
docker exec flash-games grep -n "fgChooseBestSavedDataValue\|952 新档\|sourceValue = fgChooseBestSavedDataValue" /app/client/dist/cloud-save.js /app/client/dist/cloud-early-restore.js | head -30

echo "完成。下一步：手机 Ctrl/强刷或清缓存后重新打开 → 保存新进度 → 立即上传；电脑再查云端 hash/len。"
