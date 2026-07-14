/**
 * Entrypoint patch: 在容器启动时自动修改 index.html 和 server index.js
 * 无需手动介入即可加载云端存档等功能
 */
const fs = require('fs');
const path = require('path');

const CLIENT_DIST = '/app/client/dist';
const SERVER_SRC = '/app/server/src';

// ========== 1. 确保 cloud-save 数据目录 ==========
const cloudSaveDir = process.env.CLOUD_SAVE_DIR || '/app/data/cloud-saves';
if (!fs.existsSync(cloudSaveDir)) {
  fs.mkdirSync(cloudSaveDir, { recursive: true });
  console.log(`[patch] 创建云存档目录: ${cloudSaveDir}`);
}

// ========== 2. 补丁 index.html：添加 cloud-save 脚本 ==========
const indexPath = path.join(CLIENT_DIST, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  // 清除旧的 cloud-save 引用（如有）
  html = html.replace(
    /<script src="\/cloud-(early-restore|save)\.js[^"]*"><\/script>\n?\s*/g,
    ''
  );

  // 在 ruffle.js 前插入 cloud-early-restore.js
  html = html.replace(
    '<script src="/ruffle/ruffle.js"></script>',
    '<script src="/cloud-early-restore.js?v=20260714"></script>\n  <script src="/ruffle/ruffle.js"></script>'
  );

  // 在 </body> 前插入 cloud-save.js
  html = html.replace(
    '</body>',
    '  <script src="/cloud-save.js?v=20260714"></script>\n</body>'
  );

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('[patch] index.html ✓ 已添加 cloud-save 脚本');
} else {
  console.warn('[patch] index.html 未找到，跳过');
}

// ========== 3. 补丁 server index.js：注册云存档路由 ==========
const serverIndex = path.join(SERVER_SRC, 'index.js');
if (fs.existsSync(serverIndex)) {
  let js = fs.readFileSync(serverIndex, 'utf8');

  // 检查是否已经注册
  if (js.includes("cloud-save.js")) {
    console.log('[patch] server index.js ✓ 云存档路由已注册，跳过');
  } else {
    // 在最后一条 import/require 后插入导入
    const importMarker = "import { scanGames, startWatcher, getCategories, getScanStatus } from './scanner.js'";
    if (js.includes(importMarker)) {
      js = js.replace(
        importMarker,
        importMarker + "\nimport cloudSaveRouter from './routes/cloud-save.js'"
      );
    }

    // 在 SPA fallback 之前注册路由
    const spaMarker = "// ============ SPA fallback ============";
    if (js.includes(spaMarker)) {
      js = js.replace(
        spaMarker,
        "// 云存档 API\napp.use('/api', cloudSaveRouter)\n\n" + spaMarker
      );
    }

    fs.writeFileSync(serverIndex, js, 'utf8');
    console.log('[patch] server index.js ✓ 已注册云存档路由');
  }
} else {
  console.warn('[patch] server index.js 未找到，跳过');
}

// ========== 4. 增大请求体限制（云存档上传需要） ==========
if (fs.existsSync(serverIndex)) {
  let js = fs.readFileSync(serverIndex, 'utf8');
  // 如果 body 限制还是 1mb，改为 10mb
  if (js.includes("limit: '1mb'")) {
    js = js.replace("limit: '1mb'", "limit: '10mb'");
    fs.writeFileSync(serverIndex, js, 'utf8');
    console.log('[patch] server index.js ✓ 请求体限制调整为 10mb');
  }
}

console.log('[patch] ✅ 所有补丁应用完成');
