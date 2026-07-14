#!/usr/bin/env bash
set -euo pipefail
KEEP_CODE="${1:-2s1k6p2k334h1o443a}"
TS=$(date +%Y%m%d%H%M%S)
BACKUP_DIR="/app/data/cloud-saves/_archive_$TS"

echo "保留云存档码: $KEEP_CODE"
echo "备份目录: $BACKUP_DIR"

echo "[1/4] 当前云存档列表"
docker exec flash-games sh -c 'ls -la /app/data/cloud-saves || true'

echo "[2/4] 创建归档目录"
docker exec flash-games sh -c "mkdir -p '$BACKUP_DIR'"

echo "[3/4] 归档除 ${KEEP_CODE}.json 之外的云存档（不是删除，可恢复）"
docker exec flash-games sh -c "find /app/data/cloud-saves -maxdepth 1 -type f -name '*.json' ! -name '${KEEP_CODE}.json' -exec mv {} '$BACKUP_DIR'/ \;"

echo "[4/4] 归档后列表"
docker exec flash-games sh -c "echo '--- active ---'; ls -la /app/data/cloud-saves; echo '--- archived ---'; ls -la '$BACKUP_DIR'"

echo "完成。若要恢复：docker exec flash-games sh -c \"mv '$BACKUP_DIR'/*.json /app/data/cloud-saves/ 2>/dev/null || true\""
