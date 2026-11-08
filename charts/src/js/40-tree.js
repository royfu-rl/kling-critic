/* buildTree / countLeaves / 模式切换 */
// 「带 ▷ 的标签有 demo」这半句只在真有 demo 时才说：独立分发副本把 DEMOS 置空、
// 连播放器一起排掉（见 tools/gen-chart.mjs 的 caption/index.html 那条 build），
// 那份文案里再提视频就是承诺一个点不开的功能。按数据判断，两份输出各自说对。
const HAS_DEMOS = Object.keys(DEMOS).length > 0;

// after 模式的计数只算留在体系里的标签（gone 的不计入）
const countLeaves = (sub, isAfter) =>
  isAfter ? sub.tags.filter(t => !norm(t).gone).length : sub.tags.length;

function buildTree(isAfter){
  const data = isAfter ? TAX_AFTER : TAX;
  tree.innerHTML = '';
  data.forEach((dim, i) => {
    const n1 = document.createElement('div'); n1.className = 'n1 l1 node';
    const total = dim.subs.reduce((a,s) => a + countLeaves(s, isAfter), 0);
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<span class="caret">▶</span><span class="lbl"><span class="idx">'+(i+1)+'</span> '+dim.name+'</span><span class="count">'+total+' 标签</span>';
    row.onclick = () => n1.classList.toggle('open');
    n1.appendChild(row);
    const kids = document.createElement('div'); kids.className = 'kids';
    dim.subs.forEach(sub => {
      const n2 = document.createElement('div'); n2.className = 'l2 node';
      const r2 = document.createElement('div'); r2.className = 'row';
      r2.innerHTML = '<span class="caret">▶</span><span class="lbl">'+sub.name+'</span><span class="count">'+countLeaves(sub, isAfter)+'</span>';
      r2.onclick = e => { e.stopPropagation(); n2.classList.toggle('open'); };
      n2.appendChild(r2);
      const kids2 = document.createElement('div'); kids2.className = 'kids';
      const chips = document.createElement('div'); chips.className = 'chips';
      // before-mode: sort by evaluation priority (P0 first, then P1, P2, unranked last)
      const prioRank = p => p === 'P0' ? 0 : p === 'P1' ? 1 : p === 'P2' ? 2 : 3;
      const tags = isAfter ? sub.tags : [...sub.tags].sort((a, b) => {
        const pa = prioRank(norm(a).prio), pb = prioRank(norm(b).prio);
        return pa - pb;
      });
      tags.forEach(tag => chips.appendChild(chipEl(tag, sub.name, dim.name, !!sub.subj, isAfter, sub.rules, dim.rules)));
      kids2.appendChild(chips);
      n2.appendChild(kids2);
      kids.appendChild(n2);
    });
    n1.appendChild(kids);
    tree.appendChild(n1);
  });
  document.querySelectorAll('.l1').forEach(n => n.classList.add('open'));
  panel.innerHTML = isAfter
    ? '<p class="ph">治理后的标签体系（依据 capiton-2.md 各维度 x.4）。点击标签查看处理动作、原标签与依据；虚线删除线的标签已从体系中删除或移出。</p>'
    : '<p class="ph">点击任意标签查看其定位' + (HAS_DEMOS
        ? '；带 ▷ 的标签有标注 demo，点开可查看视频与帧级标注 JSON。'
        : '、rubric 与治理动作。') + '</p>';
}
// Before 体系已退场，只渲染 After。整棵树一上来就展开，让上色的子集一眼看全。
buildTree(true);
document.querySelectorAll('.node').forEach(n => n.classList.add('open'));

