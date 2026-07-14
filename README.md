# FlashGames-SWF 🎮

> **基于 [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) 二改** — 感谢原项目作者 [@onRoadLookBeauty](https://github.com/onRoadLookBeauty)

一个可直接 Docker Compose 部署的 Flash 游戏站点项目。拉取本仓库后，放入 SWF 游戏文件，执行一条命令即可启动完整服务。

## ✨ 功能

- 基于 Ruffle，现代浏览器直接运行 Flash/SWF 游戏
- 自动扫描 `game/` 目录中的 `.swf` 游戏文件
- SQLite 数据和云存档持久化到 `data/` 目录
- 云端存档系统：支持 localStorage + IndexedDB 同步
- 存档码跨设备使用：手机上传，电脑拉取
- 手动上传/拉取，避免自动同步覆盖存档
- 启动时自动注入云存档脚本和服务端 API

## 🚀 一键部署

### 1. 克隆项目

```bash
git clone https://github.com/ABingel/FlashGames-SWF.git
cd FlashGames-SWF
```

### 2. 放入游戏文件

把 `.swf` 游戏文件放到 `game/` 目录：

```txt
game/
├── game1.swf
├── game2.swf
└── 冒险类/
    └── xxx.swf
```

### 3. 启动

```bash
docker compose up -d
```

访问：

```txt
http://localhost:3000
```

就可以用了。

## 🔧 可选配置

复制环境变量示例：

```bash
cp .env.example .env
```

修改 `.env` 里的管理密码：

```env
ADMIN_PASSWORD=你的密码
```

然后重启：

```bash
docker compose up -d --build
```

## 📁 目录说明

```txt
FlashGames-SWF/
├── docker-compose.yml         # 一键部署配置
├── Dockerfile                 # 基于 vue-flash 官方镜像叠加增强功能
├── entrypoint.sh              # 容器启动入口
├── entrypoint-patch.js        # 启动时自动注入云存档补丁
├── game/                      # 放 SWF 游戏文件
├── data/                      # 数据库和云存档持久化目录
├── client-dist/               # 前端增强脚本
│   ├── cloud-save.js
│   └── cloud-early-restore.js
├── server/routes/
│   └── cloud-save.js          # 云存档 API
├── deploy/                    # 历史补丁脚本
└── docs/                      # 补充说明
```

## 🧰 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 停止
docker compose down

# 更新项目后重新构建
git pull
docker compose up -d --build
```

## 📜 声明

本项目基于 [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) 二次开发，感谢原项目作者。

## 📝 致谢

- [vue-flash](https://github.com/onRoadLookBeauty/vue-flash) — 原项目
- [Ruffle](https://ruffle.rs/) — Flash 模拟器
