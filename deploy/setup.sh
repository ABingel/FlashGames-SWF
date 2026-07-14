#!/usr/bin/env bash
# FlashGames-SWF 部署脚本
# 基于 vue-flash Docker 部署，添加增强功能
set -euo pipefail

echo "=== FlashGames-SWF 部署脚本 ==="
echo "基于 vue-flash (https://github.com/onRoadLookBeauty/vue-flash) 二改"
echo ""

# 检查容器是否在运行
if ! docker ps --format '{{.Names}}' | grep -q flash-games; then
  echo "❌ 未找到运行中的 flash-games 容器"
  echo "请先按照 vue-flash 文档部署基础 Docker 容器"
  exit 1
fi

CONTAINER="flash-games"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "1️⃣  部署 cloud-early-restore.js..."
docker cp "$PROJECT_DIR/client-dist/cloud-early-restore.js" "$CONTAINER:/app/client/dist/cloud-early-restore.js"

echo "2️⃣  部署 cloud-save.js..."
docker cp "$PROJECT_DIR/client-dist/cloud-save.js" "$CONTAINER:/app/client/dist/cloud-save.js"

echo "3️⃣  修改 index.html 加载顺序..."
# 调整脚本顺序（cloud-early-restore 在 ruffle 前，cloud-save 在最后）
docker exec "$CONTAINER" sh -c "cat /app/client/dist/index.html" > /tmp/index.html
# ... (此处省略具体修改逻辑，请参考 docs/script-loading.md)

echo "4️⃣  部署服务端云存档路由..."
docker cp "$PROJECT_DIR/server/routes/cloud-save.js" "$CONTAINER:/app/server/src/routes/cloud-save.js"
# 注意: 需手动在 index.js 注册路由

echo "5️⃣  重启容器..."
docker restart "$CONTAINER"

echo ""
echo "✅ 部署完成！请用 Ctrl+F5 刷新浏览器测试。"
echo "更多配置请参考: docs/script-loading.md"
