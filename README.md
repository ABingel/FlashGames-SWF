# FlashGames-SWF 🎮

> **基于 [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) 二改** — 感谢原项目作者 [@onRoadLookBeauty](https://github.com/onRoadLookBeauty)

基于 Ruffle 的 Flash 游戏在线平台，无需插件，现代浏览器直接畅玩经典 SWF 游戏。本仓库在 vue-flash 基础上做了多项增强和修复。

## ✨ 新增/增强功能

### ☁️ 云端存档系统
- 支持 localStorage + IndexedDB 双存储同步
- 唯一存档码，跨设备共享游戏进度
- 手动上传/拉取，无自动同步（避免冲突）
- 智能选择最长存档（解决多 host/query 别名冲突）
- 支持 Ruffle Storage 和游戏自定义 SavedData

### 📱 手机虚拟按键
- 可自定义动作键映射（J/K/L/U/I/O/Space/WASD/方向键等）
- 双击锁定长按模式，适配触屏操作
- 按住菜单/选择文本拦截
- 按键配置按游戏保存，随云存档恢复

### 🐛 Ruffle 中文字体渲染修复
- 内置 DroidSansFallbackFull 字体
- 宋体/黑体/微软雅黑 → Droid Sans Fallback 映射

### ⏸️ 暂停保护
- 长按菜单拦截（contextmenu/selectstart/dragstart）
- 手机浏览器兼容优化

### 🐍 服务端增强
- `/api/cloud-save/:code` 云存档 GET/PUT API
- 存档持久化到宿主机挂载目录

## 🚀 Docker Compose 一键部署

### 前提
- 安装 [Docker](https://docs.docker.com/engine/install/) + [Docker Compose](https://docs.docker.com/compose/install/)
- 准备好 `.swf` 游戏文件（放入 `./game/` 目录，可嵌套子文件夹）

### 部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/ABingel/FlashGames-SWF.git
cd FlashGames-SWF

# 2. （可选）复制环境配置并修改管理密码
cp .env.example .env
# 编辑 .env，修改 ADMIN_PASSWORD

# 3. 放入游戏文件到 ./game/ 目录
# 支持 .swf 文件或嵌套子目录

# 4. 启动（自动构建镜像 + 应用增强补丁）
docker compose up -d

# 5. 访问 http://localhost:3000
```

> 🎯 容器启动时会自动：
> 1. 注入 `cloud-early-restore.js`（Ruffle 前加载）
> 2. 注入 `cloud-save.js`（云端存档 UI）
> 3. 注册云存档 API 路由
> 4. 调整请求体大小限制（支持存档上传）
> 5. 创建云存档持久化目录

### 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 停止
docker compose down

# 更新（重新构建镜像）
git pull
docker compose up -d --build
```

## 🛠 手动部署（已有 vue-flash 容器）

如果已按 vue-flash 部署了容器，可以用 deploy/ 下的脚本逐个打补丁：

```bash
# 云端存档
bash deploy/apply-flash-save-fix.sh

# 修正脚本加载顺序
bash deploy/fix-flash-early-restore.sh

# 存档多 host/query 别名兼容
bash deploy/patch-flash-save-query-alias.sh

# 智能选择最长存档
bash deploy/patch-flash-choose-longest-save.sh
```

## 📁 项目结构

```
FlashGames-SWF/
├── client-dist/               # 前端文件（覆盖 vue-flash dist）
│   ├── cloud-save.js          # 云端存档系统（含 UI）
│   └── cloud-early-restore.js # 提前恢复脚本（Ruffle 前加载）
├── server/routes/             # 服务端增强
│   └── cloud-save.js          # 云存档 API
├── deploy/                    # 部署/补丁脚本
├── docs/
│   └── script-loading.md      # 脚本加载顺序说明
├── Dockerfile                 # 基于 vue-flash 镜像扩展
├── docker-compose.yml         # Docker Compose 一键部署
├── entrypoint.sh              # 容器启动入口
├── entrypoint-patch.js        # 启动时自动应用的补丁
├── .env.example               # 环境变量示例
├── .dockerignore
└── README.md
```

## 📜 声明

本项目基于 [vue-flash](https://github.com/onRoadLookBeauty/vue-flash)（MIT License）二次开发，所有新增功能遵循相同开源协议。

## 📝 致谢

- [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) — 原项目
- [Ruffle](https://ruffle.rs/) — Flash 模拟器
