/* 被父页 srcdoc 内联时的全屏放大握手：状态与常量 */
// ── 全屏放大：当本图表被父页面以 iframe 内联（srcdoc）时，position:fixed 只能铺满
//    iframe 自身视口（高仅 ~800px），modal 会被裁。打开 modal 时通知父页面把这个
//    iframe 放大到全屏，关闭时还原。子页面无法拿到真实 URL，所以不能走「父页加载
//    popup URL」的老路——只发消息，图表和 modal 都留在原 iframe 里运行。──
const IN_IFRAME = (window !== window.top);
let pendingOpen = null;   // 被内联时，等父页 iframe 放大到全屏(kc-expand-ack)后再开 modal
let revealTimer = null;   // 关闭时，等父页把 iframe 缩回行内尺寸(kc-collapse-ack)后再放出图表

// ── 「这一帧真的上屏了」才回调 ───────────────────────────────────────────────
// rAF 的回调跑在绘制之「前」，所以在 rAF 里通知父页「我画好了」是错的：父页立刻
// 显影，而跨进程合成器手上还是子页的上一帧（刚按全屏重排、但还没加 class 的标签树）
// —— 那就是 flash.png 里那片「清晰的全屏标签树盖在模糊页面上」。
// 连续两次 rAF 之间必然跨过一个完整的帧边界，即上一帧已提交合成；再挂一个
// setTimeout 0 兜住「后台标签页 / 隐藏 iframe 里 rAF 根本不跑」的情况。
function afterPaint(fn){
  let done = false;
  const go = () => { if (done) return; done = true; fn(); };
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 120);
}

