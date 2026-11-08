// Invariant checks over data/tag-system.json — no external snapshot needed.
//
// Replaces the original one-shot migration differ, which compared against a
// hand-extracted /tmp/raw.json snapshot of the two pre-refactor charts. That
// snapshot is gone (and asserted a frozen 78-tag order), so the checks below are
// restated as properties the data must satisfy on its own.
//
//   node tools/verify.mjs
import {readFileSync} from 'fs';

const j = JSON.parse(readFileSync('data/tag-system.json', 'utf8'));
const P_OK = ['P0', 'P1', 'P2'];      // 产品只给到三档；P3/P4 调色板保留但当前无标签命中

let fail = 0;
const chk = (ok, msg) => { if (!ok) { fail++; console.log('FAIL ' + msg); } };

const withPath = j.after.flatMap(d => d.subs.flatMap(s => s.tags.map(t => ({d: d.name, s: s.name, t}))));
const live = withPath.filter(x => !x.t.gone);
const tomb = withPath.filter(x => x.t.gone);

// every rules array in the file, tagged with which level it came from
function* allRules() {
  for (const dim of j.after) {
    if (dim.rules?.length) yield {level: 'L1', name: dim.name, rules: dim.rules};
    for (const sub of dim.subs) {
      if (sub.rules?.length) yield {level: 'L2', name: sub.name, rules: sub.rules};
      for (const t of sub.tags) {
        if (t.rules?.length) yield {level: 'L3', name: t.name, rules: t.rules};
      }
    }
  }
}

// 1. live tag names are globally unique — prioOf() looks tags up BY NAME and
//    returns the first match, so a duplicate is a silent wrong-priority bug.
const seen = new Map();
for (const {d, s, t} of live) {
  if (seen.has(t.name)) chk(false, `duplicate live tag name: ${t.name} (${seen.get(t.name)} / ${d}›${s})`);
  else seen.set(t.name, `${d}›${s}`);
}

// 2. every rules[].for entry resolves to a tag in its OWN sub-dimension.
//    rulesFor() matches by exact name, so an unresolved target silently drops
//    the rule from every panel instead of erroring. Checked at all three levels:
//    L1 dim.rules may target any tag in the dimension, L2 sub.rules only its own
//    sub-dimension, L3 tag.rules are implicitly scoped and carry no `for`.
for (const dim of j.after) {
  const dimNames = new Set(dim.subs.flatMap(s => s.tags.map(t => t.name)));
  for (const r of dim.rules || []) {
    for (const f of r.for || []) {
      chk(dimNames.has(f), `L1 rule target not in ${dim.name}: "${f}" — ${r.r.slice(0, 40)}…`);
    }
  }
  for (const sub of dim.subs) {
    const names = new Set(sub.tags.map(t => t.name));
    for (const r of sub.rules || []) {
      for (const f of r.for || []) {
        chk(names.has(f), `rule target not in ${sub.name}: "${f}" — rule: ${r.r.slice(0, 40)}…`);
      }
    }
    for (const t of sub.tags) {
      for (const r of t.rules || []) {
        chk(!r.for, `L3 rule on ${t.name} must not carry a \`for\`: ${r.r.slice(0, 40)}…`);
      }
    }
  }
}

// 2b. every rule at every level declares a known verb — the panel groups by it,
//     so an unknown verb silently lands in an unordered trailing group.
const VERBS = ['需硬隔离', '需互斥', '需锚定', '需定优先级', '需降级', '需禁用'];
for (const {level, name, rules} of allRules()) {
  for (const r of rules) {
    chk(VERBS.includes(r.kind), `${level} ${name}: unknown rule kind ${JSON.stringify(r.kind)}`);
    chk(!/^需[^：:]{1,6}[：:]/.test(r.r), `${level} ${name}: verb still inlined in text — ${r.r.slice(0, 40)}…`);
  }
}

