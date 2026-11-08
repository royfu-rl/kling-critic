#!/usr/bin/env node
// charts/src/**  +  data/tag-system.json   ->   charts/tag-system.html
//                                               eval/charts/tag-system.html
//                                               charts/annotation-demo.html
//
// Charts are assembled from partials, not hand-edited. Source of truth:
//   charts/src/shell*.html  document skeletons, with <!--CSS--> <!--HTML--> <!--JS--> slots
//   charts/src/css/*.css    concatenated into <style>, in filename order
//   charts/src/html/*.html  concatenated into <body>, in filename order
//   charts/src/js/*.js      concatenated into <script>, in filename order
//   data/tag-system.json    the taxonomy, emitted as the DATA block ahead of all JS
//
// See BUILDS below for which partials each output takes. The frame-annotation
// player is shared: the tag-system chart wraps it in a modal, annotation-demo
// inlines it as a card, and neither owns a copy.
//
// The two tag-system outputs are byte-identical on purpose: overview.md and
// eval/eval.md embed the same chart at different iframe heights, and the height
// lives in the markdown, not here. (They used to be two hand-maintained copies
// with two diverging After-panel schemas, which is how tag actions leaked across
// sibling tags.) Assembling from one partial set makes divergence impossible
// rather than merely asserted.
//
// Filename prefixes order the concatenation — 00-, 10-, 20- … — because CSS
// cascade and JS declaration order both matter. Insert new files at a free
// prefix rather than renumbering.
//
//   node tools/gen-chart.mjs [--check]
//     --check  exit 1 if any output is stale (for CI / pre-commit)
import {readFileSync, writeFileSync, readdirSync, mkdirSync} from 'fs';
import {dirname} from 'path';

const SRC = 'charts/src';

const j = JSON.parse(readFileSync('data/tag-system.json', 'utf8'));

// ── the DATA block ────────────────────────────────────────────────────────
// Data is emitted UNINDENTED on purpose. Pretty-printing the taxonomy used to
// make TAX_AFTER alone 3000 lines — 69% of the whole chart — which is what made
// the file unreadable. Read data/tag-system.json instead; that is the source.
const L = [];
L.push('// ── 数据块：由 tools/gen-chart.mjs 从 data/tag-system.json 生成，勿手改 ──');
L.push('//   要改标签、优先级、rubric、边界规则 → 改 data/tag-system.json 后重跑生成器。');
L.push('//   故意压成单行：美化缩进会让本文件膨胀到 4000+ 行，可读的是 JSON 源文件。');
L.push(`const ISSUES = ${JSON.stringify(j.issues)};`);
L.push(`const STMT = new Set(${JSON.stringify(j.stmt)});`);
// ING：当前一轮正在标注的标签集合（after 筛选栏的「ing」按钮按名字命中）
L.push(`const ING = new Set(${JSON.stringify(j.ing)});`);
L.push(`const DEMOS = ${JSON.stringify(j.demos)};`);
L.push(`const TAX = ${JSON.stringify(j.before)};`);

