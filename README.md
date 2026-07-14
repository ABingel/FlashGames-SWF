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

现在部署方式和原 vue-flash 一样：只需要一个 `docker-compose.yml`。

### 1. 新建目录

```bash
mkdir FlashGames-SWF
cd FlashGames-SWF
mkdir -p game data
```

### 2. 创建 docker-compose.yml

可以直接下载：

```bash
curl -O https://raw.githubusercontent.com/ABingel/FlashGames-SWF/master/docker-compose.yml
```

也可以手动新建 `docker-compose.yml`，复制下面内容：

```yaml
services:
  flash-games:
    image: ghcr.io/abingel/flash-games-swf:latest
    container_name: flash-games-swf
    ports:
      - "3000:3000"
    volumes:
      # SWF 游戏文件目录（放 .swf 文件，自动扫描入库）
      - ./game:/app/game
      # SQLite 数据库 + 云存档持久化
      - ./data:/app/data
    environment:
      # 管理密码（部署前务必修改）
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-flash2024}
    restart: unless-stopped
```

### 3. 放入游戏文件

把 `.swf` 游戏放到 `game/` 目录：

```txt
game/
├── game1.swf
├── game2.swf
└── 冒险类/
    └── xxx.swf
```

### 4. 启动

```bash
docker compose up -d
```

访问：

```txt
http://服务器IP:3000
```

例如：

```txt
http://192.168.31.99:3000
```

> 首次运行会自动拉取 `ghcr.io/abingel/flash-games-swf:latest` 镜像，不需要本地构建。

## 🔧 可选配置

如果想改管理密码，可以直接编辑 `docker-compose.yml` 这一行：

```yaml
- ADMIN_PASSWORD=${ADMIN_PASSWORD:-flash2024}
```

例如改成：

```yaml
- ADMIN_PASSWORD=${ADMIN_PASSWORD:-你的密码}
```

然后重启：

```bash
docker compose up -d
```

## 📁 目录说明

```txt
FlashGames-SWF/
├── docker-compose.yml         # 一键部署配置（直接拉取 GHCR 镜像）
├── Dockerfile                 # 镜像构建文件（由 GitHub Actions 自动构建）
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
