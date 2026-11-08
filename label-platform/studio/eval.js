/* eval.js —— kling-rm 评测结果可视化: 模型版本 × 评测数据集。

   和训练集那套 (viewer.js) 的关系: 复用同一套 CSS 组件和分层加载套路, 但数据
   模型完全不同 —— 那边一条是「一个标注实例」, 这边一条是「一个模型在一条样本上
   的判定」, 所以另开一份而不是塞进 viewer.js 的 state。

   分三层按需拉 (和训练集同理, 一个 run 512 条详情 2.3MB, 后面 run 会很多):
     data/eval/index.json        矩阵 + 每个 run 的指标, 首屏只拉这个
     data/eval/<run>.list.json   列表行, 切 run 时拉
     data/eval/<run>.d<i>.json   点开某条才拉它所在的 100 条分片

   看评测最需要确认的三件事, 界面按这个优先级排:
     1. 这一格是哪个模型跑的哪个评测集 —— 模型轴现在不规范, 推断的必须标出来
     2. 错在哪一格 (FN 漏检 / FP 误报) —— 列表按四格筛
     3. 模型凭什么这么判 —— response 原文 + <box> 证据画到帧上
*/

const $ = (id) => document.getElementById(id);

const PAGE = 300;

const state = {
  index: null,
  run: null,
  rows: null,
  row: null,
  case: null,
  filter: "all",
  q: "",              // uid 搜索词 (和四格筛选叠加, 见 searchRows)
  shown: PAGE,
  frame: 0,
  evOnly: false,       // 帧条只显示带框的帧 (换 case 不重置, 和 showMdl 同一套习惯)
  listCache: new Map(),
  chunkCache: new Map(),
  msgCache: new Map(),
  otherTagL2: new Map(),
  // 模型轴: 同一训练名的多个 ckpt 折成一组 (见 modelGroups)
  famPick: new Map(),   // 训练名 -> 用户在这组里点过的 ckpt, 没点过就用 F1 最高的
  famOpen: new Set(),   // 展开着的组
  hidden: new Set(),    // 被筛掉的模型 label, 存 localStorage
  filterOpen: false,
  pinDs: null,          // 固定数据: {dim, key}; 钉住后只换模型, 数据集不变
  lenient: false,       // 格式容错: 用 p2 顶替未解析并重算指标
  boxNorm: null,        // 模型框坐标口径: null=自动 / true=归一化 / false=像素
  // 盲标页默认不展示任何机审结论/证据；标注员主动点「机标证据」后才显示。
  showMachineEvidence: !window.PAGE_BLIND_LABELING || !!window.PAGE_TEACH_ENGINE_VIEW || !!window.PAGE_SHOW_ENGINE,
  // 评测页上「人标证据」是叠加层, 默认关 —— 声明了 PAGE_HUMAN_EVIDENCE_TOGGLE 的页面
  // 才有这个开关。标注页没有这个标志, 恒 true, 行为和以前一模一样。
  showHumanEvidence: !window.PAGE_HUMAN_EVIDENCE_TOGGLE,
  // L3 切片: 多标签维度(动态基础质量)专用。null = 看 L2 整体; 数字 = metrics.tags
  // 里的下标, 此时整页(混淆矩阵/指标/case 列表/筛选)都切换成"这一个 L3 的二分类"。
  // 换 run 时重置 —— 不同 run 的 tags 顺序理论上一致, 但沿用下标是在赌它, 不值当。
  l3: null,
};

const CELL = {
  tp: { label: "TP 命中", note: "真有问题, 判了是" },
  fn: { label: "FN 漏检", note: "真有问题, 判了否 —— 线上表现为漏放" },
  fp: { label: "FP 误报", note: "本没问题, 判了是 —— 线上表现为错杀" },
  tn: { label: "TN 正确放过", note: "本没问题, 判了否" },
  unparsed: { label: "未解析", note: "抽不到 <answer>, 不计入混淆矩阵" },
  unlabeled: { label: "无标注预测", note: "没有 gold，只展示模型预测，不计入混淆矩阵" },
  excluded: { label: "已剔除", note: "评测员终审判为 脏数据 / 时长不一致, 不计入指标" },
  // think-output mismatch —— 和 gold 无关, 只比 <think> 内部结论与 </think> 之后的最终 JSON
  mm: {
    label: "think 矛盾",
    note: "think 里模型自己的结论和 </think> 之后的最终 JSON 不一致。\n"
      + "这是模型可用性问题, 与 gold 无关: 矛盾条上的对错都是碰运气碰来的, "
      + "指标里的召回可能整段是虚涨。",
  },
  mm_M1: {
    label: "think否/出是",
    note: "think 里判「否」(problem_frames 空 / 小结写了结论为否), 最终却输出 "
      + '{"text_unread": 1}。\n主因是 think 的 JSON schema 偏离了训练分布 —— '
      + "训练负例的 think 是逐字固定的三键空数组模板, 一旦多键、改名或数组非空, "
      + "最终 JSON 就脱钩并倒向 1。",
  },
  mm_M2: {
    label: "think是/出否",
    note: 'think 里已经标出了问题块, 最终却输出 {"text_unread": 0}。',
  },
};

/* ------------------------------------------------------------------ 工具 */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// video-arena 的公网网关会在转发前 decode 一层 URL。文件名中的 # 如果只写成
// %23，会在到达 Python 服务前变成 fragment 分隔符，后半段路径被网关直接丢掉。
// 媒体 URL 将 # 保留为双层转义；已经处理过的 %2523 不会被重复修改。
function gatewaySafeMediaUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(/%23/gi, "%2523").replace(/#/g, "%2523");
}

const jget = (u) => fetch(u).then((r) => {
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
});

/* 数据目录。eval.html 用 data/eval; rl.html 用 data/rl —— 同一套渲染, 两份数据。
   RL 那份把「训练 step」放在模型轴上 (<run>@step015), 所以模型版本 tab 就是 step,
   矩阵、混淆矩阵、样本列表、格式容错全部原样复用, 不另写一套。 */
const DATA_DIR = window.PAGE_DATA_DIR || "./data/eval";
const dataUrl = (url) => window.PAGE_DATA_VERSION
  ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(window.PAGE_DATA_VERSION)}`
  : url;

async function loadList(key) {
  if (!state.listCache.has(key)) {
    const rows = await jget(dataUrl(`${DATA_DIR}/${encodeURIComponent(key)}.list.json`));
    state.listCache.set(key, rows);
  }
  return state.listCache.get(key);
}

/* messages 的 run 级文本池 + 公共形状。单独一份文件是有意的: 它不在 index.json 里,
   否则 386 个 run 的 prompt 文本会全部挤进首屏启动包。和分片一样按 run 缓存。 */
async function loadMsg(key) {
  if (!state.msgCache.has(key)) {
    state.msgCache.set(key, await jget(
      dataUrl(`${DATA_DIR}/${encodeURIComponent(key)}.msg.json`)));
  }
  return state.msgCache.get(key);
}

async function loadChunk(key, ci) {
  const ck = `${key}/${ci}`;
  if (!state.chunkCache.has(ck)) {
    state.chunkCache.set(ck, await jget(
      dataUrl(`${DATA_DIR}/${encodeURIComponent(key)}.d${ci}.json`)));
  }
  return state.chunkCache.get(ck);
}

let frameTimingPromise;
// 两份证据帧时间戳, 优先级和 build_eval.verified_frame_seconds 一致:
//   frame-timing.json          像素核验过的真值 (build_frame_timing.py)
//   frame-timing-derived.json  只读 mp4 容器 PTS 推导的兜底 (build_frame_timing_derived.py),
//                              给没有解码器时新进的评测集用; 同一个视频两边都有时核验值赢。
// 缺文件 / 取不到都退化成 null, 页面照旧用分片里烘好的 ev.t。
function loadFrameTiming() {
  return frameTimingPromise ||= Promise.all([
    jget("./data/frame-timing.json?v=20261016-derived1").catch(() => null),
    jget("./data/frame-timing-derived.json?v=20261016-derived1").catch(() => null),
  ]).then(([verified, derived]) => {
    if (!derived?.videos) return verified;
    const videos = { ...(derived.videos), ...((verified && verified.videos) || {}) };
    return { ...(verified || derived), videos };
  }).catch(() => null);
}

let pageReferencesPromise;
function normalizeReferenceFiles(files) {
  const normalized = [];
  const seen = new Set();
  (Array.isArray(files) ? files : []).forEach((raw) => {
    const name = String(raw || "");
    // Some manifests accidentally expose all 4fps frames used to represent a
    // reference video to the model. Collapse them back to the original mp4.
    const match = /^(.*?\/input)\/frames\/((?:video|image)_\d+)_\d+\.(?:jpe?g|png)(?:[?#].*)?$/i.exec(name);
    const value = match ? `${match[1]}/${match[2]}.mp4` : name;
    if (value && !seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  });
  return normalized;
}

function loadPageReferences() {
  if (!window.PAGE_REFERENCE_MANIFEST) return Promise.resolve(null);
  return pageReferencesPromise ||= fetch(window.PAGE_REFERENCE_MANIFEST)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${window.PAGE_REFERENCE_MANIFEST}`);
      return r.text();
    })
    .then((text) => {
      const refs = new Map();
      text.split(/\r?\n/).filter(Boolean).forEach((line) => {
        const item = JSON.parse(line);
        refs.set(String(item.uid), {
          type: item.ref_type || "",
          files: normalizeReferenceFiles(item.ref_files),
          prompt: item.prompt_cn || "",
        });
      });
      return refs;
    })
    .catch(() => null);
}

function applyPageReferences(c, refs) {
  if (!refs) return;
  c.pageReference = refs.get(String(c.uid)) || null;
}

function applyFrameTiming(c, timing) {
  const matched = timing?.videos?.[c.video]?.frames;
  if (!matched || !c.frames) return;
  c.frames.times = Array.from({ length: c.frames.nf }, (_, i) => matched[frameUrl(c.frames, i)]?.t ?? null);
  for (const e of c.wf2?.ev || []) {
    const t = c.frames.times[e.frame];
    if (Number.isFinite(t)) e.t = t;
    if (Array.isArray(e.frame_range) && e.frame_range.length === 2) {
      const [a, b] = e.frame_range.map(i => c.frames.times[i]);
      if (Number.isFinite(a) && Number.isFinite(b)) e.tr = [Math.min(a, b), Math.max(a, b)];
    }
  }
}

let originalTagsPromise;
function loadOriginalTags() {
  return originalTagsPromise ||= jget("./data/original-tags.json?v=20260916-all-tags1").catch(() => null);
}

let tagGroupsPromise, tagGroups;
function loadTagGroups() {
  return tagGroupsPromise ||= jget("./data/tag-groups.json?v=20260916-l2tabs1")
    .then(data => (tagGroups = data)).catch(() => null);
}

function applyOriginalTags(c, index) {
  if (!index) return;
  let uid;
  for (const path of [c.vpath, c.video]) {
    if (!path) continue;
    let decoded = path;
    try { decoded = decodeURIComponent(path); } catch (_) { /* Literal % in a filesystem path. */ }
    const at = decoded.indexOf("/eval-data/");
    if (at >= 0) uid = index.byPath[decoded.slice(at + "/eval-data/".length)];
    if (uid) break;
  }
  if (!uid && c.vpath?.startsWith("mmu:")) {
    index.byUri ||= new Map(Object.entries(index.byUid).map(([key, row]) => [row.videoUri, key]));
    uid = index.byUri.get(c.vpath);
  }
  const entry = index.byUid[uid || c.uid];
  if (!entry || (c.vpath?.startsWith("mmu:") && c.vpath !== entry.videoUri)) return;
  const gold = new Set(c.gtags || []);
  const originals = entry.tags.filter(t => !t.aliases.some(a => gold.has(a)));
  const known = new Set(entry.tags.flatMap(t => [t.name, ...t.aliases]));
  const retained = (c.otags || []).filter(t => !known.has(t) && !gold.has(t));
  c.otags = [...new Set([...retained, ...originals.map(t => t.name)])];
  c.originalTagSources = entry.sources;
}

/* 帧路径是压缩存的 (dir+前缀+起始号+张数) —— 512 条 × 40 个绝对路径直接落盘
   要 2MB+。这里还原成第 i 张的 URL。 */
function frameUrl(fr, i) {
  if (!fr) return null;
  if (fr.list) return fr.list[i] || null;
  if (!fr.dir) return null;
  const n = String(fr.f0 + i).padStart(fr.pad, "0");
  return `${fr.dir}/${fr.pre}${n}.jpg`;
}

/* response 里的"第 N 帧"是 **images 列表的 0 基下标** —— 训练数据是 frame_0000
   起的, 模型学到的就是 0 基, 不是抽帧文件名里的序号 (嘉路那批文件名从 _00001 起)。
   三种映射都实测过, 0 基命中率最高 (详见 build_eval.py parse_evidence)。
   仍有约 6% 对不上, 因为模型连自己收到几帧都会报错 —— 对不上就返回 -1,
   由调用方标出来, 不硬凑到某一帧上。 */
function frameIndexOf(fr, cited) {
  if (!fr) return -1;
  return cited >= 0 && cited < (fr.nf || 0) ? cited : -1;
}

/* 带参考素材的集 (nature-200-GT-rubricV2-ref) 把三类图**混在同一个 frames 列表**里:
       [参考图][参考视频抽帧][待评视频抽帧]
   不标出来就会出事: 帧带第 0 张是参考图 —— 那是喂给生成模型的输入图, 上面的文字
   本来就清晰, 看图的人会拿它当"待评视频第一帧", 于是觉得"画面明明没问题, 模型瞎判"。
   image_spans 由 build_eval 原样透传 (build_run 的 spans 字段), start/end 是
   **1 基闭区间**, 这里转成 0 基下标用。老集没有这个字段, 返回 null, 行为不变。 */
function spanKindOf(spans, i) {
  if (!spans || !spans.length) return null;
  const s = spans.find((x) => i + 1 >= x.start && i + 1 <= x.end);
  return s ? s.kind : null;
}

// frames 是整段对话共用的图片池；复核用的重复图、框图和裁剪图不能算视频抽帧。
// 保留原池下标，避免改变证据框和消息图片的引用。
function videoFrameIndices(c) {
  if (c.nativeVideoMeta || c.wf2?.nativeTimeline) return [];
  const nf = c.frames?.nf || 0;
  const ranges = (c.spans || []).filter(s => /待评/.test(s.kind || ""));
  const indices = new Set();
  const add = (start, end) => {
    if (!Number.isInteger(start) || !Number.isInteger(end)) return;
    for (let i = Math.max(0, start); i < Math.min(nf, end); i++) indices.add(i);
  };
  if (ranges.length) ranges.forEach(s => add(s.start - 1, s.end));
  else {
    const messages = c.msg || (c === state.case ? state.msg?.shape : null);
    const first = messages?.find(m => m.role === "user");
    (first?.parts || []).forEach(p => {
      if (Number.isInteger(p.i)) add(p.i, p.i + (p.n ?? 1));
    });
    if (!indices.size) add(0, Number.isInteger(c.nImages) && c.nImages > 0 ? c.nImages : nf);
  }
  return [...indices].sort((a, b) => a - b);
}

/* 只看 precision / recall / F1。metrics.json 里那三个 *_balanced / tpr_recall
   就是这三个数 (字段名带 balanced 是因为评测集是 1:1 富集的, 数值本身就是
   precision/recall/F1, 没有再做任何加权)。 */
function prf(m) {
  if (m.labeled === false) return { p: -1, r: -1, f1: -1 };
  return {
    p: m.precision_balanced ?? 0,
    r: m.tpr_recall ?? 0,
    f1: m.f1_balanced ?? 0,
  };
}

/* ── 格式容错 ────────────────────────────────────────────────────────────────
   严格解析只认 </think> **之后**的 {"<key>": 0|1}。全库 53,552 条推理里它失败
   12,596 条 (23.5%), 其中 10,440 条 (82.9%) 只差一件事: 模型把结论 JSON 写在
   </think> **之前**, 然后在 think 外面接着写自由文本分析 —— 那确实是它的真结论。

   服务端 (build_eval.lenient_pred) 已经把这些救回来的值算好放在行的 p2 上, 只在
   "严格解析不出、容错能救回"时才有。这里打开开关就用 p2 顶替 pred, 并**按行重算**
   混淆矩阵与全部指标 —— 只换个数字是不行的, TP/FP/FN/TN 都会变。

   安全性不是拍脑袋: 在 40,956 条严格解析成功的样本上, 容错规则与严格解析
   一致 40,955 / 分歧 1 (0.002%)。
   ★ 真解析不出来的仍然算未解析 (空输出、通篇自言自语没结论), 不猜、不从
     problem_frames 为空反推 —— 那属于"强行兼容", 会把模型没做的判断算成它做的。 */
function effPred(r) {
  if (r.incomplete) return null;
  if (state.lenient && r.pred == null && r.p2 != null) return r.p2;
  return r.pred;
}

/* ── L3 切片 (多标签维度) ─────────────────────────────────────────────────────
   动态基础质量是第一个 L2 下挂多个 L3 叶子的维度。metrics 里除了 L2 那一套,
   还带 tags(叶子名, 顺序固定) 和 by_tag(每个叶子一套 P/R/F1); 逐条行上带
   gt/pt(gold / pred 命中的叶子下标数组)。

   ★ 为什么逐条也要带: 光有 by_tag 汇总的话, 切到某个 L3 之后混淆矩阵能显示,
     但点格子筛不出任何 case —— 和 0902 那个 mm 只挂汇总的坑一模一样。
   ★ 单标签维度的行根本没有 gt 字段, tagsOf 返回空数组, 整套 L3 UI 不渲染,
     cellOf 也走原路径。老页面零影响。 */
const tagsOf = (g) => ((g && g.metrics && g.metrics.tags) || []);
// 培训页(PAGE_TEACH_ENGINE_VIEW): 只在 collapse-tob-0928-teach 页打开, 展示预测分布 / 过滤 / 分阶段原文。
const teachEngineView = () => !!window.PAGE_TEACH_ENGINE_VIEW;
const blindQualityHidden = () => window.PAGE_BLIND_LABELING
  && !teachEngineView()
  && !window.BlindAccount?.isSuperadmin;

/* 当前 L3 下这一条的 gold / pred。行上没有 gt/pt(老数据或未加载) 时返回 null,
   调用方回退到 L2。 */
function l3GP(r) {
  if (state.l3 == null || !Array.isArray(r.gt)) return null;
  return { g: r.gt.includes(state.l3) ? 1 : 0,
           p: Array.isArray(r.pt) && r.pt.includes(state.l3) ? 1 : 0 };
}

function cellOf(r) {
  if (window.PAGE_BLIND_LABELING && window.BlindAccount?.isSuperadmin) {
    const quality = window.BlindAccount.qualityCell(r.uid || r.no);
    return ["tp", "fp", "tn", "fn", "excluded"].includes(quality) ? quality : "unlabeled";
  }
  const s = l3GP(r);
  if (s) {
    // L3 视图: 未解析仍然是未解析 (那条根本没判定, 不能算成"这个标签判否")
    if (effPred(r) == null) return "unparsed";
    return s.p === 1 ? (s.g === 1 ? "tp" : "fp") : (s.g === 1 ? "fn" : "tn");
  }
  const p = effPred(r), g = r.gold;
  if (p == null) return "unparsed";
  if (g !== 0 && g !== 1) return "unlabeled";
  return p === 1 ? (g === 1 ? "tp" : "fp") : (g === 1 ? "fn" : "tn");
}

/* 格子的显示文字。L3 视图下子 tag 判错、但整条 L2 判对(gold=1 且 pred=1)时补「· 整体TP」,
   免得"报了别的 tag"被读成"整条漏了"。只改文字, 四格 / 筛选 / 指标仍按 L3 算。 */
function cellLabel(r) {
  const k = cellOf(r);
  const base = CELL[k]?.label || "边界 / 缺失";
  if (window.PAGE_BLIND_LABELING || !l3GP(r) || !["fn", "fp"].includes(k)) return base;
  return (effPred(r) === 1 && r.gold === 1) ? `${base} · 整体TP` : base;
}

/* 容错开着且行已加载时按行重算指标; 否则原样用服务端算好的。
   返回的对象字段名和 metrics.json 一致, 所以下游 (prf / π 换算) 不用改。 */
function liveMetrics(g) {
  if (g.metrics && g.metrics.labeled === false) return g.metrics;
  // ★ 切到某个 L3 时也必须按行重算 —— 服务端算好的那套是 L2 的。
  //   行还没加载完时回退到 metrics.by_tag 里那一套 (服务端算的同一个数),
  //   这样首屏就有数, 不用等 loadList。
  const onL3 = state.l3 != null;
  if (!state.lenient && !onL3) return g.metrics;
  if (!state.rows) {
    if (!onL3) return g.metrics;
    const bt = (g.metrics && g.metrics.by_tag) || {};
    const t = tagsOf(g)[state.l3];
    return t && bt[t] ? { ...g.metrics, ...bt[t], n_total: bt[t].n } : g.metrics;
  }
  const c = { tp: 0, fp: 0, fn: 0, tn: 0, unparsed: 0 };
  let nPos = 0, nNeg = 0;
  state.rows.forEach((r) => {
    c[cellOf(r)]++;
    if (effPred(r) == null) return;
    const s = l3GP(r);
    if ((s ? s.g : r.gold) === 1) nPos++; else nNeg++;
  });
  const n = c.tp + c.fp + c.fn + c.tn;
  const tpr = (c.tp + c.fn) ? c.tp / (c.tp + c.fn) : 0;
  const fpr = (c.fp + c.tn) ? c.fp / (c.fp + c.tn) : 0;
  const prec = (c.tp + c.fp) ? c.tp / (c.tp + c.fp) : 0;
  const f1 = (prec + tpr) ? (2 * prec * tpr) / (prec + tpr) : 0;
  return {
    ...g.metrics, ...c, n, n_pos: nPos, n_neg: nNeg,
    tpr_recall: tpr, fpr, precision: prec, f1, precision_balanced: prec, f1_balanced: f1,
    youden_j: tpr - fpr,
    voided: false,            // 重算出来的是真数, 不再沿用服务端的 -1
  };
}

function nRecovered() {
  if (!state.rows) return 0;
  return state.rows.filter((r) => !r.incomplete && r.pred == null && r.p2 != null).length;
}

function renderLenient() {
  const btn = $("lenientBtn");
  if (!btn) return;
  const n = nRecovered();
  const on = !!state.lenient;
  btn.className = "lenient" + (on ? " on" : "") + (n ? "" : " none");
  btn.textContent = on ? `🩹 容错中 · 救回 ${n}` : `🩹 格式容错${n ? ` (可救 ${n})` : ""}`;
  btn.title = n
    ? "模型把结论 JSON 写在 </think> 之前 (后面接着写了自由文本)。打开后用它顶替"
      + "未解析, 并重算混淆矩阵与全部指标。\n"
      + "真解析不出来的 (空输出 / 通篇没结论) 仍然算未解析, 不会硬猜。\n"
      + "安全性: 在 40,956 条严格能解析的样本上与严格解析一致 40,955 / 分歧 1。"
    : "这个 run 没有可容错救回的条目 —— 要么全解析成功, 要么剩下的确实没有结论。";
}

function toggleLenient() {
  state.lenient = !state.lenient;
  try {
    localStorage.setItem("eval.lenient", state.lenient ? "1" : "");
  } catch (e) { /* 无痕模式写不了, 不影响本次会话 */ }
  state.filter = "all";
  state.shown = PAGE;
  renderLenient();
  if (state.run) {
    renderCM(state.run);
    renderFilters();
    renderCaseList();
    const vis = visibleRows();
    if (!vis.includes(state.row)) selectRow(vis[0] || null);
  }
}

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

/* ------------------------------------------------------------------ 侧栏 */

/* 侧栏只到「维度 / 评测集」两层, 模型是右边的 tab ——
   模型数会随版本增长, 塞进侧栏就是一条越来越长的丑列表。 */
/* 把一个维度下的评测集按 family 折成"家族"。
   返回 [{name, list, shown}]: name 是侧栏显示的名字, list 是族内全部变体,
   shown 是这一族当前代表的那个集 (优先当前选中的变体, 否则族内第一个)。
   没声明 family 的集自成一族, 于是行为和折叠之前完全一致。 */
function famsOf(datasets) {
  const order = [], by = new Map();
  datasets.forEach((ds) => {
    // ★ 分组键必须用 **key** 而不是 label: 老登记里"嘉路 0817"这个 label 被两个
    //   配比不同的集 (1:1 和 1:7) 共用, 按 label 分组会把它们误合成一族, 侧栏少
    //   一条、而且两个集的数据混在一个筛选器下。只有显式声明 family 的才折叠。
    const k = ds.family || ds.key;
    if (!by.has(k)) { by.set(k, []); order.push(k); }
    by.get(k).push(ds);
  });
  const fams = order.map((k) => {
    const list = by.get(k);
    const cur = state.run && list.find((x) => x.key === state.run.dataset.key);
    const shown = cur || list[0];
    return { name: navRename(k) || shown.family || shown.label, list, shown };
  });
  // PAGE_NAV.sortByDate: 侧栏按显示名开头的日期 (MMDD-…) 从小到大排; 同一天按名字排,
  // 于是同一份数据的 原版 / -2th / -3th 挨在一起。名字不带日期的排到最后。缺省保持 index 原顺序。
  if (!(window.PAGE_NAV && window.PAGE_NAV.sortByDate)) return fams;
  const day = (fm) => (/^(\d{4})-/.exec(fm.name) || [, "9999"])[1];
  return fams.sort((a, b) => day(a).localeCompare(day(b)) || a.name.localeCompare(b.name));
}

/* PAGE_NAV.rename: 家族 key (ds.family || ds.key) -> 侧栏/标题显示名。只改显示,
   key 不动 —— key 是外链 hash 的一部分。缺省不改, 对其他页面无影响。 */
function navRename(famKey) {
  const m = window.PAGE_NAV && window.PAGE_NAV.rename;
  return (m && Object.prototype.hasOwnProperty.call(m, famKey)) ? m[famKey] : "";
}
function dsTitle(ds) {
  const fam = ds.family || ds.key;
  const nm = navRename(fam);
  if (!nm) return ds.label;
  // label 以家族名开头 (自动派生的 <家族>@<harness>) -> 只换前缀;
  // 否则是族内自有名字的变体 (n200-2stage@v6 …), 原名留着, 不然看不出是哪个变体。
  if (ds.label === fam) return nm;
  if (ds.label.startsWith(fam)) return nm + ds.label.slice(fam.length);
  return `${nm} · ${ds.label}`;
}

// ── 侧栏隐藏 ────────────────────────────────────────────────────────────────
// 侧栏里堆着一堆早期/一次性的集(512 系列…), 天天要看的只有最近那几个。
// 按**家族名**(= 侧栏那一行显示的名字)隐藏, 默认隐藏下面这批, 用户改过之后存
// localStorage, 按维度分开存 —— 不同页面各管各的。
// ★ 当前选中的那个集**永远不隐藏**, 否则点进去之后侧栏里找不到自己在哪。
// (与 critic/site-2/eval.js 同源, 改一边记得同步另一边)
const NAV_HIDE_DEFAULT = {
  // nature-* 系列保留 —— 那是主线评测集, 不隐藏
  "文字不可读": ["0902-kling-2stage", "1-1-512", "1-7-512", "random-512", "train-512"],
};
const NAV_HIDE_KEY = "site2.navHidden.v1";

