#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)
FIX=/vol1/@apphome/trim.openclaw/data/workspace/cloud-save-fix.js
TMP_INDEX="/tmp/index.html.flash-fix.$TS.html"

echo "[1/5] 检查修复文件"
test -s "$FIX"

echo "[2/5] 备份容器内文件到 /tmp"
docker cp flash-games:/app/client/dist/cloud-save.js "/tmp/cloud-save.bak.$TS.js"
docker cp flash-games:/app/client/dist/index.html "/tmp/index.html.bak.$TS.html"

echo "[3/5] 部署修复版 cloud-save.js"
docker cp "$FIX" flash-games:/app/client/dist/cloud-save.js

echo "[4/5] 调整 index.html 加载顺序：cloud-save.js 必须在 ruffle.js 前面"
docker cp flash-games:/app/client/dist/index.html "$TMP_INDEX"
python3 - "$TMP_INDEX" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
s = p.read_text()
# 删除已有 cloud-save 引用，避免重复加载
s = re.sub(r'\n\s*<script src="/cloud-save\.js\?[^\"]*"></script>', '', s)
s = re.sub(r'\n\s*<script src="/cloud-save\.js"></script>', '', s)
# 插入到 ruffle 前面
needle = '<script src="/ruffle/ruffle.js"></script>'
insert = '<script src="/cloud-save.js?v=20260712-before-ruffle"></script>\n <script src="/ruffle/ruffle.js"></script>'
if needle not in s:
    raise SystemExit('未找到 ruffle.js script 标签，index.html 未修改')
s = s.replace(needle, insert, 1)
p.write_text(s)
PY
docker cp "$TMP_INDEX" flash-games:/app/client/dist/index.html

echo "[5/5] 验证"
docker exec flash-games head -20 /app/client/dist/index.html
echo "---"
docker exec flash-games head -3 /app/client/dist/cloud-save.js

echo "完成。请在 Edge 用 Ctrl+F5 强制刷新，或清缓存后再测试云存档。"
