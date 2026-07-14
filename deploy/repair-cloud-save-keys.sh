#!/usr/bin/env bash
set -euo pipefail

# 从最新备份恢复 cloud-save.js 里的真实 localStorage/sessionStorage key 常量，避免聊天贴文本导致 *** / 省略号污染。
BACKUP=$(ls -t /tmp/cloud-save.bak.*.js /tmp/cloud-save.bak.js 2>/dev/null | head -1 || true)
if [[ -z "${BACKUP:-}" || ! -s "$BACKUP" ]]; then
  echo "ERROR: 没找到 /tmp/cloud-save.bak*.js 备份。"
  exit 1
fi

CUR=/tmp/cloud-save.current.$(date +%Y%m%d%H%M%S).js
OUT=/tmp/cloud-save.repaired.$(date +%Y%m%d%H%M%S).js

docker cp flash-games:/app/client/dist/cloud-save.js "$CUR"

python3 - "$BACKUP" "$CUR" "$OUT" <<'PY'
from pathlib import Path
import re, sys
backup, cur, out = map(Path, sys.argv[1:])
b = backup.read_text()
s = cur.read_text()
keys = {}
for name in ['CODE_KEY','LAST_HASH_KEY','RELOAD_PROMPT_HASH_KEY','PENDING_RESTORE_KEY']:
    m = re.search(r"var\s+%s\s*=\s*(['\"])(.*?)\1\s*;" % name, b)
    if not m:
        raise SystemExit(f'备份里没找到 {name}')
    keys[name] = m.group(2)
    s = re.sub(r"var\s+%s\s*=\s*(['\"])(.*?)\1\s*;" % name,
               "var %s = %r;" % (name, keys[name]), s, count=1)
Path(out).write_text(s)
print('从备份提取到真实 key：')
for k,v in keys.items():
    print(f'  {k} = {v!r}')
PY

docker cp "$OUT" flash-games:/app/client/dist/cloud-save.js

echo "--- 当前 cloud-save.js 关键常量 ---"
docker exec flash-games grep -n "var CODE_KEY\|var LAST_HASH_KEY\|var RELOAD_PROMPT_HASH_KEY\|var PENDING_RESTORE_KEY" /app/client/dist/cloud-save.js

echo "修复完成。现在 Edge 请 Ctrl+F5，再打开存档面板，确认云存档码是否回到原来的 5k2c4x3r41576w0s4k。"