function navHideLoad() {
  try {
    const raw = localStorage.getItem(NAV_HIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function navHideSave(obj) {
  try { localStorage.setItem(NAV_HIDE_KEY, JSON.stringify(obj)); } catch (e) { /* 无痕模式 */ }
}
function navHiddenOf(dim) {
  const saved = navHideLoad();
  const list = Object.prototype.hasOwnProperty.call(saved, dim)
    ? saved[dim] : (NAV_HIDE_DEFAULT[dim] || []);
  return new Set(list);
}
function navHideToggle(dim, name) {
  const saved = navHideLoad();
  const cur = navHiddenOf(dim);
  cur.has(name) ? cur.delete(name) : cur.add(name);
  saved[dim] = [...cur];
  navHideSave(saved);
  renderNav();
}
// 展开态只活在内存里 —— 刷新后回到收起, 这才是"默认隐藏"的意思
const navExpanded = new Set();
let navScrolledFor = "";   // 上次滚进可见区的那个集; 同一个集不重复滚 (见 renderNav 末尾)

function renderNav() {
  const nav = $("runNav");
  const keepTop = nav.scrollTop;   // 重建会清空列表; 点 × / 展开隐藏时不能跳回顶部
  nav.innerHTML = "";

  state.index.nav.forEach((d) => {
    const cur = state.run && state.run.dim === d.dim;
    nav.appendChild(el("p", "ds-section-title" + (cur ? " on" : ""), d.dim));
    // 同家族的集折成一条 —— nature-200-GT 那四个是同一批视频、同一份 gold, 只换
    // 问法和素材, 在侧栏排四行会被当成四个不同的评测集。具体选哪个变体交给中间
    // 那排 variant tab。没有 family 的集自成一族, 行为和以前完全一样。
    const hidden = navHiddenOf(d.dim);
    const fams = famsOf(d.datasets);
    const activeName = (nm) => state.run && state.run.dim === d.dim &&
      fams.some((f) => f.name === nm && f.list.some((x) => x.key === state.run.dataset.key));
    const isHidden = (fm) => hidden.has(fm.name) && !activeName(fm.name);
    const nHidden = fams.filter(isHidden).length;
    const showAll = navExpanded.has(d.dim);

    fams.forEach((fm) => {
      if (isHidden(fm) && !showAll) return;
      const ds = fm.shown;
      const on = state.run && state.run.dim === d.dim &&
                 fm.list.some((x) => x.key === state.run.dataset.key);
      const a = el("a", "nav-item" + (on ? " active" : ""));
      a.href = "#";
      // 主体只放**数据集目录名** —— 它是 eval-data-format 里那一层文件夹的名字,
      // 和磁盘上的路径一一对应, 找文件时不用再做一次心算翻译。
      // 条数和正负配比压到右边的小标里: 配比决定 precision 怎么读, 不能不显示,
      // 但它是这个集的属性、不是它的名字。模型不进侧栏 —— 模型是右边的 tab。
      a.appendChild(el("span", "nav-icon", ds.key === "train-512" ? "▣" : "◈"));
      // nav-name 可以被压缩出省略号; 两个 pill 不许压 —— 260px 侧栏放不下
      // "nature-200-GT + 200 · 1:1.6 + 5 变体" 三段全文, 名字长时省略号截断,
      // hover 有 title 兜底。
      const nm = el("span", "nav-name", fm.name);
      nm.title = fm.name;
      a.appendChild(nm);
      // PAGE_NAV.nameOnly: 侧栏只留名字, 条数·配比和变体数都不显示
      const nameOnly = !!(window.PAGE_NAV && window.PAGE_NAV.nameOnly);
      if (!nameOnly) a.appendChild(el("span", "pill count",
        `${ds.nCases}${ds.ratio ? `·${ds.ratio}` : ""}`));
      // 家族里有几个变体, 在侧栏就点一下 —— 否则折起来之后看不出这条底下还有东西
      if (!nameOnly && fm.list.length > 1) {
        a.appendChild(el("span", "pill count", `${fm.list.length}变体`));
      }
      a.onclick = (e) => {
        e.preventDefault();
        // 切数据集时尽量留在同一个模型上, 方便横着比同一模型的不同集;
        // 这个集里没有那个模型时落到**本集 F1 最高**的那个 (不是列表里的第一个) ——
        // 换集第一眼要看的是这个集上最好能到多少
        const keep = state.run && ds.models.find(
          (m) => m.label === state.run.model.label && !state.hidden.has(m.label));
        selectRun(runOf((keep || bestModelOf(ds)).run));
      };
      const hb = el("button", "nav-hide", isHidden(fm) ? "＋" : "×");
      hb.title = isHidden(fm) ? "恢复显示" : "在侧栏隐藏这个集";
      hb.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navHideToggle(d.dim, fm.name); };
      a.appendChild(hb);
      if (isHidden(fm)) a.classList.add("nav-item-hidden");
      nav.appendChild(a);
    });

    if (nHidden) {
      const t = el("button", "nav-more", showAll ? `收起 ${nHidden} 个已隐藏` : `+ ${nHidden} 个已隐藏`);
      t.onclick = (e) => {
        e.preventDefault();
        showAll ? navExpanded.delete(d.dim) : navExpanded.add(d.dim);
        renderNav();
      };
      nav.appendChild(t);
    }
  });

  if ($("mediaNote")) {
    $("mediaNote").textContent =
      (window.PAGE_NAV && window.PAGE_NAV.nameOnly ? "" : "侧栏右边的小标是「条数 · 正负配比」。") +
      "1-1/1-7 是人为富集的, 它们的 precision " +
      "不等于线上 —— 线上正例更稀疏, precision 会更低; 换配比时只有 recall 直接可比。" +
      "random-512 和 nature-200 是天然占比, precision 可以直接读。train-512 (▣) " +
      "是训练同源的 holdout, 高分只说明学会了, 不是泛化。";
  }

  // 侧栏能滚动之后 (studio.css .nav): 先还原重建前的滚动位置; 只有选中的集变了 (外链 hash 直达 / 切集)
  // 才把它滚进可见区 —— 点 × / 展开隐藏也会重建, 那时不能拽走。等下一帧布局定了再滚 (mediaNote 会改侧栏高度)。
  nav.scrollTop = keepTop;
  const act = nav.querySelector(".nav-item.active");
  const actKey = state.run ? state.run.dataset.key : "";
  if (act && actKey !== navScrolledFor) {
    navScrolledFor = actKey;
    requestAnimationFrame(() => act.scrollIntoView({ block: "nearest" }));
  }
}

const runOf = (key) => state.index.runs.find((r) => r.key === key);

/* ------------------------------------------------- 模型分组 (一个模型的多个 ckpt)

   一次训练会存十几个 ckpt (cot-mix-9b-v0 有 9 个, oil-text-0824 有 6 个)。全铺成
   平行 tab 的话一屏放不下, 而且"哪几个其实是同一个模型"得靠读名字猜。所以按**训练名**
   折成一组: 一组占一行, 行上只显示这组当前选中的那个 ckpt, 展开才看到组内全部。

   默认选组内 F1 最高的那个 —— 挑 ckpt 本来就是在挑分最高的那个, 默认值直接落在那儿,
   省掉"逐个点一遍找最高分"这一步。组之间也按各自最优 F1 降序排, 第一行就是这个评测集
   上最强的模型。

   拆名规则: <训练名>-ckpt<步数> / <训练名>-base, 后面可以再跟推理参数后缀 ——
   cot-mix-9b-v0-ckpt715-reppen1.05 是同一个 ckpt 换 repetition_penalty 重跑的,
   算同组的另一个变体, 因为要比的就是它和 ckpt715 的差别。名字里没有 ckpt/base 的
   (0822-文字不可读) 自成一组, 行为和原来的单个 tab 一样。 */

const CKPT_RE = /^(.*?)[-_](?:ckpt[-_]?(\d+)|base)(.*)$/i;

function famOf(label) {
  const m = CKPT_RE.exec(label);
  if (!m) return { fam: label, step: null, variant: "" };
  return {
    fam: m[1],
    step: m[2] ? +m[2] : 0,           // base 排在最前, 当第 0 步
    variant: (m[2] ? "ckpt" + m[2] : "base") + (m[3] || ""),
  };
}

const f1Of = (runKey) => {
  const r = runOf(runKey);
  return r ? prf(r.metrics).f1 : -1;
};

/* 当前 (维度, 评测集) 下的模型, 按训练名分组。隐藏的模型在这里就被摘掉,
   但**当前正在看的那个永远保留** —— 否则把它藏了会看到一个选不中的空列表。 */
/* ── 推理档位 chip ────────────────────────────────────────────────────────
   同一模型同一集可能跑过好几次, 差别在推理配置 (max_pixels / temperature / …)。
   轴不是写死的 —— build_eval 把「组内取值不唯一的那些 infer_config 键」算好放在
   mo.inferAxes, 这里照着渲染。以后加一个采样参数, 前端零改动就会多出一行 chip。

   ★ 只有真的跑过多档的模型才出这行。650 多个单档格子完全看不到它, 不添乱。
   chip 上标的是相对**当前选中那一档**的 ΔF1, 一眼看出换档位有没有用。 */
/* 模型身份 tag。显示名保持"日期开头"(与 msswift/models.md 一致, 不改名),
   身份靠这排补: 尺寸 / 底座 / CoT 来源 / 框架 / 训练像素 / step / 落盘时间。

   为什么非要有: 折叠后侧栏只剩一个家族名, 比如 "0824-27bcot-v1" —— 看不出模型
   多大, 而 "27bcot" 说的是**CoT 由 27B 生成**、模型本身是 9B。0829 就因为这个
   把一个 9B 的成绩当成 27B 在读, 追了半天"27B 为什么不如 9B"。
   落盘时间到分钟: 0828 一天里跑了 mg9b13w 和 mg27b13w 两个 run, 只有日期分不出。
   点 tag 复制它的值 (常要把 checkpoint 路径贴进脚本)。 */
function renderModelTags(g) {
  const box = $("modelTags");
  if (!box) return;
  box.innerHTML = "";
  const mo = g.model || {};
  const me = mo.meta || {};
  const items = [
    ["ensemble",
      g.ensemble ? (g.ensemble.display_name || g.ensemble.name) : "none",
      g.ensemble ? "key" : ""],
    ["尺寸", me.size, "key"],
    ["底座", me.base, "key"],
    ["CoT", me.cot, ""],
    ["框架", me.framework, ""],
    ["训练px", me.trainPx, ""],
    // 训练数据名太长, 一行 tag 被它撑满 —— 0830 按用户要求撤掉不显示。
    // meta.data 仍然照常产出, 想看的话把下面这行的注释去掉即可:
    // ["数据", me.data, ""],
    ["step", me.step, ""],
    ["落盘", me.ckptMtime, ""],
    // 推理侧的像素档跟训练档不一致时标黄 —— 训推不一致时指标算得出来但不是这个
    // 模型的能力, 这是本项目反复踩过的坑, 必须在最显眼处提示。
    ["推理px", g.maxPixels ? pxTier(g.maxPixels) : "",
      me.trainPx && g.maxPixels && pxTier(g.maxPixels) !== me.trainPx ? "warn" : ""],
  ];
  items.forEach(([k, v, cls]) => {
    if (!v || v === "—") return;
    const b = el("button", "mtag" + (cls ? " " + cls : ""));
    b.appendChild(el("span", "mtag-k", k));
    b.appendChild(el("span", "mtag-v", String(v)));
    b.title = cls === "warn"
      ? `推理用 ${v}, 但这个模型是按 ${me.trainPx} 训的 —— 训推不一致, 指标算得出来但不是它的真实能力`
      : `${k}: ${v}  (点击复制)`;
    b.onclick = () => navigator.clipboard && navigator.clipboard.writeText(String(v));
    box.appendChild(b);
  });
  if (mo.checkpoint) {
    const b = el("button", "mtag");
    b.appendChild(el("span", "mtag-k", "ckpt"));
    b.appendChild(el("span", "mtag-v", "复制路径"));
    b.title = mo.checkpoint;
    b.onclick = () => navigator.clipboard && navigator.clipboard.writeText(mo.checkpoint);
    box.appendChild(b);
  }
}

/* 131072 -> 13w, 262144 -> 26w; 其余原样显示数字, 不硬套档位名 */
function pxTier(px) {
  const n = +px;
  if (!n) return "";
  if (n === 131072) return "13w";
  if (n === 262144) return "26w";
  return String(px);
}

function renderInferChips(mo, curRunKey) {
  const runs = mo.runs || [];
  const axes = mo.inferAxes || [];
  if (runs.length < 2 || !axes.length) return null;

  const f1s = new Map(runs.map((r) => [r.run, f1Of(r.run)]));
  const curF1 = f1s.get(curRunKey);
  const box = el("div", "ichips");

  axes.forEach((ax) => {
    const line = el("div", "irow");
    line.appendChild(el("span", "irow-label", ax));
    const seen = [];
    runs.forEach((r) => {
      const v = (r.variant || {})[ax];
      if (v !== undefined && !seen.includes(v)) seen.push(v);
    });
    seen.forEach((v) => {
      // 其他轴保持当前取值、只换这一轴的那个 run; 没有就退到该轴上取这个值的任意一个
      const cur = (runs.find((r) => r.run === curRunKey) || {}).variant || {};
      const exact = runs.find((r) => (r.variant || {})[ax] === v &&
        axes.every((a) => a === ax || (r.variant || {})[a] === cur[a]));
      const tgt = exact || runs.find((r) => (r.variant || {})[ax] === v);
      if (!tgt) return;
      const on = tgt.run === curRunKey;
      const f1 = f1s.get(tgt.run);

      const b = el("button", "ichip" + (on ? " on" : "") +
        (v === "?" ? " unknown" : "") + (!on && !exact ? " approx" : ""));
      b.appendChild(el("span", "ichip-v", v));
      // 选中的那个显示绝对 F1, 其余显示相对它的差值 —— 差值才是要看的东西。
      // ★ PAGE_NO_CHIP_F1: 逐 case 页(hands)上 case 池只有几条, F1 非 0 即 1,
      //   ΔF1 永远是 ±1.000, 纯噪音 —— 那种页面只需要 chip 当切换器。
      if (f1 >= 0 && !window.PAGE_NO_CHIP_F1) {
        if (on) {
          b.appendChild(el("span", "ichip-f1", "F1 " + f1.toFixed(3)));
        } else if (curF1 >= 0) {
          const d = f1 - curF1;
          b.appendChild(el("span",
            "ichip-d " + (d > 0.0005 ? "up" : d < -0.0005 ? "down" : "flat"),
            (d >= 0 ? "+" : "") + d.toFixed(3)));
        }
      }
      const cfg = tgt.cfg || {};
      const extra = Object.keys(cfg).filter((k) => !axes.includes(k))
        .map((k) => `${k}=${cfg[k]}`).join("\n");
      b.title = (v === "?"
        ? "这次运行没记录该配置 (0827 之前落盘的结果都没有)"
        : `${ax} = ${cfg[ax]}`) +
        `\n跑于 ${tgt.runAt || "未知"}` +
        (exact || on ? "" : `\n没有「其他条件不变、只换 ${ax}」的运行, 会跳到最接近的一次`) +
        (extra ? "\n\n其余配置:\n" + extra : "");
      if (!on) b.onclick = (e) => { e.stopPropagation(); selectRun(runOf(tgt.run)); };
      line.appendChild(b);
    });
    box.appendChild(line);
  });
  return box;
}

function modelGroups(g) {
  const ds = (state.index.nav.find((d) => d.dim === g.dim) || {}).datasets || [];
  const cur = ds.find((d) => d.key === g.dataset.key);
  if (!cur) return [];

  const byFam = new Map();
  cur.models.forEach((mo) => {
    const { fam, step, variant } = famOf(mo.label);
    if (!byFam.has(fam)) byFam.set(fam, { fam, items: [], all: [] });
    const it = { mo, step, variant, f1: f1Of(mo.run), on: mo.run === g.key };
    const G = byFam.get(fam);
    G.all.push(it);
    if (!state.hidden.has(mo.label) || it.on) G.items.push(it);
  });

  const out = [];
  byFam.forEach((G) => {
    G.all.sort((a, b) => (a.step ?? -1) - (b.step ?? -1) ||
                          a.variant.localeCompare(b.variant));
    G.items.sort((a, b) => (a.step ?? -1) - (b.step ?? -1) ||
                            a.variant.localeCompare(b.variant));
    G.best = G.items.reduce((a, b) => (b.f1 > a.f1 ? b : a), G.items[0] || null);
    out.push(G);
  });
  out.sort((a, b) => (b.best ? b.best.f1 : -1) - (a.best ? a.best.f1 : -1));
  return out;
}

/* 这一组当前该选哪个 ckpt: 正在看的 > 用户上次在这组里点过的 > F1 最高的 */
function pickOf(G) {
  const onIt = G.items.find((i) => i.on);
  if (onIt) return onIt;
  const want = state.famPick.get(G.fam);
  return G.items.find((i) => i.mo.label === want) || G.best;
}

/* 整个评测集上 F1 最高的模型 —— 侧栏换集、首屏进来时的默认落点。
   隐藏的模型不参与, 不然默认会落到一个不显示的 tab 上。 */
function bestModelOf(ds) {
  const vis = ds.models.filter((m) => !state.hidden.has(m.label));
  const pool = vis.length ? vis : ds.models;
  return pool.reduce((a, b) => (f1Of(b.run) > f1Of(a.run) ? b : a), pool[0]);
}

/* F1 随 ckpt 走的小折线 —— 收起来之后仍要一眼看出"这组是还在涨还是已经过拟合",
   否则折叠就等于把训练曲线藏了。3 个点以上才画, 少于 3 个看数字就够。 */
function sparkline(items, sel) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 56, H = 16, P = 2;
  const vals = items.map((i) => i.f1);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i) => P + (W - 2 * P) * (items.length === 1 ? 0.5 : i / (items.length - 1));
  const y = (v) => H - P - (H - 2 * P) * ((v - lo) / span);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mspark");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const pl = document.createElementNS(NS, "polyline");
  pl.setAttribute("points", items.map((it, i) => `${x(i)},${y(it.f1)}`).join(" "));
  svg.appendChild(pl);
  const dot = (it, cls) => {
    const c = document.createElementNS(NS, "circle");
    const i = items.indexOf(it);
    c.setAttribute("cx", x(i)); c.setAttribute("cy", y(it.f1)); c.setAttribute("r", 1.9);
    c.setAttribute("class", cls);
    svg.appendChild(c);
  };
  if (sel) dot(sel, "mspark-sel");
  svg.setAttribute("aria-label", `F1 ${lo.toFixed(3)}~${hi.toFixed(3)}`);
  return svg;
}

/* ------------------------------------------------------------ 数据变体筛选条

   nature-200-GT 一族是同一批 200 条视频、同一份复标 gold, 只换三件事: 判定细则
   (v1/v2/v3)、thinking 格式 (自由散文 / v3 三步结构化)、给不给参考素材。
   按轴分行渲染, 每行一组 chip —— 这样"我想只换细则、素材不变"这种意图能一步点到,
   而排成一串平铺的集名做不到。

   ★ 不是所有组合都存在 (现在只有 4 个变体, 而 3×2×2=12)。点一个不存在的组合时
     不能什么都不做 —— 那样用户以为界面坏了。策略: 优先跳"其他轴不变、只换这一轴"
     的那个变体; 没有就跳到该轴上取这个值的任意一个, 并在 title 里说明跳到了哪。
     这样每次点击都必然落在一个真实存在的集上。 */
function renderVariantTabs(g) {
  const field = $("variantField");
  const wrap = $("variantTabs");
  wrap.innerHTML = "";
  const dim = state.index.nav.find((d) => d.dim === g.dim);
  // ★ 分族口径必须和 famsOf 逐字一致 (family || key)。用 label 会把恰好同名的
  //   不同集拉进来当兄弟, 于是侧栏折成一族、变体条又是另一族, 两边对不上。
  const famKey = g.dataset.family || g.dataset.key;
  const sibs = ((dim && dim.datasets) || [])
    .filter((ds) => (ds.family || ds.key) === famKey);
  if (!g.dataset.family || sibs.length < 2) { field.hidden = true; return; }
  field.hidden = false;
  // ★ 无标注的族 (T2VA 173pair) 不能沿用同一句提示: 它没有 gold, 变体之间
  //   比的是预测分布和逐条 response, 说"可直接比大小"会被读成能比 F1。
  $("variantHint").textContent = g.dataset.unlabeled
    ? `${sibs.length} 个变体 · 同一批 ${g.nCases} 条视频, 无 gold —— 只能比预测分布与逐条 response, 不能比 F1`
    : `${sibs.length} 个变体 · 同一批 ${g.nCases} 条视频与同一份 gold, 可直接比大小`;

  const cur = g.dataset.variant || {};
  const axes = [];
  sibs.forEach((s) => Object.keys(s.variant || {})
    .forEach((a) => { if (!axes.includes(a)) axes.push(a); }));

  axes.forEach((ax) => {
    const row = el("div", "vrow");
    row.appendChild(el("span", "vrow-label", ax));
    const vals = [];
    sibs.forEach((s) => {
      const v = (s.variant || {})[ax];
      if (v && !vals.includes(v)) vals.push(v);
    });
    /* 只剩一个取值的轴不渲染 —— 它不是选择项, 点了也不会切到别处。
       eval.html 藏掉 2stage 之后, nature-200-GT 的「推理方式」就只剩「单模型」,
       留着会让人以为还有别的可选。同理 T2VA 那族的「参考素材·无」也不再显示。 */
    if (vals.length < 2) return;
    /* 按版本号自然排序, 让 v3 · v3.5 · v4 按这个次序摆。
       原来是"谁先出现谁在前"(sibs 的顺序), 于是 v3.5 是后加的就被甩到 v4 后面,
       而这三个恰恰是一条递进的链 (v3 像素框 -> v3.5 归一化 -> v4 再加 decision),
       次序错了就看不出这是一条链。

       ★ 前缀不止 v: 动态基础质量的召回口径是 r1/r3/r4, 只认 ^v 的话它们全落进
         "保持原次序", 于是按开跑先后排成 r3 · r1 · r4 —— 同样是一条递进的链,
         同样看不出次序。所以改成**任意字母前缀 + 数字**, 同前缀的按数字排,
         不同前缀的按前缀排。非版本号形式的取值 (有/无/两阶段) 仍保持原相对次序。 */
    const verOf = (s) => /^([A-Za-z]*)([\d.]+)$/.exec(s);
    vals.sort((a, b) => {
      const pa = verOf(a), pb = verOf(b);
      if (pa && pb) {
        return pa[1] !== pb[1] ? (pa[1] < pb[1] ? -1 : 1)
                               : parseFloat(pa[2]) - parseFloat(pb[2]);
      }
      if (pa) return -1;
      if (pb) return 1;
      return 0;
    });
    vals.forEach((v) => {
      const on = cur[ax] === v;
      // 只换这一轴、其他轴保持不变的那个变体
      const exact = sibs.find((s) => (s.variant || {})[ax] === v &&
        axes.every((a) => a === ax || (s.variant || {})[a] === cur[a]));
      const target = exact || sibs.find((s) => (s.variant || {})[ax] === v);
      const b = el("button",
        "vchip" + (on ? " on" : "") + (!on && !exact ? " approx" : ""), v);
      b.title = on ? `当前: ${target.label}`
        : exact ? `切到 ${target.label}`
        : `没有「其他条件不变、只把${ax}换成${v}」的变体, 会跳到最接近的: ${target.label}`;
      b.onclick = () => {
        if (on) return;
        // 换变体时尽量停在同一个模型上, 方便横着比同一模型的不同问法;
        // 该变体没跑过这个模型就落到本变体 F1 最高的那个
        const keep = state.run && target.models.find(
          (m) => m.label === state.run.model.label && !state.hidden.has(m.label));
        selectRun(runOf((keep || bestModelOf(target)).run));
      };
      row.appendChild(b);
    });
    wrap.appendChild(row);
  });
  // 所有轴都被上面的单值规则跳过时, 整块就只剩一个标题 —— 直接收起来。
  if (!wrap.children.length) field.hidden = true;
}

/* ── 评测模式 (eval_mode) ────────────────────────────────────────────────────
   同一个 F1, 端到端重跑出来的和「拿固定预测换个 gold / gate 重算」出来的不是一回事,
   并排摆着会被当成同一种结果比大小。所以模型 tab 上直接标出这次 run 是哪种模式。
   取值优先级 (只认证据, 推不出来就标「未声明」, 绝不默认当 e2e):
     1. metrics.eval_mode / infer_config.eval_mode   —— 跑的时候自己记的
     2. PAGE_EVAL_MODE.override[run key]             —— 人工登记
   ★ 不从时间戳 / reused_predictions_from / run 名推断 —— 那些不是跑法的直接证据。
     历史 run 的模式要逐个查落盘轨迹 (stage1/stage2 请求是否真的发生) 后登记进 override。
   只在声明了 window.PAGE_EVAL_MODE 的页面渲染。 */
const EVAL_MODES = {
  "e2e-fresh":           "Stage1、Stage2 全部重新请求 —— 整条 Pipeline 的一次独立运行",
  "stage2-fresh":        "Stage1 用固定输出, Stage2 全部重新请求 —— 固定召回后 Stage2 的一次独立运行",
  "paired-delta":        "Stage1 固定, Stage2 只请求 hash 变化项, 其余用 canonical response —— 衡量 L2 改动的净贡献",
  "stage1-fresh-paired": "Stage1 全部重新请求, Stage2 只请求新建或 hash 变化项 —— 衡量 Stage1 改动的净贡献",
  "cache-replay":        "两阶段都不请求, 全部从 canonical cache 读取 —— 重放已有的确定性请求集合",
  "stability-resample":  "Stage1 固定, 故意重跑相同请求, 不覆盖 canonical —— 测闭源模型的响应方差",
  "aggregate-only":      "两阶段都不请求, 直接用固定推理结果 —— 只测阈值、gate 或视频级聚合规则",
  // glb workflow v2 专用: 它的链路是 stage0 -> caption -> judge -> peshot -> stage1 -> stage2,
  // 前四段是"感知链"(把视频切成 shot 并与 PE 对齐), 跑一次很贵。改 stage1/stage2 的 rubric 时
  // 复用现成的感知链 checkpoint, 只重新请求 stage1+stage2 —— 这是上面七种都盖不住的第八种。
  // ★ 这种 run 之间可以互比(同一条感知链), 但不能和 e2e-fresh 比大小: 感知链本身的采样
  //   方差有 ±0.02~0.05 F1, 换一条感知链排名就变 (见 REPORT §13)。
  "upstream-reused":     "感知链 (stage0/caption/judge/peshot) 复用固定 checkpoint, Stage1+Stage2 全部重新请求 —— 固定感知后下游 rubric 的一次独立运行",
};

function evalModeOf(r) {
  if (!r) return null;
  const m = r.metrics || {};
  const rec = m.eval_mode || (r.inferConfig || {}).eval_mode;
  if (rec) return { mode: rec, src: "metrics.json 记录值" };
  const ov = (window.PAGE_EVAL_MODE || {}).override || {};
  if (ov[r.key]) return { mode: ov[r.key], src: "人工登记" };
  // 落盘轨迹审计结果 (eval-mode-audit.js, 由 build_eval_mode_audit.py 从逐 run 审计 JSON 生成)
  const au = (window.EVAL_MODE_AUDIT || {})[r.key];
  if (au && au.eval_mode && au.eval_mode !== "unverified") return {
    mode: au.eval_mode, likely: au.confidence !== "confirmed",
    src: `落盘轨迹审计 (${au.confidence === "confirmed" ? "有直接证据" : "证据链缺一环, 大概率"}): ${au.lineage || ""}` +
         (au.note ? `\n备注: ${au.note}` : "") +
         ((au.evidence || []).length ? "\n证据:\n- " + au.evidence.slice(0, 3).join("\n- ") : ""),
  };
  if (au) return { mode: "", unverified: true, src: `落盘轨迹审计: 证据不足 —— ${au.note || au.lineage || ""}` };
  // 单模型 (一段推理, 没有 stage1/stage2): 用户说明 (1015) 单模型评测基本都是端到端, 如 qwen 系列
  const twoStage = (m.infer_mode || (r.inferConfig || {}).mode) === "2-stage" || /2stage/.test(r.dataset.key);
  if (!twoStage) return { mode: "e2e-fresh", src: "用户说明 (1015): 单模型评测基本都是端到端 (如 qwen 系列), 未逐个审计落盘轨迹" };
  return { mode: "", src: "metrics 没有记录 eval_mode, 落盘轨迹尚未核查 —— 不确定是不是端到端跑的" };
}

function evalModeChip(runKey) {
  if (!window.PAGE_EVAL_MODE) return null;
  const em = evalModeOf(runOf(runKey));
  if (!em) return null;
  const cls = em.mode ? "m-" + em.mode : em.unverified ? "unverified" : "unknown";
  const c = el("span", "emode " + cls + (em.likely ? " likely" : ""),
    em.mode ? em.mode + (em.likely ? "?" : "") : em.unverified ? "证据不足" : "未声明");
  c.title = (em.mode ? `${em.mode}: ${EVAL_MODES[em.mode] || "(未知模式名)"}\n` : "") + em.src;
  return c;
}

function renderModelTabs(g) {
  const wrap = $("modelTabs");
  wrap.innerHTML = "";
  const all = modelGroups(g);
  const groups = all.filter((G) => G.items.length);

  const nModel = groups.reduce((n, G) => n + G.items.length, 0);
  const nAll = all.reduce((n, G) => n + G.all.length, 0);
  $("modelHint").textContent = nModel === nAll
    ? `${groups.length} 组 / ${nAll} 个`
    : `${groups.length} 组 / 显示 ${nModel} of ${nAll} 个`;

  groups.forEach((G) => {
    const sel = pickOf(G);
    if (!sel) return;
    const single = G.items.length === 1;
    const open = state.famOpen.has(G.fam);

    const row = el("div", "mgroup" + (sel.on ? " on" : ""));

    // 组头: 点它就切到这组当前选中的 ckpt (默认是组内 F1 最高的那个)
    const head = el("button", "mgroup-head");
    const name = el("span", "mgroup-name", single ? sel.mo.label : G.fam);
    head.appendChild(name);
    if (!single) {
      head.appendChild(el("span", "mgroup-ckpt", sel.variant));
      if (sel === G.best) head.appendChild(el("span", "mgroup-star", "最优"));
    }
    const emc = evalModeChip(sel.mo.run);
    if (emc) head.appendChild(emc);
    head.appendChild(el("span", "mtab-f1", "F1 " + (sel.f1 < 0 ? "—" : sel.f1.toFixed(3))));
    if (G.items.length >= 3) head.appendChild(sparkline(G.items, sel));
    head.title = sel.mo.fullLabel || sel.mo.label;
    head.onclick = () => {
      if (sel.on) { toggleFam(G.fam); return; }   // 已经在这组了, 再点就是展开/收起
      state.famPick.set(G.fam, sel.mo.label);
      selectRun(runOf(sel.mo.run));
    };
    row.appendChild(head);

    if (!single) {
      const tog = el("button", "mgroup-toggle" + (open ? " open" : ""),
        `${G.items.length} ckpt`);
      tog.title = open ? "收起" : "展开这组的全部 ckpt";
      tog.onclick = (e) => { e.stopPropagation(); toggleFam(G.fam); };
      row.appendChild(tog);
    }
    wrap.appendChild(row);

    // 推理档位 chip: 挂在模型行下面, 只有跑过多档的模型才有。
    // ★ 高亮必须用**当前真正选中的那次运行**, 不能用 sel.mo.run —— 后者恒等于这个
    //   模型的"最新一次运行"。用它的话, 点了 26w 之后数据其实换了、但高亮一直钉在
    //   最新那次上, 看起来就像点了完全没反应 (0830 报的就是这个)。
    const curKey = (state.run && state.run.model.label === sel.mo.label)
      ? state.run.key : sel.mo.run;
    const chips = renderInferChips(sel.mo, curKey);
    if (chips) wrap.appendChild(chips);

    if (!single && open) {
      const sub = el("div", "mckpts");
      G.items.forEach((it) => {
        const b = el("button", "mckpt" + (it.on ? " on" : "") +
                              (it === G.best ? " best" : ""));
        b.appendChild(el("span", "mckpt-name", it.variant));
        const emk = evalModeChip(it.mo.run);
        if (emk) b.appendChild(emk);
        b.appendChild(el("span", "mckpt-f1", it.f1 < 0 ? "—" : it.f1.toFixed(3)));
        b.title = (it.mo.fullLabel || it.mo.label) +
                  (it === G.best ? " —— 这组 F1 最高" : "");
        if (!it.on) b.onclick = () => {
          state.famPick.set(G.fam, it.mo.label);
          selectRun(runOf(it.mo.run));
        };
        sub.appendChild(b);
      });
      wrap.appendChild(sub);
    }
  });

  if (!groups.length) {
    wrap.appendChild(el("p", "block-hint", "这个评测集下的模型都被筛掉了 —— 点上面「筛选模型」放开几个"));
  }
  renderModelFilter(g);
}

function toggleFam(fam) {
  if (state.famOpen.has(fam)) state.famOpen.delete(fam);
  else state.famOpen.add(fam);
  renderModelTabs(state.run);
}

/* ---------------------------------------------------- 模型筛选面板

   模型只会越攒越多 (现在两个维度加起来 108 个 run), 而一次比较通常只关心其中三五个。
   这里按模型勾选显示/隐藏, 存 localStorage 跨维度跨评测集通用 —— 隐藏的是"模型",
   不是"某个集上的那次跑", 换个集不该又冒出来。 */

const HIDE_KEY = "site2-eval-hidden-models";

function loadHidden() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function saveHidden() {
  localStorage.setItem(HIDE_KEY, JSON.stringify([...state.hidden]));
}

function afterHiddenChange() {
  saveHidden();
  // 当前这个 run 被藏掉了就自动落到还显示着的最优模型上, 别停在一个已经不显示的 tab 上
  const g = state.run;
  const ds = (state.index.nav.find((d) => d.dim === g.dim) || {}).datasets || [];
  const cur = ds.find((d) => d.key === g.dataset.key);
  if (cur && state.hidden.has(g.model.label)) {
    const nxt = bestModelOf(cur);
    if (nxt && nxt.run !== g.key) return selectRun(runOf(nxt.run));
  }
  renderModelTabs(g);
}

function setHidden(labels, hide) {
  labels.forEach((l) => (hide ? state.hidden.add(l) : state.hidden.delete(l)));
  afterHiddenChange();
}

function renderModelFilter(g) {
  const box = $("modelFilter");
  box.hidden = !state.filterOpen;
  box.innerHTML = "";
  if (!state.filterOpen) return;

  const groups = modelGroups(g);
  const allLabels = groups.flatMap((G) => G.all.map((i) => i.mo.label));

  const bar = el("div", "mfilter-bar");
  const act = (txt, fn, hint) => {
    const b = el("button", "vfilter", txt);
    if (hint) b.title = hint;
    b.onclick = fn;
    bar.appendChild(b);
  };
  act("全选", () => setHidden(allLabels, false));
  act("全不选", () => setHidden(allLabels.filter((l) => l !== g.model.label), true),
      "当前正在看的那个留着, 否则右边会空掉");
  act("每组只留最优", () => {
    // 组内 F1 最高的留下, 其余隐藏 —— 只想横向比"各模型最好水平"时一键到位。
    // 只动本集里出现过的这些 label, 别把别的维度/评测集下藏起来的模型顺手放出来。
    const keep = new Set(groups.map((G) => {
      const pool = G.all.filter((i) => i.f1 >= 0);
      return pool.length ? pool.reduce((a, b) => (b.f1 > a.f1 ? b : a)).mo.label : null;
    }).filter(Boolean));
    allLabels.forEach((l) =>
      (keep.has(l) ? state.hidden.delete(l) : state.hidden.add(l)));
    afterHiddenChange();
  }, "每个训练名只保留本集上 F1 最高的那个 ckpt");
  box.appendChild(bar);

  groups.forEach((G) => {
    const single = G.all.length === 1;
    const shownN = G.all.filter((i) => !state.hidden.has(i.mo.label)).length;
    const line = el("div", "mfilter-fam");

    const cb = el("label", "mfilter-item");
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.checked = shownN > 0;
    inp.indeterminate = shownN > 0 && shownN < G.all.length;
    inp.onchange = () => setHidden(G.all.map((i) => i.mo.label), !inp.checked);
    cb.appendChild(inp);
    cb.appendChild(el("span", "mfilter-name", G.fam));
    if (!single) cb.appendChild(el("span", "mfilter-n", `${shownN}/${G.all.length}`));
    line.appendChild(cb);
    box.appendChild(line);

    if (single) return;
    const sub = el("div", "mfilter-ckpts");
    G.all.forEach((it) => {
      const l = el("label", "mfilter-item sm");
      const i2 = document.createElement("input");
      i2.type = "checkbox";
      i2.checked = !state.hidden.has(it.mo.label);
      i2.onchange = () => setHidden([it.mo.label], !i2.checked);
      l.appendChild(i2);
      l.appendChild(el("span", "mfilter-name", it.variant));
      l.appendChild(el("span", "mfilter-n", it.f1 < 0 ? "—" : it.f1.toFixed(3)));
      sub.appendChild(l);
    });
    box.appendChild(sub);
  });
}

/* ------------------------------------------------------------------ 单个 run */

/* ── 固定数据 ────────────────────────────────────────────────────────────────
   用途: 钉住一个评测集, 然后只换模型, 横着看"同一个集上各模型什么水平"。

   为什么要在 selectRun 里拦而不是在各个点击处拦: 能改数据集的入口有三个
   (侧栏集列表 / 数据变体 tab / URL hash), 逐个改容易漏。selectRun 是唯一收口,
   在这儿判一次就全堵住了。
   钉住时点别的集不是"不响应"——那样像卡死——而是**带着当前模型跳到钉住的集**;
   该集没有这个模型时留在原地并闪一下按钮, 让人知道是被钉住拦下的。*/
function pinnedRedirect(g) {
  const p = state.pinDs;
  if (!p || (g.dim === p.dim && g.dataset.key === p.key)) return g;
  const dim = state.index.nav.find((d) => d.dim === p.dim);
  const ds = dim && (dim.datasets || []).find((x) => x.key === p.key);
  if (!ds) { state.pinDs = null; return g; }          // 集没了就自动解钉, 不卡住
  const same = (ds.models || []).find((m) => m.label === g.model.label);
  if (same) return runOf(same.run) || g;
  const btn = $("pinDs");
  if (btn) { btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 600); }
  return state.run || g;                              // 钉住的集里没这个模型: 留在原地
}

function renderPinDs(g) {
  const btn = $("pinDs");
  if (!btn) return;
  const on = !!state.pinDs;
  btn.className = "pinds" + (on ? " on" : "");
  btn.textContent = on ? `📌 已固定 ${state.pinDs.key}` : "📌 固定数据";
  btn.title = on
    ? `已钉住 ${state.pinDs.dim} · ${state.pinDs.key}，切模型时数据集不变。再点解除。`
    : "钉住当前评测集，之后只换模型、数据集不变 —— 横着比同一个集上各模型的水平";
}

function togglePinDs() {
  const g = state.run;
  if (!g) return;
  state.pinDs = state.pinDs ? null : { dim: g.dim, key: g.dataset.key };
  try {
    localStorage.setItem("eval.pinDs", JSON.stringify(state.pinDs));
  } catch (e) { /* 无痕模式写不了, 不影响本次会话 */ }
  renderPinDs(g);
  renderNav();
  renderVariantTabs(g);
  renderModelTabs(g);
}

/* Review identity includes data directory + run + uid; machine evidence ids are run-local.
   Each operation patches one entity/field, so a stale tab cannot replace other reviews. */
const REVIEW_ROLES = [
  { key: "annotator_1", label: "标注员 1" },
  { key: "annotator_2", label: "标注员 2" },
  { key: "reviewer_3", label: "复核员 3" },
  { key: "admin", label: "管理员" },
];
function storedReviewRole() {
  if (!window.PAGE_MULTI_REVIEW) return null;
  if (window.PAGE_BLIND_ACCOUNT) return "annotator_1";
  try {
    const query = new URLSearchParams(location.search).get("review_role");
    const saved = localStorage.getItem("critic.review.role");
    const role = query || saved;
    return REVIEW_ROLES.some((item) => item.key === role) ? role : "annotator_1";
  } catch { return "annotator_1"; }
}
const REVIEW = { records: [], error: "", filter: "all", role: storedReviewRole() };
if (REVIEW.role === "reviewer_3" && !window.PAGE_TRAINING_MODE) REVIEW.filter = "conflict";
const REVIEW_INDEX = (() => {
  const sep = "\u001f";
  const marksAll = new Map();
  const marksByRole = new Map();
  const marksByWho = new Map();
  const evidenceAll = new Map();
  const evidenceByRole = new Map();
  const lastWhoAll = new Map();
  const lastWhoByRole = new Map();
  const key = (...parts) => parts.map((part) => String(part ?? "")).join(sep);
  const merge = (map, mapKey, patch) => {
    const value = map.get(mapKey) || {};
    Object.assign(value, patch);
    map.set(mapKey, value);
  };
  const evidenceMap = (root, uid) => {
    const uidKey = String(uid);
    if (!root.has(uidKey)) root.set(uidKey, new Map());
    return root.get(uidKey);
  };
  const validWho = (record) => {
    const who = String(record.who || "").trim();
    return who && who !== "anon" && who !== record.review_role ? who : "";
  };
  const apply = (record) => {
    const uid = String(record.uid || "");
    const entity = String(record.entity || "");
    const role = String(record.review_role || "");
    if (!uid || !entity) return;
    const name = validWho(record);
    if (name) {
      lastWhoAll.set("scope", name); lastWhoAll.set(uid, name);
      lastWhoByRole.set(key(role, "scope"), name);
      lastWhoByRole.set(key(role, uid), name);
    }
    if (record.kind === "mark") {
      const patch = record.patch || {};
      merge(marksAll, key(uid, entity), patch);
      merge(marksByRole, key(uid, entity, role), patch);
      const groupKey = key(uid, entity, role);
      const group = marksByWho.get(groupKey) || new Map();
      const who = String(record.who || role);
      const value = group.get(who) || {};
      Object.assign(value, patch); group.set(who, value); marksByWho.set(groupKey, group);
      return;
    }
    if (record.kind !== "evidence") return;
    const all = evidenceMap(evidenceAll, uid);
    const scoped = evidenceMap(evidenceByRole, uid);
    if (record.deleted) {
      all.delete(entity);
      scoped.delete(key(role, entity));
    } else {
      all.set(entity, record);
      scoped.set(key(role, entity), record);
    }
  };
  const reset = (records) => {
    [marksAll, marksByRole, marksByWho, evidenceAll, evidenceByRole,
      lastWhoAll, lastWhoByRole].forEach((map) => map.clear());
    records.forEach(apply);
  };
  return {
    apply, reset,
    mark(uid, entity, role) {
      const map = window.PAGE_MULTI_REVIEW ? marksByRole : marksAll;
      const mapKey = window.PAGE_MULTI_REVIEW ? key(uid, entity, role) : key(uid, entity);
      return { ...(map.get(mapKey) || {}) };
    },
    marksByReviewer(uid, entity, role) {
      return [...(marksByWho.get(key(uid, entity, role)) || new Map()).entries()]
        .map(([who, value]) => ({ who, value: { ...value } }));
    },
    annotatorName(uid, role) {
      const map = window.PAGE_MULTI_REVIEW ? lastWhoByRole : lastWhoAll;
      return map.get(window.PAGE_MULTI_REVIEW ? key(role, uid) : String(uid))
        || map.get(window.PAGE_MULTI_REVIEW ? key(role, "scope") : "scope") || "";
    },
    evidence(uid, allowedRoles) {
      if (!window.PAGE_MULTI_REVIEW) return [...(evidenceAll.get(String(uid)) || new Map()).values()];
      const allowed = new Set(allowedRoles);
      return [...(evidenceByRole.get(String(uid)) || new Map()).values()]
        .filter((record) => allowed.has(record.review_role));
    },
  };
})();
function reviewScope(run = state.run) {
  return (window.PAGE_REVIEW_SCOPE_PREFIX || DATA_DIR) + "|" + run.key;
}
function reviewUid(c) { return String(c.uid || c.no); }
function reviewRole() { return REVIEW.role || null; }
function trainingMode() { return !!window.PAGE_TRAINING_MODE; }
// 培训互见模式下各角色能看到哪些角色的答案: 评测人员 (admin) 的答案只给评测人员自己看,
// 标注 / 复核账号看不到 (1015)。服务端 /api/blind/reviews 也会剔掉, 这里只是不画空栏。
function trainingVisibleRoles() {
  return isAdmin() ? ["annotator_1", "annotator_2", "reviewer_3", "admin"]
    : ["annotator_1", "annotator_2", "reviewer_3"];
}
function isReviewer() { return reviewRole() === "reviewer_3"; }
function isAdmin() { return reviewRole() === "admin"; }
function isAdjudicator() { return isReviewer() || isAdmin(); }
function reviewLocked() { return !!window.BlindAccount?.submitted; }
function recordBelongsToRole(record, role = reviewRole()) {
  if (!window.PAGE_MULTI_REVIEW) return true;
  if (record.review_role !== role) return false;
  // Administrator review is one shared final verdict. The append-only log
  // still records who made each change, while the UI folds all admin patches
  // chronologically so every administrator sees and continues the same work.
  return true;
}
function reviewValue(c, entity = "case", role = reviewRole()) {
  if (trainingMode() && role === reviewRole() && window.BlindAccount?.account) {
    const own = REVIEW_INDEX.marksByReviewer(reviewUid(c), entity, role)
      .find((item) => item.who === window.BlindAccount.account);
    return { ...(own?.value || {}) };
  }
  return REVIEW_INDEX.mark(reviewUid(c), entity, role);
}
function reviewValuesByWho(c, entity, role) {
  return REVIEW_INDEX.marksByReviewer(reviewUid(c), entity, role);
}
function reviewRoleLabel(role) {
  return REVIEW_ROLES.find((item) => item.key === role)?.label || role || "标注员";
}
function recordedAnnotatorName(c, role) {
  return REVIEW_INDEX.annotatorName(reviewUid(c), role);
}
function annotatorIdentity(c, role) {
  const name = recordedAnnotatorName(c, role);
  return `${reviewRoleLabel(role)} · ${name || "未填写姓名"}`;
}
/* 划词标注 (可选): 在 [Stage1 参考素材] 的 prompt 上划选文字, 作为证据的 prompt_spans
   ([{start,end,text}], 偏移是 ref.prompt 字符串里的下标) 随证据一起存。草稿只活在内存里,
   保存证据时写入; 换 case 清空。renderStage1References 画 prompt 并负责高亮/选词,
   renderLocator 的表单负责增删草稿 / 保存, 两者通过 redraw 回调同步。 */
