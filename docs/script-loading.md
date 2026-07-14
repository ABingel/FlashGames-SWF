# 脚本加载顺序（index.html）

Cloud Save 系统依赖正确的加载顺序：

```
1. cloud-early-restore.js  ← 必须在 ruffle.js 之前
2. ruffle.js               ← Ruffle 播放器
3. virtual-controls.js      ← 手机虚拟按键
4. pause-protect.js         ← 暂停保护
5. cloud-save.js            ← 完整云存档面板（含 UI）
```

## 关键原则

- `cloud-early-restore.js` 必须在 `ruffle.js` 之前加载，这样在 Ruffle 初始化之前就能把待恢复的存档写入 localStorage
- `cloud-save.js` 在最后加载，因为它会创建 UI（按钮、面板等）
- 如果 virtual-controls.js 不存在，cloud-save.js 放在 pause-protect.js 之后即可

## index.html 示例

```html
<script src="/cloud-early-restore.js?v=20260712"></script>
<script src="/ruffle/ruffle.js"></script>
<!-- ... 其他脚本 -->
<script src="/virtual-controls.js?v=20260710-customkeys"></script>
<script src="/pause-protect.js"></script>
<script src="/cloud-save.js?v=20260712-panel"></script>
```

## 注意

确保所有资源 URL 添加版本参数（如 `?v=YYYYMMDD`），以便浏览器正确刷新缓存。
