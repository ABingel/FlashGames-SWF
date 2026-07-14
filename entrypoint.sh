#!/bin/sh
set -e

echo "--- FlashGames-SWF 容器启动 ---"
echo "基于 vue-flash (https://github.com/onRoadLookBeauty/vue-flash) 二改"
echo ""

# 应用补丁（修改 index.html + 注册云存档路由）
echo "🔧 应用增强补丁..."
node /app/entrypoint-patch.js

echo ""
echo "🚀 启动 Node.js 服务..."
exec node server/src/index.js