const PROMPT_SPAN = { uid: null, draft: [], active: null, canEdit: false, redraw: null };
function promptSpanChanged() { if (PROMPT_SPAN.redraw) PROMPT_SPAN.redraw(); window.dispatchEvent(new Event("prompt-span-draft")); }
function cleanPromptSpans(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && Number.isInteger(x.start) && Number.isInteger(x.end) && x.end > x.start);
}
function humanEvidence(c) {
  const roles = trainingMode()
    ? trainingVisibleRoles()
    : isAdmin()
    ? ["annotator_1", "annotator_2", "reviewer_3", "admin"]
    : isReviewer() ? ["annotator_1", "annotator_2"] : [reviewRole()];
  const live = REVIEW_INDEX.evidence(reviewUid(c), roles).map((record) => ({
    ...record.evidence, id: record.entity, human: true, who: record.who,
    review_role: window.PAGE_MULTI_REVIEW ? record.review_role : reviewRole(),
  }));
  // 评测页没有自己的复核日志, 人标证据是**烤进数据**的 (c.hev, 来自盲标批的
  // annotations/<scope>.jsonl)。只在本页复核库一条都没有时兜底 —— 有本页复核记录
  // 的页面(标注页/复核页)照旧只认实时的那份, 不会被历史快照盖掉。
  if (live.length) return live;
  return (Array.isArray(c?.hev) ? c.hev : []).map((e) => ({ ...e, human: true }));
}
async function loadReviews(run) {
  try { return { records: await ReviewStorage.read(reviewScope(run)), error: "" }; }
  catch (e) { return { records: [], error: e.message }; }
}

function reviewWho() {
  if (window.BlindAccount?.account) return window.BlindAccount.account;
  try { return new URLSearchParams(location.search).get("who") || localStorage.getItem("site2.reviewer") || ""; }
  catch { return ""; }
}
async function saveReviewRecord(c, record, scope = reviewScope()) {
  if (reviewLocked()) throw new Error("该批任务已经提交封存，不能继续修改");
  const roleFields = window.PAGE_MULTI_REVIEW ? { review_role: reviewRole() } : {};
  const result = { rec: await ReviewStorage.save({ ...record, ...roleFields,
    scope, uid: reviewUid(c), who: reviewWho() || reviewRole() || "anon" }) };
  if (state.run && scope === reviewScope()) {
    REVIEW.records.push(result.rec);
    REVIEW.records.sort((a, b) => a.ts.localeCompare(b.ts));
    REVIEW_INDEX.apply(result.rec);
    REVIEW.error = "";
    window.dispatchEvent(new Event("review-storage"));
  }
  return result.rec;
}
function reviewControls(c, entity = "case") {
  const scope = reviewScope();
  const box = el("span", "review-marks");
  const hint = el("span", "review-status");
  const buttons = [];
  for (const [key, icon, title] of [["accept", "✅", "存在该问题"], ["reject", "❎", "不存在该问题"], ["mild", "⭐️", "判别边界"]]) {
    const b = el("button", "review-mark", icon);
    b.type = "button"; b.title = title; b.setAttribute("aria-label", title);
    const paint = () => {
      const value = reviewValue(c, entity);
      const on = value.verdict === key || (key === "mild" && value.star === true);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
      b.disabled = reviewLocked();
    };
    b.onclick = async (event) => {
      event.stopPropagation();
      buttons.forEach((entry) => entry.b.disabled = true);
      hint.textContent = "保存中…";
      const value = reviewValue(c, entity);
      const on = value.verdict === key || (key === "mild" && value.star === true);
      const patch = { verdict: on ? null : key, star: false };
      try {
        await saveReviewRecord(c, { kind: "mark", entity, patch }, scope);
        hint.textContent = "已保存";
        if (scope === reviewScope()) {
          document.querySelectorAll(".review-marks").forEach((node) => node.dispatchEvent(new Event("reviewpaint")));
          renderCaseList();
        }
      } catch (e) { hint.textContent = "保存失败: " + e.message; }
      finally { buttons.forEach((entry) => entry.b.disabled = false); }
    };
    buttons.push({ b, paint }); box.appendChild(b); paint();
  }
  // 理由框: 三个图标只说得出"对/不对", 说不出**为什么**。写进同一条 mark 记录的
  // patch.note 里, 和 verdict 走同一套"按 ts 合并、取最终态"的读法, 不另开 kind。
  // 失焦或点「保存理由」才保存 —— 每敲一个字发一次请求会把 annotations 文件撑爆。
  // 显式按钮让证据复核员不必猜“移开焦点是否已经落盘”；回车也等价于点保存。
  const note = el("input", "review-note");
  note.type = "text"; note.placeholder = "理由（可选）";
  note.disabled = reviewLocked();
  note.title = "为什么这么判 —— 会和 ✅❎⭐️ 存在同一条记录里";
  const noteSave = el("button", "review-note-save", "保存理由");
  noteSave.type = "button"; noteSave.title = "保存当前理由";
  noteSave.setAttribute("aria-label", "保存理由");
  let lastSaved = "";
  let noteSaving = false;
  const paintNote = () => {
    if (document.activeElement === note) return;      // 正在打字就别覆盖
    note.value = reviewValue(c, entity).note || "";
    lastSaved = note.value;
    noteSave.disabled = true;
  };
  const paintDirty = () => {
    const dirty = note.value.trim() !== lastSaved.trim();
    noteSave.disabled = !dirty;
    noteSave.classList.toggle("dirty", dirty);
    if (dirty) hint.textContent = "理由未保存";
  };
  const saveNote = async () => {
    if (noteSaving) return;
    const v = note.value.trim();
    if (v === lastSaved.trim()) { paintDirty(); return; }       // 没改就不写
    noteSaving = true;
    note.disabled = true; noteSave.disabled = true;
    hint.textContent = "保存中…";
    let saved = false;
    try {
      await saveReviewRecord(c, { kind: "mark", entity, patch: { note: v } }, scope);
      saved = true;
      hint.textContent = "已保存";
      if (scope === reviewScope()) renderCaseList();
    } catch (e) { hint.textContent = "保存失败: " + e.message; }
    finally {
      noteSaving = false;
      note.disabled = false;
      if (saved) {
        lastSaved = v;
        paintDirty();
      } else {
        noteSave.disabled = false;
        noteSave.classList.add("dirty");
      }
    }
  };
  note.oninput = paintDirty;
  note.onkeydown = async (e) => {
    if (e.key === "Enter") { e.preventDefault(); await saveNote(); note.blur(); }
  };
  note.onblur = saveNote;
  note.onclick = (e) => e.stopPropagation();          // 表格行里别触发选中
  // 防止按按钮时 input 先 blur 导致同一理由保存两次。
  noteSave.onmousedown = (e) => e.preventDefault();
  noteSave.onclick = async (e) => { e.stopPropagation(); await saveNote(); };
  box.append(note, noteSave); paintNote();

  box.addEventListener("reviewpaint", () => {
    buttons.forEach((entry) => entry.paint());
    paintNote();
  });
  box.appendChild(hint);
  return box;
}
function videoTagEntity(tag) { return "video_tag:" + tag; }
function videoTagValue(c, tag, role = reviewRole()) {
  return reviewValue(c, videoTagEntity(tag), role);
}
function videoReviewLabels() { return window.PAGE_REVIEW_LABELS || []; }
/* 脏数据 (PAGE_DIRTY_FLAG, 1027 起 multi_camera-1021-account): 整条样本不可用时各角色自己标,
   存成 mark 记录 entity="case_flag:dirty"、verdict="accept"(取消 = null)。
   ★ 不进 video_tag: 命名空间 —— 不会被当成一个 L3 标签进指标 / 导出。
   ★ 谁标了脏数据, 这条对谁就算完成(服务端提交校验 serve.py 同口径)。 */
const DIRTY_ENTITY = "case_flag:dirty";
function dirtyBy(c, role = reviewRole()) {
  return !!window.PAGE_DIRTY_FLAG && reviewValue(c, DIRTY_ENTITY, role).verdict === "accept";
}
function dirtyAny(c) {
  return ["annotator_1", "annotator_2", "reviewer_3", "admin"].some((role) => dirtyBy(c, role));
}
/* 评测员终审分桶 (PAGE_FINAL_BUCKETS, 1028 起 multi_camera-1021-account): 只看 admin 槽位的最终值。
   脏数据 > excludeTag(如 时长不一致) > 可用; 可用再按其余 L3 拆 正样本(任一 ✅) / 负样本(全 ❎)。
   未终审完的不进任何桶。只给超管列表筛选用, 不改指标口径。 */
function finalBucket(c) {
  const exclude = window.PAGE_FINAL_BUCKETS?.excludeTag;
  if (dirtyBy(c, "admin")) return "dirty";
  if (exclude && videoTagValue(c, exclude, "admin").verdict === "accept") return "excluded";
  const verdicts = videoReviewLabels().filter((tag) => tag !== exclude)
    .map((tag) => videoTagValue(c, tag, "admin").verdict);
  if (verdicts.includes("accept")) return "pos";
  if (verdicts.length && verdicts.every((v) => v === "reject")) return "neg";
  return null;
}
function finalBucketOpts(rs) {
  const n = { dirty: 0, excluded: 0, pos: 0, neg: 0 };
  rs.forEach((r) => { const b = finalBucket(r); if (b) n[b] += 1; });
  return [["fb_dirty", `脏数据 ${n.dirty}`],
    ["fb_excluded", `${window.PAGE_FINAL_BUCKETS.excludeTag} ${n.excluded}`],
    ["fb_usable", `可用数据 ${n.pos + n.neg}`],
    ["fb_pos", `正样本 ${n.pos}`], ["fb_neg", `负样本 ${n.neg}`]];
}
function videoReviewProgress(c, role = reviewRole()) {
  if (dirtyBy(c, role)) return videoReviewLabels().length;
  return videoReviewLabels().filter((tag) => videoTagValue(c, tag, role).verdict).length;
}
function videoTagConflict(c, tag) {
  const left = videoTagValue(c, tag, "annotator_1").verdict;
  const right = videoTagValue(c, tag, "annotator_2").verdict;
  return left && right && left !== right ? { left, right } : null;
}
function videoConflicts(c) {
  return videoReviewLabels().filter((tag) => videoTagConflict(c, tag));
}
function adjudicationDone(c) {
  const conflicts = videoConflicts(c);
  if (conflicts.length > 0 && dirtyBy(c, "reviewer_3")) return true;
  return conflicts.length > 0 && conflicts.every((tag) => videoTagValue(c, tag, "reviewer_3").verdict);
}
function adminReviewDone(c) {
  if (severityRelabel()) return !!videoSeverity(c);
  return dirtyBy(c, "admin") || videoReviewLabels().every((tag) => videoTagValue(c, tag, "admin").verdict);
}
function currentFinalDone(c) {
  return isAdmin() ? adminReviewDone(c) : adjudicationDone(c);
}
const VIDEO_VERDICTS = [
  ["accept", "✅", "存在该问题"],
  ["reject", "❎", "不存在该问题"],
  ["mild", "⭐️", "问题轻微 / 模糊地带"],
];
// PAGE_REVIEW_ALLOW_MILD=false 只对标注 / 复核关掉 ⭐️；评测账号 (admin) 始终可选 ⭐️ (1019)。
function videoVerdicts() {
  return window.PAGE_REVIEW_ALLOW_MILD === false && !isAdmin()
    ? VIDEO_VERDICTS.filter(([value]) => value !== "mild")
    : VIDEO_VERDICTS;
}
function reviewSeverityEnabled() { return window.PAGE_REVIEW_USE_SEVERITY !== false; }
/* 严重度重标页 (PAGE_SEVERITY_RELABEL, 1104 起 collapse-1104-tob-account): 管理员给视频打 0–4、逐条改证据档位。
   视频分存 mark 的 note, 证据分存 evidence 记录本身, 服务端格式不变; 原分烤在 c.orig 里, 只读。 */
