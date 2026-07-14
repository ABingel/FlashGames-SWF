# ===== FlashGames-SWF =====
# 基于 vue-flash 官方镜像，叠加增强功能
# 原项目: https://github.com/onRoadLookBeauty/vue-flash

FROM lookfuna666/flash-games:latest

LABEL org.opencontainers.image.title="FlashGames-SWF"
LABEL org.opencontainers.image.description="基于 vue-flash 二改的 Flash 游戏在线平台（云端存档 + 手机虚拟按键）"
LABEL org.opencontainers.image.source="https://github.com/ABingel/FlashGames-SWF"
LABEL org.opencontainers.image.licenses="MIT"

# 复制云端存档前端文件
COPY client-dist/cloud-save.js /app/client/dist/cloud-save.js
COPY client-dist/cloud-early-restore.js /app/client/dist/cloud-early-restore.js
COPY client-dist/virtual-controls.js /app/client/dist/virtual-controls.js

# 复制云端存档服务端路由
COPY server/routes/cloud-save.js /app/server/src/routes/cloud-save.js
COPY server/routes/swf-resource-proxy.js /app/server/src/routes/swf-resource-proxy.js

# 复制启动补丁脚本
COPY entrypoint-patch.js /app/entrypoint-patch.js
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV CLOUD_SAVE_DIR=/app/data/cloud-saves

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