// 3. every live tag has a valid priority, or is explicitly flagged as pending
//    product input (priorityTBD → rendered as「P 待补」, not faded out).
for (const {d, s, t} of live) {
  if (t.priorityTBD) chk(t.priority === null, `${t.name}: priorityTBD must pair with priority:null`);
  else chk(P_OK.includes(t.priority), `${d}›${s}›${t.name}: bad priority ${JSON.stringify(t.priority)}`);
}

// 4. tombstones carry no live-tag payload (a leftover facets array would render
//    a facet strip on a struck-through chip).
for (const {t} of tomb) {
  chk(t.priority === null, `tombstone ${t.name} still has priority ${t.priority}`);
  chk(t.rubric === null,   `tombstone ${t.name} still has a rubric`);
  chk(t.facets === null,   `tombstone ${t.name} still has facets`);
  chk(!t.priorityTBD,      `tombstone ${t.name} flagged priorityTBD`);
}

// 5. no rule references a facet with a `+` prefix — after the split, facets are
//    standalone tags and `+x` reads as a stale facet. Checked at all three levels.
for (const {level, name, rules} of allRules()) {
  for (const r of rules) chk(!r.r.includes('+'), `${level} ${name}: stale facet ref — ${r.r.slice(0, 60)}`);
}

// 5b. rubric shape: 三段式 = what / symptoms[] / requires. `when` and `not` were
//     migrated away (not → L3 rules), so their presence means a stale record.
for (const {d, s, t} of live) {
  const r = t.rubric;
  chk(!!r, `${d}›${s}›${t.name}: live tag without rubric`);
  if (!r) continue;
  chk(!('when' in r) && !('not' in r), `${t.name}: rubric still has legacy when/not`);
  chk(Array.isArray(r.symptoms), `${t.name}: rubric.symptoms must be an array`);
  if (r.status !== 'TODO') {
    chk(!!r.what && !r.what.startsWith('TODO'), `${t.name}: status OK but what is a placeholder`);
    chk(r.symptoms.length > 0 || r.requires, `${t.name}: status OK but no symptoms and no requires`);
  }
}

// 5c. every `tag` cited inside rubric/rule text resolves to a real live tag —
//     the panel renders `x` as a code chip, so a typo reads as a valid pointer.
const liveNames = new Set(live.map(x => x.t.name));
const cites = s => [...String(s || '').matchAll(/`([^`]+)`/g)].map(m => m[1]);
for (const {level, name, rules} of allRules()) {
  for (const r of rules) for (const c of cites(r.r)) {
    chk(liveNames.has(c), `${level} ${name}: cites unknown tag \`${c}\``);
  }
}
for (const {t} of live) {
  for (const f of ['what', 'requires']) for (const c of cites(t.rubric?.[f])) {
    chk(liveNames.has(c), `${t.name}: rubric.${f} cites unknown tag \`${c}\``);
  }
}

// 5d. a tag must not cite itself — inside its own panel「本标签」reads naturally,
//     a self-pointing code chip does not.
for (const {t} of live) {
  for (const r of t.rules || []) {
    chk(!cites(r.r).includes(t.name), `${t.name}: rule cites itself — ${r.r.slice(0, 40)}…`);
  }
}

// 5e. 需互斥 is a symmetric claim: if A declares mutual exclusion with B, B must
//     say so too. Asymmetry means one of the two panels silently omits the pair.
//     (需硬隔离 / 需锚定 are directional by nature and NOT checked here — a broad
//     tag routinely points at a narrow one without the reverse being useful.)
const mutex = new Map();
for (const {t} of live) {
  const set = new Set();
  for (const r of t.rules || []) {
    if (r.kind === '需互斥') for (const c of cites(r.r)) if (liveNames.has(c)) set.add(c);
  }
  mutex.set(t.name, set);
}
for (const [a, targets] of mutex) {
  for (const b of targets) {
    chk(mutex.get(b)?.has(a), `需互斥 not symmetric: ${a} → ${b}, but ${b} does not declare ${a}`);
  }
}