const VIDEO_SEVERITY_ENTITY = "video_severity";
function severityRelabel() { return !!window.PAGE_SEVERITY_RELABEL && isAdmin(); }
function videoSeverity(c) { return reviewValue(c, VIDEO_SEVERITY_ENTITY, "admin").note || ""; }
function adminDoneText(c) {
  if (!severityRelabel()) return adminReviewDone(c) ? "已终审" : "待终审";
  return adminReviewDone(c) ? `已打分 S${videoSeverity(c)}` : "待打分";
}
// 「我的样本」严重度筛选: 原 = 1021 最高分 (列表行的 hsev), 现 = 产品打的视频分。没样本的档不出按钮, 正在筛的档除外。
function severityFilterOpts(rs) {
  const opts = [];
  const add = (key, label, count) => { if (count || state.filter === key) opts.push([key, `${label} ${count}`]); };
  for (const lv of [0, 1, 2, 3, 4]) add(`hsev_${lv}`, `原 S${lv}`, rs.filter((r) => r.hsev === lv).length);
  add("hsev_none", "无原结论", rs.filter((r) => r.hsev == null).length);
  for (const lv of ["0", "1", "2", "3", "4"]) add(`vsev_${lv}`, `现 S${lv}`, rs.filter((r) => videoSeverity(r) === lv).length);
  return opts;
}
function videoSeverityRow(c) {
  const row = el("div", "video-review-row");
  row.appendChild(el("span", "video-review-tag", "视频严重度"));
  const decision = el("div", "reviewer-decision");
  decision.appendChild(el("span", "video-review-compare", c.orig?.verdict
    ? `1021 原结论 ${c.orig.verdict} · 最高 S${c.orig.maxSev}` : "1021 分歧未复核，无原结论"));
  const box = el("span", "review-marks"), hint = el("span", "review-status");
  const paint = () => box.querySelectorAll(".review-mark").forEach((b) => {
    const on = b.textContent === videoSeverity(c);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
  for (const level of ["0", "1", "2", "3", "4"]) {
    const b = el("button", "review-mark", level);
    b.type = "button"; b.title = level === "0" ? "无崩坏" : `严重度 ${level}`;
    b.onclick = async () => {
      hint.textContent = "保存中…";
      try {
        await saveReviewRecord(c, { kind: "mark", entity: VIDEO_SEVERITY_ENTITY,
          patch: { note: videoSeverity(c) === level ? "" : level } });
        hint.textContent = "已保存"; paint(); renderFilters(); renderCaseList(); renderReviewFilter();
        const pill = $("caseTitle").querySelector(".pill");
        if (pill) pill.textContent = adminDoneText(c);
      } catch (e) { hint.textContent = "保存失败: " + e.message; }
    };
    box.appendChild(b);
  }
  paint(); box.appendChild(hint); decision.appendChild(box); row.appendChild(decision);
  return row;
}
function evidenceSeveritySelect(c, m, scope, onSaved) {
  const label = el("label", "loc-field", "证据严重度");
  const select = el("select"); select.className = "loc-sev";
  for (const level of ["1", "2", "3", "4"]) {
    const o = el("option", null, level); o.value = level; select.appendChild(o);
  }
  select.value = String(m.sev ?? "");
  const hint = el("span", "block-hint", c.orig?.sev?.[m.id] ? `原 S${c.orig.sev[m.id]}` : "");
  select.onchange = async () => {
    const { id, human, who, review_role, ...evidence } = m;
    hint.textContent = "保存中…";
    try {
      await saveReviewRecord(c, { kind: "evidence", entity: id,
        evidence: { ...evidence, sev: Number(select.value) } }, scope);
      onSaved();
    } catch (e) { hint.textContent = "保存失败: " + e.message; }
  };
  label.appendChild(select); label.appendChild(hint);
  return label;
}
function verdictIcon(value) {
  return value === "accept" ? "✅" : value === "reject" ? "❎" : value === "mild" ? "⭐️" : "—";
}
function trainingVoteText(c, tag, role, label) {
  const votes = reviewValuesByWho(c, videoTagEntity(tag), role)
    .filter((item) => item.value.verdict)
    .map((item) => `${item.who} ${verdictIcon(item.value.verdict)}`);
  return `${label} ${votes.length ? votes.join(" · ") : "—"}`;
}
function videoVerdictButtons(c, tag, role, disabled = false) {
  const controls = el("span", "video-verdict-buttons");
  const hint = el("span", "review-status");
  const buttons = [];
  videoVerdicts().forEach(([value, icon, title]) => {
    const button = el("button", "video-verdict", icon);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", `${tag}：${title}`);
    const paint = () => {
      const on = videoTagValue(c, tag, role).verdict === value;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
      button.disabled = disabled || reviewLocked();
    };
    button.onclick = async () => {
      const current = videoTagValue(c, tag, role).verdict;
      buttons.forEach((item) => { item.button.disabled = true; });
      hint.textContent = "保存中…";
      try {
        await saveReviewRecord(c, { kind: "mark", entity: videoTagEntity(tag),
          patch: { verdict: current === value ? null : value } });
        hint.textContent = "已保存";
        buttons.forEach((item) => item.paint());
        renderCaseList();
        renderReviewFilter();
      } catch (error) { hint.textContent = "保存失败: " + error.message; }
      finally { buttons.forEach((item) => item.paint()); }
    };
    buttons.push({ button, paint });
    controls.appendChild(button);
    paint();
  });
  controls.appendChild(hint);
  return controls;
}
function renderVideoReviewBar(c, root) {
  const panel = el("section", "video-review-panel block");
  const head = el("div", "video-review-head");
  const role = REVIEW_ROLES.find((item) => item.key === reviewRole());
  head.appendChild(el("strong", null, severityRelabel() ? "严重度重标" : trainingMode()
    ? (isAdmin() ? "视频级并行评测" : isReviewer() ? "视频级并行复核" : "视频级培训标注")
    : isAdmin() ? "视频级最终评审" : isReviewer() ? "视频级冲突复核" : "视频级标注"));
  head.appendChild(el("span", "video-review-role", role?.label || "标注"));
  head.appendChild(el("span", "block-hint", severityRelabel()
    ? "视频打 0–4 分（0 = 无崩坏），证据严重度在下方逐条改" : trainingMode()
    ? (isAdmin() ? "培训互见模式：标注、复核、评测同时进行，所有已保存答案均可查看"
      : "培训互见模式：可查看标注与复核的已保存答案（评测答案不对标注账号开放）")
    : isAdmin()
    ? "评审全部视频标签，可查看双标与复核结果"
    : isReviewer() ? "只复核两位标注员不一致的视频标签"
    : (window.PAGE_REVIEW_ALLOW_MILD === false
      ? "✅ 有问题 · ❎ 无问题"
      : "✅ 有问题 · ❎ 无问题 · ⭐️ 轻微 / 模糊")));
  if (!severityRelabel() && (isAdjudicator() || trainingMode())) {
    const identities = el("span", "reviewer-identities");
    for (const roleKey of ["annotator_1", "annotator_2"]) {
      const identity = el("button", `annotator-identity ${roleKey.replace("_", "-")}`,
        annotatorIdentity(c, roleKey));
      identity.type = "button";
      identity.title = `${reviewRoleLabel(roleKey)}的人标证据使用相同颜色显示`;
      identities.appendChild(identity);
    }
    head.appendChild(identities);
  }
  panel.appendChild(head);

  if (severityRelabel()) panel.appendChild(videoSeverityRow(c));
  else videoReviewLabels().forEach((tag) => {
    const row = el("div", "video-review-row");
    row.appendChild(el("span", "video-review-tag", tag));
    if (!isAdjudicator() && !trainingMode()) {
      row.appendChild(videoVerdictButtons(c, tag, reviewRole()));
    } else {
      const decision = el("div", "reviewer-decision");
      const compare = el("span", "video-review-compare");
      const left = videoTagValue(c, tag, "annotator_1").verdict;
      const right = videoTagValue(c, tag, "annotator_2").verdict;
      if (trainingMode()) {
        compare.appendChild(el("span", "reviewer-vote annotator-1",
          trainingVoteText(c, tag, "annotator_1", "标注")));
        compare.appendChild(el("span", "reviewer-vote annotator-2",
          trainingVoteText(c, tag, "annotator_2", "标注")));
        compare.appendChild(el("span", "reviewer-vote reviewer-3",
          trainingVoteText(c, tag, "reviewer_3", "复核")));
        if (isAdmin()) compare.appendChild(el("span", "reviewer-vote admin",
          trainingVoteText(c, tag, "admin", "评测")));
      } else {
        // Full account mapping is shown once in the header. Repeating long account
        // ids on every tag makes the final-review panel unnecessarily tall.
        compare.appendChild(el("span", "reviewer-vote annotator-1", `标1 ${verdictIcon(left)}`));
        compare.appendChild(el("span", "reviewer-vote annotator-2", `标2 ${verdictIcon(right)}`));
      }
      if (isAdmin() && !trainingMode()) {
        const reviewed = reviewValuesByWho(c, videoTagEntity(tag), "reviewer_3")
          .filter((item) => item.value.verdict)
          .map((item) => verdictIcon(item.value.verdict));
        compare.appendChild(el("span", "reviewer-vote reviewer-3",
          `复核员 ${reviewed.length ? reviewed.join(" · ") : "—"}`));
      }
      decision.appendChild(compare);
      const conflict = videoTagConflict(c, tag);
      if (trainingMode()) decision.appendChild(videoVerdictButtons(c, tag, reviewRole()));
      else if (isAdmin()) decision.appendChild(videoVerdictButtons(c, tag, "admin"));
      else if (conflict) decision.appendChild(videoVerdictButtons(c, tag, "reviewer_3"));
      else decision.appendChild(el("span", left && right ? "review-agree" : "review-wait",
        left && right ? "一致，无需复核" : "等待两位标注员完成"));
      row.appendChild(decision);
    }
    panel.appendChild(row);
  });
  if (window.PAGE_DIRTY_FLAG) panel.appendChild(dirtyRow(c));

  const footer = el("div", "video-review-footer");
  const who = el("input", "review-who");
  who.placeholder = "姓名（可选）"; who.setAttribute("aria-label", "标注人姓名"); who.value = reviewWho();
  who.oninput = () => { try { localStorage.setItem("site2.reviewer", who.value.trim()); } catch {} };
  footer.appendChild(who);
  const nav = el("span", "review-case-nav");
  for (const [label, delta] of [["← 上一条", -1], ["下一条 →", 1]]) {
    const button = el("button", "vfilter", label);
    button.onclick = () => {
      const rows = visibleRows(), index = rows.indexOf(state.row);
      const target = index < 0 ? rows[0] : rows[index + delta];
      if (target) selectRow(target);
    };
    nav.appendChild(button);
  }
  footer.appendChild(nav); panel.appendChild(footer); root.appendChild(panel);
}
// 「脏数据」一行: 每个角色标自己的; 复核 / 评测顺带看两位标注员各自标没标
function dirtyRow(c) {
  const row = el("div", "video-review-row dirty-row");
  row.appendChild(el("span", "video-review-tag", "脏数据（整条样本不可用）"));
  const box = el("span", "video-verdict-buttons");
  if (isAdjudicator() || trainingMode()) {
    for (const [role, label] of [["annotator_1", "标1"], ["annotator_2", "标2"]]) {
      box.appendChild(el("span", `reviewer-vote ${role.replace("_", "-")}`,
        `${label} ${dirtyBy(c, role) ? "🗑" : "—"}`));
    }
  }
  const own = reviewRole();
  const button = el("button", "video-verdict dirty-toggle");
  button.type = "button";
  const hint = el("span", "review-status");
  const paint = () => {
    const on = dirtyBy(c, own);
    button.classList.toggle("on", on);
    button.textContent = on ? "🗑 已记为脏数据 · 再点取消" : "🗑 记为脏数据";
    button.setAttribute("aria-pressed", String(on));
    button.disabled = reviewLocked();
  };
  button.onclick = async () => {
    const on = dirtyBy(c, own);
    button.disabled = true;
    hint.textContent = "保存中…";
    try {
      await saveReviewRecord(c, { kind: "mark", entity: DIRTY_ENTITY, patch: { verdict: on ? null : "accept" } });
      hint.textContent = "已保存";
      renderCaseList();
      renderReviewFilter();
    } catch (error) { hint.textContent = "保存失败: " + error.message; }
    finally { paint(); }
  };
  paint();
  box.append(button, hint);
  row.appendChild(box);
  return row;
}
function renderReviewBar(c, root) {
  if (window.PAGE_MULTI_REVIEW) { renderVideoReviewBar(c, root); return; }
  const bar = el("div", "review-bar block");
  bar.append(el("strong", null, "Case 标记"), reviewControls(c));
  const who = el("input", "review-who");
  who.placeholder = "标注员（可选）"; who.setAttribute("aria-label", "标注员"); who.value = reviewWho();
  who.oninput = () => { try { localStorage.setItem("site2.reviewer", who.value.trim()); } catch {} };
  bar.appendChild(who);
  const nav = el("span", "review-case-nav");
  for (const [label, delta] of [["← 上一条", -1], ["下一条 →", 1]]) {
    const b = el("button", "vfilter", label);
    b.onclick = () => {
      const rows = visibleRows(), i = rows.indexOf(state.row);
      const target = i < 0 ? rows[0] : rows[i + delta];
      if (target) selectRow(target);
    };
    nav.appendChild(b);
  }
  bar.appendChild(nav);
  root.appendChild(bar);
}
function renderReviewFilter() {
  let box = $("reviewFilters");
  if (!box) {
    box = el("div", "review-filters"); box.id = "reviewFilters";
    const search = $("caseSearch");
    if (search) search.insertAdjacentElement("afterend", box);
    else $("caseList").insertAdjacentElement("beforebegin", box);
  }
  box.replaceChildren();
  if (window.PAGE_MULTI_REVIEW) {
    const labels = videoReviewLabels().length;
    const dirtyOpt = window.PAGE_DIRTY_FLAG ? [["dirty", "🗑 脏数据"]] : [];
    if (isAdjudicator()) {
      if (trainingMode() && isReviewer()) {
        const resolved = state.rows.filter((row) => videoReviewProgress(row, "reviewer_3") === labels);
        box.appendChild(el("span", "block-hint",
          `并行复核 ${state.rows.length} 条 · 已完成 ${resolved.length}`));
        for (const [value, label] of [["all", "全部样本"], ["pending", "待复核"], ["resolved", "已复核"], ...dirtyOpt]) {
          const button = el("button", "vfilter" + (REVIEW.filter === value ? " on" : ""), label);
          button.onclick = () => { REVIEW.filter = value; renderCaseList();
            if (!visibleRows().includes(state.row)) selectRow(visibleRows()[0] || null); };
          box.appendChild(button);
        }
        return;
      }
      const conflicts = state.rows.filter((row) => videoConflicts(row).length);
      const scopeRows = isAdmin() ? state.rows : conflicts;
      const resolved = scopeRows.filter(currentFinalDone);
      box.appendChild(el("span", "block-hint", severityRelabel()
        ? `全量 ${state.rows.length} · 已打分 ${resolved.length}`
        : isAdmin()
        ? `全量 ${state.rows.length} · 冲突 ${conflicts.length} · 已终审 ${resolved.length}`
        : `冲突 ${conflicts.length} · 已复核 ${resolved.length}`));
      const options = severityRelabel()
        ? [["all", "全部样本"], ["pending", "待打分"], ["resolved", "已打分"]]
        : isAdmin()
        ? [["all", "全部样本"], ["conflict", "全部冲突"], ["pending", "待终审"], ["resolved", "已终审"]]
        : [["conflict", "全部冲突"], ["pending", "待复核"], ["resolved", "已复核"], ["all", "全部样本"]];
      for (const [value, label] of [...options, ...dirtyOpt]) {
        const button = el("button", "vfilter" + (REVIEW.filter === value ? " on" : ""), label);
        button.onclick = () => { REVIEW.filter = value; renderCaseList();
          if (!visibleRows().includes(state.row)) selectRow(visibleRows()[0] || null); };
        box.appendChild(button);
      }
    } else {
      const done = state.rows.filter((row) => videoReviewProgress(row) === labels).length;
      box.appendChild(el("span", "block-hint", `已完成 ${done} / ${state.rows.length}`));
      for (const [value, label] of [["all", "全部"], ["pending", "待标注"], ["resolved", "已完成"], ...dirtyOpt]) {
        const button = el("button", "vfilter" + (REVIEW.filter === value ? " on" : ""), label);
        button.onclick = () => { REVIEW.filter = value; renderCaseList();
          if (!visibleRows().includes(state.row)) selectRow(visibleRows()[0] || null); };
        box.appendChild(button);
      }
    }
    return;
  }
  const reviewed = state.rows.filter((r) => reviewValue(r).verdict).length;
  box.appendChild(el("span", "block-hint", `已复核 ${reviewed} / ${state.rows.length}`));
  for (const [value, label] of [["all", "全部"], ["pending", "待复核"], ["accept", "✅"], ["reject", "❎"], ["star", "⭐️"]]) {
    const b = el("button", "vfilter" + (REVIEW.filter === value ? " on" : ""), label);
    b.onclick = () => {
      REVIEW.filter = value; renderCaseList();
      if (!visibleRows().includes(state.row)) selectRow(visibleRows()[0] || null);
    };
    box.appendChild(b);
  }
}

async function selectRun(g) {
  if (!g) return;
  g = pinnedRedirect(g);
  if (!g) return;
  if (LOC.cleanup) LOC.cleanup();
  // 换模型时记住当前看的是哪一条。no 是这条数据在集里的身份, 与模型无关 ——
  // 同一个集换模型能停在原地, 才比得了"同一条数据在不同模型下判成什么样"。
  // 换了集就没有可比性 (no 指向的是另一条数据), 老老实实回第一条。
  const prev = state.run;
  const sameSet = prev && state.row &&
                  prev.dim === g.dim && prev.dataset.key === g.dataset.key;
  const keepNo = sameSet ? state.row.no : null;
  const keepFrame = sameSet ? state.frame : 0;
  state.run = g;
  state.filter = "all";
  state.shown = PAGE;
  state.row = null;
  state.case = null;
  // L3 切片按下标存, 换 run 一律回到 L2 总体。不同 run 的 tags 顺序理论上一致,
  // 但沿用下标是在赌它 —— 赌输了就是"看着是 A 标签、其实筛的是 B 标签"。
  state.l3 = null;
  renderNav();
  renderVariantTabs(g);
  renderModelTabs(g);
  location.hash = "#" + encodeURIComponent(g.key);

  $("runTitle").textContent = `${g.dim} · ${dsTitle(g.dataset)}`;
  $("runSub").textContent = g.model.fullLabel || g.model.label;
  renderModelTags(g);
  renderPinDs(g);
  renderLenient();
  $("dimBadge").textContent =
    `${g.nCases} 条 ${g.dataset.ratio || ""}`.trim();
  $("dimBadge").className = "mode-badge " + (g.dataset.key === "同源" ? "t2v" : "i2v");

  renderCM(g);
  renderFacts(g);

  $("caseList").innerHTML = "";
  $("caseCount").textContent = "加载中…";
  let rows, reviews;
  if (window.BlindAccount) {
    rows = await loadList(g.key);
    const assigned = await window.BlindAccount.assign(reviewScope(g), rows);
    REVIEW.role = assigned.role;
    if (assigned.role === "admin") {
      // 首次 renderCM 发生在服务端分配角色之前；拿到账号权限后必须重画。
      renderCM(g);
      state.showMachineEvidence = true;
      const machineButton = $("machineEvidenceToggle");
      if (machineButton) {
        machineButton.classList.add("on");
        machineButton.setAttribute("aria-pressed", "true");
        machineButton.title = "点击隐藏机标证据";
      }
    }
    const allowed = new Set(assigned.uids);
    rows = rows.filter(row => allowed.has(String(row.uid || row.no)));
    reviews = await loadReviews(g);
  } else {
    [rows, reviews] = await Promise.all([loadList(g.key), loadReviews(g)]);
  }
  if (state.run !== g) return;
  state.rows = rows;
  Object.assign(REVIEW, reviews, { filter: isReviewer() && !trainingMode() ? "conflict" : "all" });
  REVIEW_INDEX.reset(REVIEW.records);
  // 容错开着时混淆矩阵是**按行重算**的, 而行要等 loadList 回来才有 —— 上面那次
  // renderCM 拿不到行, 只能先画服务端的原始指标, 这里补一次才是容错后的数。
  // L3 表同理: 首屏用的是 metrics.by_tag, 行到了之后才换成按行现算的数。
  if (state.lenient || tagsOf(g).length) renderCM(g);
  renderLenient();      // 救回条数要等行加载完才准
  renderFilters();
  let pick = null;
  if (keepNo != null) {
    const vis = visibleRows();
    const at = vis.findIndex((r) => r.no === keepNo);
    if (at >= 0) {
      pick = vis[at];
      // 列表一次只渲染 PAGE 条, 目标在窗口外就先把窗口撑到它, 否则点不亮也滚不到
      while (state.shown <= at) state.shown += PAGE;
    }
  }
  renderCaseList();
  if (pick) state.frame = keepFrame;
  await selectRow(pick || visibleRows()[0] || null, !!pick);
  if (pick) {
    requestAnimationFrame(() =>
      $("caseList").querySelector(".case-item.on")
        ?.scrollIntoView({ block: "nearest" }));
  }
}

/* ── L3 面板 ─────────────────────────────────────────────────────────────────
   只在多标签维度出现 (metrics.tags 非空)。两部分:
     ① 一排 chip: [L2 总体] + 8 个叶子, 点一下整页切到那个 L3 的二分类
        —— 混淆矩阵、Precision/Recall/F1、case 列表、四格筛选全部跟着换。
     ② 一张全表: 8 个叶子的正例数 / TP / FP / FN / P / R / F1 一屏看完,
        不用挨个点过去。行也可以点, 和 chip 等价。

   指标来源分两种, **不能只用一种**:
     · 行已加载 -> 按行现算 (这样和格式容错、和 case 列表看到的数一定自洽)
     · 行没加载 -> 用服务端的 metrics.by_tag (首屏就有数, 不用等)
   n_pos = 0 的叶子(这个集里一条正例都没有)显示 n/a 并置灰 —— 显示 0.000 会
   被读成"模型一条都没召回", 而真相是集里根本没这个样本。 */
function l3Stats(g, i) {
  const t = tagsOf(g)[i];
  if (!t) return null;
  if (state.rows && state.rows.length && Array.isArray(state.rows[0].gt)) {
    const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
    state.rows.forEach((r) => {
      if (effPred(r) == null) return;             // 未解析不进四格
      const gg = Array.isArray(r.gt) && r.gt.includes(i) ? 1 : 0;
      const pp = Array.isArray(r.pt) && r.pt.includes(i) ? 1 : 0;
      c[pp ? (gg ? "tp" : "fp") : (gg ? "fn" : "tn")]++;
    });
    const tpr = (c.tp + c.fn) ? c.tp / (c.tp + c.fn) : null;
    const prec = (c.tp + c.fp) ? c.tp / (c.tp + c.fp) : null;
    const f1 = (prec && tpr) ? (2 * prec * tpr) / (prec + tpr) : null;
    return { ...c, n_pos: c.tp + c.fn, tpr_recall: tpr, precision: prec, f1 };
  }
  const b = ((g.metrics && g.metrics.by_tag) || {})[t];
  return b ? { ...b, precision: b.precision_balanced ?? b.precision,
               f1: b.f1_balanced ?? b.f1 } : null;
}

function setL3(g, i) {
  state.l3 = (state.l3 === i) ? null : i;
  state.filter = "all";
  state.shown = PAGE;
  renderCM(g);
  renderFilters();
  renderCaseList();
  const vis = visibleRows();
  if (!vis.includes(state.row)) selectRow(vis[0] || null);
}

/* 人标严重度切片: 按**人工终判的最高严重度** 0-4 分档, 看机标在每一档上的表现。
   和 L3 切片正交 —— L3 切的是"崩坏的种类", 这一栏切的是"崩坏的程度"。
   数据来自盲标批烤进去的 hsev, 老 run 没这个字段, 整栏不渲染。

   ★ 一档之内 precision 没有信息量, 别照着 P 读: hsev>=1 的档 gold 全是 1,
   FP 恒为 0、P 恒为 1; hsev=0 那档 gold 全是 0, 根本没有 TP。
   真正有信息的是两件事, 所以表里给的就是这两件:
     1. 逐档召回 —— 漏检到底集中在轻微档还是明显档;
     2. 每档占"机标判是"的比例 —— 这就是 precision 的拆解 (sev0 那行即误报率)。 */
function renderHumanSev(g, box) {
  const rs = state.rows;
  if (!rs || !rs.some((r) => r.hsev != null)) return;
  const bands = [0, 1, 2, 3, 4].map((lv) => {
    const rows = rs.filter((r) => r.hsev === lv);
    const yes = rows.filter((r) => effPred(r) === 1).length;
    return { lv, n: rows.length, yes, no: rows.length - yes };
  }).filter((b) => b.n);
  if (!bands.length) return;

  const tot = bands.reduce((a, b) => ({ n: a.n + b.n, yes: a.yes + b.yes, no: a.no + b.no }),
                           { n: 0, yes: 0, no: 0 });
  const pos = bands.filter((b) => b.lv > 0).reduce((a, b) => ({ n: a.n + b.n, yes: a.yes + b.yes }),
                                                   { n: 0, yes: 0 });
  const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : "—");

  const wrap = el("div", "l3 hsev");
  const head = el("div", "l3-head");
  head.appendChild(el("span", "l3-title", "人标严重度切片"));
  head.appendChild(el("span", "l3-note",
    "按人工终判的最高严重度分档 (0 = 人工判不崩坏)。点一行筛出该档的 case。"
    + "口径是 L2「有没有崩坏」, 不随上面的 L3 切片变。"));
  wrap.appendChild(head);

  const tb = el("table", "l3-table");
  const hr = el("tr");
  ["人标 sev", "条数", "机标判是", "机标判否", "召回 R", "占机标判是"].forEach((h, i) => {
    hr.appendChild(el("th", i ? "num" : null, h));
  });
  tb.appendChild(hr);

  bands.forEach((b) => {
    const key = `hsev_${b.lv}`;
    const tr = el("tr", "l3-row" + (state.filter === key ? " on" : ""));
    tr.appendChild(el("td", null, b.lv === 0 ? "0 · 人工判不崩坏" : String(b.lv)));
    [b.n, b.yes, b.no].forEach((x) => tr.appendChild(el("td", "num", String(x))));
    // sev0 这行没有召回可言 (全是负例), 给的是误报率 —— 写 n/a 等于把唯一有用的数藏了
    tr.appendChild(el("td", "num",
      b.lv === 0 ? `误报率 ${pct(b.yes, b.n)}` : pct(b.yes, b.n)));
    tr.appendChild(el("td", "num", pct(b.yes, tot.yes)));
    tr.title = b.lv === 0
      ? `人工终判不崩坏的 ${b.n} 条里, 模型判是 ${b.yes} 条 (误报)`
      : `人工终判崩坏且最高严重度 ${b.lv} 的 ${b.n} 条里, 模型召回 ${b.yes} 条`;
    tr.onclick = () => {
      state.filter = (state.filter === key) ? "all" : key;
      state.shown = PAGE;
      renderCM(g);
      renderFilters();
      renderCaseList();
      const vis = visibleRows();
      if (!vis.includes(state.row)) selectRow(vis[0] || null);
    };
    tb.appendChild(tr);
  });

  const sum = el("tr", "l3-row sum");
  sum.appendChild(el("td", null, "合计"));
  [tot.n, tot.yes, tot.no].forEach((x) => sum.appendChild(el("td", "num", String(x))));
  sum.appendChild(el("td", "num", pct(pos.yes, pos.n)));
  sum.appendChild(el("td", "num", "100%"));
  tb.appendChild(sum);
  wrap.appendChild(tb);

  const fp0 = bands.find((b) => b.lv === 0);
  wrap.appendChild(el("p", "l3-foot",
    `精度拆解: 机标判是的 ${tot.yes} 条里, ${fp0 ? fp0.yes : 0} 条人工判不崩坏 (误报), `
    + `其余 ${tot.yes - (fp0 ? fp0.yes : 0)} 条命中 —— precision ${pct(tot.yes - (fp0 ? fp0.yes : 0), tot.yes)}。`
    + `召回拆解: 人工判崩坏的 ${pos.n} 条里召回 ${pos.yes} 条 —— recall ${pct(pos.yes, pos.n)}。`));
  box.appendChild(wrap);
}

function renderL3(g, box) {
  const tags = tagsOf(g);
  if (!tags.length) return;
  const wrap = el("div", "l3");

  const head = el("div", "l3-head");
  head.appendChild(el("span", "l3-title", "L3 维度切片"));
  head.appendChild(el("span", "l3-note",
    state.l3 == null
      ? "点标签切到该 L3 的二分类 —— 上面的混淆矩阵和下面的 case 列表都会跟着换"
      : `当前只看「${tags[state.l3]}」· 再点一次回到 L2 总体`));
  wrap.appendChild(head);

  const chips = el("div", "l3-chips");
  const mk = (label, on, onclick, cls) => {
    const b = el("button", "l3-chip" + (on ? " on" : "") + (cls ? " " + cls : ""),
                label);
    b.onclick = onclick;
    return b;
  };
  chips.appendChild(mk("L2 总体", state.l3 == null,
                       () => { if (state.l3 != null) setL3(g, state.l3); }, "l2"));
  tags.forEach((t, i) => {
    const s = l3Stats(g, i) || {};
    const none = !s.n_pos;
    chips.appendChild(mk(
      `${t}${none ? "" : ` · F1 ${s.f1 == null ? "n/a" : s.f1.toFixed(2)}`}`,
      state.l3 === i, () => setL3(g, i), none ? "empty" : ""));
  });
  wrap.appendChild(chips);

  const tb = el("table", "l3-table");
  const hr = el("tr");
  ["L3 标签", "正例", "TP", "FP", "FN", "P", "R", "F1"].forEach((h, i) => {
    const th = el("th", i ? "num" : null, h);
    hr.appendChild(th);
  });
  tb.appendChild(hr);
  const f3 = (x) => (x == null ? "n/a" : x.toFixed(3));
  tags.forEach((t, i) => {
    const s = l3Stats(g, i);
    const tr = el("tr", "l3-row" + (state.l3 === i ? " on" : "")
                        + (s && s.n_pos ? "" : " empty"));
    tr.appendChild(el("td", null, t));
    [s ? s.n_pos : 0, s ? s.tp : 0, s ? s.fp : 0, s ? s.fn : 0].forEach((x) =>
      tr.appendChild(el("td", "num", String(x ?? 0))));
    [s && s.precision, s && s.tpr_recall, s && s.f1].forEach((x) =>
      tr.appendChild(el("td", "num", f3(x == null ? null : x))));
    tr.onclick = () => setL3(g, i);
    tb.appendChild(tr);
  });
  wrap.appendChild(tb);

  const mm = g.metrics || {};
  if (mm.l3_macro_f1 != null) {
    wrap.appendChild(el("p", "l3-foot",
      `宏平均 F1 ${mm.l3_macro_f1.toFixed(3)} · 宏平均 Recall `
      + `${(mm.l3_macro_recall ?? 0).toFixed(3)} `
      + `(只按 ${mm.l3_n_usable_tags} 个**集里有正例**的标签算 —— `
      + `把没样本的标签算进去等于用一堆空值拉低平均)`));
  }
  // 归因: L2 判对但标签归错的那部分。8 个 L3 的定义本身重叠(穿模同时写在
  // 「不符合物理规律」和「主体间交互」里), 归错时 per-L3 是一个 FN + 一个 FP
  // 的双重惩罚, 但模型其实**看见了那个问题** —— 不单独看这个数, 会把分类学的
  // 模糊算到模型头上, 然后照着错误的方向改 rubric。
  if (mm.attribution_rate != null) {
    const ok = mm.attribution_ok, miss = mm.attribution_miss;
    const p = el("p", "l3-foot",
      `归因准确率 ${mm.attribution_rate.toFixed(3)} —— L2 判对的 ${ok + miss} 条里, `
      + `标签对上 ${ok} 条 / 全错 ${miss} 条 (找对了问题但归错了标签)`);
    const conf = mm.tag_confusion || {};
    const top = Object.entries(conf).slice(0, 5);
    if (top.length) {
      p.title = "最常见的错归 (gold -> pred):\n"
        + top.map(([k, v]) => `${v}  ${k}`).join("\n");
      p.appendChild(el("span", null,
        "　最常错归: " + top.map(([k, v]) => `${k} ×${v}`).join(" · ")));
    }
    wrap.appendChild(p);
  }
  box.appendChild(wrap);
}

function renderCM(g) {
  // 容错开着时按行重算, 否则用服务端算好的 (见 liveMetrics)
  const m = liveMetrics(g);
  $("cmHint").textContent = (m.metrics_scope === "complete_video_subset" ? `总数 ${m.n_total} · 有效 ${m.n} · 未知 ${m.unparsed}` : `n=${m.n_total ?? m.n}`) + (state.lenient && nRecovered() ? ` · 容错救回 ${nRecovered()}` : "");
  const box = $("cmBox");
  box.innerHTML = "";

  if (window.PAGE_BLIND_LABELING && (!teachEngineView() || window.BlindAccount?.isSuperadmin)) {
    if (window.BlindAccount?.isSuperadmin) {
      window.BlindAccount.renderAdminQualityMatrix();
    } else {
      $("cmHint").textContent = `${g.nCases} 条`;
      box.appendChild(el("p", "ratio-note",
        window.BlindAccount?.isGod
          ? "仅超级管理员可查看人标质检混淆矩阵。"
          : "盲标模式：标注员和复核员不展示样本正负、模型预测分布或混淆矩阵。"));
    }
    return;
  }

  if (m.labeled === false || g.dataset.unlabeled) {
    const r = el("div", "rate-row");
    const add = (k, val) => {
      const s = el("span");
      s.appendChild(el("b", null, `${k} ${val}`));
      r.appendChild(s);
    };
    add("判是", m.pred_pos ?? 0);
    add("判否", m.pred_neg ?? 0);
    add("未解析", m.unparsed ?? 0);
    box.appendChild(r);
    box.appendChild(el("p", "ratio-note",
      "本评测集没有 gold：这里只展示预测分布、response、grounding 与 workflow，" +
      "precision / recall / F1 不存在，不能把判是或判否当成 TP/FP/FN/TN。"));
    return;
  }

  const cm = el("div", "cm");
  cm.appendChild(el("div", "cm-h", ""));
  cm.appendChild(el("div", "cm-h", "判是"));
  cm.appendChild(el("div", "cm-h", "判否"));
  [["真是", "tp", "fn"], ["真否", "fp", "tn"]].forEach(([lab, a, b]) => {
    cm.appendChild(el("div", "cm-h", lab));
    [a, b].forEach((k) => {
      const d = el("div", `cm-cell ${k}` + (state.filter === k ? " on" : ""));
      d.appendChild(el("span", "cm-n", String(m[k] ?? 0)));
      d.appendChild(el("span", "cm-lab", CELL[k].label));
      d.onclick = () => {
        state.filter = state.filter === k ? "all" : k;
        state.shown = PAGE;
        renderCM(g);
        renderFilters();
        renderCaseList();
        const vis = visibleRows();
        if (!vis.includes(state.row)) selectRow(vis[0] || null);
      };
      cm.appendChild(d);
    });
  });
  box.appendChild(cm);

  renderL3(g, box);
  renderHumanSev(g, box);

  const v = prf(m);
  const r = el("div", "rate-row");
  const add = (k, val, hint) => {
    const s = el("span");
    s.appendChild(el("b", null, `${k} ${val}`));
    if (hint) s.title = hint;
    r.appendChild(s);
  };
  add("Precision", pct(v.p), "判是的里面真有问题的比例 = TP/(TP+FP)");
  add("Recall", pct(v.r), "真有问题的里面判对的比例 = TP/(TP+FN)");
  add("F1", v.f1.toFixed(3), "precision 和 recall 的调和平均");
  box.appendChild(r);
  if (m.metrics_scope === "complete_video_subset") {
    box.appendChild(el("p", "warn-note", `以上 P/R/F1 仅统计完整有效的 ${m.n}/${m.n_total} 条；${m.unparsed} 条未知不计入四格，未提供全 ${m.n_total} 条的实测点估计。`));
  }
  if (m.model_provenance_note) box.appendChild(el("p", "warn-note", m.model_provenance_note));
  if (m.input_comparison_note) box.appendChild(el("p", "warn-note", m.input_comparison_note
    + (m.baseline_route_counts ? " 基线路由计数：" + JSON.stringify(m.baseline_route_counts) : "")));
  if (m.same_subset_comparison) {
    const comparison = m.same_subset_comparison;
    const k = comparison.control;
    const metricText = value => `P ${value.precision == null ? "—" : pct(value.precision)} · R ${value.recall == null ? "—" : pct(value.recall)} · F1 ${typeof value.f1 === "number" ? value.f1.toFixed(3) : "—"}`;
    box.appendChild(el("p", "ratio-note", `相同 ${comparison.n} 条有效视频：${comparison.control_name || "K3"}：${metricText(k)}。`
      + (comparison.candidate ? `${comparison.candidate_name || "当前版本"}：${metricText(comparison.candidate)}。` : "")
      + (comparison.n < 200 ? "这是相同子集比较，不代表全200。" : "这是完整200条上的比较。")));
  }

  if (m.same_backend_subset_comparison) {
    const comparison = m.same_backend_subset_comparison;
    const metricText = value => `P ${value.precision == null ? "—" : pct(value.precision)} · R ${value.recall == null ? "—" : pct(value.recall)} · F1 ${typeof value.f1 === "number" ? value.f1.toFixed(3) : "—"}`;
    box.appendChild(el("p", "ratio-note", `明确 TokenHub 的共同完整 ${comparison.n} 条：多图基线 ${metricText(comparison.control)}；原生视频 ${metricText(comparison.candidate)}。此子集不能代表全200。`));
  }

  if (m.three_model_common_subset) {
    const common = m.three_model_common_subset;
    box.appendChild(el("p", "ratio-note", `三者共同 ${common.n} 条完整有效视频（正${common.n_positive}/负${common.n_negative}），阈值3；这是受失败样本选择影响的子集比较，不是全200。`));
    const table = el("table", "ts-table");
    const head = el("tr");
    ["模型", "Precision", "Recall", "F1"].forEach(t => head.appendChild(el("th", "", t)));
    table.appendChild(head);
    Object.entries(common.models).forEach(([key, value]) => {
      const row = el("tr");
      const label = {k3:"K3", gemini:"请求 Gemini3.1（网关混合）", gpt6:"请求 GPT6（网关别名）"}[key] || key;
      [label, pct(value.precision), pct(value.recall), value.f1.toFixed(3)].forEach(t => row.appendChild(el("td", "", t)));
      table.appendChild(row);
    });
    box.appendChild(table);
  }

  if (m.native_model_common_subset) {
    const common = m.native_model_common_subset;
    box.appendChild(el("p", "ratio-note", `原生视频输入：两个模型共同完整的 ${common.n} 条，阈值3。`
      + (common.n < 200 ? "结果受完整样本选择影响，不代表全200。" : "覆盖全部200条。")));
    const table = el("table", "ts-table"), head = el("tr");
    ["模型", "Precision", "Recall", "F1"].forEach(t => head.appendChild(el("th", "", t)));
    table.appendChild(head);
    Object.entries(common.models).forEach(([name, value]) => {
      const row = el("tr");
      [name, value.precision == null ? "—" : pct(value.precision), value.recall == null ? "—" : pct(value.recall), typeof value.f1 === "number" ? value.f1.toFixed(3) : "—"]
        .forEach(t => row.appendChild(el("td", "", t)));
      table.appendChild(row);
    });
    box.appendChild(table);
  }

  renderMismatch(box, m);

  // 换算到线上自然先验的 precision/F1。
  // 为什么必须有这一栏: 上面那个 P/F1 是**这个集的配比下**算出来的, 1-1-512 是人为
  // 配成 π=0.5 的, 在那种集上"多判是"几乎不受惩罚 —— 实测 merge 在 text_unread/1-1-512
  // 上 FPR 0.617 (负例里 62% 误报) 却仍有 0.568 precision, F1 0.669 排第一;
  // 换到线上 π=0.1, 同样的 FPR 让它 precision 塌到 0.128。而 FPR 只有 0.063 的
  // cot-mix 集内 F1 只有 0.327 看着差一半, 线上 precision 反而是它的 2 倍。
  // TPR/FPR 与先验无关, 所以这个换算是合法的, 也是跨集/跨模型唯一能直接比的口径。
  const pi = g.naturalPi;
  if (pi && m.n_pos && m.n_neg && m.metrics_scope !== "complete_video_subset") {
    const tpr = m.tpr_recall, fpr = m.fpr;
    const den = pi * tpr + (1 - pi) * fpr;
    const ppi = den ? (pi * tpr) / den : 0;
    const f1pi = (ppi + tpr) ? (2 * ppi * tpr) / (ppi + tpr) : 0;
    const r2 = el("div", "rate-row rate-row-pi");
    const add2 = (k, val, hint) => {
      const sp = el("span");
      sp.appendChild(el("b", null, `${k} ${val}`));
      if (hint) sp.title = hint;
      r2.appendChild(sp);
    };
    // π 现在可能是**评测集级**的 (GT 复标改了"什么算正例", 同一批天然分布视频
    // 旧标签 π=0.100 / 复标 GT π=0.395)。所以 tooltip 必须说清这个 π 是哪来的,
    // 并且提醒: 换了尺子的两列, 这一栏也不能直接比 —— 分母的定义都不是一回事。
    add2(`Precision@π=${pi}`, pct(ppi),
      `按线上自然先验 π=${pi} (${g.naturalPiSrc || "维度级"}) 换算的 precision。`
      + `富集集上的 precision 是配比造出来的, 这一栏才能跨集/跨模型比 —— `
      + `但只在**同一套标签口径内**成立: GT 复标的那几列 π=0.395, `
      + `旧标签的列 π=0.1, 两边的"正例"不是同一个定义, 别并排比大小。`);
    add2("F1@π", f1pi.toFixed(3), "用 Precision@π 和 recall 重算的 F1");
    add2("FPR", pct(fpr), "负例里被误报的比例 —— 线上负例远多于正例, 它决定误报总量");
    box.appendChild(r2);
  }

  // 富集集上的 precision 依赖正负配比, 跨配比直接比 precision/F1 是错的 ——
  // recall 不受影响 (分母只有正例), 所以换配比时看 recall 才有可比性。
  if (m.n_pos && m.n_neg) {
    box.appendChild(el("p", "ratio-note",
      `正 ${m.n_pos} / 负 ${m.n_neg} (${g.dataset.ratio})。` +
      `precision 和 F1 随配比变 —— 负例越多 FP 越多, precision 越低; ` +
      `recall 只看正例, 换配比仍可比。`));
  }

  // 数据泄漏: 这个模型训练时见过这个评测集里的样本。放在指标正下方, 因为它直接
  // 决定上面那三个数能不能当能力看 —— 见过的样本上考高分是记忆, 不是判断力。
  if (g.leak && g.leak.overlap) {
    const L = g.leak;
    box.appendChild(el("p", "warn-note",
      `⚠ 数据泄漏: 这个模型训练时见过本集 ${L.overlap}/${L.n_with_id} 条 ` +
      `(${(L.frac * 100).toFixed(1)}%)。上面的 precision/recall/F1 有这么多是背下来的, ` +
      `不能当泛化能力读 —— 要看泛化请换 1-1-512 / 1-7-512 / random-512 / nature-200。`));
  }

  if (m.unparsed) {
    const bits = [m.metrics_scope === "complete_video_subset" ? `${m.unparsed} 条推理未完整成功，状态未知，不按负例计分。` : `${m.unparsed} 条抽不到结论, 不计入四格 (分母 ${m.n} < 总数)`];
    if (g.nOOM) {
      bits.push(`其中 ${g.nOOM} 条是服务端 CUDA OOM 挂掉的 —— 那是跑挂了不是模型判错, ` +
                `降并发或调小 mem-frac 重跑这几条。`);
    }
    box.appendChild(el("p", "warn-note", bits.join("; ")));
  }

  // 截断的详细归因。分两件事说, 因为处置完全不同:
  //   重复循环 -> 调大 max_tokens 没用, 要 repetition_penalty
  //   偏向正例 -> 剔除是有偏的, recall 被高估
  const t = g.trunc;
  if (t && t.n) {
    const degenPart = t.nDegen
      ? `其中 ${t.nDegen} 条是**重复循环**(模型把同一段分析反复写到撞上限, ` +
        `实测最长一条 16042 字符而正常输出中位只有 877) —— 这种调大 max_tokens 救不回来, ` +
        `只会烧更多 token 后照样截断, 要靠 repetition_penalty 打断。`
      : "";
    const biasPart = (t.posRate > t.negRate * 1.2)
      ? `而且它**偏向正例**: 正例里 ${(t.posRate * 100).toFixed(1)}% 被截断, ` +
        `负例里只有 ${(t.negRate * 100).toFixed(1)}% —— 属于有偏剔除, ` +
        `上面的 recall ${m.tpr_recall.toFixed(3)} 是高估的; ` +
        `把截断算作漏检的话是 ${t.recallIfFN.toFixed(3)}。`
      : `正负例上的截断比例接近 (正 ${(t.posRate * 100).toFixed(1)}% / ` +
        `负 ${(t.negRate * 100).toFixed(1)}%), 属于随机缺失, 对指标影响不大。`;
    box.appendChild(el("p", "warn-note",
      `${t.n} 条被 max_tokens 截断。${degenPart}${biasPart}`));
  }
}

function renderFacts(g) {
  const ul = $("runFacts");
  ul.innerHTML = "";
  const li = (t) => ul.appendChild(el("li", null, t));

  const mo = g.model;
  if (mo.checkpoint) {
    li(`checkpoint: ${mo.checkpoint}`);
    li(`身份来源: ${mo.recorded ? "metrics.json 记录值" :
        mo.ckptSrc === "confirmed" ? "registry 登记 (已核对服务日志)" :
        "registry 登记 —— 按命名约定推的, 对应服务日志已被覆盖, 没有记录能证实"}`);
  } else {
    li(`checkpoint 未记录: metrics.json 里只有 served name (${mo.served || "?"}), ` +
       "registry 也没登记 —— serve.sh 对同一维度固定同一个 served name, 分不出 checkpoint");
  }
  if (mo.note) li(mo.note);
  if (window.PAGE_EVAL_MODE) {
    const em = evalModeOf(g);
    li(`评测模式: ${em.mode ? `${em.mode} —— ${EVAL_MODES[em.mode] || "未知模式名"}` : "未声明"} (${em.src})`);
  }
  li(`评测集: ${g.dataset.input || g.dataset.label}`);
  if (g.dataset.note) li(g.dataset.note);
  li(`来源分布: ${JSON.stringify(g.srcDist)}`);
  const nP = g.nPreview || 0;
  li(`视频: ${g.nVideo}/${g.nCases} 条有原视频` +
     (nP ? `; 另有 ${nP} 条原视频在未挂载的盘上 (且没有 BS3 URI 可下), ` +
           "看到的是 make_frame_previews.py 用本地输入帧合成的 4fps 预览 —— " +
           "内容就是模型看到的输入, 但只有前 10s" : "") +
     (g.nVideo + nP < g.nCases
       ? `; 还有 ${g.nCases - g.nVideo - nP} 条既没视频也没合成预览, 只能看帧`
       : ""));
  li(`p50 延迟 ${g.metrics.latency_p50_s}s · thinking=${g.metrics.thinking}`);
  li(`产出: ${g.srcPath}`);
  if (g.nEvidence) li(`${g.nEvidence} 条 response 带 <box> 证据, 已画到帧上`);
  li(`分片 ${g.nChunk} 个 × ${g.chunk} 条`);
}

/* --------------------------------------------- think-output mismatch 面板

   为什么要单开一块摆在混淆矩阵旁边:
   混淆矩阵只看 gold vs 最终 pred, 完全看不见 <think> 里模型自己说了什么。
   9B 在偏离训练 schema 的 think 格式下会大面积出现「think 判否 / 最终输出是」——
   实测 r10-t20 上 200 条里 125 条如此, 而这批矛盾条几乎全落在 FP 上。
   只看混淆矩阵时它表现为"召回 0.936 精度 0.390 的跷跷板", 像是判定尺度问题;
   实际上是最终 JSON 和 think 脱钩、无脑输出 1, 召回是虚的。
   所以这个比例必须和 P/R/F1 并排显示 —— 它是这一列指标可不可信的前置条件。

   分母取 determined (match + M1 + M2), 不是 n: 非 think 输出、think JSON 抽不出来的
   条目归 undet, 既不算一致也不算矛盾, 计进分母会把比例稀释成看不出问题。
*/
function renderMismatch(box, m) {
  const rs = state.rows;
  let match, m1, m2, undet;
  if (rs && rs.length && rs.some((r) => r.mm)) {
    const n = (k) => rs.filter((r) => r.mm === k).length;
    match = n("match"); m1 = n("M1"); m2 = n("M2"); undet = n("undet");
  } else {
    match = m.mm_match ?? 0; m1 = m.mm_M1 ?? 0; m2 = m.mm_M2 ?? 0; undet = m.mm_undet ?? 0;
  }
  const det = match + m1 + m2;
  if (!det) return;                      // 非 think 列: 整块不渲染, 不显示假的 0%

  const bad = m1 + m2;
  const rate = bad / det;
  const wrap = el("div", "mm-box" + (rate >= 0.1 ? " mm-bad" : ""));

  const head = el("div", "mm-head");
  head.appendChild(el("span", "mm-title", "think-output 一致性"));
  head.appendChild(el("span", "mm-rate", `矛盾 ${(rate * 100).toFixed(1)}%`));
  head.title = CELL.mm.note;
  wrap.appendChild(head);

  const line = el("div", "mm-line");
  line.appendChild(el("span", "mm-num ok", `一致 ${match}`));
  line.appendChild(el("span", "mm-num bad", `矛盾 ${bad}`));
  line.appendChild(el("span", "mm-num dim", `判不出 ${undet}`));
  wrap.appendChild(line);

  // 一条按占比分段的横条, 比数字更快看出这一列是不是废了
  const bar = el("div", "mm-bar");
  const seg = (cls, v) => {
    if (!v) return;
    const s = el("div", `mm-seg ${cls}`);
    s.style.width = `${(v / det) * 100}%`;
    s.title = `${v} 条`;
    bar.appendChild(s);
  };
  seg("ok", match); seg("m1", m1); seg("m2", m2);
  wrap.appendChild(bar);

  const btns = el("div", "mm-btns");
  const mkBtn = (key, label, cnt) => {
    if (!cnt) return;
    const b = el("button", "mm-btn" + (state.filter === key ? " on" : ""),
      `${label} ${cnt}`);
    b.title = CELL[key] ? CELL[key].note : "";
    b.onclick = () => {
      state.filter = state.filter === key ? "all" : key;
      state.shown = PAGE;
      renderCM(state.run);
      renderFilters();
      renderCaseList();
      const vis = visibleRows();
      if (!vis.includes(state.row)) selectRow(vis[0] || null);
    };
    btns.appendChild(b);
  };
  mkBtn("mm", "看矛盾数据", bad);
  mkBtn("mm_M1", "think否/出是", m1);
  mkBtn("mm_M2", "think是/出否", m2);
  wrap.appendChild(btns);

  if (rate >= 0.1) {
    wrap.appendChild(el("p", "mm-warn",
      "矛盾比例过高 —— 这一列的 Recall 很可能是最终 JSON 无脑输出「是」造成的虚涨, "
      + "不要拿它和 think 一致的列直接比大小。"));
  }
  box.appendChild(wrap);
}

/* ------------------------------------------------------------------ 列表 */

function renderFilters() {
  const wrap = $("caseFilters");
  wrap.innerHTML = "";
  const rs = state.rows;
  const n = (fn) => rs.filter(fn).length;
  const opts = [["all", `全部 ${rs.length}`]];
  if (blindQualityHidden()) {
    if (severityRelabel()) opts.push(...severityFilterOpts(rs));
    opts.forEach(([key, label]) => {
      const b = el("button", "vfilter" + (state.filter === key ? " on" : ""), label);
      b.onclick = () => {
        state.filter = key; state.shown = PAGE; renderFilters(); renderCaseList();
        const vis = visibleRows();
        if (!vis.includes(state.row)) selectRow(vis[0] || null);
      };
      wrap.appendChild(b);
    });
    return;
  }
  ["fn", "fp", "tp", "tn", "unlabeled", "unparsed"].forEach((k) => {
    const c = n((r) => cellOf(r) === k);
    if (c) opts.push([k, `${CELL[k].label} ${c}`]);
  });
  if (window.PAGE_BLIND_LABELING && window.BlindAccount?.isSuperadmin) {
    if (window.PAGE_FINAL_BUCKETS?.excludeTag) opts.push(...finalBucketOpts(rs));
    opts.forEach(([key, label]) => {
      const b = el("button", "vfilter" + (state.filter === key ? " on" : ""), label);
      if (CELL[key]) b.title = CELL[key].note;
      b.onclick = () => {
        state.filter = key;
        state.shown = PAGE;
        window.BlindAccount.setQualityFilter(state.filter);
        renderCM(state.run);
        renderFilters();
        renderCaseList();
        const vis = visibleRows();
        if (!vis.includes(state.row)) selectRow(vis[0] || null);
      };
      wrap.appendChild(b);
    });
    return;
  }
  // 无 gold 的评测集没有 tp/fp/tn/fn，按模型预测值提供正、负两个筛选入口。
  const predPos = n((r) => r.pred === 1);
  const predNeg = n((r) => r.pred === 0);
  if (predPos) opts.push(["pred_pos", `预测正例 ${predPos}`]);
  if (predNeg) opts.push(["pred_neg", `预测负例 ${predNeg}`]);
  // 预测正例按 max sev(视频级最大 severity)逐档拆: sev=1/2/3/4 各一个按钮。
  // 只有数据带 sev 字段 (两阶段松口径 run) 才出; 旧严口径 run 无 sev, 不显示。
  // 某档没有样本就不出那个按钮 (例如当前 TOB 最高到 3, sev=4 不出现)。
  for (const lv of [1, 2, 3, 4]) {
    const cnt = n((r) => r.pred === 1 && (r.sev || 0) === lv);
    if (cnt) opts.push([`sev_${lv}`, `max sev ${lv} · ${cnt}`]);
  }
  // 人标最高严重度 0-4 (hsev, 来自盲标终判)。和上面的 max sev 是两回事 ——
  // 那个是模型自己给的档, 这个是人给的, 0 = 人工终判不崩坏。
  // 只有盲标批的产物带 hsev, 老 run 没这个字段, 一个按钮都不会出。
  for (const lv of [0, 1, 2, 3, 4]) {
    const cnt = n((r) => r.hsev === lv);
    if (cnt) opts.push([`hsev_${lv}`, `人标 sev ${lv} · ${cnt}`]);
  }
  const ev = n((r) => r.ne > 0);
  if (ev) opts.push(["ev", `带证据框 ${ev}`]);
  // 模型自己画的 grounding 框 (红框那层)。和上面的"带证据框"(标注给的, 蓝框)
  // 分成两个按钮 —— 合成一个"有框"的话, 到底是谁画的就说不清了。
  const mg = n((r) => r.ng > 0);
  if (mg) opts.push(["mg", `有模型框 ${mg}`]);
  // think-output mismatch 的直达入口。总数一个按钮, 两个方向各一个 ——
  // M1 (想否却说是) 和 M2 (想是却说否) 的成因完全不同, 混在一起看不出病灶。
  const m1 = n((r) => r.mm === "M1");
  const m2 = n((r) => r.mm === "M2");
  if (m1 + m2) opts.push(["mm", `⚠ think 矛盾 ${m1 + m2}`]);
  if (m1) opts.push(["mm_M1", `⚠ think否/出是 ${m1}`]);
  if (m2) opts.push(["mm_M2", `⚠ think是/出否 ${m2}`]);
  // 难负例 (hn): 本身带邻近标签、画面上确实有毛病、只是没到本维度的档的负例。
  // 明显崩坏那批 = 带「轻微崩坏」的 28 条负例 —— 整个维度的难度都在这上面。
  // 两个按钮分开: "难负例" 看全体 (分母), "难负例误报" 直接跳到判错的那些 (分子)。
  // 合成一个的话, 看到的数字到底是 28 还是 9 就说不清了。
  const hn = n((r) => r.hn);
  const hnFp = n((r) => r.hn && r.pred === 1);
  if (hn) {
    opts.push(["hn", `★难负例 ${hn}`]);
    if (hnFp) opts.push(["hn_fp", `★难负例误报 ${hnFp}`]);
  }

  opts.forEach(([key, label]) => {
    const b = el("button", "vfilter" + (state.filter === key ? " on" : ""), label);
    if (CELL[key]) b.title = CELL[key].note;
    b.onclick = () => {
      state.filter = key;
      state.shown = PAGE;
      window.BlindAccount?.setQualityFilter?.(state.filter);
      renderCM(state.run);
      renderFilters();
      renderCaseList();
      const vis = visibleRows();
      if (!vis.includes(state.row)) selectRow(vis[0] || null);
    };
    wrap.appendChild(b);
  });
}

function visibleRows() {
  return searchRows(visibleRowsByFilter()).filter((r) => {
    if (window.PAGE_MULTI_REVIEW) {
      if (REVIEW.filter === "dirty") return dirtyAny(r);
      if (isAdjudicator()) {
        if (trainingMode() && isReviewer()) {
          const done = videoReviewProgress(r, "reviewer_3") === videoReviewLabels().length;
          if (REVIEW.filter === "pending") return !done;
          if (REVIEW.filter === "resolved") return done;
          return true;
        }
        const hasConflict = videoConflicts(r).length > 0;
        if (REVIEW.filter === "conflict") return hasConflict;
        if (REVIEW.filter === "pending") return (isAdmin() || hasConflict) && !currentFinalDone(r);
        if (REVIEW.filter === "resolved") return (isAdmin() || hasConflict) && currentFinalDone(r);
        return true;
      }
      const done = videoReviewProgress(r) === videoReviewLabels().length;
      return REVIEW.filter === "all" || (REVIEW.filter === "pending" ? !done : done);
    }
    const v = reviewValue(r);
    return REVIEW.filter === "all" || (REVIEW.filter === "pending" ? !v.verdict
      : REVIEW.filter === "star" ? (v.star || v.verdict === "mild") : v.verdict === REVIEW.filter);
  });
}

/* uid 搜索。和四格筛选是**叠加**关系: 先按格子筛, 再按 uid 过滤 ——
   两个条件互不覆盖, 不然"搜到了但被当前筛选挡住"会让人以为这条不存在。
   空格分隔的多个词按**或**匹配 (一次贴几个 uid 进来比一个个搜快)。 */
function searchRows(rs) {
  const q = (state.q || "").trim().toLowerCase();
  if (!q) return rs;
  const terms = q.split(/\s+/).filter(Boolean);
  return rs.filter((r) => {
    const hay = `${r.uid || ""} ${(r.evalDataUids || []).join(" ")} ${r.src || ""} ${r.no}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}

function visibleRowsByFilter() {
  const rs = state.rows;
  if (!rs) return [];
  const f = state.filter;
  if (f === "all") return rs;
  // 评测员终审分桶: fb_usable = 正样本 + 负样本
  const fb = /^fb_(dirty|excluded|usable|pos|neg)$/.exec(f);
  if (fb) return rs.filter((r) => (fb[1] === "usable"
    ? ["pos", "neg"].includes(finalBucket(r)) : finalBucket(r) === fb[1]));
  if (f === "pred_pos") return rs.filter((r) => r.pred === 1);
  if (f === "pred_neg") return rs.filter((r) => r.pred === 0);
  // 按 max sev 逐档切: sev_1/2/3/4 → 预测正例里 r.sev 恰等于该档的。
  const sevLv = /^sev_([1-4])$/.exec(f);
  if (sevLv) return rs.filter((r) => r.pred === 1 && (r.sev || 0) === Number(sevLv[1]));
  // 人标档位: hsev_0..hsev_4 → 人工终判最高严重度恰等于该档的 (0 = 人工判不崩坏)
  const hsevLv = /^hsev_([0-4])$/.exec(f);
  if (hsevLv) return rs.filter((r) => r.hsev === Number(hsevLv[1]));
  if (f === "hsev_none") return rs.filter((r) => r.hsev == null);
  const vsevLv = /^vsev_([0-4])$/.exec(f);
  if (vsevLv) return rs.filter((r) => videoSeverity(r) === vsevLv[1]);
  if (f === "ev") return rs.filter((r) => r.ne > 0);
  if (f === "mg") return rs.filter((r) => r.ng > 0);
  // think-output mismatch: mm 字段由 build_eval.py 逐条打好 ("match"/"M1"/"M2"/"undet")
  if (f === "mm") return rs.filter((r) => r.mm === "M1" || r.mm === "M2");
  if (f === "mm_M1") return rs.filter((r) => r.mm === "M1");
  if (f === "mm_M2") return rs.filter((r) => r.mm === "M2");
  if (f === "hn") return rs.filter((r) => r.hn);
  if (f === "hn_fp") return rs.filter((r) => r.hn && r.pred === 1);
  return rs.filter((r) => cellOf(r) === f);
}

function renderCaseList() {
  if (window.BlindAccount && state.rows && !isAdjudicator()) {
    const total = videoReviewLabels().length;
    const completed = state.rows.filter(row => videoReviewProgress(row, reviewRole()) === total).length;
    window.BlindAccount.updateCompletion(completed, state.rows.length);
  }
  renderReviewFilter();
  const list = $("caseList");
  list.innerHTML = "";
  const vis = visibleRows();
  const show = vis.slice(0, state.shown);
  $("caseCount").textContent =
    `${vis.length} / ${state.rows.length} 条` +
    (vis.length > show.length ? ` (已渲染 ${show.length})` : "");

  show.forEach((r) => {
    const li = el("li");
    const b = el("button", `case-item ${blindQualityHidden() ? "blind" : cellOf(r)}` + (r === state.row ? " on" : ""));
    const leading = el("span", "case-leading");
    leading.appendChild(el("span", "case-no", String(r.no)));
    const review = reviewValue(r);
    let badges;
    if (window.PAGE_MULTI_REVIEW) {
      if (isAdjudicator()) {
        const conflicts = videoConflicts(r).length;
        badges = severityRelabel() ? "" : isAdmin()
          ? `${conflicts ? `冲突 ${conflicts} · ` : ""}${adminDoneText(r)}`
          : trainingMode()
            ? `${videoReviewProgress(r, "reviewer_3")}/${videoReviewLabels().length}`
          : conflicts ? `冲突 ${conflicts}${adjudicationDone(r) ? " ✓" : ""}` : "";
      } else {
        badges = `${videoReviewProgress(r)}/${videoReviewLabels().length}`;
      }
      if (dirtyAny(r)) badges = "🗑 脏" + (badges ? ` · ${badges}` : "");
    } else {
      badges = [review.verdict === "accept" ? "✅" : review.verdict === "reject" ? "❎" : "",
        (review.star || review.verdict === "mild") ? "⭐️" : ""].filter(Boolean).join(" ");
    }
    if (badges) leading.appendChild(el("span", "review-badges", badges));
    b.appendChild(leading);
    // 重映射集同时展示评测 UID 和全部 eval-data UID；一对多映射不能藏在详情里。
    const mappedUids = r.evalDataUids || [];
    const uidLine = mappedUids.length
      ? `${r.uid || "—"} → ${mappedUids.join(" / ")}`
      : (r.uid || "—");
    b.appendChild(el("span", "case-line", uidLine));
    const blindStatus = window.PAGE_MULTI_REVIEW
      ? (isAdmin() ? adminDoneText(r)
        : isReviewer() ? (trainingMode()
          ? (videoReviewProgress(r, "reviewer_3") === videoReviewLabels().length ? "已复核" : "待复核")
          : (videoConflicts(r).length ? (adjudicationDone(r) ? "已复核" : "待复核") : "无冲突"))
        : (videoReviewProgress(r) === videoReviewLabels().length ? "已完成" : "待标注"))
      : "待标注";
    const qualityCell = cellOf(r);
    b.appendChild(el("span", blindQualityHidden() ? "pill cell-unlabeled" : `pill cell-${qualityCell}`,
      blindQualityHidden() ? blindStatus : cellLabel(r)));
    b.onclick = () => selectRow(r);
    li.appendChild(b);
    list.appendChild(li);
  });

  if (!vis.length) {
    list.appendChild(el("li", "block-hint", "该筛选下没有样本"));
  } else if (vis.length > show.length) {
    const li = el("li");
    const more = el("button", "vfilter",
      `再加载 ${Math.min(PAGE, vis.length - show.length)} 条 (还剩 ${vis.length - show.length})`);
    more.onclick = () => { state.shown += PAGE; renderCaseList(); };
    li.appendChild(more);
    list.appendChild(li);
  }
}

/* ------------------------------------------------------------------ 详情 */

async function selectRow(r, keepFrame) {
  if (LOC.cleanup) LOC.cleanup();
  state.row = r;
  if (!keepFrame) state.frame = 0;
  renderCaseList();
  const detail = $("detail");
  $("resultPane").dataset.phase = r ? "done" : "idle";

  if (!r) {
    state.case = null;
    $("caseTitle").textContent = "该筛选下没有样本";
    $("caseMeta").innerHTML = "";
    detail.innerHTML = "";
    return;
  }

  detail.innerHTML = "";
  detail.appendChild(el("p", "empty-state", "加载详情分片…"));
  let c;
  try {
    // 分片和 messages 池并行拉。messages 池失败不该挡住整条 case 的展示 ——
    // 它只影响"模型输入"那一块, 指标/response/帧带都不依赖它
    const [chunk, msgs, timing, originalTags, , pageReferences] = await Promise.all([
      loadChunk(state.run.key, r.ck),
      loadMsg(state.run.key).catch(() => ({ texts: [], shape: null })),
      loadFrameTiming(),
      loadOriginalTags(),
      loadTagGroups(),
      loadPageReferences(),
    ]);
    state.msg = msgs;
    c = chunk[String(r.no)];
    if (!c) {
      // Defensive fallback for old/minified list files whose ck field was not
      // updated when d0 was split into d0/d1 at the configured chunk size.
      const chunkSize = Number(state.run?.chunk);
      const fallbackCk = Number.isInteger(chunkSize) && chunkSize > 0
        ? Math.floor((Number(r.no) - 1) / chunkSize) : r.ck;
      if (fallbackCk !== r.ck) {
        const fallbackChunk = await loadChunk(state.run.key, fallbackCk);
        c = fallbackChunk[String(r.no)];
      }
    }
    if (!c) throw new Error(`分片里没有 #${r.no}`);
    applyFrameTiming(c, timing);
    applyOriginalTags(c, originalTags);
    applyPageReferences(c, pageReferences);
  } catch (e) {
    detail.innerHTML = "";
    detail.appendChild(el("p", "empty-state", "详情加载失败: " + e.message));
    return;
  }
  if (state.row !== r) return;

  state.case = c;
  detail.innerHTML = "";

  const title = $("caseTitle");
  title.innerHTML = "";
  title.appendChild(document.createTextNode(`#${c.no}  `));
  const titleStatus = window.PAGE_MULTI_REVIEW
    ? (isAdmin() ? adminDoneText(c)
      : isReviewer() ? (trainingMode()
        ? (videoReviewProgress(c, "reviewer_3") === videoReviewLabels().length ? "已复核" : "待复核")
        : (videoConflicts(c).length ? (adjudicationDone(c) ? "已复核" : "待复核") : "无冲突"))
      : (videoReviewProgress(c) === videoReviewLabels().length ? "已完成" : "待标注"))
    : "待标注";
  title.appendChild(el("span", window.PAGE_BLIND_LABELING ? "pill cell-unlabeled" : `pill cell-${cellOf(c)}`,
    window.PAGE_BLIND_LABELING ? titleStatus : (c.incomplete ? "未知" : cellLabel(c))));
  const uid = String(c.uid || r.uid || "");
  if (uid) {
    const copyUid = el("button", "case-uid-copy", uid);
    copyUid.type = "button";
    copyUid.title = "点击复制 UID";
    copyUid.setAttribute("aria-label", `复制 UID ${uid}`);
    copyUid.onclick = async () => {
      try {
        await navigator.clipboard.writeText(uid);
        copyUid.textContent = `${uid} ✓`;
        copyUid.title = "已复制";
        setTimeout(() => {
          copyUid.textContent = uid;
          copyUid.title = "点击复制 UID";
        }, 1500);
      } catch (_) {
        const range = document.createRange();
        range.selectNodeContents(copyUid);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copyUid.title = "已选中 UID，请按 Ctrl+C / ⌘C 复制";
      }
    };
    title.appendChild(copyUid);
  }
  const mappedUids = c.evalDataUids || r.evalDataUids || [];
  if (mappedUids.length) {
    title.appendChild(document.createTextNode("  → eval-data "));
    title.appendChild(el("span", "case-uid-copy", mappedUids.join(" / ")));
  }

  renderCaseMeta(c);
  // Annotation pages start with the generation references. Annotators must
  // see the prompt/images/video before either the verdict controls or output.
  renderPeCaption(c, detail);
  renderStage1References(c, detail);
  renderReviewBar(c, detail);
  renderLocator(c, detail);
  renderFrames(c, detail);
  if (state.showMachineEvidence) renderWorkflow(c, detail);
  // ★ 两阶段的 case 走阶段页签这一条路, 不再叠加"两阶段轨迹"和底部的 response/messages ——
  //   否则同一页会出现两份"模型输入 · messages"(页签里一份 + renderResponse 里一份)。
  //   PAGE_SHOW_ENGINE (1027 ToB 送标准确率页): 盲标账号流程不变, 但产品要对着机审结论标,
  //   所以机标证据默认打开、分阶段页签照常画 —— 不用 teachEngineView, 它会把列表里的个人进度换掉。
  if (!window.PAGE_BLIND_ACCOUNT || teachEngineView() || window.PAGE_SHOW_ENGINE) {
    if (isTwoStage(c)) renderStageTabs(c, detail);
    else if (state.showMachineEvidence) renderResponse(c, detail);
  }
}

/* 一行标签 chip。多标签维度专用: 光看 gold/pred 的 0/1 不知道"它到底被打了什么"。
   三种颜色对应三个不同的问题, 不要混成一种:
     gold  = 标注员在本次 8 个叶子里打了哪些        (蓝, 事实)
     pred  = 模型判「是」的证据认领了哪些叶子        (橙, 模型说的)
     other = 原始人审的其它标签，包含画质、音频、指令响应等所有维度 (灰)
   gold 和 pred 都有的那个标签额外描边 —— 一眼看出"这条是不是归对了"。 */
function tagChips(names, kind, both) {
  const box = el("div", "tagrow");
  if (!names || !names.length) {
    box.appendChild(el("span", "tagchip none", "—"));
    return box;
  }
  names.forEach((t) => {
    const hit = both && both.includes(t);
    box.appendChild(el("span", `tagchip ${kind}` + (hit ? " match" : ""), t));
  });
  return box;
}

function groupedOtherTags(c) {
  const groups = new Map();
  const taxonomy = tagGroups || { headings: [], groups: [], lookup: {} };
  const headings = new Set(taxonomy.headings);
  const aliases = new Map(taxonomy.groups.flatMap(g => g.aliases.map(a => [a, g.name])));
  for (const raw of c.otags || []) {
    if (headings.has(raw)) continue;
    const parts = raw.split(" · ").map(x => x.trim()).filter(Boolean);
    let group;
    while (parts.length && headings.has(parts[0])) {
      const heading = parts.shift();
      group ||= aliases.get(heading);
    }
    const label = parts.join(" · ");
    if (!label || headings.has(label)) continue;
    group ||= taxonomy.lookup[label] || taxonomy.lookup[label.split("+")[0]] || "未分类";
    if (!groups.has(group)) groups.set(group, []);
    if (!groups.get(group).includes(label)) groups.get(group).push(label);
  }
  return groups;
}

function otherTagFilter(c) {
  const groups = groupedOtherTags(c);
  const dim = state.run?.dim || "";
  const preferred = tagGroups?.lookup[dim]
    || tagGroups?.groups.find(g => g.aliases.includes(dim))?.name
    || (["明显崩坏", "崩坏", "生物类结构异常"].includes(dim) ? "动态基础质量" : groups.keys().next().value)
    || "全部";
  const selected = state.otherTagL2.get(dim) || preferred;
  const ordered = (tagGroups?.groups || []).map(g => g.name).filter(name => groups.has(name));
  const options = [...new Set([preferred, ...ordered, ...groups.keys(), selected, "全部"])];
  const box = el("div", "other-tag-filter");
  const tabs = el("div", "other-tag-tabs");
  tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "其它标签分类");
  const panel = el("div", "other-tag-panel"); panel.id = "other-tag-panel";
  panel.setAttribute("role", "tabpanel");
  [tabs, panel].forEach(scroller => scroller.addEventListener("wheel", e => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    e.preventDefault();
    scroller.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientWidth : 1);
  }, { passive: false }));
  const buttons = [];
  function choose(name) {
    state.otherTagL2.set(dim, name);
    buttons.forEach(b => {
      const on = b.dataset.group === name;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      if (on) panel.setAttribute("aria-labelledby", b.id);
    });
    const names = name === "全部" ? [...new Set([...groups.values()].flat())] : groups.get(name) || [];
    panel.replaceChildren(tagChips(names, "other"));
    panel.scrollLeft = 0;
  }
  options.forEach((name, i) => {
    const count = name === "全部" ? new Set([...groups.values()].flat()).size : (groups.get(name) || []).length;
    const b = el("button", "other-tag-tab", `${name} ${count}`);
    b.type = "button"; b.dataset.group = name; b.id = `other-tag-tab-${i}`;
    b.setAttribute("role", "tab"); b.setAttribute("aria-controls", panel.id);
    b.onclick = () => {
      choose(name);
      b.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    b.onkeydown = e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      choose(options[next]); buttons[next].focus({ preventScroll: true });
      buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    buttons.push(b); tabs.appendChild(b);
  });
  box.append(tabs, panel); choose(selected);
  return box;
}

