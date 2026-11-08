/* 标签树构建 + chip 渲染（rulesFor / md / rulesHTML / chipEl） */
// ══════════════════════════════════════════════════════════════════════════
// TREE BUILD
// ══════════════════════════════════════════════════════════════════════════
const tree  = document.getElementById('tree');
const panel = document.getElementById('panel');
const bodyEl = document.body;
let selected = null;

const norm = t => typeof t === 'string' ? {n:t} : t;

// ── rubric 边界规则的归属 ─────────────────────────────────────────────────
//   子维度的 rules 里，多数规则其实只约束其中一两个标签（「结构异常仅限运动形变」
//   只跟 `合理性` 有关），整份 rules 直接铺给子维度下每个标签会让侧栏塞满与当前
//   标签无关的内容。所以规则写成两种形态：
//     "……"                          → 子维度通用，所有标签都显示
//     {r:"……", for:["标签A","标签B"]} → 仅这些标签显示
//   for 里写标签名（治理后的名字）。规则文本里的标签是简写或 facet 名（如
//   `结构异常` 对应 `合理性` 的 facets），无法靠字符串匹配可靠推断，故显式声明。
//   三级 rules 合并：L1 一级维度通用 → L2 子维度（for 可收窄到标签）→ L3 标签自有。
//   同一动词下按层级从宽到窄排列，标签级排最后（最具体，判定时最先看）。
function rulesFor(t, subRules, dimRules){
  const out = [];
  (dimRules || []).forEach(r => {
    if (!r.for || r.for.includes(t.n)) out.push({kind: r.kind, r: r.r, lvl: '一级维度'});
  });
  (subRules || []).forEach(r => {
    if (!r.for || r.for.includes(t.n)) out.push({kind: r.kind, r: r.r, lvl: '子维度'});
  });
  (t.rules || []).forEach(r => out.push({kind: r.kind, r: r.r, lvl: null}));
  return out;
}

// `标签名` → <code>；面板全是字符串拼接，没有 markdown 渲染，反引号原样漏出过。
const md = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

// 按动词分组渲染，动词顺序固定（判定强度从硬到软）
const RULE_ORDER = ['需硬隔离', '需互斥', '需锚定', '需定优先级', '需降级', '需禁用'];
function rulesHTML(rules){
  const by = new Map();
  rules.forEach(r => { if (!by.has(r.kind)) by.set(r.kind, []); by.get(r.kind).push(r); });
  const kinds = [...by.keys()].sort((a, b) => {
    const ia = RULE_ORDER.indexOf(a), ib = RULE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return kinds.map(k => '<div class="rgrp"><span class="rv">' + k + '</span><ul>'
    + by.get(k).map(r => '<li>' + md(r.r)
        + (r.lvl ? '<span class="lvl">· ' + r.lvl + '</span>' : '') + '</li>').join('')
    + '</ul></div>').join('');
}

function chipEl(tag, sub, dim, subjInherit, isAfter, subRules, dimRules){
  const t = norm(tag);
  const subj = t.subj != null ? t.subj : subjInherit;
  // after 模式下已删除/已移出的标签不参与优先级（它们不在最终体系里）
  // before 模式下优先级来自标签自身的 prio 字段（由 xlsx 导入）
  const prio = isAfter
    ? (!t.gone ? prioOf(t.n) : null)
    : (t.prio || null);
  // 优先级待产品输入的活标签：既不能着色，也不该跟已删除标签一样灰掉
  const prioTBD = isAfter && !t.gone && !prio && !!t.prioTBD;
  const hasDemo = !!demosFor(t);
  const isStmt = !isAfter && STMT.has(t.n);
  // 「ing」= 当前一轮正在标注的标签。只在 after 模式成立：ING 里写的是治理后的
  // 名字，before 模式的同一概念叫法不同（`主体一致性` vs `主体不一致`），拿去匹配
  // before 的 chip 只会零星命中几个没改名的，比不匹配更误导。
  const isIng = isAfter && ING.has(t.n);
  const el = document.createElement('div');
  el.className = 'chip' + (subj ? ' subj' : '') + (t.flag ? ' flag-'+t.flag : '')
               + (isStmt ? ' flag-stmt' : '') + (hasDemo ? ' hasdemo' : '') + (t.gone ? ' gone' : '');
  el.dataset.subj = subj ? '1' : '0';
  el.dataset.flag = t.flag || '';
  el.dataset.stmt = isStmt ? '1' : '0';
  el.dataset.ing = isIng ? '1' : '0';
  if (prio) el.dataset.p = prio;                 // drives after-mode coloring
  else if (prioTBD) el.dataset.p = 'TBD';
  const name = document.createElement('div');
  name.className = 'name';
  name.innerHTML = '<span>'+t.n+'</span>';
  if (prio) name.innerHTML += '<span class="pbadge prio-only" data-p="'+prio+'">'+prio+'</span>';
  else if (prioTBD) name.innerHTML += '<span class="pbadge prio-only" data-p="TBD">P 待补</span>';
  if (isAfter && t.act && t.act !== '维持')
    name.innerHTML += '<span class="badge '+(t.gone ? 'b-gone' : 'b-chg')+'">'+t.act+'</span>';
  if (t.flag === 'confusion') name.innerHTML += '<span class="badge b-warn flag-only">边界不清晰</span>';
  if (t.flag === 'dup')       name.innerHTML += '<span class="badge b-dup flag-only">重复</span>';
  if (isStmt)                 name.innerHTML += '<span class="badge b-stmt flag-only">陈述式</span>';
  el.appendChild(name);
  if (t.facets){
    const f = document.createElement('div'); f.className = 'facets';
    t.facets.forEach(x => { const s = document.createElement('span'); s.className='facet'; s.textContent='+'+x; f.appendChild(s); });
    el.appendChild(f);
  }
  el.onclick = e => { e.stopPropagation(); selectChip(el, t, sub, dim, subj, prio, isAfter, subRules, dimRules); };
  return el;
}

