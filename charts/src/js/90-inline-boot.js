// ══════════════════════════════════════════════════════════════════════════
// 内联播放器启动 —— Pointwise 数据示例（charts/annotation-demo.html）
// ══════════════════════════════════════════════════════════════════════════
// 用的是与标签体系完全相同的 modal 组件（html/50-modal.html），只是被
// 60-inline.css 摊平成静态卡片：没有开关弹窗那一层，页面加载完直接挂 demo。
// 数据取自 data/tag-system.json 的 demos —— 与标签体系同一份，不再像旧版那样
// 在 HTML 里另抄一份 3 条子集。

// 展示顺序固定：先崩坏（结构类），再六指（局部结构），再字幕（文字类），
// 覆盖三种不同的缺陷形态和三段不同素材。DEMOS 的键就是标签名。
const INLINE_KEYS = ["文字不可读", "崩坏", "生物类结构异常", "主体未响应"];

const inlineDemos = INLINE_KEYS.flatMap(k => (DEMOS[k] || []).map(d => ({
  ...d,
  // 内联版没有标题栏可放标签名，把它并进 pill 文案里
  // An empty label means the tag name says it all (public-set clips had a
  // redundant "VideoFeedback · <id>" tail); otherwise append the demo's own name.
  label: d.label ? k + ' · ' + d.label.replace(/^demo-\d+\s*·\s*/, '') : k,
})));

// modal 的标题栏在这里成了卡片头：填成这份 demo 的说明，而不是某个标签名。
document.getElementById('m-title').textContent = 'Pointwise 帧级标注';
document.getElementById('m-path').textContent  = '点击进度条问题帧或时间戳查看该帧 JSON';

if (!mountDemos(inlineDemos)) {
  document.getElementById('j-body').innerHTML =
    '<span class="jempty">data/tag-system.json 的 demos 里没有这几个键：'
    + INLINE_KEYS.join(' / ') + '</span>';
}