function renderCaseMeta(c) {
  const meta = $("caseMeta");
  meta.innerHTML = "";
  const hasTags = Array.isArray(c.gtags);
  const rows = [
    // ★ 标签摆在最上面: 这是看一条 case 时第一个要回答的问题 ——
    //   "标注员说它有什么毛病 / 模型说它有什么毛病"。放在 video_path 底下没人看。
    ...(hasTags ? [
      ["gold 标签", tagChips(c.gtags, "gold", c.ptags)],
      ["pred 标签", tagChips(c.ptags, "pred", c.gtags)],
    ] : []),
    ...((hasTags || Array.isArray(c.otags)) ? [["其它标签", otherTagFilter(c)]] : []),
    ...(!window.PAGE_BLIND_LABELING ? [["gold / pred", `${(c.gold === 0 || c.gold === 1) ? c.gold : "无标注"} / ${c.pred == null ? (c.incomplete ? "未知（推理未完整成功）" : "未解析") : c.pred}` +
      (c.answer ? `  (<answer>${c.answer}</answer>)` : "")]] : []),
    ["pair", c.pairId ? `${c.pairId} · idx-${c.pairIndex} · side ${c.pairSide}` : ""],
    ["评测 UID", c.uid],
    ["eval-data UID", (c.evalDataUids || []).join(" / ")],
    ["生成模型", c.src],
    ["帧数", `${videoFrameIndices(c).length} 张`],
    ["finish", c.finish === "length" ? "length —— 被 max_tokens 截断了" : c.finish],
    ["video_path", c.vpath],
    ["全部 eval-data 路径", (c.evalDataPaths || []).join("\n")],
  ];
  if ((state.run?.metrics?.gold_revision?.ids || []).includes(c.uid)) {
    rows.push(["用户纠标", "2026-09-16 用户确认：gold 0 → 1（明显崩坏）；模型预测与原始回答未改。"]);
  }
  if (c.modelProvenance) {
    const mp = c.modelProvenance;
    rows.push(["请求评审模型", mp.requested_model]);
    rows.push(["S1 回包版本", mp.stage1_model_version || "未报告"]);
    rows.push(["S2 回包版本", Object.entries(mp.stage2_version_counts || {}).map(([k, n]) => `${k}: ${n}`).join(" · ") || "无 S2 请求"]);
  }
  if (c.err) rows.push(["error", c.err]);
  rows.forEach(([k, v]) => {
    if (!v && v !== 0) return;
    const li = el("li", "stage-row");
    if (k === "其它标签") li.classList.add("other-tags-row");
    li.appendChild(el("span", "stage-dot"));
    li.appendChild(el("span", "stage-name", k));
    // 值可以是字符串, 也可以是已经建好的节点(标签 chip 那几行)
    if (v instanceof Node) {
      const w = el("span", "stage-note");
      w.appendChild(v);
      li.appendChild(w);
    } else {
      li.appendChild(el("span", "stage-note mono", String(v)));
    }
    meta.appendChild(li);
  });
}

/* 和训练集视图 (viewer.js renderPoint) 同一个骨架:
     左 = 原始视频 + 该条的判定信息
     右 = 当前帧大图 + 框详情
   下面再跟"全部输入帧"的帧条。视频拿不到时明说原因, 但帧条照给 —— 帧是一定有的。 */
function videoBox(src, note, kind) {
  const box = el("div", "vbox");
  if (src && kind === "preview") {
    // 合成预览和原视频混在一起看会得出错的结论 (只有前 10s), 所以贴一条说明在播放器上方
    box.appendChild(el("p", "vsynth-note", note ||
      "由输入帧合成的预览, 不是原视频"));
  }
  if (!src) {
    const ph = el("div", "vmissing");
    ph.appendChild(el("div", "vmissing-icon", "⃰"));
    ph.appendChild(el("p", "vmissing-title", "视频拿不到"));
    ph.appendChild(el("p", "vmissing-note", note || ""));
    box.appendChild(ph);
    return box;
  }
  const v = el("video");
  v.src = gatewaySafeMediaUrl(src);
  v.controls = true;
  v.preload = "metadata";
  v.playsInline = true;
  box.appendChild(v);
  return box;
}

function metaGrid(rows) {
  const g = el("div", "meta-grid");
  rows.forEach(([k, v]) => {
    if (v === "" || v == null) return;
    const d = el("div");
    d.appendChild(el("b", null, k));
    d.appendChild(el("span", null, String(v)));
    g.appendChild(d);
  });
  return g;
}

/* ---- 模型 grounding 框 (rubricV3 系列 think 段里的结构化定位) ---------------
   thinkV3/V4 的 response 在 </think> 前是一个 JSON:
     {"problem_frames":[{frame,issue}], "grounding":[{frame,bbox,text_actual,
      text_expected,reasoning}], ...}
   帧号 0 基、指【待评视频抽帧】内的序号 (spans 里 kind 含"待评"的那段)。
   坐标制按集分: thinking v4 = [0,1000] 归一化; v3 = **原图像素** (1280×720 等,
   训练数据就是这个量纲), 画的时候用 img.naturalWidth/Height 换算 —— 所以 px 框
   必须等图加载完才能定位 (见 drawBoxes)。
   模型经常数错帧 (和 claimNf 警告同源), 超范围的帧号不静默丢, 收集给页脚。 */