// AFTER: reshape to what the renderer expects.
//   rules（三级同构）: {kind, r, for?}  —— kind 是判定动词（需硬隔离 / 需锚定 / …）
//   tag: {n, act, from, why, gone, facets, note, prio, prioTBD, rubric, rules, demoKey}
const rule = r => {
  const o = {kind: r.kind, r: r.r};
  if (r.for) o.for = r.for;
  return o;
};
const after = j.after.map(dim => ({
  name: dim.name,
  rules: (dim.rules || []).map(rule),
  subs: dim.subs.map(sub => {
    const o = {name: sub.name};
    if (sub.subj) o.subj = true;
    o.rules = sub.rules.map(rule);
    o.tags = sub.tags.map(t => {
      const x = {n: t.name, act: t.action.verb};
      if (t.action.from) x.from = t.action.from;
      if (t.action.why)  x.why  = t.action.why;
      if (t.gone)        x.gone = true;
      if (t.facets)      x.facets = t.facets;
      if (t.note)        x.note = t.note;
      if (t.subj != null) x.subj = t.subj;
      if (t.priority)    x.prio = t.priority;
      // 活标签但产品还没给优先级 → 渲染成「P 待补」，而不是跟已删除标签一样灰掉
      if (t.priorityTBD) x.prioTBD = true;
      if (t.rubric)      x.rubric = t.rubric;
      if (t.rules?.length) x.rules = t.rules.map(rule);
      if (t.demoKey)     x.demoKey = t.demoKey;
      return x;
    });
    return o;
  })
}));
L.push(`const TAX_AFTER = ${JSON.stringify(after)};`);
L.push('');
L.push('// 优先级直接来自数据（人工分级），不再按遍历顺序生成');
L.push('const prioOf = name => {');
L.push('  for (const d of TAX_AFTER) for (const s of d.subs) for (const t of s.tags)');
L.push('    if (t.n === name && !t.gone) return t.prio || null;');
L.push('  return null;');
L.push('};');
L.push('');
L.push('const demosFor = t => DEMOS[t.demoKey || t.n] || null;');
const dataBlock = L.join('\n');
// 不带视频组件的数据块（caption/ 的独立分发副本用，见 BUILDS 的 demos:false）。
// Play 按钮由 30-panel.js 的 `if (demos)` 门控、demosFor 又只查 DEMOS，所以把 DEMOS
// 置空就足以让按钮、modal、播放器整条路径都不渲染 —— 标签树、rubric、优先级一个不少。
// 光靠排除 partial 是不够的：30-panel.js 仍会画出 Play 按钮，点了才发现 openModal
// 已经不存在。数据门控在前，partial 排除在后，两道一起来。
const dataBlockNoDemos = L
  .map(l => l.startsWith('const DEMOS = ') ? 'const DEMOS = {};   // 本副本不含视频组件' : l)
  .join('\n');

// ── assemble ──────────────────────────────────────────────────────────────
const read = p => readFileSync(`${SRC}/${p}`, 'utf8').replace(/\n+$/, '');
const pick = (dir, keep) => {
  const files = readdirSync(`${SRC}/${dir}`).filter(f => !f.startsWith('.')).sort()
                  .filter(f => keep ? keep(f) : true);
  if (!files.length) { console.error(`${SRC}/${dir}: no partials matched`); process.exit(2); }
  return {files, text: files.map(f => read(`${dir}/${f}`)).join('\n\n')};
};

// Two documents, one source tree. The tag-system chart wraps the player in a
// modal; the Pointwise demo inlines the same player as a standalone card. They
// share every player partial — CSS, markup and JS — so the player only ever
// exists once. Before this, annotation-demo.html carried its own hand-written
// copy of the player (and its own hardcoded 3-demo subset of the taxonomy's
// demos), which is exactly the drift this table exists to prevent.
const BUILDS = [
  {
    outs: ['charts/tag-system.html', 'eval/charts/tag-system.html'],
    shell: 'shell.html',
    // 树 + 面板 + 筛选栏 + modal（modal 内部再通过 <!--PLAYER--> 槽装播放器）。
    // 40-player.html 刻意排除：它只经由 50-modal.html 的槽位注入一次。直接一起
    // 拼进来会得到两份播放器 DOM，id 全部重复 —— getElementById 命中的是文档里
    // 靠前的那份（modal 外的孤儿副本），于是 modal 里空空如也，而脚本却在正常
    // 更新那份看不见的 DOM（能查到 jumps/marks 数，画面却是空的）。
    css: () => true,
    html: f => f !== '40-player.html',
    js: () => true,
  },
  {
    outs: ['charts/annotation-demo.html'],
    shell: 'shell-inline.html',
    // 与 modal 版同一个组件：连 50-modal.html / 50-modal.css 一起用，
    // 60-inline.css 只负责把 overlay 摊平成静态卡片。少的是标签树、筛选栏、
    // 优先级染色，以及驱动弹窗开关的 70-modal-shell.js。
    css: f => ['00-tokens.css', '45-player.css', '50-modal.css', '60-inline.css'].includes(f),
    html: f => f === '50-modal.html',
    js: f => ['00-iframe.js', '60-player.js', '90-inline-boot.js'].includes(f),
  },
];

