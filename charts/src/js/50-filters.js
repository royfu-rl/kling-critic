/* 筛选：Before 按标记、After 按优先级；展开收起 */
// ══════════════════════════════════════════════════════════════════════════
// FILTERS (multi-select union) + EXPAND / COLLAPSE
// ══════════════════════════════════════════════════════════════════════════
//   chip matches a filter when:  subj→dataset.subj==1 · obj→dataset.subj==0
//   dup/confusion→dataset.flag · stmt→dataset.stmt==1.  A chip shows if it
//   matches ANY selected filter (union). "全部" clears the selection.
const active = new Set();
const matches = (c, f) =>
  f === 'subj'      ? c.dataset.subj === '1' :
  f === 'obj'       ? c.dataset.subj === '0' :
  f === 'confusion' ? c.dataset.flag === 'confusion' :
  f === 'dup'       ? c.dataset.flag === 'dup' :
  f === 'stmt'      ? c.dataset.stmt === '1' :
  // after-mode 优先级筛选；data-p 由 chipEl 写入（TBD = 待产品补充）
  f === 'p0'        ? c.dataset.p === 'P0' :
  f === 'p1'        ? c.dataset.p === 'P1' :
  f === 'p2'        ? c.dataset.p === 'P2' :
  f === 'ptbd'      ? c.dataset.p === 'TBD' :
  // ing = 本轮正在标注的标签子集，跨维度跨优先级，来自 data/tag-system.json 的 ing
  f === 'ing'       ? c.dataset.ing === '1' : false;

document.getElementById('toolbar').addEventListener('click', e => {
  const b = e.target.closest('.fbtn'); if(!b) return;
  const f = b.dataset.f;
  if (f === 'all'){ resetFilters(); return; }
  active.has(f) ? active.delete(f) : active.add(f);
  b.classList.toggle('on', active.has(f));
  b.closest('.filters').querySelector('.fbtn[data-f="all"]').classList.toggle('on', active.size === 0);
  applyFilter();
});
function resetFilters(){
  active.clear();
  document.querySelectorAll('.fbtn').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.fbtn[data-f="all"]').forEach(x => x.classList.add('on'));
  applyFilter();                     // 灰显、隐藏、计数三样都从这一条路还原
}
// 不匹配的标签怎么处理，分两种：
//   优先级筛选（P0/P1/P2/待补）→ 灰显。要看的是「这一档在全景里占多少」，位置得留着。
//   ing（本轮正在标注）        → 直接不渲染，空掉的二级 / 一级维度整层收掉，只剩这一批。
function applyFilter(){
  const any = active.size > 0;
  const focus = active.has('ing');
  document.querySelectorAll('.chip').forEach(c => {
    const show = !any || [...active].some(f => matches(c, f));
    c.classList.toggle('dimmed', !show && !focus);
    c.classList.toggle('hidden', !show && focus);
  });
  // 先二级再一级：一个 chip 都没剩的那层，标题连计数一起是纯噪声。
  // 一级维度里数 .chip:not(.hidden) 不会重复计 —— 被收掉的二级本就没有可见 chip。
  document.querySelectorAll('.l2.node').forEach(n => recount(n, focus));
  document.querySelectorAll('.n1').forEach(n => recount(n, focus));
  if (any) document.querySelectorAll('.node').forEach(n => n.classList.add('open'));
}
// 焦点模式下计数跟着可见集合走，否则会出现标题写「23 标签」、底下只剩 15 个 chip。
// 原始文本存在 dataset.full 里，退出焦点模式原样写回（'N 标签' 与 'N' 两种格式都有）。
function recount(node, focus){
  const n = node.querySelectorAll('.chip:not(.hidden)').length;
  node.classList.toggle('hidden', focus && n === 0);
  const el = node.querySelector(':scope > .row > .count');
  if (!el) return;
  if (el.dataset.full == null) el.dataset.full = el.textContent;
  el.textContent = focus ? n + (el.dataset.full.endsWith('标签') ? ' 标签' : '') : el.dataset.full;
}
document.getElementById('expandAll').onclick   = () => document.querySelectorAll('.node').forEach(n => n.classList.add('open'));
document.getElementById('collapseAll').onclick = () => document.querySelectorAll('.l2.node').forEach(n => n.classList.remove('open'));