function parseGrounding(c) {
  // ensemble 的 reducer response 不含 bbox；groundingResp 是各 arm 的原始 think。
  const resp = c.gresp || c.resp || "";
  // ★ 这道快速门必须把两种 think 结构都放进来。原来只认 "grounding", 于是 t20 系列
  //   (只有 text_blocks) 在这里就被挡掉了, 下面的适配一行都执行不到 —— 表现是
  //   r10-t20 / t20.5 的 case 里一个模型框都看不到, 而且不报错。
  if (resp.indexOf('"grounding"') < 0 && resp.indexOf('"text_blocks"') < 0
      && resp.indexOf('"evidence"') < 0) {
    return { boxes: [], oor: [] };
  }
  let seg = resp;
  const te = seg.indexOf("</think>");
  if (te >= 0) seg = seg.slice(0, te);
  seg = seg.replace(/```(?:json)?/g, "");
  const a = seg.indexOf("{"), b = seg.lastIndexOf("}");
  if (a < 0 || b <= a) return { boxes: [], oor: [] };
  let th;
  try { th = JSON.parse(seg.slice(a, b + 1)); } catch (e) { return { boxes: [], oor: [] }; }
  /* 两种 think 结构:
       A. rubricV3 系列 (thinkv3/v3.5/v4): problem_frames[] + grounding[], 一条一帧
       B. rubric-evolve 的 t20 系列: text_blocks[], 一条 = 一个"文字块", 带
          frames(该块出现的帧号**枚举列表**, 实测多为 5~13 个, 不是 [首,末] 区间)
          + verdict(自由文本: 不可读 / 可读且正确 / 拼写错误且笔画扭曲 …)
     B 展开成"每帧一个框", 这样帧条和画框逻辑不用区分两套。
     verdict 只有"可读且正确"算没问题, 其余一律当问题块 —— 措辞有十来种变体,
     白名单比黑名单稳。 */
  let g = Array.isArray(th.grounding) ? th.grounding : [];
  const issues = new Map((th.problem_frames || [])
    .filter((p) => p && p.frame != null).map((p) => [p.frame, p.issue || ""]));
  if (!g.length && Array.isArray(th.text_blocks)) {
    g = [];
    th.text_blocks.forEach((b) => {
      if (!b || !Array.isArray(b.bbox) || b.bbox.length !== 4) return;
      const fs = Array.isArray(b.frames) ? b.frames : [b.frame];
      const okBlock = /^可读且正确/.test(String(b.verdict || ""));
      fs.filter((x) => typeof x === "number").forEach((fr) => {
        g.push({ frame: fr, bbox: b.bbox, text_actual: b.text_actual,
                 text_expected: b.text_expected, reasoning: b.reasoning,
                 _where: b.where || "", _verdict: b.verdict || "", _ok: okBlock });
        if (!issues.has(fr)) issues.set(fr, b.where || b.verdict || "");
      });
    });
  }
  /* C. rubricV11/thinkV11 系列 (0907-kling-gemini 训练格式): evidence[], 一条 = 画面里
        的一处文字, 用 st_frame_idx/ed_frame_idx 表示时间跨度, 两端各一个框
        (st_bbox / ed_bbox)。
     ★ 只画首末两帧, **不在区间内插值** —— 模型只对这两帧做了断言, 中间帧的框是
       推测出来的。`evidence_from_two_stage` 处理 start/end 对时也是同一个做法。
     ★ 帧号要 -1: v11 的细则明写「填『帧 j』的 j（从 1 开始）」, 而下面的越界判据和
       `n = base + f` 都按 0-based 算。不减这一下, 每个框都会偏一帧, 且最后一帧恒越界。*/
  if (!g.length && Array.isArray(th.evidence)) {
    g = [];
    th.evidence.forEach((e) => {
      if (!e) return;
      [["st_frame_idx", "st_bbox"], ["ed_frame_idx", "ed_bbox"]].forEach(([fk, bk], i) => {
        const fr = e[fk], bb = e[bk];
        if (typeof fr !== "number" || !Array.isArray(bb) || bb.length !== 4) return;
        // 首末同帧同框时只画一次, 否则同一处会叠两层框
        if (i === 1 && e.st_frame_idx === fr
            && JSON.stringify(e.st_bbox) === JSON.stringify(bb)) return;
        g.push({ frame: fr - 1, bbox: bb, reasoning: e.analyze || "",
                 _where: "", _verdict: "", _ok: false });
        if (!issues.has(fr - 1)) issues.set(fr - 1, e.analyze || "");
      });
    });
  }
  const es = (c.spans || []).find((s) => /待评/.test(s.kind || ""));
  const base = es ? es.start - 1 : 0;
  const len = es ? es.end - es.start + 1 : (c.frames.nf || 0);
  const ds = (state.run || {}).dataset || {};
  const v = ds.variant || {};
  /* bbox 是像素还是 [0,1000] 归一化。
     优先用集自己声明的 bboxNorm (build_eval 的 DS_LABEL 里按该集【输出格式】原文标的:
     thinkv3 明确写"像素坐标", thinkv3.5/thinkv4 明确写"[0,1000] 归一化")。
     ★ 有的集**不声明坐标系** (r10-t20 的 prompt 只写 "bbox": [x1,y1,x2,y2]),
       这时口径取决于模型自己的训练约定 —— 像素数据训的出像素, fixbbox 训的出归一化,
       同一个集里两种都会出现。所以没声明时按**这一条的框值**现判:
         任一坐标 > 该帧宽/高  -> 不可能是像素, 判归一化
         全部 <= 1000 且帧比 1000 大 -> 判归一化 (像素框不会恰好都挤在左上角 1000 内)
       判错的代价是框画歪, 不影响指标, 所以这里宁可用启发式也不要写死一个值。 */
  const declared = ds.bboxNorm;
  const out = [], oor = [];
  /* ★ 帧尺寸在 parseGrounding 这一步拿不到 (pack_frames 只给 nf 和 url 列表),
     所以"没声明坐标系"的集不能在这里判, 只能标成 auto, 留到 drawBoxes 里判 ——
     那时 img 已加载, naturalWidth/Height 是真值。 */
  g.forEach((it) => {
    if (!it || !Array.isArray(it.bbox) || it.bbox.length !== 4) return;
    const f = it.frame;
    if (typeof f !== "number" || f < 0 || f >= len) { oor.push(f); return; }
    const bx = it.bbox.map(Number);
    const known = typeof declared === "boolean";
    out.push({ n: base + f, f, box: bx,
               px: known ? !declared : false, auto: !known,
               where: it._where || "", verdict: it._verdict || "", okBlock: !!it._ok, mdl: true,
               ta: it.text_actual || "", te2: it.text_expected || "",
               why: it.reasoning || "", issue: issues.get(f) || "" });
  });
  return { boxes: out, oor };
}


/* ── 问题定位: 在真视频的时间轴上找证据 ────────────────────────────────────────
   帧胶片翻缩略图看不出"这一段发生了什么", 时序类证据尤其如此(抖动/前后不一致在
   静止的缩略图里是看不见的)。这里换成: **真视频 + 进度条上的证据标记 + 叠在画面
   上的框**, 点标记直接 seek 过去。做法参考 fuhongyi03/aigc-eval 的 studio.html。

   时间从哪来: build_eval 已按抽帧率(4fps)把每条证据的关键帧算成秒数挂在 ev.t 上,
   带 frame_range 的另有 ev.tr=[起,止]。前端不做换算 —— 那个映射要回到帧文件名里的
   真实帧号(评测集降采样过, 第 i 张 ≠ 盘上第 i 帧), 放前端算迟早算错。

   三个坑(都在 studio.js 里踩过, 照抄):
   ① 标注层要按**视频内容矩形**定位, 不是 wrapper: object-fit:contain 会留黑边,
      拿 wrapper 量会让每个框都偏黑边的一半, 而 16:9 的素材永远暴露不出来。
   ② metadata 没就绪不能 seek —— duration 可能还是上一条视频的残留值。排进
      pendingSeek 等 loadedmetadata。
   ③ 框显示窗口: 播放时在 [t, t+hold) 内显示; **暂停时选中的那条一直显示**,
      否则点完标记跳过去, 框刚好被窗口扫过、什么都看不到。 */
const LOC = { marks: [], sel: -1, pending: null, metaReady: false };

/* mode 前缀匹配: 两阶段的变体会在 mode 上挂后缀(如 "2-stage+ensemble" —— 三轮并集那版,
   或 "2-stage-high-recall" —— 只跑召回、跳过 verifier 的高召回版)。
   ★ 0913 踩过: 这里原本是精确相等, 于是 "2-stage+ensemble" 的 run 在页面上
     阶段切换器、两阶段轨迹、时间轴标记**整块消失**, 看着像"数据没落盘",
     其实 wf2 完完整整在分片里。判定只认前缀, 后缀留给写产物的人自由标注。 */
function twoStageMode(m) { return String(m || "").startsWith("2-stage"); }

function locMarks(c) {
  const w = c.wf2;
  if (!w || !twoStageMode(w.mode)) return [];
  const byId = {};
  (w.s2 || []).forEach((v) => { byId[String(v.id)] = v; });
  const out = [];
  (w.ev || []).forEach((e) => {
    if (typeof e.t !== "number") return;         // 算不出时间的不画, 不猜
    const v = byId[String(e.id)];
    out.push({
      id: e.id, t: e.t, tr: Array.isArray(e.tr) ? e.tr : null,
      frame: e.frame, frameRaw: e.frameRaw, bbox: e.bbox,
      bboxOrig: Array.isArray(e.bbox_orig) ? e.bbox_orig : null,
      reedited: !!e.reedited,
      bboxRawYxyx1000: e.bboxRawYxyx1000,
      tag: e.tag || "", obs: e.obs || "",
      label: v?.label == null ? null : Number(v.label), why: (v && v.why) || "",
      // Older packaged runs used `sev`; harness-result/v1 uses `severity`.
      // Treat 0 as a real value and only fall back when the field is absent.
      sev: v ? (v.sev ?? v.severity ?? 0) : 0,
    });
  });
  out.sort((a, b) => a.t - b.t);
  return out;
}

function fmtClock(s) {
  if (!isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

function renderLocator(c, root) {
  if (LOC.cleanup) LOC.cleanup();
  Object.assign(LOC, { marks: [], on: new Set(), pending: null, metaReady: false,
    goto: null, seekFrame: null, video: null, cur: -1, cleanup: null });
  if (!window.PAGE_LOCATOR || !c.video) return;
  const scope = reviewScope();
  let marks = [], selected = null, evidencePage = 0, loop = null, pendingPlay = false, disposed = false;
  let drawing = false, draftBox = null, editId = null, dragStart = null;
  let showReaimOrig = true;   // 修框实验: 是否叠加「原框」(改前) 做对比, 由「重定位」按钮切换
  let fullscreenFallback = false, changingView = false;
  const block = el("div", "block loc");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", "原始视频"));
  const body = el("div", "loc-body");
  const left = el("div", "loc-vcol");
  const wrap = el("div", "loc-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("aria-label", "原始视频，空格播放或暂停");
  const vid = el("video");
  vid.controls = true; vid.preload = "metadata"; vid.playsInline = true;
  vid.setAttribute("controlsList", "nofullscreen"); vid.src = gatewaySafeMediaUrl(c.video);
  const layer = el("div", "loc-layer");
  wrap.append(vid, layer); left.appendChild(wrap);
  const controls = el("div", "loc-controls");
  const status = el("span", "loc-navnote");
  function button(label, fn, parent = controls) {
    const b = el("button", "loc-navbtn", label); b.type = "button"; b.onclick = fn; parent.appendChild(b); return b;
  }
  const playButton = button("播放 / 暂停", () => vid.paused ? play() : vid.pause());
  button("−0.04s", () => seekTo(vid.currentTime - 0.04));
  button("+0.04s", () => seekTo(vid.currentTime + 0.04));
  const rate = el("select", "loc-rate"); rate.setAttribute("aria-label", "播放速度");
  [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2].forEach((r) => {
    const option = el("option", null, r + "×"); option.value = r; rate.appendChild(option);
  });
  if (!LOC.rate) {
    try { LOC.rate = Number(localStorage.getItem("eval.playbackRate")) || 1; } catch { LOC.rate = 1; }
  }
  rate.value = String(LOC.rate);
  if (!rate.value) rate.value = "1";
  vid.playbackRate = Number(rate.value);
  rate.onchange = () => {
    LOC.rate = Number(rate.value); vid.playbackRate = LOC.rate;
    try { localStorage.setItem("eval.playbackRate", String(LOC.rate)); } catch {}
  };
  controls.appendChild(rate);
  button("完整视频", clearSelection);
  const expandButton = button("放大", () => changeView(isLarge() ? "inline" : "expanded"));
  expandButton.dataset.action = "expand";
  const fullscreenButton = button("全屏", () => changeView(
    document.fullscreenElement === block || fullscreenFallback ? "inline" : "fullscreen"));
  fullscreenButton.dataset.action = "fullscreen";
  // Keep an exit in the sticky header even when the evidence list needs scrolling.
  const exitButton = button("退出大屏", () => changeView("inline"), head);
  exitButton.dataset.action = "exit-view"; exitButton.hidden = true;

  function isLarge() { return block.classList.contains("loc-expanded") || document.fullscreenElement === block; }
  function syncView() {
    const full = document.fullscreenElement === block || fullscreenFallback;
    expandButton.textContent = isLarge() ? "还原" : "放大";
    fullscreenButton.textContent = full ? "退出全屏" : "全屏";
    expandButton.setAttribute("aria-pressed", String(isLarge()));
    fullscreenButton.setAttribute("aria-pressed", String(full));
    exitButton.hidden = !isLarge();
    fitLayer();
  }
  async function changeView(mode) {
    if (changingView || disposed) return;
    changingView = true;
    expandButton.disabled = fullscreenButton.disabled = exitButton.disabled = true;
    try {
      if (document.fullscreenElement === block && mode !== "fullscreen") await document.exitFullscreen();
      fullscreenFallback = false;
      block.classList.toggle("loc-expanded", mode === "expanded");
      if (mode === "fullscreen") {
        try {
          await block.requestFullscreen();
        } catch {
          // Embedded viewers may disallow native fullscreen. Always enter the
          // fallback explicitly; toggling here could instead close an expanded view.
          if (!disposed) { fullscreenFallback = true; block.classList.add("loc-expanded"); }
        }
      }
    } catch (e) {
      if (!disposed) status.textContent = "切换显示失败，请重试";
    } finally {
      changingView = false;
      expandButton.disabled = fullscreenButton.disabled = exitButton.disabled = false;
      if (!disposed) syncView();
    }
  }
  controls.appendChild(status); left.appendChild(controls);
  const tlrow = el("div", "loc-tl"), track = el("div", "loc-track");
  track.tabIndex = 0;
  track.setAttribute("aria-label", "视频进度条，空格播放或暂停");
  track.appendChild(el("div", "loc-rail"));
  const fill = el("div", "loc-fill"); track.appendChild(fill);
  const clock = el("span", "loc-clock", "0.00 / 0.00s");
  tlrow.append(track, clock); left.appendChild(tlrow);
  const nav = el("div", "loc-nav"), jumps = el("div", "loc-jumps");
  const evidencePanel = el("div", "loc-evidence-panel");
  const evidenceControls = el("div", "loc-evidence-controls");
  const evidenceHead = el("div", "loc-evidence-head");
  const evidenceTabs = el("div", "loc-evidence-tabs");
  evidenceTabs.setAttribute("role", "tablist");
  evidenceTabs.setAttribute("aria-label", "选择证据");
  evidenceHead.append(el("h3", "block-title", "证据"), evidenceTabs);
  const evidenceScroll = el("div", "loc-evidence-scroll");
  evidenceScroll.tabIndex = 0;
  evidenceScroll.setAttribute("aria-label", "证据");
  evidenceScroll.append(nav, jumps);
  evidenceControls.append(evidenceHead, evidenceScroll);
  const info = el("div", "loc-info");
  evidencePanel.append(evidenceControls, info);
  left.appendChild(evidencePanel);
  body.appendChild(left); block.append(head, body); root.appendChild(block);
  LOC.video = vid;

  function dur() { return Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0; }
  function fitLayer() {
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const sw = vid.videoWidth || 16, sh = vid.videoHeight || 9;
    const scale = Math.min(cw / sw, ch / sh), w = sw * scale, h = sh * scale;
    Object.assign(layer.style, { width: w + "px", height: h + "px", left: (cw - w) / 2 + "px", top: (ch - h) / 2 + "px" });
  }
  function timed(m) { return Number.isFinite(m.t); }
  function tLabel(m) { return Number.isFinite(m.t) ? m.t.toFixed(2) + "s" : "无时间"; }
  function markKey(m) {
    return m.human ? `${m.review_role || "single"}:${m.id}` : "machine:" + m.id;
  }
  function evidenceRoleClass(m) {
    return m.review_role === "annotator_1" ? "annotator-1"
      : m.review_role === "annotator_2" ? "annotator-2" : "";
  }
  function humanEvidenceOwner(m) {
    if (!window.PAGE_MULTI_REVIEW) return "人审";
    const name = String(m.who || "").trim();
    if (isAdmin() && !trainingMode()
        && (m.review_role === "annotator_1" || m.review_role === "annotator_2")) {
      return reviewRoleLabel(m.review_role);
    }
    return `${reviewRoleLabel(m.review_role)}${name && name !== "anon" && name !== m.review_role ? " · " + name : ""}`;
  }
  function canEditHumanEvidence(m) {
    if (trainingMode()) {
      return m.human && m.review_role === reviewRole()
        && m.who === window.BlindAccount?.account;
    }
    return m.human && (!window.PAGE_MULTI_REVIEW
      || (m.review_role === reviewRole() && (!isAdmin() || m.review_role === "admin")));
  }
  function evidenceReviewEntity(m) {
    return m.human ? m.id : "machine:" + m.id;
  }
  function evidenceVerdictText(value) {
    return value === "accept" ? "✅ 认可" : value === "reject" ? "❎ 不认可"
      : value === "mild" ? "⭐️ 轻微 / 模糊" : "";
  }
  function appendAdjudicatorComments(m, row) {
    if (!isAdjudicator() && !trainingMode()) return;
    const entity = evidenceReviewEntity(m);
    if (trainingMode()) {
      for (const role of trainingVisibleRoles()) {
        for (const { who, value } of reviewValuesByWho(c, entity, role)) {
          if (who === window.BlindAccount?.account
              || (!value.verdict && !value.note && !value.star)) continue;
          const parts = [`${reviewRoleLabel(role)} · ${who}`];
          if (value.verdict) parts.push(evidenceVerdictText(value.verdict));
          if (value.note) parts.push("评论：" + value.note);
          if (value.star && value.verdict !== "mild") parts.push("⭐️ 边界");
          row.appendChild(el("div", `reviewer-evidence-comment ${role.replace("_", "-")}`,
            parts.join(" · ")));
        }
      }
      return;
    }
    const roles = isAdmin() ? ["annotator_1", "annotator_2", "reviewer_3"]
      : ["annotator_1", "annotator_2"];
    for (const role of roles) {
      if (role === "reviewer_3") {
        for (const { who, value } of reviewValuesByWho(c, entity, role)) {
          if (!value.verdict && !value.note && !value.star) continue;
          const parts = [`复核员 · ${who}`];
          if (value.verdict) parts.push(evidenceVerdictText(value.verdict));
          if (value.note) parts.push("评论：" + value.note);
          if (value.star && value.verdict !== "mild") parts.push("⭐️ 边界");
          row.appendChild(el("div", "reviewer-evidence-comment reviewer-3", parts.join(" · ")));
        }
        continue;
      }
      const value = reviewValue(c, entity, role);
      if (!value.verdict && !value.note && !value.star) continue;
      const parts = [isAdmin() ? reviewRoleLabel(role) : annotatorIdentity(c, role)];
      if (value.verdict) parts.push(evidenceVerdictText(value.verdict));
      if (value.note) parts.push("评论：" + value.note);
      if (value.star && value.verdict !== "mild") parts.push("⭐️ 边界");
      row.appendChild(el("div", `reviewer-evidence-comment ${role.replace("_", "-")}`,
        parts.join(" · ")));
    }
  }
  function current() { return marks.find((m) => markKey(m) === selected); }
  function interval(m) {
    // A single-frame evidence is a point, never an invented replay interval.
    if (!timed(m)) return [0, dur()];
    const tr = m.tr && m.tr[1] > m.tr[0] ? m.tr : [m.t, m.t];
    const d = dur() || Math.max(tr[1], m.t);
    return [Math.max(0, Math.min(tr[0], d - 0.01)), Math.min(d, tr[1])];
  }
  function play() {
    if (!LOC.metaReady) { pendingPlay = true; return; }
    if (loop && (vid.currentTime < loop[0] || vid.currentTime >= loop[1] - 0.005)) vid.currentTime = loop[0];
    vid.play().catch((e) => { if (!disposed && e.name !== "AbortError") status.textContent = "点击播放继续"; });
  }
  function seekTo(t, autoplay = false) {
    const bounds = loop || [0, dur() || Math.max(0, t)];
    t = Math.max(bounds[0], Math.min(bounds[1], t));
    pendingPlay = autoplay;
    if (!autoplay) vid.pause();
    if (!LOC.metaReady) { LOC.pending = t; return; }
    vid.currentTime = t;
    if (autoplay) play();
  }
  function pick(m) {
    if (drawing) setDrawing(false);
    evidencePage = Math.max(0, marks.indexOf(m));
    selected = markKey(m);
    loop = timed(m) && m.tr && m.tr[1] > m.tr[0] ? interval(m) : null;
    PROMPT_SPAN.active = m.id; promptSpanChanged();
    LOC.cur = marks.indexOf(m); LOC.on = new Set([LOC.cur]);
    // The evidence card/zoom is the key frame at m.t.  Starting ranged
    // evidence at tr[0] made the video show a different image immediately
    // after clicking the key-frame evidence (especially obvious on fast
    // motion).  Always land paused on the key moment first; pressing Play
    // then uses the retained loop interval and replays the full context.
    if (timed(m)) seekTo(m.t, false); else vid.pause();
    redraw();
  }
  function clearSelection() {
    PROMPT_SPAN.active = null; promptSpanChanged();
    selected = null; loop = null; pendingPlay = false; LOC.pending = null;
    LOC.cur = -1; LOC.on.clear(); vid.pause(); redraw();
  }
  function drawBoxes() {
    layer.replaceChildren();
    const m = current();
    function box(b, cls, label) {
      if (!Array.isArray(b) || b.length !== 4) return;
      const n = el("div", "loc-box " + cls);
      Object.assign(n.style, { left: b[0] / 10 + "%", top: b[1] / 10 + "%", width: (b[2] - b[0]) / 10 + "%", height: (b[3] - b[1]) / 10 + "%" });
      n.appendChild(el("span", null, label)); layer.appendChild(n);
    }
    // 修框实验: 该证据被重定位时, 先叠加「原框」(改前, 虚线灰) 做对比
    if (m && m.reedited && showReaimOrig && Array.isArray(m.bboxOrig)) box(m.bboxOrig, "reaim-orig", "原框");
    if (m) box(m.bbox, m.human ? `human ${evidenceRoleClass(m)}` : m.label === 0 ? "pass" : "hit",
               (m.human ? humanEvidenceOwner(m) + " · " : "机审 · ") + m.tag
               + (reviewSeverityEnabled() && m.sev ? " · S" + m.sev : "")
               + (m.reedited ? " · 新框" : ""));
    if (draftBox) box(draftBox, "human draft", "人审草稿");
  }
  function drawMarks() {
    track.querySelectorAll(".loc-span,.loc-mark").forEach((n) => n.remove());
    const m = current(); if (!m || !dur() || !timed(m)) return;
    const [a, b] = interval(m);
    const span = el("div", "loc-span " + (m.human ? `human ${evidenceRoleClass(m)}` : "hit"));
    span.style.left = a / dur() * 100 + "%"; span.style.width = (b - a) / dur() * 100 + "%";
    track.appendChild(span);
    const key = el("div", "loc-mark " + (m.human ? `human ${evidenceRoleClass(m)}` : "hit"));
    key.style.left = Math.max(0, Math.min(100, m.t / dur() * 100)) + "%"; track.appendChild(key);
  }
  function drawNav() {
    nav.replaceChildren();
    const m = current();
    status.textContent = loop ? `循环 ${loop[0].toFixed(2)}–${loop[1].toFixed(2)}s`
      : m ? (timed(m) ? `单帧 ${m.t.toFixed(3)}s` : "该证据未指定时间 / 帧") : "完整视频";
    if (!m || !timed(m)) return;
    const [a, b] = interval(m);
    if (loop) button("起点 " + a.toFixed(3) + "s", () => seekTo(a), nav);
    button("关键时刻 " + m.t.toFixed(3) + "s", () => seekTo(m.t), nav);
    if (loop) button("终点 " + b.toFixed(3) + "s", () => seekTo(b), nav);
  }
  function drawJumps() {
    jumps.replaceChildren();
    evidenceTabs.replaceChildren();
    // 「完整」tab: 不选任何证据, 看全量视频 (清除关键帧定位 / 循环 / 叠框)。
    // 没有它时每条 case 必然锁在某条证据上, 整段视频看不了 —— selected==null 时它高亮。
    if (marks.length) {
      const fullTab = el("button", "loc-evidence-tab full" + (selected == null ? " on" : ""), "完整");
      fullTab.type = "button"; fullTab.setAttribute("role", "tab");
      fullTab.setAttribute("aria-selected", String(selected == null));
      fullTab.title = "看完整视频：不选任何证据，清除定位与叠框";
      fullTab.setAttribute("aria-label", "完整视频：不选任何证据");
      fullTab.onclick = () => clearSelection();
      evidenceTabs.appendChild(fullTab);
    }
    marks.forEach((m, index) => {
      const roleClass = evidenceRoleClass(m);
      const tab = el("button", `loc-evidence-tab ${m.human ? `human ${roleClass}` : "machine"}${m.reedited ? " reaim" : ""}`, String(index + 1));
      tab.type = "button"; tab.setAttribute("role", "tab");
      // 高亮按**真实选中态**走, 不是 evidencePage —— 选「完整」(selected==null) 时数字全不亮。
      const isOn = selected === markKey(m);
      tab.setAttribute("aria-selected", String(isOn));
      tab.classList.toggle("on", isOn);
      tab.title = `${m.human ? humanEvidenceOwner(m) : "机审 #" + m.id} · ${tLabel(m)} · ${m.tag || "证据"}`;
      tab.setAttribute("aria-label", `证据 ${index + 1}：${tab.title}`);
      // 再次点击已选中的 tab => 取消, 回到完整视频。
      tab.onclick = () => {
        if (selected === markKey(m)) clearSelection();
        else { evidencePage = index; pick(m); }
      };
      evidenceTabs.appendChild(tab);
    });
    if (!marks.length) {
      jumps.appendChild(el("span", "block-hint", isAdmin()
        ? "暂无证据，可由管理员补充遗漏证据。" : "暂无证据，可添加人审标注。"));
      return;
    }
    evidencePage = Math.max(0, Math.min(evidencePage, marks.length - 1));
    const m = marks[evidencePage];
    const roleClass = evidenceRoleClass(m);
    const row = el("div", "loc-evidence " + (m.human ? `human ${roleClass}` : "machine"));
    const b = el("button", "loc-jump " + (m.human ? `human ${roleClass}` : m.label === 0 ? "pass" : "hit") + (selected === markKey(m) ? " on" : ""),
      `${m.human ? humanEvidenceOwner(m) : "机审 #" + m.id} · ${tLabel(m)} · ${m.tag || "证据"}`
      + (reviewSeverityEnabled() && m.sev ? ` · S${m.sev}` : ""));
    b.title = (m.obs || "") + (selected === markKey(m) ? " · 再次点击关闭"
      : !timed(m) ? " · 该证据未指定时间 / 帧"
      : m.tr && m.tr[1] > m.tr[0] ? " · 点击定位关键时刻，播放后循环证据区间" : " · 点击定位此帧");
    b.setAttribute("aria-pressed", String(selected === markKey(m)));
    b.onclick = () => selected === markKey(m) ? clearSelection() : pick(m);
    row.appendChild(b);
    // 修框实验: 被重定位的证据加高亮「重定位」按钮, 点一下切换是否叠加原框, 看改前/改后
    if (m.reedited && Array.isArray(m.bboxOrig) && Array.isArray(m.bbox)) {
      const fmt = (x) => "[" + x.map((v) => Math.round(v)).join(",") + "]";
      const rb = el("button", "loc-reaim-badge" + (showReaimOrig ? " on" : ""),
        "重定位 ⇄ " + (showReaimOrig ? "隐藏原框" : "显示原框"));
      rb.type = "button";
      rb.title = "该证据的框被重定位\n原框 " + fmt(m.bboxOrig) + "  →  新框 " + fmt(m.bbox)
        + "\n点击切换是否叠加「原框」做对比";
      rb.onclick = (ev) => { ev.stopPropagation(); showReaimOrig = !showReaimOrig; if (selected !== markKey(m)) pick(m); else drawBoxes(); rb.classList.toggle("on", showReaimOrig); rb.textContent = "重定位 ⇄ " + (showReaimOrig ? "隐藏原框" : "显示原框"); };
      row.appendChild(rb);
      row.appendChild(el("div", "loc-reaim-cmp", "框对比  原框 " + fmt(m.bboxOrig) + "  →  新框 " + fmt(m.bbox)));
    }
    if (isAdjudicator()) row.appendChild(el("span", "reviewer-evidence-final-label",
      isAdmin() ? "管理员终判" : "复核终判"));
    row.appendChild(reviewControls(c, evidenceReviewEntity(m)));
    if (severityRelabel() && m.human) row.appendChild(evidenceSeveritySelect(c, m, scope,
      () => { if (!disposed) refreshEvidence(); }));
    if (m.human) row.appendChild(el("div", `human-evidence-description ${roleClass}`,
      "证据描述：" + (m.obs || "未填写")));
    if (m.human && cleanPromptSpans(m.prompt_spans).length) row.appendChild(el("div", `human-evidence-description ${roleClass}`,
      "划词：" + cleanPromptSpans(m.prompt_spans).map((x) => `「${x.text}」`).join(" ")));
    if (!m.human && (!Array.isArray(m.bbox) || m.bbox.length !== 4)) {
      row.appendChild(el("div", "block-hint machine-evidence-no-bbox",
        m.label === 0
          ? "该候选被原始 Stage2 机审判否，源数据未提供 bbox。"
          : "源数据未提供 bbox，无法绘制定位框。"));
    }
    appendAdjudicatorComments(m, row);
    if (canEditHumanEvidence(m)) {
      button("编辑", () => editEvidence(m), row);
      button("删除", async () => {
        try {
          await saveReviewRecord(c, { kind: "evidence", entity: m.id, deleted: true }, scope);
          if (disposed) return;
          if (selected === markKey(m)) { selected = null; loop = null; vid.pause(); }
          if (editId === m.id) resetDraft();
          refreshEvidence();
        } catch (e) { status.textContent = "删除失败: " + e.message; }
      }, row);
    }
    jumps.appendChild(row);
  }
  function showInfo() {
    info.replaceChildren(el("h3", "block-title", "判别解释"));
    const m = current(), pre = el("pre", "resp-box");
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", "判别解释");
    if (m) pre.textContent = JSON.stringify({ source: m.human ? "人审" : "机审", ...m }, null, 2);
    else if (window.PAGE_BLIND_LABELING && !state.showMachineEvidence) {
      pre.textContent = "机标证据已隐藏。请先独立完成人工标注；需要核对时可点击右上角「机标证据」。";
    }
    else {
      const raw = (c.resp || "").split("</think>").pop().trim();
      try { pre.textContent = JSON.stringify(JSON.parse(raw.slice(raw.indexOf("{"))), null, 2); }
      catch { pre.textContent = raw || "暂无视频级结论"; }
    }
    info.appendChild(pre);
  }
  function redraw() { drawBoxes(); drawMarks(); drawNav(); drawJumps(); showInfo(); }
  function refreshEvidence() {
    marks = [...(state.showMachineEvidence ? locMarks(c) : []),
             ...(state.showHumanEvidence ? humanEvidence(c) : [])]
      .sort((a, b) => (Number.isFinite(a.t) ? a.t : Infinity) - (Number.isFinite(b.t) ? b.t : Infinity)
        || markKey(a).localeCompare(markKey(b)));
    LOC.marks = marks; LOC.cur = marks.findIndex((m) => markKey(m) === selected);
    if (LOC.cur >= 0) evidencePage = LOC.cur;
    else {
      if (selected) { selected = null; loop = null; }
      evidencePage = Math.max(0, Math.min(evidencePage, marks.length - 1));
      // The panel already renders evidencePage, so make it the actual current
      // evidence too. Previously its text was visible while selected stayed
      // null, making valid machine bboxes look missing until a second click.
      if (marks.length) {
        const initial = marks[evidencePage];
        selected = markKey(initial);
        LOC.cur = evidencePage;
        LOC.on = new Set([evidencePage]);
        loop = null;
        if (timed(initial)) seekTo(initial.t);
      }
    }
    LOC.on = new Set(LOC.cur < 0 ? [] : [LOC.cur]);
    if (current() && loop) loop = interval(current());
    redraw();
  }

  const editor = el("details", "loc-editor");
  editor.appendChild(el("summary", null, isAdmin()
    ? "＋ 管理员补充遗漏证据（区间 / 画框 / 标签）"
    : "＋ 人审标注（区间 / 画框 / 标签）"));
  const form = el("form", "loc-editor-form");
  const fields = {};
  // severity 用 select 而不是 number: 它是**四个档位**不是连续量, 输入框会收到 0/7/1.5
  // 这种没有定义的值。留空表示"不给分级"—— 有些标注只想圈出位置, 强制填会逼人瞎填。
  const evidenceFields = [["start", "起点 (s)", "number"], ["key", "关键时刻 (s)", "number"], ["end", "终点 (s)", "number"], ["tag", "标签", window.PAGE_REVIEW_LABELS ? "tag-select" : "text"]];
  if (reviewSeverityEnabled()) evidenceFields.push(["sev", "严重程度", "select"]);
  evidenceFields.push(["obs", "描述", "text"]);
  for (const [name, title, type] of evidenceFields) {
    const label = el("label", "loc-field", title);
    let input;
    if (type === "select") {
      input = el("select"); input.name = name; input.className = "loc-sev";
      for (const v of ["", "1", "2", "3", "4"]) {
        const o = el("option", null, v || "—"); o.value = v; input.appendChild(o);
      }
    } else if (type === "tag-select") {
      input = el("select"); input.name = name; input.className = "loc-tag"; input.required = true;
      const empty = el("option", null, "请选择标签"); empty.value = ""; empty.disabled = true;
      input.appendChild(empty);
      window.PAGE_REVIEW_LABELS.forEach((v) => {
        const o = el("option", null, v); o.value = v; input.appendChild(o);
      });
      input.value = "";
    } else {
      input = el("input"); input.type = type; input.name = name;
      if (type === "number") { input.min = "0"; input.step = "0.001"; }
      if (name === "tag") { input.required = true; input.placeholder = "例如：明显崩坏"; }
    }
    label.appendChild(input); fields[name] = input;
    if (type === "number") button("取当前", () => { input.value = vid.currentTime.toFixed(3); }, label);
    form.appendChild(label);
  }
  // 时间 / 框 / 划词都是可选的: 指令遵循里"某条指令没遵循"本来就没有可框的画面、可指的帧。
  // 勾上「不指定时间」→ 不存 t/tr; 不画框 → 不存 bbox; 不划词 → 不存 prompt_spans。
  const untimedLabel = el("label", "loc-field loc-untimed");
  const untimedBox = el("input"); untimedBox.type = "checkbox"; untimedBox.name = "untimed";
  untimedLabel.append(untimedBox, document.createTextNode(" 不指定时间区间 / 帧（如指令未遵循，无具体画面）"));
  form.insertBefore(untimedLabel, form.querySelector(".loc-field"));
  const timeNames = ["start", "key", "end"];
  function syncUntimed() {
    timeNames.forEach((n) => { fields[n].disabled = untimedBox.checked; fields[n].closest("label").classList.toggle("off", untimedBox.checked); });
    if (untimedBox.checked) setDrawing(false);
  }
  untimedBox.onchange = () => {
    if (!untimedBox.checked && LOC.metaReady && !fields.key.value) {
      const t = vid.currentTime || 0;
      fields.start.value = Math.max(0, t - 0.3).toFixed(3); fields.key.value = t.toFixed(3);
      fields.end.value = Math.min(dur() || t + 0.6, t + 0.6).toFixed(3);
    }
    syncUntimed();
  };
  const spanBox = el("div", "loc-field loc-spans");
  function drawSpanBox() {
    spanBox.replaceChildren(el("span", "loc-spans-title", "划词（可选）"));
    if (!PROMPT_SPAN.draft.length) {
      spanBox.appendChild(el("span", "block-hint", "在上方 [Stage1 参考素材] 的 prompt 里划选文字即可添加；不需要可不划。"));
      return;
    }
    PROMPT_SPAN.draft.forEach((sp, i) => {
      const chip = el("span", "loc-span-chip", sp.text.length > 40 ? sp.text.slice(0, 40) + "…" : sp.text);
      chip.title = sp.text;
      const x = button("✕", () => { PROMPT_SPAN.draft.splice(i, 1); promptSpanChanged(); }, chip);
      x.type = "button"; x.title = "移除这段划词";
      spanBox.appendChild(chip);
    });
    const clear = button("清除划词", () => { PROMPT_SPAN.draft = []; promptSpanChanged(); }, spanBox); clear.type = "button";
  }
  form.appendChild(spanBox);
  const onDraftChange = () => { if (!disposed) drawSpanBox(); };
  window.addEventListener("prompt-span-draft", onDraftChange);
  const tools = el("div", "loc-controls");
  const drawButton = button("画框", () => setDrawing(!drawing), tools);
  drawButton.title = "可选：没有具体画面可框时不用画";
  button("清除框", () => { draftBox = null; drawBoxes(); }, tools);
  const saveButton = button(isAdmin() ? "保存管理员证据" : "保存人审证据", () => {}, tools);
  saveButton.type = "submit"; saveButton.onclick = null;
  button("重置草稿", () => resetDraft(), tools);
  const formHint = el("span", "review-status"); tools.appendChild(formHint);
  form.appendChild(tools); editor.appendChild(form);
  if (!(window.PAGE_MULTI_REVIEW && isReviewer()) && !reviewLocked()) left.appendChild(editor);
  // 划词只在展开「＋ 人审标注」时才可用; 收起即关闭并丢弃草稿
  PROMPT_SPAN.canEdit = false;
  function setDrawing(on) {
    if (on && untimedBox.checked) return;
    drawing = on; layer.classList.toggle("drawing", on); drawButton.classList.toggle("on", on);
    drawButton.textContent = on ? "结束画框" : "画框";
    if (on) { vid.pause(); loop = null; selected = null; redraw(); }
  }
  function resetDraft(keepSpans = false) {
    draftBox = null; editId = null; setDrawing(false);
    untimedBox.checked = false; syncUntimed();
    if (!keepSpans) { PROMPT_SPAN.draft = []; PROMPT_SPAN.active = null; }
    promptSpanChanged();
    const t = vid.currentTime || 0;
    fields.start.value = Math.max(0, t - 0.3).toFixed(3); fields.key.value = t.toFixed(3);
    fields.end.value = Math.min(dur() || t + 0.6, t + 0.6).toFixed(3);
    fields.tag.value = ""; if (fields.sev) fields.sev.value = "";
    fields.obs.value = ""; formHint.textContent = "";
    saveButton.textContent = isAdmin() ? "保存管理员证据" : "保存人审证据"; drawBoxes();
  }
  function editEvidence(m) {
    editor.open = true; PROMPT_SPAN.canEdit = true; vid.pause(); loop = null; selected = null; editId = m.id;
    untimedBox.checked = !timed(m); syncUntimed();
    if (timed(m)) { fields.start.value = (m.tr || [m.t, m.t])[0]; fields.key.value = m.t; fields.end.value = (m.tr || [m.t, m.t])[1]; }
    else { fields.start.value = fields.key.value = fields.end.value = ""; }
    PROMPT_SPAN.draft = cleanPromptSpans(m.prompt_spans).map((x) => ({ start: x.start, end: x.end, text: String(x.text || "") }));
    PROMPT_SPAN.active = m.id; promptSpanChanged();
    fields.tag.value = m.tag;
    if (fields.sev) fields.sev.value = m.sev == null ? "" : String(m.sev);
    fields.obs.value = m.obs || "";
    draftBox = m.bbox && [...m.bbox]; if (timed(m)) seekTo(m.t); redraw();
    saveButton.textContent = "保存修改";
  }
  function point(event) {
    const rect = layer.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)),
      Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000))];
  }
  layer.onpointerdown = (event) => {
    if (!drawing || !LOC.metaReady) return;
    event.preventDefault(); dragStart = point(event); layer.setPointerCapture(event.pointerId);
    fields.key.value = vid.currentTime.toFixed(3);
  };
  layer.onpointermove = (event) => {
    if (!dragStart) return;
    const end = point(event);
    draftBox = [Math.min(dragStart[0], end[0]), Math.min(dragStart[1], end[1]), Math.max(dragStart[0], end[0]), Math.max(dragStart[1], end[1])].map(Math.round);
    drawBoxes();
  };
  layer.onpointerup = layer.onpointercancel = () => {
    dragStart = null;
    if (draftBox && (draftBox[2] <= draftBox[0] || draftBox[3] <= draftBox[1])) draftBox = null;
    drawBoxes();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const untimedNow = untimedBox.checked;
    const a = Number(fields.start.value), t = Number(fields.key.value), b = Number(fields.end.value);
    if (!untimedNow && (!LOC.metaReady || [fields.start, fields.key, fields.end].some((f) => f.value === "")
        || ![a, t, b].every(Number.isFinite) || a < 0 || b < a || t < a || t > b || b > dur())) {
      formHint.textContent = "时间须在视频范围内，且起点 ≤ 关键时刻 ≤ 终点；标单帧时三个时间可相同；无具体画面可勾选「不指定时间区间 / 帧」。"; return;
    }
    if (!fields.tag.value.trim()) { formHint.textContent = "请填写标签"; return; }
    const id = editId || "human:" + (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(16).slice(2));
    const evidence = { bbox: draftBox && [...draftBox], tag: fields.tag.value.trim(), obs: fields.obs.value.trim() };
    if (!untimedNow) { evidence.t = t; evidence.tr = [a, b]; }
    if (PROMPT_SPAN.draft.length) evidence.prompt_spans = PROMPT_SPAN.draft.map((x) => ({ start: x.start, end: x.end, text: x.text }));
    // 没选就不写这个键 —— 下游按"有没有 sev"区分"没分级"和"分级为1", 写 0/null 会混淆
    if (fields.sev?.value) evidence.sev = Number(fields.sev.value);
    saveButton.disabled = true; formHint.textContent = "保存中…";
    try {
      await saveReviewRecord(c, { kind: "evidence", entity: id, evidence }, scope);
      if (disposed) return;
      resetDraft(); refreshEvidence(); formHint.textContent = "已保存";
      pick(marks.find((m) => m.id === id && (!window.PAGE_MULTI_REVIEW || m.review_role === reviewRole()))); vid.pause();
    } catch (e) { formHint.textContent = "保存失败: " + e.message; }
    finally { saveButton.disabled = false; }
  };
  editor.addEventListener("toggle", () => {
    if (disposed) return;
    PROMPT_SPAN.canEdit = editor.open;
    if (!editor.open) { setDrawing(false); PROMPT_SPAN.draft = []; PROMPT_SPAN.active = null; }
    promptSpanChanged();
  });
  function tick() {
    if (disposed) return;
    if (!vid.paused && loop && !vid.seeking && (vid.currentTime >= loop[1] - 0.005 || vid.currentTime < loop[0])) vid.currentTime = loop[0];
    fill.style.width = (vid.currentTime / (dur() || 1)) * 100 + "%";
    clock.textContent = `${vid.currentTime.toFixed(2)} / ${dur().toFixed(2)}s`;
  }
  vid.addEventListener("timeupdate", tick);
  vid.addEventListener("seeking", () => {
    if (!disposed && document.activeElement === vid) wrap.focus({ preventScroll: true });
    if (loop && (vid.currentTime < loop[0] || vid.currentTime > loop[1])) {
      vid.currentTime = Math.max(loop[0], Math.min(loop[1], vid.currentTime));
    }
  });
  vid.addEventListener("seeked", () => {
    // Chromium's native timeline keeps keyboard focus inside its closed shadow
    // tree and can swallow Space before page handlers see it. After seeking,
    // move focus to our player wrapper, where playbackKey owns the shortcut.
    if (!disposed && document.activeElement === vid) wrap.focus({ preventScroll: true });
  });
  vid.addEventListener("ended", () => { if (loop) seekTo(loop[0], true); });
  vid.addEventListener("play", () => { playButton.textContent = "暂停"; });
  vid.addEventListener("pause", () => { playButton.textContent = "播放"; });
  vid.addEventListener("loadedmetadata", () => {
    if (disposed) return;
    LOC.metaReady = true; fitLayer();
    const m = current(); if (m && loop) loop = interval(m);
    if (LOC.pending != null) { const t = LOC.pending; LOC.pending = null; seekTo(t, pendingPlay); }
    else if (pendingPlay) play();
    if (!editId && !draftBox) resetDraft(true);
    drawMarks(); drawNav(); tick();
  });
  vid.addEventListener("error", () => { status.textContent = "视频加载失败，请检查素材路径"; });
  function playbackKey(event) {
    if (event.code !== "Space" && event.key !== " ") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (vid.paused && !pendingPlay) play();
    else { pendingPlay = false; vid.pause(); }
  }
  // Keep focus on the clicked timeline so Space controls playback instead of
  // scrolling the detail pane. Capture native video keys to avoid double toggles.
  track.addEventListener("keydown", playbackKey);
  wrap.addEventListener("keydown", playbackKey, true);
  track.onclick = (event) => {
    track.focus({ preventScroll: true });
    if (!LOC.metaReady) return;
    const r = track.getBoundingClientRect(); seekTo((event.clientX - r.left) / r.width * dur());
  };
  const observer = new ResizeObserver(fitLayer); observer.observe(wrap);
  const fullscreenChange = () => { if (!disposed) syncView(); };
  const escape = (event) => {
    if (event.key === "Escape") { if (isLarge()) changeView("inline"); setDrawing(false); }
  };
  document.addEventListener("fullscreenchange", fullscreenChange);
  document.addEventListener("keydown", escape);
  // rAF checks the boundary between timeupdate events, also during slow playback.
  let raf;
  const animate = () => { tick(); if (!disposed) raf = requestAnimationFrame(animate); };
  raf = requestAnimationFrame(animate);
  LOC.cleanup = () => {
    disposed = true; vid.pause(); observer.disconnect(); cancelAnimationFrame(raf);
    window.removeEventListener("prompt-span-draft", onDraftChange);
    PROMPT_SPAN.canEdit = false; PROMPT_SPAN.draft = []; PROMPT_SPAN.active = null;
    document.removeEventListener("fullscreenchange", fullscreenChange); document.removeEventListener("keydown", escape);
    block.classList.remove("loc-expanded");
    if (document.fullscreenElement === block) document.exitFullscreen().catch(() => {});
    LOC.cleanup = null;
  };
  LOC.goto = (id) => { const m = marks.find((e) => !e.human && String(e.id) === String(id)); if (m) { pick(m); wrap.scrollIntoView({ block: "nearest" }); } };
  LOC.seekFrame = (t) => { loop = null; selected = null; seekTo(t); redraw(); };
  drawSpanBox(); resetDraft(true); refreshEvidence(); syncView();
}

function renderFrames(c, root) {
  if (c.nativeVideoMeta || c.wf2?.nativeTimeline) {
    root.appendChild(el("p", "block-hint", "本轮输入为原生视频。实际视频与参考图见分阶段输入，证据框图和放大图见证据复核。"));
    return;
  }
  const fr = c.frames;
  const frameIndices = videoFrameIndices(c);
  const visibleFrames = new Set(frameIndices);
  // 只有真的混了不止一类图才需要标 —— 老集全是"待评视频抽帧"一类, 标了纯属噪声
  const spans = c.spans || [];
  const multiKind = new Set(frameIndices.map(i => spanKindOf(spans, i)).filter(Boolean)).size > 1;

  // 帧号 -> 该帧上的框
  const byFrame = new Map();
  const outOfRange = [];
  c.ev.forEach((e) => {
    e.boxes.forEach((b) => {
      const i = frameIndexOf(fr, b.n);
      if (i < 0) { outOfRange.push(b.n); return; }
      if (!byFrame.has(i)) byFrame.set(i, []);
      byFrame.get(i).push({ ...b, ref: e.ref });
    });
  });

  // 模型 grounding 框 (rubricV3 系列): 单独一层, [模型框] 按钮开关。
  // 和 <ref>+<box> 证据框分开存 —— 两者可以同时出现, 关掉一层不影响另一层。
  const mg = parseGrounding(c);
  const mdlByFrame = new Map();
  mg.boxes.forEach((b) => {
    if (b.n >= (fr.nf || 0)) { mg.oor.push(b.f); return; }
    if (!mdlByFrame.has(b.n)) mdlByFrame.set(b.n, []);
    mdlByFrame.get(b.n).push(b);
  });
  if (state.showMdl == null) state.showMdl = true;   // 记住开关, 换 case 不重置
  const boxesOf = (i) => (byFrame.get(i) || [])
    .concat(state.showMdl ? (mdlByFrame.get(i) || []) : []);
  const framesWithBox = () =>
    frameIndices.filter(i => boxesOf(i).length).length;

  // 把一组框画到 canvas 里的 img 上。归一化框 (0-1000) 直接换百分比;
  // 像素框 (thinkV3) 要除以图的真实宽高 —— naturalWidth 在图加载完之前是 0,
  // 所以有像素框时挂到 load 事件上画, 不能同步画。
  const drawBoxes = (canvas, img, boxes) => {
    const place = () => boxes.forEach((b) => {
      // 集没声明坐标系时 (见 parseGrounding), 用真实帧尺寸现判: 框超出帧边界就
      // 只可能是 [0,1000] 归一化; 否则当像素。判错只是框画歪, 不影响任何指标。
      if (b.auto && img.naturalWidth && img.naturalHeight) {
        b.px = !(b.box[2] > img.naturalWidth || b.box[3] > img.naturalHeight);
        b.auto = false;
      }
      // 用户手动指定了口径就以它为准 (state.boxNorm: null=自动 / true=归一化 / false=像素)。
      // 只对模型自己画的框生效 —— 标注给的证据框一直是像素, 没有歧义。
      const pxMode = (b.mdl && state.boxNorm != null) ? !state.boxNorm : b.px;
      const W = pxMode ? img.naturalWidth : 1000, H = pxMode ? img.naturalHeight : 1000;
      if (!W || !H) return;
      const [x1, y1, x2, y2] = b.box;
      const d = el("div", "evbox" + (b.mdl ? " mdl" : ""));
      d.style.left = `${(x1 / W) * 100}%`;
      d.style.top = `${(y1 / H) * 100}%`;
      d.style.width = `${((x2 - x1) / W) * 100}%`;
      d.style.height = `${((y2 - y1) / H) * 100}%`;
      if (y1 / H < 0.06) d.classList.add("near-top");
      d.appendChild(el("span", null,
        b.mdl ? (b.ta ? `模型: ${b.ta}` : "模型框") : (b.ref || "框")));
      canvas.appendChild(d);
    });
    if (boxes.every((b) => !b.px && !b.auto)) { place(); return; }
    if (img.complete && img.naturalWidth) place();
    else img.addEventListener("load", place, { once: true });
  };

  const top = el("div", "point-top");

  // ── 左: 原始视频 ──
  const vcol = el("div", "block");
  const vhead = el("div", "block-head");
  vhead.appendChild(el("h3", "block-title", "原始视频"));
  vhead.appendChild(el("span", "pill count", `${frameIndices.length} 帧输入`));
  // 混了参考素材时, 把"这 41 张里哪几张是什么"直接摆在标题上, 不用点开帧带数
  if (multiKind) {
    spans.forEach((s) => vhead.appendChild(
      el("span", "pill count", `${s.kind} ${s.end - s.start + 1}`)));
  }
  if (c.videoKind === "preview") vhead.appendChild(el("span", "pill warn", "帧合成预览"));
  if (byFrame.size || mdlByFrame.size) {
    vhead.appendChild(el("span", "pill warn", `${framesWithBox()} 帧有框`));
  }
  vcol.appendChild(vhead);
  vcol.appendChild(videoBox(c.video, c.videoNote, c.videoKind));
  vcol.appendChild(el("span", "tag-label", "模型判定"));
  const tl = el("div", "taglist");
  tl.appendChild(el("span", `tag ${["tp","tn"].includes(cellOf(c)) ? "clean" : "hit"}`,
    `${(c.incomplete ? "未知" : cellLabel(c))}`));
  tl.appendChild(el("span", "tag other", `gold ${c.gold}`));
  tl.appendChild(el("span", "tag other",
    `pred ${c.pred == null ? (c.incomplete ? "未知（推理未完整成功）" : "未解析") : c.pred}${c.answer ? ` (${c.answer})` : ""}`));
  vcol.appendChild(tl);
  vcol.appendChild(metaGrid([
    ["来源", c.src], ["unique_id", c.uid],
    ["延迟", c.lat != null ? c.lat + "s" : ""],
    ["finish", c.finish],
  ]));
  top.appendChild(vcol);

  // ── 右: 当前帧大图 + 框详情 ──
  const fcol = el("div", "block");
  const fhead = el("div", "block-head");
  fhead.appendChild(el("h3", "block-title", "帧 + 模型给的框"));
  const fcount = el("span", "block-hint");
  fhead.appendChild(fcount);
  fcol.appendChild(fhead);
  const big = el("div", "frame-big");
  fcol.appendChild(big);
  const info = el("div", "boxinfo");
  fcol.appendChild(info);
  top.appendChild(fcol);
  // ★ 开了「问题定位」的页面不再渲染这一整行(左"原始视频" + 右"帧 + 模型给的框"):
  //   视频和框都在上面那块看, 这里重复一遍只是占地方。
  //   但 top / big / info 仍然**建出来**(只是不挂到 DOM), 因为下面的帧胶片、
  //   跳帧、框叠加全都在往它们身上写 —— 少建一个就是一串 null 引用。
  //   ★ 0918: 判据从「页面开没开 locator」改成「locator 这一条**真的渲染了吗**」。
  //   renderLocator 在 `!c.video` 时会直接 return, 而它跑在 renderFrames 之前、
  //   开头把 LOC.video 重置成 null —— 所以 LOC.video 就是「渲染了」的可靠信号。
  //   只看开关的旧写法在「开了 locator 但这条没有视频」时会两头落空:
  //   locator 不渲染, 这一行又被抽掉, 详情页直接空一块。崩坏那 62 个 run 100% 带
  //   video 所以从没暴露; 文字不可读的 train-512(7400 条) 是 0% 覆盖, 一开就中。
  if (!window.PAGE_LOCATOR || !LOC.video) root.appendChild(top);

  // 保留帧号切模型时, 新的这条可能更短 —— 不钳会去请求一张不存在的帧
  if (!visibleFrames.has(state.frame)) state.frame = frameIndices[0] ?? 0;

  if (!frameIndices.length) {
    big.appendChild(el("p", "empty-state", "这条没有输入帧 (images 为空)"));
    return;
  }

  // ── 全部输入帧的帧条 ──
  const strip = el("div", "block");
  const shead = el("div", "block-head");
  shead.appendChild(el("h3", "block-title", "全部输入帧"));
  // [模型框] 开关: rubricV3 系列 think 段里的 grounding 定位。和红色证据框分层,
  // 关掉只隐藏紫色的模型框。
  let syncEvBtn = () => {};   // 由下面的 [只看证据帧] 填上
  if (mdlByFrame.size) {
    const tg = el("button", "vfilter" + (state.showMdl ? " on" : ""),
      `模型框 ${mdlByFrame.size} 帧`);
    tg.title = "response think 段 grounding 里的 bbox; "
      + (mg.boxes[0] && mg.boxes[0].px ? "像素坐标(按原图宽高换算)" : "[0,1000] 归一化");
    tg.onclick = () => {
      state.showMdl = !state.showMdl;
      tg.classList.toggle("on", state.showMdl);
      syncEvBtn();
      buildStrip();
      paint();
    };
    shead.appendChild(tg);

    /* 坐标口径开关。同一份 bbox 数字, 两种贴法:
         归一化 -> 除以 1000 当百分比
         像素   -> 除以该帧真实宽高
       为什么要手动: 有的集**不声明坐标系** (r10-t20 的 prompt 只写 "bbox":[x1,y1,x2,y2]),
       模型各按自己的训练约定输出, 同一个集里两种混着; 自动判据只在框越界时才有把握。
       让人一键切过去看哪种贴得上, 比猜快得多。提取的原始 bbox 一个数都不变。 */
    const modeName = () => state.boxNorm == null
      ? (mg.boxes[0] && mg.boxes[0].px ? "自动 · 像素" : "自动 · 归一化")
      : (state.boxNorm ? "归一化" : "像素");
    const nb = el("button", "vfilter" + (state.boxNorm != null ? " on" : ""),
      `坐标 ${modeName()}`);
    nb.title = "模型框的 bbox 怎么贴到图上。自动 = 按集声明; 集没声明时按框是否越界现判。\n"
      + "点一下在 自动 → 归一化 → 像素 之间循环。只影响画框, 不改任何指标。";
    nb.onclick = () => {
      state.boxNorm = state.boxNorm == null ? true : (state.boxNorm ? false : null);
      mg.boxes.forEach((b) => { if (b.auto0 == null) b.auto0 = b.auto; });
      nb.textContent = `坐标 ${modeName()}`;
      nb.classList.toggle("on", state.boxNorm != null);
      paint();
      buildStrip();
    };
    shead.appendChild(nb);
  }

  // [只看证据帧] 40 张帧里通常只有 2~3 张有框, 逐张扫太慢。
  // 数的是"当前显示口径"下有框的帧 —— 关掉模型框之后紫框那些帧就不算数了。
  const evBtn = el("button", "vfilter", "");
  syncEvBtn = () => {
    const n = framesWithBox();
    evBtn.textContent = `只看证据帧 ${n}`;
    evBtn.disabled = !n;
    evBtn.title = n
      ? "帧条里只留有框的帧, 帧号照旧是 0 基原下标, 不重新编号"
      : "当前口径下没有任何带框的帧";
    // 关掉模型框之后一个带框的帧都不剩时, 筛选必须自己退掉, 否则帧条空成一片
    if (!n && state.evOnly) state.evOnly = false;
    evBtn.classList.toggle("on", state.evOnly);
  };
  syncEvBtn();
  evBtn.onclick = () => {
    state.evOnly = !state.evOnly;
    evBtn.classList.toggle("on", state.evOnly);
    buildStrip();
    paint();
  };
  shead.appendChild(evBtn);

  // [特定帧] 输入下标直跳。0 基, 和 response 里的"第 N 帧"、缩略图标号同一套。
  const jump = document.createElement("input");
  jump.type = "number";
  jump.className = "frame-jump";
  jump.min = frameIndices[0];
  jump.max = frameIndices[frameIndices.length - 1];
  jump.placeholder = `跳到帧 ${jump.min}-${jump.max}`;
  jump.title = "输入帧下标 (0 基) 回车跳过去; 该帧被 [只看证据帧] 滤掉时会自动取消筛选";
  const jumpGo = () => {
    const v = parseInt(jump.value, 10);
    if (!Number.isInteger(v) || !visibleFrames.has(v)) return;
    // 跳到一个没有框的帧时, 筛选开着会让它在帧条里根本不存在 —— 自动关掉,
    // 否则用户看到大图跳了、帧条没动, 会以为跳错了
    if (state.evOnly && !boxesOf(v).length) {
      state.evOnly = false;
      evBtn.classList.remove("on");
      buildStrip();
    }
    state.frame = v;
    paint();
    row.querySelector(`.ev-thumb[data-f="${v}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  };
  jump.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); jumpGo(); } };
  jump.onchange = jumpGo;
  shead.appendChild(jump);

  shead.appendChild(el("p", "block-hint",
    ((byFrame.size || mdlByFrame.size)
      ? "点击切换 · 红边=这帧上有框 (红=证据框, 紫=模型 grounding)"
      : "点击切换 · 这条 response 没有帧级证据 (油腻感的 target 就是裸 answer)")
    + (multiKind
      ? " · 这条混了参考素材, 每张缩略图左上角标了它是哪一类 —— "
        + "参考图是生成时的输入, 不是待评画面"
      : "")));
  strip.appendChild(shead);
  const row = el("div", "ev-strip");
  strip.appendChild(row);
  root.appendChild(strip);

  const paint = () => {
    const i = state.frame;
    const boxes = boxesOf(i);
    const kind = multiKind ? spanKindOf(spans, i) : null;
    fcount.textContent = `第 ${i} 帧 (共 ${frameIndices.length})`
      + (kind ? ` · ${kind}` : "") + ` · ${boxes.length} 个框`;

    big.innerHTML = "";
    const img = el("img");
    img.src = gatewaySafeMediaUrl(frameUrl(fr, i));
    big.appendChild(img);
    drawBoxes(big, img, boxes);

    info.innerHTML = "";
    boxes.forEach((b, k) => {
      const card = el("div", "boxcard");
      const head = el("div", "boxcard-head");
      head.appendChild(el("span", "boxdot" + (b.mdl ? " mdl" : "")));
      head.appendChild(el("span", null,
        b.mdl ? "模型 grounding" : (b.ref || `框 ${k + 1}`)));
      head.appendChild(el("span", "boxcard-coord",
        `[${b.box[0]}, ${b.box[1]}] → [${b.box[2]}, ${b.box[3]}]  `
        + (b.mdl ? (b.px ? "(像素坐标, 按原图宽高换算)" : "(0-1000 归一化)")
                 : "(0-999 归一化)")));
      card.appendChild(head);
      // grounding 自带的文字判读: 实际读到什么 / 应该是什么 / 为什么算不可读
      if (b.mdl && (b.ta || b.te2 || b.why || b.issue)) {
        const bd = el("div", "boxcard-body");
        if (b.ta || b.te2) bd.appendChild(el("div", null,
          `实际: ${b.ta || "—"}` + (b.te2 ? `　应为: ${b.te2}` : "")));
        if (b.issue) bd.appendChild(el("div", null, `问题: ${b.issue}`));
        if (b.why) bd.appendChild(el("div", "block-hint", b.why));
        card.appendChild(bd);
      }
      info.appendChild(card);
    });
    if (!boxes.length) {
      info.appendChild(el("p", "block-hint", "这一帧模型没给框"));
    }

    row.querySelectorAll(".ev-thumb")
       .forEach((n) => n.classList.toggle("on", Number(n.dataset.f) === i));
  };

  const buildStrip = () => {
    row.innerHTML = "";
    for (const i of frameIndices) {
      const bx = boxesOf(i);
      if (state.evOnly && !bx.length) continue;
      const b = el("button", "ev-thumb" + (bx.length ? " cited" : ""));
      // 帧号挂在 DOM 上: 一开筛选, 第 k 个缩略图就不再是第 k 帧,
      // 高亮/键盘/跳转全都得按这个真实帧号来找
      b.dataset.f = i;
      const canvas = el("div", "frame-canvas thumb");
      const img = el("img");
      img.src = gatewaySafeMediaUrl(frameUrl(fr, i));
      img.loading = "lazy";
      canvas.appendChild(img);
      // 非"待评视频抽帧"的才标 —— 40 张待评帧每张都挂个标签会把帧带糊满,
      // 而真正需要一眼认出来的就是那少数几张参考素材
      const kind = multiKind ? spanKindOf(spans, i) : null;
      if (kind && kind !== "待评视频抽帧") {
        canvas.appendChild(el("span", "thumb-kind", kind));
      }
      // 缩略图上也画框, 扫帧条时不用逐帧点开
      drawBoxes(canvas, img, bx);
      b.appendChild(canvas);
      // 标号用 0 基下标 —— 和 response 里的"第 N 帧"同一套, 能直接对着看
      b.appendChild(el("div", "ev-cap",
        `${i}` + (bx.length ? ` ·${bx.length}框` : "")));
      b.onclick = () => {
        state.frame = i; paint();
        // 开了「问题定位」时大图那一栏已经撤掉了, 点缩略图改成**把视频 seek 到这一帧**,
        // 否则点了没有任何反应。时间由 wf2 那套同一个口径给(见 build_eval.frame_seconds),
        // 这里只在证据里找同帧的那条; 找不到就不动 —— 不自己按 i/fps 猜, 那会错
        // (评测集对盘上的帧做过均匀降采样, 第 i 张 ≠ 盘上第 i 帧)。
        if (window.PAGE_LOCATOR && typeof LOC.seekFrame === "function") {
          const t = fr.times?.[i];
          const m = (LOC.marks || []).find((x) => x.frame === i);
          if (Number.isFinite(t)) LOC.seekFrame(t);
          else if (m) LOC.seekFrame(m.t);
        }
      };
      row.appendChild(b);
    }
    if (!row.children.length) {
      row.appendChild(el("p", "block-hint", "当前口径下没有带框的帧"));
    }
  };
  buildStrip();
  paint();

  // 帧号对不上要显式说出来, 否则看的人会以为证据都画上了 / 画准了。
  const notes = [];
  if (outOfRange.length) {
    const u = [...new Set(outOfRange)].sort((a, b) => a - b);
    notes.push(
      `response 引用了 ${u.length} 个超出输入范围的帧号 (${u.slice(0, 12).join(", ")}` +
      `${u.length > 12 ? " …" : ""}), 这些框画不出来 —— 输入只有 ${fr.nf} 张 (下标 0..${fr.nf - 1})。`);
  }
  if (mg.oor.length) {
    const u = [...new Set(mg.oor)].sort((a, b) => a - b);
    notes.push(
      `模型 grounding 引用了 ${u.length} 个超出待评范围的帧号 (${u.slice(0, 12).join(", ")}` +
      `${u.length > 12 ? " …" : ""}), 这些模型框画不出来。`);
  }
  if (c.claimNf != null && c.claimNf !== fr.nf) {
    notes.push(
      `模型自报"覆盖 x/${c.claimNf} 帧", 但实际只送进去 ${fr.nf} 张 —— 它连收到几帧都数错了, ` +
      `所以帧号只能当近似位置看, 别把画上去的框当成精确定位。`);
  }
  if (notes.length) root.appendChild(el("p", "warn-note", notes.join(" ")));
}

