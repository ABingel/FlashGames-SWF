#!/bin/sh
set -e

echo "--- FlashGames-SWF 容器启动 ---"
echo "基于 vue-flash (https://github.com/onRoadLookBeauty/vue-flash) 二改"
echo ""

# 保留 vue-flash 原始逻辑：如果用户挂载的 game 目录为空，自动复制内置默认游戏
if [ -z "$(ls -A /app/game 2>/dev/null)" ]; then
  echo "📦 检测到 game 目录为空，正在复制内置游戏..."
  cp /app/game_default/*.swf /app/game/ 2>/dev/null || true
  count=$(ls /app/game/*.swf 2>/dev/null | wc -l)
  echo "✅ 内置游戏复制完成（共 ${count} 款）"
fi

# 应用补丁（修改 index.html + 注册云存档路由）
echo "🔧 应用增强补丁..."
node /app/entrypoint-patch.js

echo ""
echo "🚀 启动 Node.js 服务..."
exec node server/src/index.js