// 6. demos: every demoKey resolves, and every demo bucket is reachable.
const reach = new Set(withPath.map(x => x.t.demoKey).filter(Boolean));
for (const {t} of withPath) {
  if (t.demoKey) chk(!!j.demos[t.demoKey], `demoKey unresolved: ${t.name} → ${t.demoKey}`);
}
const orphan = Object.keys(j.demos).filter(k => !reach.has(k));
chk(orphan.length === 0, `demo buckets unreachable from any tag: ${orphan.join(', ')}`);

// 6b. demo 素材路径必须是「相对项目根」的（assets/…），不能是相对本文档的 ../assets/…。
//     图表既会被直接打开（base=charts/），也会被 build.py 内联成 srcdoc（base=项目根，
//     因为 srcdoc 文档没有自己的 URL）。写死 ../ 在后一种情况下会解析到项目根的上一层，
//     视频 404 → video.error.code=4，表现为「视频不能播放」。路径归一在 60-player.js
//     的 ASSET_BASE，这里只守住数据侧的写法。
for (const [k, list] of Object.entries(j.demos)) {
  for (const d of list) {
    chk(!d.src.startsWith('../'),
        `demo ${k} / ${d.label}: src 必须相对项目根（assets/…），不能用 ../ — 现为 ${d.src}`);
  }
}

// 6c. 生成的图表里，同一行不能出现成对的 `$`。
//     build.py 会把图表内联进 index.html 的 markdown，而 SPA 端 renderDoc 把一行里的
//     `$…$` 当行内公式抽走再还原（template.html 的 _MATH_RE），还原时不解码 &#10;。
//     于是 JS 正则里成对的 `$` 锚点会被整段吃掉 → SyntaxError → 播放器根本不启动。
//     这个坑只在「内联进博客」时炸，直接打开图表是好的，所以必须在这里守住。
const DOLLAR_PAIR = /\$[^$\n]+\$/;
for (const f of ['charts/tag-system.html', 'eval/charts/tag-system.html', 'charts/annotation-demo.html']) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }   // 还没生成就跳过
  text.split('\n').forEach((line, i) => {
    chk(!DOLLAR_PAIR.test(line),
        `${f}:${i + 1} 同一行出现成对的 $ —— 内联进 index.html 后会被当成行内公式吃掉：${line.trim().slice(0, 60)}`);
  });
}

// 7. ing（本轮正在标注的标签子集）里每个名字都要落到 after 的某个标签上。
//    chipEl 按名字命中（ING.has(t.n)），所以一个错名 / 旧名不会报错，只会安静地
//    少高亮一个标签 —— 筛出 23 个还是 24 个，肉眼分不出来。改名时这条会失败。
const allAfterNames = new Set(withPath.map(x => x.t.name));
const ingSeen = new Set();
for (const n of j.ing || []) {
  chk(allAfterNames.has(n), `ing 里的名字不在 after 体系中: "${n}"`);
  chk(!ingSeen.has(n), `ing 里重复: "${n}"`);
  ingSeen.add(n);
}

// 8. counts, printed not asserted
const byP = {};
for (const {t} of live) { const k = t.priority ?? '待补'; byP[k] = (byP[k] || 0) + 1; }
const rubricTODO = live.filter(x => x.t.rubric?.status === 'TODO').length;
console.log(`before: ${j.before.flatMap(d => d.subs.flatMap(s => s.tags)).length} tags`);
console.log(`after:  ${live.length} live (+${tomb.length} tombstones)`);
console.log(`priority: ${Object.entries(byP).map(([k, v]) => `${k}:${v}`).join(' / ')}`);
console.log(`rubric TODO: ${rubricTODO}/${live.length}`);
const ingLive = (j.ing || []).filter(n => liveNames.has(n)).length;
console.log(`ing: ${ingLive} live (+${(j.ing || []).length - ingLive} tombstones)`);

console.log(fail ? `\n${fail} FAILURES` : '\nall checks passed');
process.exit(fail ? 1 : 0);

