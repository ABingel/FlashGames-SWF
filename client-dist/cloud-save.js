// ======= Flash Games 云端存档同步 v1.1 - IndexedDB 修复版 =======
(function () {
 'use strict';

 var CODE_KEY = '***';
 var LAST_HASH_KEY = 'fgClou…Hash';
 var RELOAD_PROMPT_HASH_KEY = 'fgClou…Hash';
 var API_BASE = '/api/cloud-save';
 var PENDING_RESTORE_KEY = 'fgClou…reV1';
 var AUTO_SYNC_MS = 30000;
 var autoTimer = null;
 var busy = false;
 var panel = null;
 var statusEl = null;

 function log() { try { console.log.apply(console, ['[cloud-save]'].concat([].slice.call(arguments))); } catch (_) {} }
 function nowIso() { return new Date().toISOString(); }
 function enc(s) { return encodeURIComponent(s); }

 function earlySavedDataHosts() {
 var hosts = [];
 function addHost(h) { if (h && hosts.indexOf(h) < 0) hosts.push(h); }
 addHost(location.host);
 addHost(location.hostname);
 addHost('192.168.31.99');
 addHost('192.168.31.99:3000');
 addHost('fg.223727.xyz');
 return hosts;
 }

 function earlyNormalizeRestoreLocalStorage(obj) {
 if (!obj || typeof obj !== 'object') return obj;
 var hosts = earlySavedDataHosts();
 var groups = {};
 Object.keys(obj).forEach(function (key) {
 if (!/\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(key)) return;
 var m = key.match(/^(.*?)(\/game\/.*\/game\.swf(?:\?.*)?\/SavedData)$/);
 if (!m) return;
 var canonicalPath = m[2].replace(/game\.swf\?[^/]+\/SavedData$/, 'game.swf/SavedData');
 (groups[canonicalPath] || (groups[canonicalPath] = [])).push({ key: key, value: obj[key] });
 });
 Object.keys(groups).forEach(function (canonicalPath) {
 var counts = {}, sourceValue = null, sourceCount = -1;
 groups[canonicalPath].forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
 Object.keys(counts).forEach(function (val) { if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; } });
 if (!sourceValue && groups[canonicalPath][0]) sourceValue = groups[canonicalPath][0].value;
 if (!sourceValue) return;
 try {
 for (var i = localStorage.length - 1; i >= 0; i--) {
 var k = localStorage.key(i);
 if (k && k.indexOf(canonicalPath) >= 0 && /\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(k)) localStorage.removeItem(k);
 }
 } catch (_) {}
 hosts.forEach(function (h) { obj[h + canonicalPath] = sourceValue; });
 });
 return obj;
 }

 function earlyApplyPendingRestore() {
 try {
 var raw = sessionStorage.getItem(PENDING_RESTORE_KEY);
 if (!raw) return;
 sessionStorage.removeItem(PENDING_RESTORE_KEY);
 var obj = JSON.parse(raw);
 var ls = earlyNormalizeRestoreLocalStorage(obj && obj.localStorage);
 if (!ls || typeof ls !== 'object') return;
 Object.keys(ls).forEach(function (key) {
 if (!key || key === CODE_KEY || key === LAST_HASH_KEY || key === RELOAD_PROMPT_HASH_KEY) return;
 if (/token|password|auth|jwt|admin|lock|credential|secret/i.test(key)) return;
 localStorage.setItem(key, ls[key]);
 });
 console.log('[cloud-save] pending cloud restore applied before game startup');
 } catch (e) {
 console.warn('[cloud-save] pending restore failed', e);
 }
 }

 earlyApplyPendingRestore();

 function validCode(code) {
 return /^[A-Za-z0-9_-]{6,64}$/.test(String(code || ''));
 }

 function randomCode() {
 var bytes = new Uint8Array(12);
 (window.crypto || window.msCrypto).getRandomValues(bytes);
 return Array.from(bytes).map(function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 18);
 }

 function getCode() {
 var code = localStorage.getItem(CODE_KEY);
 if (!validCode(code)) {
 code = randomCode();
 localStorage.setItem(CODE_KEY, code);
 }
 return code;
 }

 function setStatus(text, good) {
 if (statusEl) {
 statusEl.textContent = text;
 statusEl.style.color = good ? '#28c76f' : '#ffd166';
 }
 log(text);
 }

 function shouldSyncLocalStorageKey(key) {
 if (!key) return false;
 if (key === CODE_KEY || key === LAST_HASH_KEY || key === RELOAD_PROMPT_HASH_KEY) return false;
 if (/token|password|auth|jwt|admin|lock|credential|secret/i.test(key)) return false;
 return true;
 }

 function collectLocalStorage() {
 var out = {};
 for (var i = 0; i < localStorage.length; i++) {
 var key = localStorage.key(i);
 if (shouldSyncLocalStorageKey(key)) out[key] = localStorage.getItem(key);
 }
 return out;
 }


 function getSavedDataHosts() {
 var hosts = [];
 function addHost(h) { if (h && hosts.indexOf(h) < 0) hosts.push(h); }
 addHost(location.host);
 addHost(location.hostname);
 addHost('192.168.31.99');
 addHost('192.168.31.99:3000');
 addHost('fg.223727.xyz');
 return hosts;
 }

 function groupSavedDataKeys(obj) {
 var groups = {};
 if (!obj || typeof obj !== 'object') return groups;
 Object.keys(obj).forEach(function (key) {
 if (!/\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(key)) return;
 var m = key.match(/^(.*?)(\/game\/.*\/game\.swf(?:\?.*)?\/SavedData)$/);
 if (!m) return;
 var pathPart = m[2];
 var canonicalPath = pathPart.replace(/game\.swf\?[^/]+\/SavedData$/, 'game.swf/SavedData');
 (groups[canonicalPath] || (groups[canonicalPath] = [])).push({ key: key, host: m[1], path: pathPart, value: obj[key] });
 });
 return groups;
 }

 function normalizeSavedDataForUpload(obj) {
 if (!obj || typeof obj !== 'object') return 0;
 var hosts = getSavedDataHosts();
 var changed = 0;
 var groups = groupSavedDataKeys(obj);
 Object.keys(groups).forEach(function (canonicalPath) {
 var items = groups[canonicalPath];
 var source = null;
 [location.host, location.hostname].some(function (h) {
 source = items.find(function (it) { return it.host === h && it.value; });
 return !!source;
 });
 if (!source) source = items.find(function (it) { return it.value; });
 if (!source) return;
 hosts.forEach(function (h) {
 [canonicalPath, source.path].forEach(function (pathPart) {
 var nk = h + pathPart;
 if (obj[nk] !== source.value) { obj[nk] = source.value; changed++; }
 });
 });
 });
 return changed;
 }

 function normalizeSavedDataForRestore(obj) {
 if (!obj || typeof obj !== 'object') return 0;
 var hosts = getSavedDataHosts();
 var changed = 0;
 var groups = groupSavedDataKeys(obj);
 Object.keys(groups).forEach(function (canonicalPath) {
 var items = groups[canonicalPath];
 var counts = {};
 items.forEach(function (it) { if (it.value) counts[it.value] = (counts[it.value] || 0) + 1; });
 var sourceValue = null, sourceCount = -1;
 Object.keys(counts).forEach(function (val) {
 if (counts[val] > sourceCount) { sourceValue = val; sourceCount = counts[val]; }
 });
 if (!sourceValue) {
 var first = items.find(function (it) { return it.value; });
 sourceValue = first && first.value;
 }
 if (!sourceValue) return;
 hosts.forEach(function (h) {
 var nk = h + canonicalPath;
 if (obj[nk] !== sourceValue) { obj[nk] = sourceValue; changed++; }
 });
 });
 return changed;
 }

 function restoreLocalStorage(obj) {
 if (!obj || typeof obj !== 'object') return 0;
 normalizeSavedDataForRestore(obj);
 Object.keys(obj).forEach(function (key) {
 if (!/\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(key)) return;
 var m = key.match(/^(.*?)(\/game\/.*\/game\.swf(?:\?.*)?\/SavedData)$/);
 if (!m) return;
 var canonicalPath = m[2].replace(/game\.swf\?[^/]+\/SavedData$/, 'game.swf/SavedData');
 try {
 for (var i = localStorage.length - 1; i >= 0; i--) {
 var k = localStorage.key(i);
 if (k && k.indexOf(canonicalPath) >= 0 && /\/game\/.*\/game\.swf(?:\?.*)?\/SavedData$/.test(k)) localStorage.removeItem(k);
 }
 } catch (_) {}
 });
 var count = 0;
 Object.keys(obj).forEach(function (key) {
 if (shouldSyncLocalStorageKey(key)) {
 localStorage.setItem(key, obj[key]);
 count++;
 }
 });
 return count;
 }

 function rememberDbName(name) {
 if (!name) return;
 try {
 var list = JSON.parse(localStorage.getItem('fgCloudKnownIdbNames') || '[]');
 if (list.indexOf(name) < 0) {
 list.push(name);
 localStorage.setItem('fgCloudKnownIdbNames', JSON.stringify(list.slice(-50)));
 }
 } catch (_) {}
 }

 (function hookIndexedDBOpen() {
 if (!window.indexedDB || indexedDB.__fgCloudHooked) return;
 var origOpen = indexedDB.open.bind(indexedDB);
 var origDelete = indexedDB.deleteDatabase ? indexedDB.deleteDatabase.bind(indexedDB) : null;
 indexedDB.open = function (name, version) {
 rememberDbName(name);
 return version === undefined ? origOpen(name) : origOpen(name, version);
 };
 if (origDelete) {
 indexedDB.deleteDatabase = function (name) {
 rememberDbName(name);
 return origDelete(name);
 };
 }
 indexedDB.__fgCloudHooked = true;
 })();

 function idbReq(req) {
 return new Promise(function (resolve, reject) {
 req.onsuccess = function () { resolve(req.result); };
 req.onerror = function () { reject(req.error || new Error('IndexedDB request failed')); };
 req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
 });
 }

 function txDone(tx) {
 return new Promise(function (resolve, reject) {
 tx.oncomplete = function () { resolve(); };
 tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
 tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
 });
 }

 function bytesToBase64(bytes) {
 var binary = '';
 for (var i = 0; i < bytes.length; i += 0x8000) {
 binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
 }
 return btoa(binary);
 }

 function base64ToBytes(b64) {
 var binary = atob(b64 || '');
 var bytes = new Uint8Array(binary.length);
 for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
 return bytes;
 }

 async function encodeAny(val) {
 if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
 if (val instanceof Date) return { __fgType: 'Date', value: val.toISOString() };
 if (val instanceof ArrayBuffer) return { __fgType: 'ArrayBuffer', base64: bytesToBase64(new Uint8Array(val)) };
 if (ArrayBuffer.isView(val)) return { __fgType: val.constructor && val.constructor.name || 'TypedArray', base64: bytesToBase64(new Uint8Array(val.buffer, val.byteOffset, val.byteLength)) };
 if (typeof Blob !== 'undefined' && val instanceof Blob) {
 var buf = await val.arrayBuffer();
 return { __fgType: 'Blob', type: val.type || '', base64: bytesToBase64(new Uint8Array(buf)) };
 }
 if (Array.isArray(val)) {
 var arr = [];
 for (var i = 0; i < val.length; i++) arr.push(await encodeAny(val[i]));
 return arr;
 }
 if (typeof val === 'object') {
 var out = {};
 var keys = Object.keys(val);
 for (var k = 0; k < keys.length; k++) out[keys[k]] = await encodeAny(val[keys[k]]);
 return out;
 }
 return null;
 }

 function decodeAny(val) {
 if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
 if (Array.isArray(val)) return val.map(decodeAny);
 if (val && typeof val === 'object' && val.__fgType) {
 if (val.__fgType === 'Date') return new Date(val.value);
 if (val.__fgType === 'ArrayBuffer') return base64ToBytes(val.base64).buffer;
 if (val.__fgType === 'Uint8Array' || val.__fgType === 'Uint8ClampedArray') return base64ToBytes(val.base64);
 if (val.__fgType === 'Int8Array') return new Int8Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Uint16Array') return new Uint16Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Int16Array') return new Int16Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Uint32Array') return new Uint32Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Int32Array') return new Int32Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Float32Array') return new Float32Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Float64Array') return new Float64Array(base64ToBytes(val.base64).buffer);
 if (val.__fgType === 'Blob') return new Blob([base64ToBytes(val.base64)], { type: val.type || '' });
 }
 if (val && typeof val === 'object') {
 var out = {};
 Object.keys(val).forEach(function (k) { out[k] = decodeAny(val[k]); });
 return out;
 }
 return val;
 }

 async function listDatabases() {
 var names = [];
 function add(n) { if (n && names.indexOf(n) < 0) names.push(n); }
 try {
 JSON.parse(localStorage.getItem('fgCloudKnownIdbNames') || '[]').forEach(add);
 } catch (_) {}
 [
 'ruffle', 'Ruffle', 'ruffle-storage', 'ruffle_storage', 'ruffle_saves',
 'RuffleSaveData', 'ruffle-save-data', 'shared_objects', 'SharedObjects',
 'flash', 'flash-storage', 'flash_saves'
 ].forEach(add);
 if (window.indexedDB && indexedDB.databases) {
 try {
 var dbs = (await indexedDB.databases()) || [];
 dbs.forEach(function (db) { add(db && db.name); });
 } catch (_) {}
 }
 return names.map(function (name) { return { name: name }; });
 }

 function shouldSyncDbName(name) {
 if (!name) return false;
 if (/token|password|auth|jwt|admin|credential|secret/i.test(name)) return true;
 return true;
 }

 async function dumpStore(db, storeName) {
 var tx = db.transaction(storeName, 'readonly');
 var store = tx.objectStore(storeName);
 var entries = [];
 await new Promise(function (resolve, reject) {
 var req = store.openCursor();
 req.onerror = function () { reject(req.error || new Error('cursor failed')); };
 req.onsuccess = async function () {
 var cursor = req.result;
 if (!cursor) return resolve();
 entries.push({ key: await encodeAny(cursor.key), value: await encodeAny(cursor.value) });
 cursor.continue();
 };
 });
 await txDone(tx).catch(function () {});
 return { keyPath: store.keyPath, autoIncrement: store.autoIncrement, entries: entries };
 }

 // ======= 诊断：列出所有 IndexedDB 数据库并显示内容摘要 =======
 async function debugIndexedDB() {
 var result = [];
 var names = await listDatabases();
 for (var i = 0; i < names.length; i++) {
 var name = names[i] && names[i].name;
 if (!name) continue;
 try {
 var db = await idbReq(indexedDB.open(name));
 var info = { name: name, version: db.version, storeNames: [], totalEntries: 0 };
 for (var j = 0; j < db.objectStoreNames.length; j++) {
 var sName = db.objectStoreNames[j];
 info.storeNames.push(sName);
 try {
 var dump = await dumpStore(db, sName);
 info.totalEntries += dump.entries.length;
 } catch(e) { info.totalEntries += -1; }
 }
 result.push(info);
 db.close();
 } catch (e) {
 result.push({ name: name, error: e && e.message || String(e) });
 }
 }
 return result;
 }

 async function collectIndexedDB() {
 var result = {};
 var dbs = await listDatabases();
 for (var i = 0; i < dbs.length; i++) {
 var name = dbs[i] && dbs[i].name;
 if (!shouldSyncDbName(name)) continue;
 try {
 var db = await idbReq(indexedDB.open(name));
 rememberDbName(name);
 if (!db.objectStoreNames || db.objectStoreNames.length === 0) { db.close(); continue; }
 var stores = {};
 for (var j = 0; j < db.objectStoreNames.length; j++) {
 var storeName = db.objectStoreNames[j];
 stores[storeName] = await dumpStore(db, storeName);
 }
 result[name] = { version: db.version, stores: stores };
 db.close();
 } catch (e) {
 log('skip idb', name, e && e.message);
 }
 }
 return result;
 }

 async function openDbEnsuringStores(name, wanted) {
 var db = await idbReq(indexedDB.open(name));
 var missing = Object.keys(wanted.stores || {}).filter(function (s) { return !db.objectStoreNames.contains(s); });
 if (!missing.length) return db;
 var newVersion = (db.version || 1) + 1;
 db.close();
 return await new Promise(function (resolve, reject) {
 var req = indexedDB.open(name, newVersion);
 req.onupgradeneeded = function () {
 var upDb = req.result;
 missing.forEach(function (storeName) {
 var meta = wanted.stores[storeName] || {};
 var opts = {};
 if (meta.keyPath != null) opts.keyPath = meta.keyPath;
 if (meta.autoIncrement) opts.autoIncrement = true;
 if (!upDb.objectStoreNames.contains(storeName)) upDb.createObjectStore(storeName, opts);
 });
 };
 req.onsuccess = function () { resolve(req.result); };
 req.onerror = function () { reject(req.error || new Error('open upgrade failed')); };
 req.onblocked = function () { reject(new Error('IndexedDB upgrade blocked')); };
 });
 }

 async function restoreIndexedDB(idbData) {
 if (!idbData || typeof idbData !== 'object' || !window.indexedDB) return 0;
 var total = 0;
 var names = Object.keys(idbData);
 for (var i = 0; i < names.length; i++) {
 var name = names[i];
 if (!shouldSyncDbName(name)) continue;
 var wanted = idbData[name];
 try {
 var db = await openDbEnsuringStores(name, wanted);
 var storeNames = Object.keys(wanted.stores || {}).filter(function (s) { return db.objectStoreNames.contains(s); });
 if (!storeNames.length) { db.close(); continue; }
 var tx = db.transaction(storeNames, 'readwrite');
 for (var s = 0; s < storeNames.length; s++) {
 var storeName = storeNames[s];
 var store = tx.objectStore(storeName);
 var entries = (wanted.stores[storeName] && wanted.stores[storeName].entries) || [];
 store.clear();
 for (var e = 0; e < entries.length; e++) {
 var key = decodeAny(entries[e].key);
 var value = decodeAny(entries[e].value);
 try { store.put(value, key); }
 catch (_) { try { store.put(value); } catch (__) {} }
 total++;
 }
 }
 await txDone(tx);
 db.close();
 rememberDbName(name);
 } catch (e) {
 log('restore idb failed', name, e && e.message);
 }
 }
 return total;
 }

 async function collectAll() {
 return {
 schema: 1,
 page: location.pathname + location.search,
 userAgent: navigator.userAgent,
 savedAt: nowIso(),
 localStorage: collectLocalStorage(),
 indexedDB: await collectIndexedDB()
 };
 }


 function countIndexedDbEntries(idbData) {
 var total = 0;
 if (!idbData || typeof idbData !== 'object') return 0;
 Object.keys(idbData).forEach(function (dbName) {
 var db = idbData[dbName] || {};
 Object.keys(db.stores || {}).forEach(function (storeName) {
 var entries = db.stores[storeName] && db.stores[storeName].entries;
 if (Array.isArray(entries)) total += entries.length;
 });
 });
 return total;
 }

 function hasLikelyGameSave(data) {
 if (!data || typeof data !== 'object') return false;
 if (countIndexedDbEntries(data.indexedDB) > 0) return true;
 var ls = data.localStorage || {};
 return Object.keys(ls).some(function (k) { return /ruffle|flash|sharedobject|\.sol|save/i.test(k) && k.indexOf('fgCloud') !== 0; });
 }

 function stableStringify(obj) {
 return JSON.stringify(obj, function (key, val) {
 if (val && typeof val === 'object' && !Array.isArray(val)) {
 return Object.keys(val).sort().reduce(function (out, k) { out[k] = val[k]; return out; }, {});
 }
 return val;
 });
 }

 async function sha256(text) {
 if (!crypto.subtle) return String(text.length) + ':' + text.slice(0, 64);
 var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
 return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
 }

 async function upload(force) {
 if (busy) return;
 var code = getCode();
 var data = await collectAll();
 if (data.localStorage) normalizeSavedDataForUpload(data.localStorage);
 if (!force && !hasLikelyGameSave(data)) {
 setStatus('未检测到游戏存档，已跳过自动上传，避免空存档覆盖云端', false);
 return;
 }
 if (force && !hasLikelyGameSave(data)) {
 if (!confirm('当前浏览器没有检测到游戏存档。继续上传可能会覆盖云端存档，确定继续？')) return;
 }
 var text = stableStringify(data);
 var hash = await sha256(text);
 if (!force && hash === localStorage.getItem(LAST_HASH_KEY)) return;
 busy = true;
 try {
 var res = await fetch(API_BASE + '/' + enc(code), {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ data: data, hash: hash, clientUpdatedAt: nowIso() })
 });
 if (!res.ok) throw new Error('HTTP ' + res.status);
 localStorage.setItem(LAST_HASH_KEY, hash);
 setStatus('已自动同步到云端 ' + new Date().toLocaleTimeString(), true);
 } catch (e) {
 setStatus('云同步失败：' + (e && e.message || e), false);
 } finally {
 busy = false;
 }
 }

 async function download(force) {
 if (busy) return;
 var code = getCode();
 force = !!force;
 busy = true;
 try {
 var res = await fetch(API_BASE + '/' + enc(code));
 if (!res.ok) throw new Error('HTTP ' + res.status);
 var payload = await res.json();
 if (!payload.exists || !payload.data) {
 setStatus('云端还没有这个存档；请先在有进度的设备上手动点击"立即上传"', false);
 return;
 }
 if (!force && payload.hash && localStorage.getItem(LAST_HASH_KEY) === payload.hash) {
 setStatus('云存档已是最新 ' + new Date().toLocaleTimeString(), true);
 return;
 }
 try { sessionStorage.setItem(PENDING_RESTORE_KEY, JSON.stringify(payload.data || {})); } catch (_) {}
 var lsCount = restoreLocalStorage(payload.data.localStorage);
 var idbCount = await restoreIndexedDB(payload.data.indexedDB);
 var appliedHash = payload.hash || await sha256(stableStringify(payload.data));
 if (appliedHash) localStorage.setItem(LAST_HASH_KEY, appliedHash);
 setStatus('已从云端恢复：localStorage ' + lsCount + ' 项，IndexedDB ' + idbCount + ' 项。', true);
 if (force || (appliedHash && localStorage.getItem(RELOAD_PROMPT_HASH_KEY) !== appliedHash)) {
 if (appliedHash) localStorage.setItem(RELOAD_PROMPT_HASH_KEY, appliedHash);
 if (confirm('云存档已恢复。是否现在刷新页面让游戏读取存档？')) location.reload();
 }
 } catch (e) {
 setStatus('拉取失败：' + (e && e.message || e), false);
 } finally {
 busy = false;
 }
 }

 function copyCode() {
 var code = getCode();
 if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () {});
 prompt('这是你的云存档码。在其他设备输入同一个码即可同步：', code);
 }

 function switchCode() {
 var old = getCode();
 var code = prompt('输入云存档码（6-64位，字母/数字/_/-）。留空则取消：', old);
 if (code == null) return;
 code = String(code).trim();
 if (!validCode(code)) return alert('存档码格式不对');
 localStorage.setItem(CODE_KEY, code);
 localStorage.removeItem(LAST_HASH_KEY);
 updatePanelCode();
 download();
 }

 function newCode() {
 if (!confirm('生成新云存档码后，本浏览器会使用新的云端存档空间。旧码仍可继续使用，确定生成？')) return;
 localStorage.setItem(CODE_KEY, randomCode());
 localStorage.removeItem(LAST_HASH_KEY);
 updatePanelCode();
 upload(true);
 }

 function updatePanelCode() {
 var el = document.getElementById('fg-cloud-code');
 if (el) el.textContent = getCode();
 }

 function injectStyle() {
 if (document.getElementById('fg-cloud-style')) return;
 var style = document.createElement('style');
 style.id = 'fg-cloud-style';
 style.textContent = '#fg-cloud-btn{position:fixed;right:12px;top:calc(env(safe-area-inset-top,0px) + 72px);bottom:auto;z-index:99999;width:46px;height:46px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(15,23,42,.72);color:#fff;font-size:21px;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer}#fg-cloud-panel{position:fixed;right:12px;top:calc(env(safe-area-inset-top,0px) + 124px);bottom:auto;z-index:99999;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 88px);overflow:auto;background:rgba(15,23,42,.96);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,.35);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#fg-cloud-panel button{margin:6px 6px 0 0;border:0;border-radius:9px;padding:8px 10px;background:#334155;color:#fff;cursor:pointer}#fg-cloud-panel button.primary{background:#2563eb}#fg-cloud-panel .fg-section{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12)}#fg-cloud-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#93c5fd;word-break:break-all}#fg-cloud-status{margin-top:8px;font-size:12px;color:#ffd166}@media (max-width:520px){#fg-cloud-panel{top:calc(env(safe-area-inset-top,0px) + 122px);font-size:13px}}#fg-cloud-debug{background:#5b21b6!important;font-size:11px}#fg-cloud-debug-output{white-space:pre-wrap;font-size:11px;font-family:monospace;background:rgba(0,0,0,.4);padding:8px;border-radius:6px;max-height:300px;overflow:auto;margin-top:6px;display:none}';
 document.head.appendChild(style);
 }

 function createUi() {
 if (document.getElementById('fg-cloud-btn')) return;
 injectStyle();
 var btn = document.createElement('button');
 btn.id = 'fg-cloud-btn';
 btn.textContent = '💾';
 btn.title = '存档中心：本地存档 + 云存档';
 ['contextmenu','selectstart','dragstart'].forEach(function (name) {
 btn.addEventListener(name, function (ev) { ev.preventDefault(); ev.stopPropagation(); return false; }, { passive: false });
 });
 btn.onclick = function () {
 panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
 updatePanelCode();
 };

 panel = document.createElement('div');
 panel.id = 'fg-cloud-panel';
 panel.style.display = 'none';
 panel.innerHTML = '<div style="font-weight:700;font-size:16px;margin-bottom:6px">💾☁️ 存档中心</div>' +
 '<div>云存档码：<span id="fg-cloud-code"></span></div>' +
 '<div style="font-size:12px;color:#cbd5e1;margin:6px 0">本地存档用于导入/导出 .sol；云存档已关闭自动同步，需要手动上传/拉取。</div>' +
 '<div class="fg-section"><div style="font-weight:600">本地存档</div>' +
 '<button id="fg-local-save">打开本地存档管理</button></div>' +
 '<div class="fg-section"><div style="font-weight:600">云存档</div>' +
 '<button class="primary" id="fg-cloud-upload">立即上传</button>' +
 '<button id="fg-cloud-download">拉取云端</button>' +
 '<button id="fg-cloud-copy">复制/查看码</button>' +
 '<button id="fg-cloud-switch">输入码</button>' +
 '<button id="fg-cloud-new">新建码</button></div>' +
 '<div class="fg-section"><button id="fg-cloud-debug">🔍 诊断（IndexedDB + localStorage）</button>' +
 '<div id="fg-cloud-debug-output"></div></div>' +
 '<div id="fg-cloud-status">准备就绪</div>';
 document.body.appendChild(btn);
 document.body.appendChild(panel);
 ['contextmenu','selectstart','dragstart'].forEach(function (name) {
 panel.addEventListener(name, function (ev) { ev.stopPropagation(); }, { passive: false });
 });
 statusEl = document.getElementById('fg-cloud-status');
 document.getElementById('fg-local-save').onclick = function () {
 if (window.FlashGamesOpenSaveManager) window.FlashGamesOpenSaveManager();
 else alert('本地存档管理还没准备好，请等游戏加载完成后再试。');
 };
 document.getElementById('fg-cloud-upload').onclick = function () { upload(true); };
 document.getElementById('fg-cloud-download').onclick = function () { download(true); };
 document.getElementById('fg-cloud-copy').onclick = copyCode;
 document.getElementById('fg-cloud-switch').onclick = switchCode;
 document.getElementById('fg-cloud-new').onclick = newCode;
 document.getElementById('fg-cloud-debug').onclick = async function () {
 var el = document.getElementById('fg-cloud-debug-output');
 el.style.display = 'block';
 el.textContent = '诊断中...';
 var lines = [];
 lines.push('location: ' + location.href);
 lines.push('userAgent: ' + navigator.userAgent);
 lines.push('');
 lines.push('--- localStorage ---');
 lines.push('total keys: ' + localStorage.length);
 lines.push('fgCloudKnownIdbNames: ' + (localStorage.getItem('fgCloudKnownIdbNames') || '(空)'));
 var savedDataKeys = [];
 for (var i = 0; i < localStorage.length; i++) {
 var k = localStorage.key(i);
 if (k && /SavedData/i.test(k)) savedDataKeys.push(k);
 }
 lines.push('SavedData keys: ' + savedDataKeys.length);
 savedDataKeys.forEach(function(k) {
 var v = localStorage.getItem(k);
 lines.push('  ' + k + ' (' + (v?v.length:0) + ' chars)');
 });
 lines.push('');
 lines.push('--- IndexedDB ---');
 try {
 var idbInfo = await debugIndexedDB();
 if (idbInfo.length === 0) {
 lines.push('（没有找到任何 IndexedDB 数据库）');
 } else {
 idbInfo.forEach(function(db) {
 lines.push('DB: ' + db.name + ' v' + db.version);
 if (db.error) { lines.push('  ❌ ' + db.error); }
 else {
 db.storeNames.forEach(function(sn) {
 lines.push('  📦 ' + sn);
 });
 lines.push('  📊 total entries: ' + db.totalEntries);
 }
 });
 }
 } catch(e) {
 lines.push('❌ IndexedDB 诊断失败: ' + (e && e.message || e));
 }
 lines.push('');
 lines.push('--- indexedDB.databases() ---');
 try {
 if (indexedDB.databases) {
 var dbs = await indexedDB.databases();
 lines.push(JSON.stringify(dbs));
 } else {
 lines.push('❌ indexedDB.databases() 不可用（Firefox 不支持）');
 }
 } catch(e) {
 lines.push('❌ ' + (e && e.message || e));
 }
 el.textContent = lines.join('\n');
 };
 updatePanelCode();
 }

 function startAutoSync() {
 getCode();
 setStatus('自动同步已关闭；上传/拉取都需要手动点击按钮', true);
 }

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', function () { createUi(); startAutoSync(); });
 } else {
 createUi(); startAutoSync();
 }
})();
