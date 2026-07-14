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

### 🐛 游戏兼容性修复
- **《冒险王之神兵传奇》进度条卡住修复**
  - SWF 相对资源路径兼容路由（music/mapPic/monster 等）
  - Helmet `Referrer-Policy` 改为 `same-origin`
- **Ruffle 中文字体渲染修复**
  - 内置 DroidSansFallbackFull 字体
  - 宋体/黑体/微软雅黑 → Droid Sans Fallback 映射

### ⏸️ 暂停保护
- 长按菜单拦截（contextmenu/selectstart/dragstart）
- 手机浏览器兼容优化

### 🐍 服务端增强
- `/api/cloud-save/:code` 云存档 GET/PUT API
- SWF 相对资源智能路由
- 存档持久化到宿主机挂载目录

## 🚀 快速开始

### 基于 vue-flash 原始部署

1. 按照 [vue-flash 文档](https://github.com/onRoadLookBeauty/vue-flash) 完成基础部署
2. 将 `client-dist/` 下的文件部署到 `/app/client/dist/`
3. 将 `server/routes/` 下的代码合并到服务端
4. 在 `index.html` 中调整脚本加载顺序（参考 `docs/script-loading.md`）

### 一键部署（Docker）

```bash
# 前提：已部署 vue-flash 基础 Docker 容器
bash deploy/setup.sh
```

## 📁 项目结构

```
FlashGames-SWF/
├── client-dist/               # 前端文件（覆盖 vue-flash dist）
│   ├── cloud-save.js          # 云端存档系统（含 UI）
│   └── cloud-early-restore.js # 提前恢复脚本（Ruffle 前加载）
├── server/routes/             # 服务端增强
│   ├── cloud-save.js          # 云存档 API
│   └── swf-resource-proxy.js  # SWF 相对资源智能路由
├── deploy/                    # 部署/补丁脚本
│   ├── apply-flash-save-fix.sh
│   ├── fix-flash-early-restore.sh
│   ├── patch-flash-save-query-alias.sh
│   ├── patch-flash-choose-longest-save.sh
│   ├── archive-cloud-saves-keep-one.sh
│   ├── repair-cloud-save-keys.sh
│   ├── patch-flash-localstorage-existing-query.sh
│   └── setup.sh
├── docs/
│   └── script-loading.md      # 脚本加载顺序说明
└── README.md
```

## 📜 声明

本项目基于 [vue-flash](https://github.com/onRoadLookBeauty/vue-flash)（MIT License）二次开发，所有新增功能遵循相同开源协议。

## 📝 致谢

- [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) — 原项目
- [Ruffle](https://ruffle.rs/) — Flash 模拟器