/* ---------------------------------------------------- 两阶段 (agentic-critic)

   和上面的 renderWorkflow 不是一回事: 那个是 cascade-v2 的 ensemble (route/reducer/
   arms), 这个是 Recaller -> Verifier 两阶段。数据在 c.wf2 (键名不能用 wf, 已被占)。

   渲染两块:
     Stage1  召回出的证据清单 —— 帧号可点, 跳到对应帧看框
     Stage2  逐证据裁决表 —— zoom 缩略图 | 帧/区间 | 判定 | 理由, 点开看完整对话
   证据和裁决按 evidence_id 对齐; 判「是」的证据标红, 判「否」标灰 ——
   这样"上游框了什么"和"下游怎么判的"在同一屏里能对上。
*/
// Keep the model verdict separate from the run's severity threshold.
function evidenceVerdictText(v, w) {
  const lab = v?.label == null ? null : Number(v.label);
  const verdict = lab === 1 ? "判是" : lab === 0 ? "判否" : (v?.stage1Only ? "直出" : "未裁决");
  const sev = v?.severity;
  if (typeof sev !== "number" || !Number.isFinite(sev)) return verdict;
  return `${verdict} · severity=${sev}`;
}

function aggregationRuleText(w) {
  if (w?.incomplete) return "本视频推理未完整成功，pred 为未知；已有局部结果不替代完整裁决，不按负例计分。";
  const threshold = w?.min_severity;
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    return `聚合层不调模型：本轮证据阈值为 severity >= ${threshold}。`
      + "达到阈值的证据用于视频级判定；最终 pred 以本轮聚合输出为准。";
  }
  return "聚合层不调模型: pred = OR(所有证据的 label); 命中证据的 bbox/reasoning 写进 response。";
}

function evidenceAuditText(v, primaryLabel) {
  const status = v?.auditStatus;
  if (status === "verified") return "已核验";
  if (status === "severity_disputed") return "强度有争议";
  if (status === "disputed") return "证据有争议";
  if (status === "audit_missing") return "核验缺失";
  if (status === "rejection_disputed") return "判否理由有争议";
  if (status === "rejection_agreed") return "复审同意判否";
  if (Number(primaryLabel) === 0) return "主判否 · 未入审";
  return "未核验";
}

function evidenceAuditClass(v, primaryLabel) {
  if (v?.auditStatus === "verified") return "verified";
  if (["disputed", "severity_disputed", "audit_missing"].includes(v?.auditStatus)) {
    return "disputed";
  }
  if (v?.auditStatus === "rejection_disputed") return "disputed";
  if (v?.auditStatus === "rejection_agreed") return "reviewed-negative";
  return Number(primaryLabel) === 0 ? "not-used" : "unaudited";
}

function evidenceAuditSummary(w) {
  const a = w?.audit;
  if (!a) return "";
  const good = Number(a.n_verified_hits || 0);
  const all = Number(a.n_primary_hits || 0);
  const rejected = (a.rejection_disputed_evidence_ids || []).length;
  const tail = rejected ? ` · 另有 ${rejected} 条判否理由有争议` : "";
  if (a.status === "verified_only") return `证据核验 ${good}/${all} · 全部命中证据已核验${tail}`;
  if (a.status === "alternative") return `证据核验 ${good}/${all} · 优先采用绿色证据，黄色证据不作为解释${tail}`;
  if (a.status === "disputed_only") return `证据核验 0/${all} · 主判定保留，但当前解释均有争议${tail}`;
  if (a.status === "rejected_candidate") return `发现 ${rejected} 条判否理由有争议 · 视频主判定暂不改变`;
  return `证据核验 ${good}/${all}${tail}`;
}

function renderTwoStage(c, root, embedded) {
  const w = c.wf2;
  if (!w || !twoStageMode(w.mode)) return;

  const byId = {};
  (w.s2 || []).forEach((v) => { byId[String(v.id)] = v; });
  const nHit = (w.s2 || []).filter((v) => Number(v.label) === 1).length;
  // 高召回直出会带 Stage1 生成的复核图片；它们不是 Verifier 的裁决记录。
  const verifierSkipped = String(w.mode) === "2-stage-high-recall";
  const verifierNote = verifierSkipped
    ? "Verifier 未执行（高召回直出）"
    : `Verifier 判「是」${nHit} 条`;
  const auditNote = evidenceAuditSummary(w);

  const block = el("div", embedded ? "" : "block");
  if (!embedded) {
    const head = el("div", "block-head");
    head.appendChild(el("h3", "block-title", "两阶段轨迹"));
    head.appendChild(el(
      "p", "block-hint",
      `Recaller 召回 ${w.ev.length} 条证据 · ${verifierNote} · ` +
      `聚合 pred=${c.pred}` + (auditNote ? ` · ${auditNote}` : "")
      + (w.rubric ? ` · 判定细则 ${w.rubric}` : "")
    ));
    block.appendChild(head);
  } else {
    block.appendChild(el("p", "block-hint",
      `召回 ${w.ev.length} 条证据 · ${verifierNote} · 聚合 pred=${c.pred}`
      + (auditNote ? ` · ${auditNote}` : "")
      + (w.rubric ? ` · 判定细则 ${w.rubric}` : "")
      + " —— 上游框了什么与下游怎么判的, 在同一行里对齐。"));
  }

  if (!w.ev.length) {
    // 零证据不是"没渲染", 是这条真的什么都没召回 —— 说清楚, 免得被当成页面坏了
    block.appendChild(el(
      "p", "block-hint",
      w.incomplete ? "本视频推理未完整成功，预测未知；没有有效证据不能作为无崩坏结论。" : "召回阶段没有产出任何证据, 因此没有第二阶段可看 (聚合规则: 无证据 => pred=0)。"));
    root.appendChild(block);
    return;
  }

  const frameOf = (e) => (e.frame != null ? e.frame : e.start_frame);
  const rangeTxt = (e) => (e.start_frame != null
    ? `第 ${e.start_frame}~${e.end_frame} 帧` : `第 ${e.frame} 帧`);

  // 多标签维度(动态基础质量): 每条证据认领了一个 L3, 多一列。单标签维度没有
  // tag 字段, 整列不出现 —— 老评测的表宽不变。
  const hasTag = (w.ev || []).some((e) => e.tag);
  const hasAudit = !!w.audit;

  const tb = el("table", "ts-table");
  const hr = el("tr", "");
  ["证据", "帧", ...(hasTag ? ["L3 标签"] : []), "zoom", "裁决",
   ...(hasAudit ? ["证据核验"] : []), "理由 / 召回描述"]
    .forEach((t) => { hr.appendChild(el("th", "", t)); });
  tb.appendChild(hr);

  const auditRank = (e) => {
    const v = byId[String(e.id)];
    return v?.auditStatus === "verified" ? 0
      : v?.auditStatus === "rejection_disputed" ? 1
      : ["disputed", "severity_disputed", "audit_missing"].includes(v?.auditStatus) ? 2
      : Number(v?.label) === 0 ? 3 : 1;
  };
  const shownEvidence = hasAudit
    ? [...w.ev].sort((a, b) => auditRank(a) - auditRank(b))
    : w.ev;
  shownEvidence.forEach((e) => {
    const v = byId[String(e.id)];
    const lab = v?.label == null ? null : Number(v.label);
    const auditClass = hasAudit ? ` audit-${evidenceAuditClass(v, lab)}` : "";
    const tr = el("tr", (lab === 1 ? "ts-hit" : (lab === 0 ? "ts-pass" : "ts-none"))
      + auditClass);

    const tdId = el("td", "ts-id", "#" + e.id);
    tdId.appendChild(reviewControls(c, "machine:" + e.id));
    tr.appendChild(tdId);

    const tdF = el("td", "ts-frame");
    // 跳帧照抄上面证据卡片那套: frameIndexOf 把"模型说的帧号"映射到实际输入下标
    // (两者不一定相等 —— 模型的帧号基准本身就不确定), 映射不到就禁用按钮并说明。
    const idx = w.nativeTimeline ? -1 : frameIndexOf(c.frames, frameOf(e));
    const a = el("button", "vfilter ts-jump", rangeTxt(e));
    const nativeJump = w.nativeTimeline && Number.isFinite(e.t)
      && typeof LOC !== "undefined" && typeof LOC.goto === "function"
      && LOC.marks.some(m => String(m.id) === String(e.id));
    if (idx < 0 && !nativeJump) {
      a.disabled = true;
      a.title = w.nativeTimeline ? "原生视频时间定位不可用；辅助图片不是原始帧序列。"
        : `帧号超出输入范围 (只有 0..${(c.frames.nf || 1) - 1})`;
    } else {
      a.onclick = () => {
        // 有「问题定位」播放器时优先驱动它 —— 直接 seek 到真视频那一刻,
        // 比在帧胶片里翻缩略图直观得多; 没有(单轮评测/拿不到视频)才退回帧胶片。
        if (typeof LOC.goto === "function" && LOC.marks.some(
              (m) => String(m.id) === String(e.id))) {
          LOC.goto(e.id);
          return;
        }
        state.frame = idx;
        const t = document.querySelectorAll(".ev-thumb")[idx];
        if (t) { t.click(); t.scrollIntoView({ block: "nearest", inline: "center" }); }
      };
    }
    tdF.appendChild(a);
    tr.appendChild(tdF);

    if (hasTag) {
      const tdT = el("td", "ts-tag");
      tdT.appendChild(el("span", "l3-chip" + (state.l3 != null
        && tagsOf(state.run)[state.l3] === e.tag ? " on" : ""),
        e.tag || "—"));
      // 时序类证据带了区间上下文, 标出来 —— 判"抖没抖/变没变"靠的就是这几帧
      if (Array.isArray(e.frame_range)) {
        tdT.appendChild(el("div", "ts-obs",
          `时序 ${e.frame_range[0]}~${e.frame_range[1]}`));
      }
      tr.appendChild(tdT);
    }

    const tdZ = el("td", "ts-zoom");
    const zooms = ((v && v.zoom) || []).slice(0, 2);
    zooms.forEach((u) => {
      const im = el("img", "ts-zoom-img");
      im.src = gatewaySafeMediaUrl(u);
      im.loading = "lazy";
      im.onclick = () => window.open(gatewaySafeMediaUrl(u), "_blank");
      tdZ.appendChild(im);
    });
    // 兼容旧高召回产物：新产物一定有「原图框 + 放大图」两张。
    if (!zooms.length) {
      const raw = frameUrl(c.frames, idx);
      if (raw) {
        const im = el("img", "ts-zoom-img");
        im.src = gatewaySafeMediaUrl(raw);
        im.loading = "lazy";
        im.title = "旧产物未生成证据复核图：显示 Stage1 的原始证据帧";
        im.onclick = () => window.open(gatewaySafeMediaUrl(raw), "_blank");
        tdZ.appendChild(im);
      }
    }
    tr.appendChild(tdZ);

    const tdL = el("td", "ts-label");
    tdL.appendChild(el(
      "span", "ts-badge " + (lab === 1 ? "bad" : lab === 0 ? "ok" : "dim"),
      evidenceVerdictText(v, w)));
    tr.appendChild(tdL);

    if (hasAudit) {
      const tdA = el("td", "ts-audit");
      tdA.appendChild(el("span", "audit-badge " + evidenceAuditClass(v, lab),
        evidenceAuditText(v, lab)));
      if (v?.auditSeverity != null) {
        tdA.appendChild(el("div", "ts-obs", `audit severity=${v.auditSeverity}`));
      }
      tr.appendChild(tdA);
    }

    const tdW = el("td", "ts-why");
    if (v && v.why) tdW.appendChild(el("div", "ts-reason", v.why));
    if (hasAudit && v?.auditWhy) {
      const auditPrefix = v.auditStatus === "verified" ? "核验依据: "
        : v.auditStatus === "rejection_agreed" ? "复审判否依据: " : "审计反证: ";
      tdW.appendChild(el("div", "audit-reason " + evidenceAuditClass(v, lab),
        auditPrefix + v.auditWhy));
      if (v.auditReviewer) {
        tdW.appendChild(el("div", "ts-obs", `复核来源: ${v.auditReviewer}`));
      }
    }
    if (e.obs) tdW.appendChild(el("div", "ts-obs", "召回: " + e.obs));
    if (e.want && e.want !== "无") {
      tdW.appendChild(el("div", "ts-obs", "指令要求: " + e.want));
    }
    if (v && v.resp) {
      const d = el("details", "ts-more");
      d.appendChild(el("summary", "", `完整裁决对话 (${v.nimg} 张图)`));
      const pre = el("pre", "resp-box");
      pre.textContent = v.resp;
      d.appendChild(pre);
      tdW.appendChild(d);
    }
    tr.appendChild(tdW);
    tb.appendChild(tr);
  });
  block.appendChild(tb);

  if (w.s1resp) {
    const d = el("details", "ts-more");
    d.appendChild(el("summary", "", "Stage1 (Recaller) 原始输出"));
    const pre = el("pre", "resp-box");
    pre.textContent = w.s1resp;
    d.appendChild(pre);
    block.appendChild(d);
  }
  root.appendChild(block);
}

function renderWorkflow(c, root) {
  if (!c.wf) return;
  const block = el("div", "block");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", "Agentic workflow"));
  head.appendChild(el(
    "p", "block-hint",
    c.wf.route + " · " + c.wf.reducer + " · " + c.wf.called.length + " arm(s)"
  ));
  block.appendChild(head);
  const compact = {
    route: c.wf.route,
    matched_terms: c.wf.matched,
    negated_terms: c.wf.negated,
    reducer: c.wf.reducer,
    arms: c.wf.arms,
    final_pred: c.pred,
  };
  const pre = el("pre", "resp-box");
  pre.textContent = JSON.stringify(compact, null, 2);
  block.appendChild(pre);
  // Agentic workflows often put grounding text in the selected arm response,
  // while the top-level reducer response only contains the final decision.
  // Show the actual grounding response explicitly so the displayed context
  // matches the boxes rendered above.
  if (c.gresp) {
    block.appendChild(el("h4", "block-title", "实际 grounding arm response"));
    const gp = el("pre", "resp-box");
    gp.textContent = c.gresp;
    block.appendChild(gp);
  }
  root.appendChild(block);
}

function renderResponse(c, root) {
  if (c.ev.length) {
    const eb = el("div", "block");
    const h = el("div", "block-head");
    h.appendChild(el("h3", "block-title", "模型给出的证据"));
    h.appendChild(el("p", "block-hint", "点帧号跳到那一帧"));
    eb.appendChild(h);
    c.ev.forEach((e, index) => {
      const card = el("div", "ev-card");
      const hd = el("div", "ev-head");
      hd.appendChild(el("span", "ev-ref", e.ref || "(无 ref)"));
      hd.appendChild(el("span", "ev-frames", `${e.boxes.length} 帧`));
      hd.appendChild(reviewControls(c, "machine:" + (e.no ?? index)));
      card.appendChild(hd);
      const fl = el("div", "ev-frames");
      e.boxes.forEach((b, i) => {
        const idx = frameIndexOf(c.frames, b.n);
        const a = el("button", "vfilter", `${b.n}`);
        if (idx < 0) { a.disabled = true; a.title = `超出输入范围 (只有 0..${(c.frames.nf || 1) - 1})`; }
        else a.onclick = () => {
          state.frame = idx;
          const t = document.querySelectorAll(".ev-thumb")[idx];
          if (t) { t.click(); t.scrollIntoView({ block: "nearest", inline: "center" }); }
        };
        fl.appendChild(a);
        if (i < e.boxes.length - 1) fl.appendChild(document.createTextNode(" "));
      });
      card.appendChild(fl);
      eb.appendChild(card);
    });
    root.appendChild(eb);
  }

  const rb = el("div", "block");
  const h = el("div", "block-head");
  h.appendChild(el("h3", "block-title", "response 原文"));
  h.appendChild(el("p", "block-hint", `${c.resp.length} 字符`));
  rb.appendChild(h);
  const pre = el("pre", "resp-box");
  // 高亮 <ref>/<box>/<answer>, 用 DOM 拼而不是 innerHTML —— response 是模型输出,
  // 里面有尖括号, 拼 HTML 会被当标签解析
  const re = /(<ref>.*?<\/ref>)|(<box>.*?<\/box>)|(<answer>.*?<\/answer>)/gs;
  let last = 0, m;
  while ((m = re.exec(c.resp))) {
    if (m.index > last) pre.appendChild(document.createTextNode(c.resp.slice(last, m.index)));
    pre.appendChild(el("span", m[1] ? "mk-ref" : m[2] ? "mk-box" : "mk-ans", m[0]));
    last = m.index + m[0].length;
  }
  if (last < c.resp.length) pre.appendChild(document.createTextNode(c.resp.slice(last)));
  rb.appendChild(pre);
  root.appendChild(rb);

  // 两阶段: 这里也只摊 stage1 那一轮, 否则同一页会把 stage2 的提示词重复铺两遍
  renderMessages(c, root, null, isTwoStage(c) ? 1 : 0);
}

/* ------------------------------------------------ 阶段切换器 (stage1 / stage2 / 聚合)

   上面的"两阶段轨迹"是**聚合视角** —— 把 stage1 的 observation 和 stage2 的 reasoning
   拼进一张表看对齐。但排查模型行为时要看的是**每一阶段自己收到什么、吐出什么**:
   拼过的看不出格式问题 (stage2 到底拿没拿到 zoom 图? 提示词里 Evidence 一节长什么样?
   模型有没有按 {"reasoning","label"} 的契约输出?)。
   所以这里按阶段分屏, 每屏都是"原始输入 + 原始输出", 一律不加工。

   数据来源:
     stage1 输入 = 这条 case 的顶层 messages (聚合时原样搬过来的, 复用 renderMessages)
     stage1 输出 = wf2.s1resp
     stage2 输入 = wf2.s2[i].msg   —— 文本走 run 级文本池, 图存 URL (0903 起才有)
     stage2 输出 = wf2.s2[i].resp
     聚合输出   = c.resp
*/
function isTwoStage(c) {
  return !!(c.wf2 && twoStageMode(c.wf2.mode));
}

/* 带划词的 prompt 块。pre 的 textContent 恒等于 prompt 原文, 高亮只是把文本切段包 <span>,
   所以选区偏移 (从 pre 起点量到选区起点的字符数) 就是 prompt 里的下标。 */
function promptPart(c, prompt) {
  const uid = reviewUid(c);
  if (PROMPT_SPAN.uid !== uid) { PROMPT_SPAN.uid = uid; PROMPT_SPAN.draft = []; PROMPT_SPAN.active = null; }
  const wrap = el("div", "msg-text prompt-select-wrap");
  wrap.appendChild(el("div", "msg-imgs-cap", "原始任务提示"));
  const long = prompt.length > TEXT_FOLD;
  const pre = el("pre", "msg-text-body prompt-select" + (long ? " folded" : ""));
  const hint = el("div", "block-hint prompt-span-hint");
  function paint() {
    const saved = humanEvidence(c).flatMap((m) => cleanPromptSpans(m.prompt_spans).map((x) => ({ ...x, id: m.id, tag: m.tag })));
    const draft = cleanPromptSpans(PROMPT_SPAN.draft);
    const cuts = new Set([0, prompt.length]);
    [...saved, ...draft].forEach((x) => { cuts.add(Math.min(x.start, prompt.length)); cuts.add(Math.min(x.end, prompt.length)); });
    const pts = [...cuts].sort((a, b) => a - b);
    pre.replaceChildren();
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], text = prompt.slice(a, b);
      if (!text) continue;
      const hit = saved.filter((x) => x.start <= a && x.end >= b);
      const isDraft = draft.some((x) => x.start <= a && x.end >= b);
      if (!hit.length && !isDraft) { pre.appendChild(document.createTextNode(text)); continue; }
      const active = hit.some((x) => x.id === PROMPT_SPAN.active);
      const node = el("mark", "prompt-hl" + (isDraft ? " draft" : "") + (active ? " active" : ""), text);
      if (hit.length) node.title = hit.map((x) => x.tag).filter(Boolean).join(" / ");
      pre.appendChild(node);
    }
    hint.textContent = PROMPT_SPAN.canEdit
      ? `可选：划选上面的 prompt 文字作为划词标注${draft.length ? `（当前草稿 ${draft.length} 段，保存证据时一并写入）` : ""}；不需要可不划。`
      : "";
  }
  function offsetOf(range) {
    const r = document.createRange();
    r.selectNodeContents(pre); r.setEnd(range.startContainer, range.startOffset);
    const start = r.toString().length;
    return [start, start + range.toString().length];
  }
  function onSelect() {
    if (!PROMPT_SPAN.canEdit) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!pre.contains(range.startContainer) || !pre.contains(range.endContainer)) return;
    let [start, end] = offsetOf(range);
    while (start < end && /\s/.test(prompt[start])) start++;
    while (end > start && /\s/.test(prompt[end - 1])) end--;
    if (end <= start) return;
    const draft = PROMPT_SPAN.draft;
    if (!draft.some((x) => x.start === start && x.end === end)) {
      draft.push({ start, end, text: prompt.slice(start, end) });
      draft.sort((a, b) => a.start - b.start);
    }
    sel.removeAllRanges();
    promptSpanChanged();
  }
  pre.addEventListener("mouseup", onSelect);
  pre.addEventListener("keyup", (e) => { if (e.shiftKey) onSelect(); });
  PROMPT_SPAN.redraw = paint;
  paint();
  wrap.append(pre, hint);
  if (long) {
    const btn = el("button", "msg-fold", `展开全文 (${prompt.length} 字)`);
    btn.onclick = () => {
      const f = pre.classList.toggle("folded");
      btn.textContent = f ? `展开全文 (${prompt.length} 字)` : "收起";
    };
    wrap.appendChild(btn);
  }
  return wrap;
}

/* glb 两张对照表 (1020): 结构化 PE = 指令要求的分镜, Video Caption = 画面实际的分镜。
   数据在 wf2.pe / wf2.shots (build_eval 透传), 没有就整块不画 —— 只有 glb workflow v2 有。
   PE 只留核心字段, instruction_constraints 在建站时就已去掉。
   帧号 1 起、4fps: 秒 = (帧号 − 1) ÷ 4, 与 caption 提示词同一口径。 */
