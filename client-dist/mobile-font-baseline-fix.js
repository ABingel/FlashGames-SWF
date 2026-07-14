(function () {
  'use strict';

  var isMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|HarmonyOS|MiuiBrowser|HuaweiBrowser/i.test(navigator.userAgent || '');
  if (!isMobile || !window.CanvasRenderingContext2D) return;
  if (window.__fgMobileFontBaselineFix) return;
  window.__fgMobileFontBaselineFix = true;

  var CJK_RE = /[\u2e80-\u2eff\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  var proto = window.CanvasRenderingContext2D.prototype;
  var rawFillText = proto.fillText;
  var rawStrokeText = proto.strokeText;

  function fontSizeOf(ctx) {
    var m = /(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|$)/i.exec(ctx && ctx.font || '');
    return m ? Number(m[1]) : 16;
  }

  function shouldShift(ctx, text) {
    if (typeof text !== 'string' || !CJK_RE.test(text)) return false;
    var canvas = ctx && ctx.canvas;
    if (!canvas) return false;
    // Ruffle 游戏画布通常面积较大；排除普通小图标/页面 UI canvas。
    return (canvas.width >= 200 && canvas.height >= 150) || (canvas.clientWidth >= 200 && canvas.clientHeight >= 150);
  }

  function shiftedY(ctx, text, y) {
    if (!shouldShift(ctx, text)) return y;
    // 移动端 canvas 中文基线偏低；按字号轻微上移，避免过度影响不同字号。
    return y - Math.max(1, Math.round(fontSizeOf(ctx) * 0.16));
  }

  if (rawFillText) {
    proto.fillText = function (text, x, y, maxWidth) {
      y = shiftedY(this, text, y);
      return arguments.length > 3
        ? rawFillText.call(this, text, x, y, maxWidth)
        : rawFillText.call(this, text, x, y);
    };
  }

  if (rawStrokeText) {
    proto.strokeText = function (text, x, y, maxWidth) {
      y = shiftedY(this, text, y);
      return arguments.length > 3
        ? rawStrokeText.call(this, text, x, y, maxWidth)
        : rawStrokeText.call(this, text, x, y);
    };
  }
})();