function assemble(b) {
  const css = pick('css', b.css), html = pick('html', b.html), js = pick('js', b.js);
  // Slot substitution goes through a REPLACER FUNCTION, never a replacement string.
  // String.replace treats `$&`, `` $` ``, `$'` and `$1` in the replacement as
  // insertion patterns: a partial source file containing e.g. a backtick right
  // after a `$` silently spliced the whole document-so-far into the middle of the
  // JS bundle (SyntaxError: Unexpected token '<'). A function replacement is taken
  // literally, so partials can contain any characters.
  const put = (subject, slot, body) => subject.replace(slot, () => body);
  let markup = html.text;
  if (markup.includes('<!--PLAYER-->')) {
    markup = put(markup, '<!--PLAYER-->', read('html/40-player.html'));
  }
  let shell = readFileSync(`${SRC}/${b.shell}`, 'utf8');
  const data = b.demos === false ? dataBlockNoDemos : dataBlock;
  for (const [slot, body] of [['<!--CSS-->', css.text], ['<!--HTML-->', markup],
                              ['<!--JS-->', data + '\n\n' + js.text]]) {
    if (!shell.includes(slot)) { console.error(`${b.shell}: missing slot ${slot}`); process.exit(2); }
    shell = put(shell, slot, body);
  }
  // Self-check: exactly one document. A duplicated <!DOCTYPE means a slot
  // substitution spliced the document into itself — the failure mode the `put()`
  // replacer above exists to prevent. It manifests as a JS SyntaxError halfway
  // down the bundle (an empty tag tree in the browser), which is slow to trace
  // back to here, so fail loudly at generation time instead.
  const docs = shell.split(/<!DOCTYPE/i).length - 1;
  if (docs !== 1) {
    console.error(`${b.outs[0]}: assembled ${docs} <!DOCTYPE blocks (expected 1) — a slot`
                + ` substitution corrupted the output. Check partials for '$' + backtick sequences.`);
    process.exit(2);
  }
  // Self-check: no duplicate id. The player and its hosts communicate purely by
  // DOM id (see 60-player.js), so a partial included both directly AND through the
  // <!--PLAYER--> slot yields two copies; getElementById then silently drives the
  // first one while the visible one stays empty. Symptom is a modal with no video,
  // no chips and no JSON — with no error anywhere.
  const ids = [...shell.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dupes.length) {
    console.error(`${b.outs[0]}: duplicate DOM id(s): ${dupes.join(', ')}`
                + ` — a partial is included twice (directly and via <!--PLAYER-->?).`);
    process.exit(2);
  }
  return {out: shell, counts: [css.files.length, html.files.length, js.files.length]};
}

// ── write / check ─────────────────────────────────────────────────────────
const check = process.argv.includes('--check');
let stale = 0;
for (const b of BUILDS) {
  const {out, counts} = assemble(b);
  for (const target of b.outs) {
    let cur = null;
    try { cur = readFileSync(target, 'utf8'); } catch {}
    if (out === cur) { if (!check) console.log(`unchanged  ${target}`); continue; }
    if (check) { stale++; console.error(`${target} is stale — run: node tools/gen-chart.mjs`); }
    else {
      mkdirSync(dirname(target), {recursive: true});   // caption/ may not exist yet on a fresh clone
      writeFileSync(target, out);
      console.log(`wrote      ${target}  (${counts[0]} css / ${counts[1]} html / ${counts[2]} js`
                + `  →  ${out.split('\n').length} lines)`);
    }
  }
}

if (check) {
  if (stale) process.exit(1);
  console.log('all charts up to date with charts/src/** + data/tag-system.json');
} else {
  const tags = j.after.flatMap(d => d.subs.flatMap(s => s.tags));
  console.log(`  ${j.after.length} dims / ${j.after.reduce((a,d)=>a+d.subs.length,0)} subs`
            + ` / ${tags.filter(t=>!t.gone).length} live tags (+${tags.filter(t=>t.gone).length} tombstones)`);
}