function renderPeCaption(c, root) {
  const w = c.wf2 || {};
  const pe = w.pe, cap = w.shots;
  if (!pe && !(cap && cap.length)) return;
  const sec = (f) => `${((f - 1) / 4).toFixed(2).replace(/\.?0+$/, "")}s`;
  const want = pe?.shot_count?.value, got = cap ? cap.length : null;
  const off = want != null && got != null && want !== got;

  const card = (title, badge, bad, head, rows) => {
    const box = el("div", "pc-card");
    const h = el("div", "pc-head");
    h.appendChild(el("span", "pc-title", title));
    if (badge) h.appendChild(el("span", "pc-badge" + (bad ? " bad" : ""), badge));
    box.appendChild(h);
    if (!rows.length) {
      box.appendChild(el("p", "pc-empty", title === "生成视频的分镜 & 画面内容 Caption" && pe
        ? "caption 阶段对这条视频没产出可解析的分镜表（模型返回的 JSON 坏了，重试也没救回），下游 stage1 是在没有分镜表的情况下判的。"
        : "无数据"));
      return box;
    }
    const t = el("table", "pc-table");
    const tr = el("tr");
    head.forEach(([name, cls]) => tr.appendChild(el("th", cls || "", name)));
    t.appendChild(el("thead")).appendChild(tr);
    const tb = t.appendChild(el("tbody"));
    rows.forEach((cells) => {
      const r = el("tr");
      cells.forEach(([v, cls]) => r.appendChild(el("td", cls || "", v == null || v === "" ? "—" : String(v))));
      tb.appendChild(r);
    });
    box.appendChild(t);
    return box;
  };

  const block = el("div", "block pe-caption");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", "Prompt 结构化 × 生成视频的分镜 & 画面内容 Caption"));
  head.appendChild(el("p", "block-hint", off
    ? `镜头数不一致：指令要求 ${want} 个，画面实际 ${got} 个`
    : "左：指令要求的分镜；右：画面实际的分镜"));
  block.appendChild(head);
  const grid = el("div", "pc-grid");

  // 转场两种格式: glb harness 是字符串 + transition_source; 服务版 PE (1027 起) 是 {kind, text, source}
  const peTransition = (s) => {
    const t = s.transition, obj = t && typeof t === "object";
    const kind = obj ? t.kind : t, source = obj ? t.source : s.transition_source;
    return kind ? kind + (source === "写明" ? "" : "·默认") : "";
  };
  const peRows = (pe?.shots || []).map((s) => [
    [`#${s.id}`, "pc-id"],
    [Array.isArray(s.time) ? `${s.time[0]}–${s.time[1]}s` : "", "pc-num"],
    [peTransition(s), "pc-tr"],
    [s.instruction, "pc-text"],
  ]);
  grid.appendChild(card("Prompt 结构化",
    pe ? `要求 ${want ?? "?"} 个镜头 · ${pe.shot_count?.source || "?"}` : "本 run 无 PE",
    off, [["镜头", "pc-id"], ["时间", "pc-num"], ["转场", "pc-tr"], ["指令", "pc-text"]], peRows));

  const capRows = (cap || []).map((s) => {
    const fr = Array.isArray(s.frame_range) ? s.frame_range : null;
    return [
      [`#${s.id}`, "pc-id"],
      [fr ? `${fr[0]}–${fr[1]} 帧\n${sec(fr[0])}–${(fr[1] / 4).toFixed(2).replace(/\.?0+$/, "")}s` : "", "pc-num"],
      [s.transition, "pc-tr"],
      [(s.pe_shot || []).length ? s.pe_shot.map((x) => `#${x}`).join(" ") : "无对应", "pc-id"],
      [s.video_caption, "pc-text"],
    ];
  });
  grid.appendChild(card("生成视频的分镜 & 画面内容 Caption",
    cap ? `实际 ${got} 个镜头` : pe ? "这条 caption 失败" : "本 run 无 caption", off || (pe && !cap),
    [["镜头", "pc-id"], ["帧 / 秒", "pc-num"], ["转场", "pc-tr"], ["对应 PE", "pc-id"], ["画面描述", "pc-text"]],
    capRows));

  block.appendChild(grid);
  root.appendChild(block);
}

function renderStage1References(c, root) {
  if (!window.PAGE_REFERENCE_MANIFEST) return;
  const ref = c.pageReference;
  const block = el("div", "block stage-reference");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", "Stage1 参考素材"));
  const referenceHint = ref?.files?.length
    ? `${ref.type || "参考素材"} · ${ref.files.length} 个文件`
    : ref?.prompt
      ? "仅提供参考 prompt，无参考图片或参考视频。"
      : "该样本没有参考 prompt、参考图片或参考视频。";
  head.appendChild(el("p", "block-hint", referenceHint));
  block.appendChild(head);
  if (ref?.prompt) block.appendChild(promptPart(c, ref.prompt));
  const base = String(c.video || "").replace(/[^/]*$/, "");
  // New manifests contain public paths; old manifests may contain a bare
  // filename relative to the generated video. Support both contracts.
  const urls = (ref?.files || []).map((name) =>
    String(name).includes("/") ? String(name) : base + encodeURIComponent(name));
  urls.filter((u) => /\.mp4$/i.test(u)).forEach((u) => block.appendChild(videoPart(u, "参考视频")));
  // 参考图横排, 两种尺寸可切: 大图(默认, 质检要看细节, 单张同 1027 前的 560×420 上限)
  // / 缩略图(104px, 同「待评视频抽帧」; PAGE_REF_VIEW="thumb" 的页默认这个)。每人每页记住自己的选择。
  // 点任一张 -> openRefViewer 全屏看原图。
  // ★ 不用 .ev-thumb: imagePart 靠 querySelectorAll(".ev-thumb")[i] 跳帧, 混进来会把下标挤歪。
  const imgs = urls.filter((u) => !/\.mp4$/i.test(u));
  if (imgs.length) {
    const viewKey = `site2.refView:${location.pathname}`;
    let big = window.PAGE_REF_VIEW !== "thumb";
    try { const saved = localStorage.getItem(viewKey); if (saved) big = saved === "big"; } catch {}
    const strip = el("div", "ref-strip");
    const toggle = el("button", "vfilter ref-view-toggle");
    toggle.type = "button";
    const paint = () => {
      strip.classList.toggle("big", big);
      toggle.textContent = big ? "切到缩略图" : "切到大图";
    };
    toggle.onclick = () => {
      big = !big;
      paint();
      try { localStorage.setItem(viewKey, big ? "big" : "thumb"); } catch {}
    };
    head.appendChild(toggle);
    imgs.forEach((u, k) => {
      const b = el("button", "ref-thumb");
      b.type = "button";
      b.title = `${u.split("/").pop()} · 点击看原图`;
      const img = el("img");
      img.src = gatewaySafeMediaUrl(u);
      img.loading = "lazy";
      b.appendChild(img);
      b.appendChild(el("div", "ev-cap", `Image ${k + 1}`));
      b.onclick = () => openRefViewer(imgs, k);
      strip.appendChild(b);
    });
    paint();
    block.appendChild(strip);
  }
  root.appendChild(block);
}

/* 参考图全屏查看: ← → 切换, Esc / 点空白关闭。
   键盘在捕获阶段截住, 别让页面的翻条 / 跳帧快捷键同时触发。 */
function openRefViewer(urls, start) {
  let k = start;
  const overlay = el("div", "ref-viewer");
  const img = el("img", "ref-viewer-img");
  const cap = el("span", "ref-viewer-cap");
  const open = el("a", "ref-viewer-open", "新标签页打开");
  open.target = "_blank";
  open.rel = "noopener";
  const show = () => {
    const u = gatewaySafeMediaUrl(urls[k]);
    img.src = u;
    open.href = u;
    cap.textContent = `Image ${k + 1} / ${urls.length} · ${urls[k].split("/").pop()}`;
  };
  const step = (d) => { k = (k + d + urls.length) % urls.length; show(); };
  const close = () => { window.removeEventListener("keydown", onKey, true); overlay.remove(); };
  const onKey = (e) => {
    if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") close();
    else if (urls.length > 1) step(e.key === "ArrowLeft" ? -1 : 1);
  };
  const bar = el("div", "ref-viewer-bar");
  if (urls.length > 1) {
    for (const [label, d] of [["‹ 上一张", -1], ["下一张 ›", 1]]) {
      const nav = el("button", "vfilter", label);
      nav.type = "button";
      nav.onclick = () => step(d);
      bar.appendChild(nav);
    }
  }
  const shut = el("button", "vfilter", "关闭 (Esc)");
  shut.type = "button";
  shut.onclick = close;
  bar.append(cap, open, shut);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.append(img, bar);
  window.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  show();
}

function renderStageTabs(c, root) {
  const w = c.wf2;
  if (!w || !twoStageMode(w.mode)) return;

  const s2 = w.s2 || [];
  const st = { cur: "s1", ev: 0 };

  const block = el("div", "block");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", "分阶段原文"));
  head.appendChild(el("p", "block-hint",
    "每一阶段的原始输入与输出, 不做拼接加工 —— 用来核对提示词与模型输出的真实形态。"));
  block.appendChild(head);

  const bar = el("div", "stage-tabs");
  const body = el("div", "stage-body");

  const respBlock = (title, text, open) => {
    const d = el("details", "ts-more");
    d.open = open !== false;
    d.appendChild(el("summary", "", `${title} · ${(text || "").length} 字符`));
    const pre = el("pre", "resp-box");
    pre.textContent = text || "(空)";
    d.appendChild(pre);
    return d;
  };

  function drawStage2Input(v) {
    const pool = (state.msg && state.msg.texts) || [];
    if (!v.msg) {
      const p = el("p", "block-hint",
        "这条的 stage2 输入没有随产物落盘 —— aggregate.py 从 0903 起才把它带出来。"
        + "重新聚合一次即可补上 (不用重跑模型)。下面是该条裁决用到的图片:");
      body.appendChild(p);
      (v.zoom || []).forEach((u) => {
        const im = el("img", "stage-img");
        im.src = gatewaySafeMediaUrl(u); im.loading = "lazy";
        body.appendChild(im);
      });
      return;
    }
    const wrap = el("div", "msg-turn");
    wrap.appendChild(el("span", "msg-role role-user", "user"));
    const inner = el("div", "msg-body");
    inner.appendChild(el("p", "block-hint", requestMediaSummary(
      v.msg.filter(p => p[0] === "v").length,
      v.msg.filter(p => p[0] === "i").length, v.native_video_meta?.request_sent)));
    if (v.native_video_meta) inner.appendChild(textPart("原生视频请求元数据\n" + JSON.stringify(v.native_video_meta, null, 2)));
    // ★ 0930: 连续图片横排成一组 (同一类只标一次), 不再一张一行竖着排;
    //   指令遵循 harness 在图前插的 "[第k帧]" 标号并进角标, 不单独占一段。
    const LABEL_RE = /^\[([^\[\]\n]{1,24})\]$/;
    let row = null, rowKind = null, pending = null;
    v.msg.forEach((p, k) => {
      const next = v.msg[k + 1];
      if (p[0] === "t") {
        const m = LABEL_RE.exec((pool[p[1]] || "").trim());
        if (m && next && next[0] === "i") { pending = m[1]; return; }
      }
      if (p[0] === "i") {
        const kind = p[2] || "图片";
        if (!row || rowKind !== kind) {
          inner.appendChild(el("div", "msg-imgs-cap", kind + " · image_url"));
          row = el("div", "s2-imgs-row"); rowKind = kind;
          inner.appendChild(row);
        }
        const a = el("a", "s2-thumb");
        a.href = gatewaySafeMediaUrl(p[1]); a.target = "_blank"; a.rel = "noopener";
        const im = el("img");
        im.src = gatewaySafeMediaUrl(p[1]); im.loading = "lazy";
        a.appendChild(im);
        if (pending) a.appendChild(el("span", "msg-thumb-n", pending));
        pending = null;
        row.appendChild(a);
        return;
      }
      row = null; rowKind = null; pending = null;
      if (p[0] === "t") {
        inner.appendChild(textPart(pool[p[1]] || `(文本池缺 #${p[1]})`));
      } else if (p[0] === "v") {
        inner.appendChild(videoPart(p[1], p[2]));
      }
    });
    wrap.appendChild(inner);
    body.appendChild(wrap);
  }

  function draw() {
    body.innerHTML = "";
    if (st.cur === "s1") {
      if (state.showMachineEvidence) {
        body.appendChild(el("p", "block-hint",
          "Recaller 只找证据、不下结论。以下按实际请求展示媒体、Basic Rubric 与 Output Format；原生视频和抽帧图片分别标注。"));
        renderMessages(c, body, "Stage1 输入 · messages", 1);
        if (c.nativeVideoMeta || w.native_video_meta) body.appendChild(textPart("原生视频请求元数据\n" + JSON.stringify(w.native_video_meta || c.nativeVideoMeta, null, 2)));
        body.appendChild(respBlock("Stage1 输出 · response", w.s1resp));
      } else {
        body.appendChild(el("p", "block-hint",
          "盲标模式下 Recaller 输入输出已隐藏；任务提示与参考素材显示在上方原始视频之前。"));
      }
    } else if (st.cur === "s2") {
      if (String(w.mode) === "2-stage-high-recall") {
        body.appendChild(el("p", "block-hint",
          "此高召回 run 只执行 Stage1，刻意跳过 Stage2 Verifier；聚合结果直接采用召回证据。"
          + " 原图红框与放大图请在「证据复核」查看。"));
      } else if (!s2.length) {
        body.appendChild(el("p", "block-hint",
          w.incomplete ? "S1 未完整成功，没有可用的 S2 请求；本视频预测未知。" : "召回阶段没有产出证据, 因此没有 stage2 样本 (聚合规则: 无证据 => pred=0)。"));
      } else {
        const pick = el("div", "stage-picker");
        s2.forEach((v, i) => {
          const lab = v.label == null ? null : Number(v.label);
          const b = el("button",
            "stage-ev" + (i === st.ev ? " on" : "")
            + (lab === 1 ? " hit" : lab === 0 ? " miss" : ""),
            `#${v.id} ${evidenceVerdictText(v, w)}`
            + (w.audit ? ` · ${evidenceAuditText(v, lab)}` : ""));
          b.onclick = () => { st.ev = i; draw(); };
          pick.appendChild(b);
        });
        body.appendChild(pick);
        body.appendChild(el("p", "block-hint",
          `一条证据一个请求。当前第 ${st.ev + 1}/${s2.length} 条 (证据 #${s2[st.ev].id})。` + ("model_version" in s2[st.ev] ? ` 回包模型版本：${s2[st.ev].model_version || "未报告"}。` : "")));
        drawStage2Input(s2[st.ev]);
        body.appendChild(respBlock("Stage2 输出 · response", s2[st.ev].resp));
      }
    } else if (st.cur === "agg") {
      body.appendChild(el("p", "block-hint",
        aggregationRuleText(w)));
      body.appendChild(respBlock("聚合输出 · response", c.resp));
    } else {
      // 证据复核: 原来那张"两阶段轨迹"表, 嵌进页签里
      renderTwoStage(c, body, true);
    }
  }

  const tabs = [["s1", "Stage1 · Recaller", state.showMachineEvidence
    ? `召回 ${(w.ev || []).length} 条证据` : "任务提示与参考素材"]];
  if (state.showMachineEvidence) tabs.push(
    ["s2", "Stage2 · Verifier", `${s2.length} 条逐证据裁决`],
    ["agg", "聚合结果", `pred=${c.pred}`],
    ["rev", "证据复核", "召回证据与逐条裁决对齐着看"]);
  tabs.forEach(([k, label, hint]) => {
    const b = el("button", "stage-tab" + (k === st.cur ? " on" : ""), label);
    b.title = hint;
    b.onclick = () => {
      st.cur = k;
      [...bar.children].forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      draw();
    };
    bar.appendChild(b);
  });
  block.appendChild(bar);
  block.appendChild(body);
  draw();
  root.appendChild(block);
}

/* ------------------------------------------------------------------ 模型输入 (messages)

   这些评测集是**多模态交叉输入**: 一条 user 消息里图文按特定顺序穿插, 而顺序本身
   是有意义的 —— 判定细则排在图片前面还是后面、每段图片前那句"以下 40 张是待评视频"
   到底说了什么, 都会影响模型怎么读。原先这里只把 run 级 prompt 当一坨纯文本贴出来,
   role、分段、图文次序全丢了, 带参考素材的集尤其看不出输入到底长什么样。

   数据来自两处拼装:
     state.msg.texts  —— run 级文本池 (判定细则那 1250 字全 run 共用一份)
     c.msg / state.msg.shape —— part 序列。全 run 结构一致时只在 run 级存一份
                                (老集 512 条结构完全相同), 否则逐条存。
   图片不重复存 URL, part 里只有序号, 这里用 frameUrl() 从已打包的 frames 还原,
   和上面的帧带共用同一份数据。 */

const MSG_ROLE = { system: "system", user: "user", assistant: "assistant" };
const TEXT_FOLD = 360;   // 超过这么多字就折叠 —— 判定细则有 1250 字, 不折会淹掉整块

/* only: 只渲染前 N 个 user 轮。两阶段产物的 c.msg 里装着**整条轨迹的全部请求**
   (stage1 一轮 + 每条证据一轮 stage2), 直接全铺出来会让 "Stage1 输入" 那一栏
   混进一堆 stage2 的提示词 —— 0913 被当成"stage1 里塞了 stage2 的请求"的 bug 报上来。
   stage2 的输入本来就在 Stage2 页签里逐条看, 这里只该显示 stage1 那一轮。 */
function renderMessages(c, root, title, only) {
  const pool = (state.msg && state.msg.texts) || [];
  let msgs = c.msg || (state.msg && state.msg.shape) || null;
  const nAll = msgs ? msgs.length : 0;
  if (msgs && only && msgs.length > only) msgs = msgs.slice(0, only);

  // 没有 messages 的老产物: 退回原来那个纯文本 prompt 块, 别让这一块直接消失
  if (!msgs || !msgs.length) {
    const prompt = state.run.prompt || c.prompt;
    if (!prompt) return;
    const pb = el("div", "block");
    const ph = el("div", "block-head");
    ph.appendChild(el("h3", "block-title", "prompt"));
    ph.appendChild(el("p", "block-hint",
      state.run.prompt ? "该 run 全部条目同一个 prompt" : "这条自己的 prompt (该 run 内有多种)"));
    pb.appendChild(ph);
    pb.appendChild(el("p", "prompt-box", prompt));
    root.appendChild(pb);
    return;
  }

  const spans = c.spans || [];
  const box = el("div", "block");
  const head = el("div", "block-head");
  head.appendChild(el("h3", "block-title", title || "模型输入 · messages"));
  // 图片 part 是区间, 数张数要累加 n 而不是数 part 个数
  const nImg = msgs.reduce((a, m) => a + m.parts.reduce(
    (b, p) => b + ("i" in p ? (p.n || 1) : 0), 0), 0);
  const nTxt = msgs.reduce((a, m) => a + m.parts.filter((p) => "t" in p).length, 0);
  const nVideo = msgs.reduce((a, m) => a + m.parts.filter((p) => "v" in p).length, 0);
  head.appendChild(el("span", "pill count", `${msgs.length} 轮`));
  head.appendChild(el("span", "pill count", `${nTxt} 段文字`));
  head.appendChild(el("span", "pill count", `${nImg} 张图`));
  head.appendChild(el("span", "pill count", `${nVideo} 个原生视频`));
  head.appendChild(el("p", "block-hint", requestMediaSummary(nVideo, nImg, c.nativeVideoMeta?.request_sent)));
  head.appendChild(el("p", "block-hint",
    nAll > msgs.length
      ? `按原始顺序还原的输入。这条轨迹一共 ${nAll} 次请求, 这里只显示 stage1 那一次 ——`
        + ` 其余 ${nAll - msgs.length} 次是 stage2 (一条证据一次), 在 Stage2 页签里逐条看。`
      : "按原始顺序还原的完整输入。assistant 轮就是上面那段 response, 不重复展示。"));
  box.appendChild(head);

  msgs.forEach((m) => {
    const turn = el("div", "msg-turn");
    turn.appendChild(el("span", `msg-role role-${m.role}`, MSG_ROLE[m.role] || m.role));
    const body = el("div", "msg-body");

    // 图片在产物里已经压成区间 {i: 起始, n: 张数} —— 一段抽帧本来就是一组,
    // 这里直接展开成序号列表交给 imagePart, 不用再合并连续 part
    // ★ 0930: 指令遵循 harness 在每张帧前插了 "[第k帧]" 标号文字, 原样渲染会把
    //   每张图劈成单独一组、竖着排一长串。这里把「短标号 + 紧跟的图」并回同一组横排,
    //   标号改成缩略图角标。只认整段就是 [..] 的短文字, 其他数据不受影响。
    const LABEL_RE = /^\[([^\[\]\n]{1,24})\]$/;
    let group = null;                      // {idxs: [], labels: []}
    const flush = () => {
      if (group) body.appendChild(imagePart(c, spans, group.idxs, group.labels));
      group = null;
    };
    m.parts.forEach((p, k) => {
      const next = m.parts[k + 1];
      const label = "t" in p ? LABEL_RE.exec((pool[p.t] || "").trim()) : null;
      if (label && next && "i" in next) {
        // 标号本身不单独渲染, 挂到下一张图上
        (group ||= { idxs: [], labels: [] }).pending = label[1];
        return;
      }
      if ("i" in p) {
        const idxs = Array.from({ length: p.n || 1 }, (_, j) => p.i + j);
        if (group && group.pending !== undefined) {
          group.idxs.push(...idxs);
          group.labels.push(group.pending, ...idxs.slice(1).map(() => null));
          delete group.pending;
          return;
        }
        flush();
        body.appendChild(imagePart(c, spans, idxs));
        return;
      }
      flush();
      if ("t" in p) {
        body.appendChild(textPart(pool[p.t] || ""));
      } else if ("v" in p) {
        body.appendChild(videoPart(p.v, p.kind));
      }
    });
    flush();
    turn.appendChild(body);
    box.appendChild(turn);
  });
  root.appendChild(box);
}

function requestMediaSummary(nVideo, nImg, sent) {
  return `${sent === false ? "未发送的预备输入媒体" : "实际请求媒体"}：${nVideo} 个 video_url（原生视频），${nImg} 个 image_url（图片/抽帧）。`;
}

function videoPart(url, kind) {
  const wrap = el("div", "msg-native-video");
  wrap.appendChild(el("div", "msg-imgs-cap", `${kind || "原生视频 · 用途未标注"} · video_url`));
  if (!url) {
    wrap.appendChild(el("p", "block-hint", "视频路径未映射，无法播放；原始请求包含 video_url。"));
    return wrap;
  }
  const video = el("video", "msg-video-player");
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.src = gatewaySafeMediaUrl(url);
  wrap.appendChild(video);
  const error = el("p", "block-hint");
  video.addEventListener("error", () => { error.textContent = "视频加载失败，请核对媒体路径或浏览器格式支持。"; });
  wrap.appendChild(error);
  return wrap;
}

function textPart(t) {
  const wrap = el("div", "msg-text");
  const long = t.length > TEXT_FOLD;
  const pre = el("pre", "msg-text-body" + (long ? " folded" : ""));
  pre.textContent = t;
  wrap.appendChild(pre);
  if (long) {
    const btn = el("button", "msg-fold", `展开全文 (${t.length} 字)`);
    btn.onclick = () => {
      const f = pre.classList.toggle("folded");
      btn.textContent = f ? `展开全文 (${t.length} 字)` : "收起";
    };
    wrap.appendChild(btn);
  }
  return wrap;
}

function imagePart(c, spans, idxs, labels) {
  const wrap = el("div", "msg-imgs");
  // 这一组图属于哪一类 (参考图 / 参考视频抽帧 / 待评视频抽帧) —— 取组内第一张的
  // span。混了多类时也标出来, 免得一组里其实跨了两段还当成一类读
  const kinds = [...new Set(idxs.map((i) => spanKindOf(spans, i)).filter(Boolean))];
  const cap = el("div", "msg-imgs-cap");
  cap.appendChild(el("span", "msg-imgs-kind", kinds.length ? kinds.join(" + ") : "图片"));
  cap.appendChild(el("span", "msg-imgs-n",
    `${idxs.length} 张 · 输入序号 ${idxs[0]}–${idxs[idxs.length - 1]}`));
  wrap.appendChild(cap);

  const row = el("div", "msg-imgs-row");
  idxs.forEach((i) => {
    const b = el("button", "msg-thumb");
    b.title = `第 ${i} 张 —— 点击在上面的帧查看器里打开`;
    const img = el("img");
    img.src = gatewaySafeMediaUrl(frameUrl(c.frames, i));
    img.loading = "lazy";
    b.appendChild(img);
    const label = labels && labels[idxs.indexOf(i)];
    b.appendChild(el("span", "msg-thumb-n", label || String(i)));
    // 点缩略图 = 让上面那个帧查看器切到同一帧, 不在这里再开一个大图查看器。
    // 复用证据列表里跳帧那套 (点对应的 .ev-thumb), 别自己重画整个 detail
    b.onclick = () => {
      const t = document.querySelectorAll(".ev-thumb")[i];
      if (t) { t.click(); t.scrollIntoView({ block: "nearest", inline: "center" }); }
    };
    row.appendChild(b);
  });
  wrap.appendChild(row);
  return wrap;
}

/* ------------------------------------------------------------------ 面板收放 + 主题 */

function wireReviewRoleSwitcher() {
  const switcher = $("reviewRoleSwitcher");
  if (!switcher || !window.PAGE_MULTI_REVIEW) return;
  const note = $("reviewRoleNote");
  const buttons = [...switcher.querySelectorAll("[data-review-role]")];
  const paint = () => {
    buttons.forEach((button) => {
      const on = button.dataset.reviewRole === reviewRole();
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    if (note) note.textContent = isAdjudicator()
      ? "只显示两位标注员的视频级分歧"
      : "独立标注，不显示另一位标注员的结果";
  };
  buttons.forEach((button) => {
    button.onclick = () => {
      const next = button.dataset.reviewRole;
      if (!REVIEW_ROLES.some((item) => item.key === next) || next === reviewRole()) return;
      REVIEW.role = next;
      REVIEW.filter = next === "reviewer_3" ? "conflict" : "all";
      try { localStorage.setItem("critic.review.role", next); } catch {}
      paint();
      if (!state.rows) return;
      renderCaseList();
      const rows = visibleRows();
      selectRow(rows.includes(state.row) ? state.row : (rows[0] || null), true);
    };
  });
  paint();
}

function wireChrome() {
  const shell = $("shell");
  const bar = $("restoreBar");
  const navR = $("navRestore");
  const listR = $("listRestore");
  const machineBtn = $("machineEvidenceToggle");
  wireReviewRoleSwitcher();
  if (machineBtn) {
    const paintMachineButton = () => {
      machineBtn.classList.toggle("on", state.showMachineEvidence);
      machineBtn.setAttribute("aria-pressed", String(state.showMachineEvidence));
      machineBtn.title = state.showMachineEvidence ? "点击隐藏机标证据" : "点击显示机标证据";
    };
    machineBtn.onclick = () => {
      state.showMachineEvidence = !state.showMachineEvidence;
      paintMachineButton();
      if (state.row) selectRow(state.row, true);
    };
    paintMachineButton();
  }

  // 「人标证据」叠加层开关 (评测页)。和机标那颗同构, 开了才把 humanEvidence(c)
  // 并进证据列表 —— 关着的时候页面和以前完全一样。
  const humanBtn = $("humanEvidenceToggle");
  if (humanBtn) {
    const paintHumanButton = () => {
      humanBtn.classList.toggle("on", state.showHumanEvidence);
      humanBtn.setAttribute("aria-pressed", String(state.showHumanEvidence));
      humanBtn.title = state.showHumanEvidence ? "点击隐藏人标证据" : "点击显示人标证据";
    };
    humanBtn.onclick = () => {
      state.showHumanEvidence = !state.showHumanEvidence;
      try { localStorage.setItem("critic.showHumanEvidence", String(state.showHumanEvidence)); } catch {}
      paintHumanButton();
      if (state.row) selectRow(state.row, true);
    };
    try {
      const saved = localStorage.getItem("critic.showHumanEvidence");
      if (saved !== null) state.showHumanEvidence = saved === "true";
      // ?human=1 / ?human=0 覆盖记忆值 —— 贴链接给别人时能把开关状态一起带过去,
      // 不然对方打开看到的是他自己上次的状态, 说的不是同一个画面。
      const q = new URLSearchParams(location.search).get("human");
      if (q !== null) state.showHumanEvidence = q !== "0" && q !== "false";
    } catch {}
    paintHumanButton();
  }

  const sync = () => {
    const n = shell.classList.contains("nav-collapsed");
    const l = shell.classList.contains("input-collapsed");
    navR.hidden = !n;
    listR.hidden = !l;
    bar.hidden = !n && !l;
  };
  const fb = $("modelFilterBtn");
  fb.onclick = () => {
    state.filterOpen = !state.filterOpen;
    fb.textContent = state.filterOpen ? "筛选模型 ▴" : "筛选模型 ▾";
    renderModelFilter(state.run);
  };

  $("navToggle").onclick = () => { shell.classList.add("nav-collapsed"); sync(); };
  navR.onclick = () => { shell.classList.remove("nav-collapsed"); sync(); };
  listR.onclick = () => { shell.classList.remove("input-collapsed"); sync(); };

  const theme = $("themeToggle");
  const applyTheme = (t) => {
    document.documentElement.className = t;
    theme.textContent = t === "dark" ? "切换浅色" : "切换深色";
    localStorage.setItem("site2-theme", t);
  };
  applyTheme(localStorage.getItem("site2-theme") || "light");
  theme.onclick = () =>
    applyTheme(document.documentElement.className === "dark" ? "light" : "dark");

  // 固定数据: 钉住的集跨刷新保留 —— 横着比一个集上的十几个模型往往要好几轮,
  // 中途刷新一次就得重新找集的话这功能就白做了。
  try {
    state.pinDs = JSON.parse(localStorage.getItem("eval.pinDs") || "null");
  } catch (e) { state.pinDs = null; }
  const pinBtn = $("pinDs");
  if (pinBtn) pinBtn.onclick = togglePinDs;

  try { state.lenient = !!localStorage.getItem("eval.lenient"); }
  catch (e) { state.lenient = false; }
  const lenBtn = $("lenientBtn");
  if (lenBtn) lenBtn.onclick = toggleLenient;

  // uid 搜索框。输入即筛, 不用回车 —— 贴一个 uid 进来就该立刻定位。
  // 唯一命中时直接选中那条, 省一次点击 (拿 uid 回看 case 是这个框的主要用法)。
  const sb = $("caseSearch");
  if (sb) {
    sb.oninput = () => {
      state.q = sb.value;
      state.shown = PAGE;
      renderFilters();
      renderCaseList();
      const vis = visibleRows();
      if (vis.length === 1) selectRow(vis[0]);
      else if (!vis.includes(state.row)) selectRow(vis[0] || null);
    };
    // Esc 清空。搜完想回到全量时不用手删。
    sb.onkeydown = (e) => {
      if (e.key === "Escape") { sb.value = ""; sb.oninput(); }
      e.stopPropagation();       // 别让方向键被全局的上一条/下一条抢走
    };
  }

  document.addEventListener("keydown", (e) => {
    if (!state.run || !state.rows) return;
    // 光标在"跳到帧"这类输入框里时, 方向键归输入框自己用
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.closest(".loc") || t.isContentEditable)) return;
    const vis = visibleRows();
    const i = vis.indexOf(state.row);
    if (e.key === "ArrowRight" && i < vis.length - 1) selectRow(vis[i + 1]);
    else if (e.key === "ArrowLeft" && i > 0) selectRow(vis[i - 1]);
    else if (state.case) {
      // 上下键在**帧条里实际渲染出来的**缩略图之间走。开了 [只看证据帧] 之后
      // 第 k 个缩略图不再是第 k 帧, 按 state.frame±1 取下标会跳到隔壁去。
      const thumbs = [...document.querySelectorAll(".ev-thumb")];
      const at = thumbs.findIndex((t) => Number(t.dataset.f) === state.frame);
      if (e.key === "ArrowDown" && at >= 0 && at < thumbs.length - 1) {
        thumbs[at + 1].click();
        thumbs[at + 1].scrollIntoView({ block: "nearest", inline: "center" });
      } else if (e.key === "ArrowUp" && at > 0) {
        thumbs[at - 1].click();
        thumbs[at - 1].scrollIntoView({ block: "nearest", inline: "center" });
      }
    }
  });
}

/* --------------------------------------------------------- 按页面裁剪索引 */
/* 同一份 data/eval/index.json 喂两个页面, 差别只在**渲染哪些格子**:
 *     eval.html          全维度, 但不要 2stage (它自成一条线, 会把主表撑乱)
 *     text-unread.html   只要文字不可读, 但**要**包含 2stage
 * 所以不能像 HIDDEN_EVAL_SETS 那样在 build 期丢掉 —— 那样 text-unread 也没了。
 * 规则由各自的 HTML 用 window.PAGE_FILTER 声明, 这里只负责执行, 缺省不裁。
 *   onlyDims:      只保留这些维度
 *   hideDatasetRe: 集 key 命中就丢
 *   onlyDatasetRe: 集 key **不**命中就丢 (白名单)
 * ★ onlyDatasetRe 是 0917 为 hands.html 加的: 那一页只看手部专项那一个集。
 *   用 hideDatasetRe 表达要写成否定前瞻 /^(?!…)/, 读的人得绕一圈才明白。
 *   缺省仍然不裁, 所以对已有几页完全无影响。
 * nav 和 runs 必须**一起**裁: 只裁 nav 的话侧栏干净了, 但 hash 直达和
 * bestModelOf 还能摸到被藏的 run, 页面会跳去一个侧栏上不存在的格子。 */
function applyPageFilter(d) {
  const f = window.PAGE_FILTER || {};
  if (!f.onlyDims && !f.hideDatasetRe && !f.onlyDatasetRe) return d;
  const dimOK = (dim) => !f.onlyDims || f.onlyDims.includes(dim);
  const dsOK = (key) => (!f.hideDatasetRe || !f.hideDatasetRe.test(key))
    && (!f.onlyDatasetRe || f.onlyDatasetRe.test(key));
  const nav = (d.nav || [])
    .filter((x) => dimOK(x.dim))
    .map((x) => ({ ...x, datasets: (x.datasets || []).filter((s) => dsOK(s.key)) }))
    .filter((x) => x.datasets.length);
  const keep = new Set();
  nav.forEach((x) => x.datasets.forEach((s) => keep.add(x.dim + " | " + s.key)));
  const runs = (d.runs || []).filter(
    (g) => g.dataset && keep.has(g.dim + " | " + g.dataset.key));
  return { ...d, nav, runs };
}

/* ------------------------------------------------------------------ 启动 */

window.addEventListener("blind-quality-slice-change", () => {
  if (!state.run || !window.BlindAccount?.isSuperadmin) return;
  state.filter = "all";
  state.shown = PAGE;
  renderCM(state.run);
  renderFilters();
  renderCaseList();
  const rows = visibleRows();
  if (!rows.includes(state.row)) selectRow(rows[0] || null);
});
window.addEventListener("blind-quality-filter-change", (event) => {
  if (!state.run || !window.BlindAccount?.isSuperadmin) return;
  state.filter = event.detail?.filter || "all";
  state.shown = PAGE;
  renderFilters();
  renderCaseList();
  const rows = visibleRows();
  if (!rows.includes(state.row)) selectRow(rows[0] || null);
});
window.addEventListener("blind-quality-metrics-change", () => {
  if (!state.run || !window.BlindAccount?.isSuperadmin) return;
  renderCM(state.run);
  renderFilters();
  renderCaseList();
  const rows = visibleRows();
  if (!rows.includes(state.row)) selectRow(rows[0] || null);
});

Promise.resolve(window.PAGE_READY).then(() => jget(dataUrl(`${DATA_DIR}/index.json`)))
  .then((raw) => {
    const d = applyPageFilter(raw);
    state.index = d;
    state.hidden = loadHidden();
    wireChrome();
    const key = decodeURIComponent(location.hash.slice(1));
    const hashed = d.runs.find((g) => g.key === key);
    // 没带 hash 进来时: 停在第一个维度的第一个评测集, 模型选**该集 F1 最高**的那个,
    // 而不是 runs[0] (那只是扫盘顺序里的第一个, 和好坏无关)
    let first = d.nav[0] && d.nav[0].datasets[0];
    // PAGE_NAV.defaultFamily: 没带 hash 时落到指定家族 (family || key), 族内取 F1 最高的那个变体
    const defFam = window.PAGE_NAV && window.PAGE_NAV.defaultFamily;
    if (defFam) {
      const cand = d.nav.flatMap((x) => x.datasets).filter((ds) => (ds.family || ds.key) === defFam);
      if (cand.length) first = cand.reduce((a, b) =>
        (f1Of(bestModelOf(b).run) > f1Of(bestModelOf(a).run) ? b : a));
    }
    // 过滤后可能一个 run 都不剩 (PAGE_FILTER 写窄了)。不拦的话 selectRun(undefined)
    // 会抛在渲染半途, 页面停在"加载中…", 看不出是过滤问题还是数据没 build。
    if (!first && !d.runs.length) {
      $("detail").innerHTML = "";
      $("detail").appendChild(el("p", "empty-state",
        "这一页的 PAGE_FILTER 过滤后没有任何 run —— 检查 window.PAGE_FILTER 或先跑 build_eval.py"));
      return;
    }
    return selectRun(hashed || (first ? runOf(bestModelOf(first).run) : d.runs[0]));
  })
  .catch((err) => {
    $("detail").innerHTML = "";
    $("detail").appendChild(
      el("p", "empty-state", `${DATA_DIR}/index.json 加载失败: ` + err.message +
        " —— 先跑 python build_eval.py"));
  });

