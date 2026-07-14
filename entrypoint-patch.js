/**
 * Entrypoint patch: 在容器启动时自动修改 index.html 和 server index.js
 * 无需手动介入即可加载云端存档功能
 */
const fs = require('fs');
const path = require('path');

const CLIENT_DIST = '/app/client/dist';
const SERVER_SRC = '/app/server/src';

// ========== 1. 确保 cloud-save 数据目录 ==========
const cloudSaveDir = process.env.CLOUD_SAVE_DIR || '/app/data/cloud-saves';
const assetVersion = process.env.FGSWF_ASSET_VERSION || String(Date.now());
if (!fs.existsSync(cloudSaveDir)) {
  fs.mkdirSync(cloudSaveDir, { recursive: true });
  console.log(`[patch] 创建云存档目录: ${cloudSaveDir}`);
}

// ========== 2. 补丁 index.html：添加 cloud-save 脚本 ==========
const indexPath = path.join(CLIENT_DIST, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  // 清除旧的增强脚本引用（如有），避免容器重启后重复插入
  html = html.replace(
    /<script src="\/(cloud-(early-restore|save)|virtual-controls|pause-protect)\.js[^"]*"><\/script>\n?\s*/g,
    ''
  );

  if (html.includes('<script src="/ruffle/ruffle.js"></script>')) {
    html = html.replace(
      '<script src="/ruffle/ruffle.js"></script>',
      `<script src="/cloud-early-restore.js?v=${assetVersion}"></script>\n  <script src="/mobile-font-baseline-fix.js?v=${assetVersion}"></script>\n  <script src="/ruffle/ruffle.js"></script>`
    );
  } else {
    console.warn('[patch] 未找到 ruffle.js 标签，cloud-early-restore 未插入');
  }

  html = html.replace(
    '</body>',
    `  <script src="/pause-protect.js?v=${assetVersion}"></script>\n  <script src="/virtual-controls.js?v=${assetVersion}"></script>\n  <script src="/cloud-save.js?v=${assetVersion}"></script>\n</body>`
  );

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('[patch] index.html ✓ 已添加 cloud-save 脚本');
} else {
  console.warn('[patch] index.html 未找到，跳过');
}


// ========== 2.5 补丁前端 JS：Ruffle 中文字体/联网配置 ==========
try {
  const assetsDir = path.join(CLIENT_DIST, 'assets');
  if (fs.existsSync(assetsDir)) {
    for (const name of fs.readdirSync(assetsDir)) {
      if (!name.endsWith('.js')) continue;
      const fp = path.join(assetsDir, name);
      let code = fs.readFileSync(fp, 'utf8');
      const before = code;
      code = code.replace(/allowNetworking:"none"/g, 'allowNetworking:"all"');
      code = code.replace(/allowScriptAccess:!1/g, 'allowScriptAccess:!0');
      code = code.replace(/openUrlMode:"deny"/g, 'openUrlMode:"allow"');
      const fontPatch = `fontSources:["/fonts/NotoSerifSC-Regular.ttf","/fonts/NotoSansSC-Regular.ttf","/fonts/DroidSansFallbackFull.ttf"],defaultFonts:{sans:"Noto Serif SC",serif:"Noto Serif SC",typewriter:"Noto Serif SC",SimSun:"Noto Serif SC",宋体:"Noto Serif SC",SimHei:"Noto Serif SC",黑体:"Noto Serif SC",微软雅黑:"Noto Serif SC","Microsoft YaHei":"Noto Serif SC",Arial:"Noto Serif SC","Arial Unicode MS":"Noto Serif SC"},deviceFontRenderer:"canvas",`;
      if (code.includes('fontSources:["/fonts/DroidSansFallbackFull.ttf"]')) {
        code = code.replace(/fontSources:\["\/fonts\/DroidSansFallbackFull\.ttf"\],defaultFonts:\{sans:"Droid Sans Fallback".*?\},deviceFontRenderer:(?:"canvas"|"embedded"|\([^,]+\)),/g, fontPatch);
      }
      if (!code.includes('defaultFonts:{sans:"Droid Sans Fallback"')) {
        if (code.includes('fontSources:["/fonts/DroidSansFallbackFull.ttf"],')) {
          code = code.replace('fontSources:["/fonts/DroidSansFallbackFull.ttf"],', fontPatch);
        } else {
          code = code.replace(/warnOnUnsupportedContent:!1,/g, 'warnOnUnsupportedContent:!1,' + fontPatch);
        }
      }
      if (code !== before) {
        fs.writeFileSync(fp, code, 'utf8');
        console.log('[patch] 前端资源 ✓ 已修复 Ruffle 配置:', name);
      }
    }
  }
} catch (e) {
  console.warn('[patch] Ruffle 配置补丁失败:', e.message);
}

// ========== 3. 补丁 server index.js：注册增强路由 ==========
const serverIndex = path.join(SERVER_SRC, 'index.js');
if (fs.existsSync(serverIndex)) {
  let js = fs.readFileSync(serverIndex, 'utf8');

  function addImport(importLine, markerText) {
    if (js.includes(markerText)) return;
    const lastImportMatch = [...js.matchAll(/^import .*$/gm)].pop();
    if (lastImportMatch) {
      const pos = lastImportMatch.index + lastImportMatch[0].length;
      js = js.slice(0, pos) + '\n' + importLine + js.slice(pos);
    } else {
      console.warn('[patch] server index.js 未找到 import 区域，无法自动添加:', importLine);
    }
  }

  addImport("import cloudSaveRouter from './routes/cloud-save.js'", './routes/cloud-save.js');
  addImport("import swfResourceProxy from './routes/swf-resource-proxy.js'", './routes/swf-resource-proxy.js');

  const spaMarker = '// ============ SPA fallback ============';
  if (js.includes(spaMarker)) {
    const inserts = [];
    if (!js.includes("app.use('/api', cloudSaveRouter)")) {
      inserts.push("// 云存档 API\napp.use('/api', cloudSaveRouter)");
    }
    if (!js.includes('app.use(swfResourceProxy)')) {
      inserts.push("// SWF 相对资源兼容代理\napp.use(swfResourceProxy)");
    }
    if (inserts.length) {
      js = js.replace(spaMarker, inserts.join('\n\n') + '\n\n' + spaMarker);
      console.log('[patch] server index.js ✓ 已注册增强路由');
    } else {
      console.log('[patch] server index.js ✓ 增强路由已注册，跳过');
    }
  } else {
    console.warn('[patch] 未找到 SPA fallback 标记，跳过路由注册');
  }

  // 如果 body 限制还是 1mb，改为 10mb
  js = js.replace(/limit: '1mb'/g, "limit: '10mb'");
  fs.writeFileSync(serverIndex, js, 'utf8');
  console.log('[patch] server index.js ✓ 请求体限制已确认');
} else {
  console.warn('[patch] server index.js 未找到，跳过');
}

console.log('[patch] ✅ 所有补丁应用完成');
