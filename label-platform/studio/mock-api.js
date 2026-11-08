/* mock-api.js —— critic-studio 双人盲标页的纯前端后端替身（博客内嵌用）。

   原平台的页面、样式、脚本一字未改；只在它们之前加载本文件和 mock-data.js：
     · /api/blind/*       按 serve.py + blind_store.py + blind_metrics.py 的规则在浏览器里实现
     · data-hands/、data/ 的 JSON 由 mock-data.js 里的裁剪子集直接返回（file:// 也能打开）
     · 其余请求（视频、帧图）照常走网络
   状态 = mock-data.js 的种子 + 本浏览器 localStorage 里的改动；「重置演示数据」回到种子。 */
(() => {
  "use strict";
  const DATA = window.STUDIO_DATA;
  if (!DATA) return;
  const STORE_KEY = "critic.studio-demo.v1";
  const SESSION_KEY = "critic.blind.account.v1";          // blind-account.js 自己的会话 key
  const ROLES = ["annotator_1", "annotator_2"];
  const ALL_ROLES = ["annotator_1", "annotator_2", "reviewer_3", "admin"];
  const VIDEO_PREFIX = "video_tag:";
  const BASE = new URL("./", location.href).href;
  const nativeFetch = window.fetch.bind(window);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  /* ------------------------------------------------------------ 状态与持久化 */
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };
  const db = (() => {
    try {
      const saved = JSON.parse(storage.get(STORE_KEY) || "null");
      if (saved?.version === DATA.version) return saved;
    } catch {}
    return { version: DATA.version, scopes: clone(DATA.scopes), records: clone(DATA.records) };
  })();
  const persist = () => storage.set(STORE_KEY, JSON.stringify(db));

  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const forbid = (message) => { throw new HttpError(403, message); };
  const invalid = (message) => { throw new HttpError(400, message); };

  /* ------------------------------------------------------------ 账号（blind_store.login / authenticate） */
  const ACCOUNTS = new Map(DATA.accounts.map((item) => [item.account, item]));
  const tokenOf = (account) => `demo-session:${account}`;
  const isGod = (account) => ACCOUNTS.get(account)?.kind === "god";
  const isReviewer = (account) => ACCOUNTS.get(account)?.kind === "reviewer";
  const isSuperadmin = (account) => !!ACCOUNTS.get(account)?.superadmin;

  function login({ account, password, token }) {
    account = String(account || "").trim();
    if (!/^[^\s/\\]{1,64}$/.test(account)) invalid("账号须为 1–64 个非空字符，不能包含空格或路径符号");
    if (!ACCOUNTS.has(account)) forbid("账号不在本批次白名单中，请联系管理员");
    if (token && token === tokenOf(account)) return { account, token };
    if (String(password || "") !== DATA.password) forbid("账号或密码错误");
    return { account, token: tokenOf(account) };
  }
  function authenticate(token) {
    if (!token) forbid("请先登录");
    for (const account of ACCOUNTS.keys()) if (tokenOf(account) === token) return account;
    forbid("登录会话无效");
  }

  /* ------------------------------------------------------------ 分配（blind_store.assign 等） */
  function scopeState(scope) {
    db.scopes[scope] ||= { scope, uid_order: [], roster: DATA.accounts
      .filter((item) => item.kind === "annotator").map((item) => item.account),
    accounts: {}, items: {}, review_accounts: {}, review_items: {} };
    return db.scopes[scope];
  }
  const capacity = (n) => ({ annotator_1: Math.max(1, Math.ceil(n / 2)), annotator_2: Math.max(1, Math.floor(n / 2)) });
  function coverage(state, uids) {
    const out = { zero: 0, one: 0, two: 0 };
    uids.forEach((uid) => {
      const count = ROLES.filter((role) => state.items[uid]?.[role]).length;
      out[["zero", "one", "two"][count]] += 1;
    });
    return out;
  }
  function progress(state) {
    const roster = new Set(state.roster);
    const required = Object.values(capacity(roster.size)).reduce((a, b) => a + b, 0);
    const active = Object.entries(state.accounts).filter(([name, meta]) => roster.has(name) && meta.quota > 0);
    const submitted = active.filter(([, meta]) => meta.submitted_at).length;
    const cov = coverage(state, state.uid_order);
    return { ready: active.length === required && submitted === required && cov.two === state.uid_order.length,
      required_accounts: required, submitted_accounts: submitted, coverage: cov };
  }
  function cleanUids(uids) {
    if (!Array.isArray(uids) || !uids.length || uids.length > 10000) invalid("uids 必须是 1–10000 条 UID 列表");
    return [...new Set(uids.map((uid) => String(uid ?? "").trim()))].filter(Boolean);
  }
  function stableOrder(state, uids) {
    const same = state.uid_order.length === uids.length && uids.every((uid) => state.uid_order.includes(uid));
    if (!same) state.uid_order = [...uids];          // 服务端此处随机打乱一次；演示保持数据顺序
    return state.uid_order;
  }
  function assign(scope, account, uids) {
    if (typeof scope !== "string" || !scope) invalid("缺少或无效的 scope");
    uids = cleanUids(uids);
    const state = scopeState(scope);
    if (isGod(account)) {
      return { scope, account, role: "admin", uids, quota: uids.length, coverage: coverage(state, uids),
        god: true, superadmin: isSuperadmin(account), teaching: false, submitted: false, submitted_at: null };
    }
    const order = stableOrder(state, uids);
    if (isReviewer(account)) {
      state.review_accounts[account] ||= { role: "reviewer_3", slot_index: Object.keys(state.review_accounts).length };
      const p = progress(state);
      persist();
      if (!p.ready) {
        return { scope, account, role: "reviewer_3", uids: [], quota: 0, coverage: p.coverage, god: false,
          reviewer: true, waiting: true, teaching: false, required_accounts: p.required_accounts,
          submitted_accounts: p.submitted_accounts, submitted: false, submitted_at: null };
      }
      state.review_accounts[account].quota = order.length;
      return { scope, account, role: "reviewer_3", uids: [...order], quota: order.length, coverage: p.coverage,
        waiting: false, god: false, reviewer: true, teaching: false, submitted: false, submitted_at: null };
    }
    if (!state.roster.includes(account)) forbid("当前账号不在该批次的标注名单中");
    const cap = capacity(state.roster.length);
    let meta = state.accounts[account];
    if (!meta) {
      const count = (role) => Object.values(state.accounts).filter((item) => item.role === role).length;
      const role = count("annotator_1") < cap.annotator_1 ? "annotator_1" : "annotator_2";
      meta = state.accounts[account] = { role, slot_index: count(role) };
    }
    // 两轮各自按 slot 顺序把 uid 均分成连续分片（与服务端同一公式）
    for (const role of ROLES) {
      const workers = cap[role];
      Object.values(state.items).forEach((slots) => { delete slots[role]; });
      const names = Object.entries(state.accounts).filter(([, item]) => item.role === role)
        .sort(([a, x], [b, y]) => (x.slot_index - y.slot_index) || a.localeCompare(b));
      let cursor = 0;
      names.forEach(([name, item]) => {
        if (item.slot_index >= workers) { item.quota = 0; return; }
        const take = Math.floor(order.length / workers) + (item.slot_index < order.length % workers ? 1 : 0);
        item.quota = take;
        order.slice(cursor, cursor + take).forEach((uid) => { (state.items[uid] ||= {})[role] = name; });
        cursor += take;
      });
    }
    persist();
    const owned = order.filter((uid) => state.items[uid]?.[meta.role] === account);
    return { scope, account, role: meta.role, uids: owned, quota: meta.quota || 0,
      coverage: coverage(state, uids), god: false, teaching: false,
      submitted: !!meta.submitted_at, submitted_at: meta.submitted_at || null };
  }
  function assignedUids(scope, account) {
    if (isGod(account)) return { role: "admin", uids: null };
    const state = scopeState(scope);
    if (isReviewer(account)) {
      return { role: "reviewer_3", uids: new Set(progress(state).ready ? state.uid_order : []) };
    }
    const role = state.accounts[account]?.role;
    if (!state.roster.includes(account) || !ROLES.includes(role)) return { role, uids: new Set() };
    return { role, uids: new Set(Object.keys(state.items).filter((uid) => state.items[uid][role] === account)) };
  }
  function writeRole(scope, account, uid) {
    if (isGod(account)) return "admin";
    const state = scopeState(scope);
    if (isReviewer(account)) {
      if (!progress(state).ready) forbid("全部双人标注并提交后才能进行复核");
      if (!state.uid_order.includes(uid)) forbid("该样本不属于当前复核批次");
      return "reviewer_3";
    }
    const meta = state.accounts[account] || {};
    if (!state.roster.includes(account) || !ROLES.includes(meta.role)
        || state.items[uid]?.[meta.role] !== account) forbid("该样本未分配给当前账号");
    if (meta.submitted_at) forbid("该批任务已经提交封存，不能继续修改");
    return meta.role;
  }
  function submit(scope, account) {
    if (isGod(account) || isReviewer(account)) invalid("上帝或审核账号不需要提交标注批次");
    const { role, uids } = assignedUids(scope, account);
    const meta = scopeState(scope).accounts[account];
    if (!meta || !ROLES.includes(role)) forbid("当前账号在该批次没有任务");
    const values = new Map();
    (db.records[scope] || []).forEach((row) => {
      const entity = String(row.entity || "");
      if (row.who === account && row.review_role === role && uids.has(row.uid) && row.kind === "mark"
          && (entity.startsWith(VIDEO_PREFIX) || entity === "case_flag:dirty")) {
        const key = row.uid + "\u001f" + entity;
        values.set(key, { ...(values.get(key) || {}), ...(row.patch || {}) });
      }
    });
    const completed = new Set([...values].filter(([, value]) => value.verdict).map(([key]) => key.split("\u001f")[0]));
    const missing = [...uids].filter((uid) => !completed.has(uid));
    if (missing.length) invalid(`还有 ${missing.length} 条未完成，不能提交`);
    if (!uids.size) invalid("当前账号没有可提交的任务");
    meta.submitted_at ||= new Date().toISOString();
    persist();
    return { account, role, submitted: true, submitted_at: meta.submitted_at, count: uids.size };
  }

  /* ------------------------------------------------------------ 标注日志（review_store.validate / append） */
  function validate(rec) {
    if (!rec || typeof rec !== "object") invalid("记录必须是 JSON 对象");
    for (const key of ["scope", "uid", "entity"]) {
      if (typeof rec[key] !== "string" || !rec[key] || rec[key].length > 2048) invalid(`缺少或无效的 ${key}`);
    }
    if (rec.review_role != null && !ALL_ROLES.includes(rec.review_role)) invalid("无效的 review_role");
    if (!["mark", "evidence"].includes(rec.kind)) invalid("无效的 kind");
    const num = (x) => typeof x === "number" && Number.isFinite(x);
    if (rec.kind === "mark") {
      const patch = rec.patch;
      if (!patch || typeof patch !== "object" || !Object.keys(patch).length
          || Object.keys(patch).some((k) => !["verdict", "star", "note"].includes(k))) invalid("无效的标记");
      if ("verdict" in patch && ![null, "accept", "reject", "mild"].includes(patch.verdict)) invalid("无效的 verdict");
      if ("star" in patch && typeof patch.star !== "boolean") invalid("star 必须是布尔值");
      if ("note" in patch && typeof patch.note !== "string") invalid("note 必须是文本");
    } else if (!rec.deleted) {
      const e = rec.evidence || {};
      if (typeof e !== "object") invalid("evidence 必须是 JSON 对象");
      if (!(e.tr == null && e.t == null)) {
        if (!Array.isArray(e.tr) || e.tr.length !== 2 || !e.tr.every(num)) invalid("必须填写起止时间（或同时留空）");
        if (!num(e.t) || !(e.tr[0] <= e.t && e.t <= e.tr[1] && e.tr[0] >= 0)) invalid("关键时刻必须在有效区间内");
      }
      const box = e.bbox;
      if (box != null && (!Array.isArray(box) || box.length !== 4 || !box.every((x) => num(x) && x >= 0 && x <= 1000)
          || box[0] >= box[2] || box[1] >= box[3])) invalid("框必须是 0–1000 的 xyxy 坐标");
      if (typeof e.tag !== "string" || !e.tag.trim()) invalid("请填写标签");
      if (e.obs != null && typeof e.obs !== "string") invalid("描述必须是文本");
    }
  }
  function appendRecord(rec) {
    validate(rec);
    const log = (db.records[rec.scope] ||= []);
    const old = rec.op_id && log.find((row) => row.op_id === rec.op_id);
    if (old) return old;
    const saved = { ...rec, ts: new Date().toISOString() };
    log.push(saved);
    persist();
    return saved;
  }
  function visibleRecords(scope, account) {
    const all = [...(db.records[scope] || [])].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const { role, uids } = assignedUids(scope, account);
    if (role === "admin") return { role, records: all };
    return { role, records: all.filter((row) => uids.has(row.uid) && (role === "reviewer_3"
      ? ROLES.includes(row.review_role) || (row.review_role === "reviewer_3" && row.who === account)
      : row.who === account && row.review_role === role)) };
  }

  /* ------------------------------------------------------------ 质检指标（blind_metrics.compute 的移植） */
  const ratio = (n, d) => (d ? n / d : null);
  const f1 = (p, r) => (p == null || r == null || p + r === 0 ? null : (2 * p * r) / (p + r));
  function binarySummary(tp, fp, tn, fn, extra = {}) {
    const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
    return { tp, fp, tn, fn, n_scored: tp + fp + tn + fn, accuracy: ratio(tp + tn, tp + fp + tn + fn),
      precision, recall, f1: f1(precision, recall), specificity: ratio(tn, tn + fp), ...extra };
  }
  function setSummary(tp, fp, fn, extra = {}) {
    const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
    return { tp, fp, fn, precision, recall, f1: f1(precision, recall), ...extra };
  }
  function markState(value) {
    if (!value) return "missing";
    if (value.star === true || value.verdict === "mild") return "boundary";
    if (value.verdict === "accept") return "positive";
    if (value.verdict === "reject") return "negative";
    return "missing";
  }
  function rawVerdict(value) {
    if (!value) return null;
    if (["accept", "reject", "mild"].includes(value.verdict)) return value.verdict;
    return value.star === true ? "mild" : null;
  }
  function binaryCell(gold, pred) {
    if (gold === "boundary" && (pred === "positive" || pred === "negative")) return pred === "positive" ? "tp" : "tn";
    if (gold === "boundary" || pred === "boundary") return "boundary";
    if (gold === "missing" || pred === "missing") return "missing";
    if (gold === "positive") return pred === "positive" ? "tp" : "fn";
    return pred === "positive" ? "fp" : "tn";
  }
  function scoreBinary(pairs) {
    const c = { tp: 0, fp: 0, tn: 0, fn: 0, boundary: 0, missing: 0, star_credit: 0 };
    pairs.forEach(([gold, pred]) => {
      const cell = binaryCell(gold, pred);
      c[cell] += 1;
      if (gold === "boundary" && cell !== "boundary") c.star_credit += 1;
    });
    return binarySummary(c.tp, c.fp, c.tn, c.fn, { n_boundary: c.boundary, n_missing: c.missing,
      n_star_credit: c.star_credit, n_total: pairs.length });
  }
  const K = (...parts) => parts.join("\u001f");
  function fold(records) {
    const shared = new Map(), reviewers = new Map(), evidence = new Map();
    [...records].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || ""))).forEach((row) => {
      const role = row.review_role, uid = String(row.uid || ""), entity = String(row.entity || "");
      if (!ALL_ROLES.includes(role) || !uid || !entity) return;
      if (row.kind === "mark") {
        const map = role === "reviewer_3" ? reviewers : shared;
        const key = K(uid, entity, role === "reviewer_3" ? String(row.who || role) : role);
        map.set(key, { ...(map.get(key) || {}), ...(row.patch || {}) });
      } else if (row.kind === "evidence") {
        const key = K(role, uid, entity);
        if (row.deleted) evidence.delete(key); else evidence.set(key, row);
      }
    });
    return { shared, reviewers, evidence };
  }
  // 只有一个复核账号，服务端的「稳定随机选一位复核员」在这里退化为取那一位。
  function pickReviewer(reviewers, uid, entity) {
    const choices = [...reviewers].filter(([key, value]) => {
      const [u, e] = key.split("\u001f");
      return u === uid && e === entity && markState(value) !== "missing";
    }).sort(([a], [b]) => a.localeCompare(b));
    if (!choices.length) return { value: null, who: null, count: 0 };
    return { value: choices[0][1], who: choices[0][0].split("\u001f")[2], count: choices.length };
  }
  function pipeline(fd, uid, entity, creatorPositive = false) {
    const left = markState(fd.shared.get(K(uid, entity, "annotator_1")));
    const right = markState(fd.shared.get(K(uid, entity, "annotator_2")));
    const pick = () => pickReviewer(fd.reviewers, uid, entity);
    if (creatorPositive) {
      const r = pick();
      return r.value ? { pred: markState(r.value), ...r } : { pred: "positive", who: null, count: 0 };
    }
    if ((left === "positive" || left === "negative") && right === left) return { pred: left, who: null, count: 0 };
    if (left === "boundary" || right === "boundary") return { pred: "boundary", who: null, count: 0 };
    if (["positive", "negative"].includes(left) && ["positive", "negative"].includes(right)) {
      const r = pick();
      return r.value ? { pred: markState(r.value), who: r.who, count: r.count } : { pred: "missing", who: null, count: 0 };
    }
    return { pred: "missing", who: null, count: 0 };
  }
  function pipelineRaw(fd, uid, entity) {
    const left = rawVerdict(fd.shared.get(K(uid, entity, "annotator_1")));
    const right = rawVerdict(fd.shared.get(K(uid, entity, "annotator_2")));
    if (left != null && right != null && left === right) return { raw: left, who: null, count: 0 };
    if (left != null && right != null) {
      const r = pickReviewer(fd.reviewers, uid, entity);
      return r.value ? { raw: rawVerdict(r.value), who: r.who, count: r.count } : { raw: null, who: null, count: 0 };
    }
    return { raw: null, who: null, count: 0 };
  }
  function predSeverity(evidence, uid, roles) {
    let best = 0;
    evidence.forEach((row, key) => {
      const [role, u] = key.split("\u001f");
      const sev = row.evidence?.sev;
      if (u === uid && roles.includes(role) && typeof sev === "number" && sev > best) best = Math.trunc(sev);
    });
    return best;
  }
  function videoFromSlices(fd, uids, config, tally) {
    const entity = VIDEO_PREFIX + String(config.entity || "");
    const predPositive = config.pred_positive || "accept";
    const sevRoles = config.sev_roles || ["annotator_1", "annotator_2", "reviewer_3"];
    const obviousMin = Number(config.obvious_min_sev ?? 3);
    const slices = config.slices || [];
    const overallLabel = config.overall || slices[0]?.label || "";
    const pairsBy = Object.fromEntries(slices.map((s) => [s.label, []]));
    const micro = [], decisions = {};
    uids.forEach((uid) => {
      decisions[uid] = { overall: null, per_tag: {} };
      const goldRaw = rawVerdict(fd.shared.get(K(uid, entity, "admin")));
      const { raw: predRaw, who, count } = pipelineRaw(fd, uid, entity);
      if (who) tally.byWho[who] = (tally.byWho[who] || 0) + 1;
      if (count > 1) tally.multi += 1;
      const has = predRaw === predPositive;
      const sev = predSeverity(fd.evidence, uid, sevRoles);
      slices.forEach((spec) => {
        const band = spec.sev || "any";
        const predPos = !has ? false : band === "obvious" ? sev >= obviousMin
          : band === "mild" ? sev >= 1 && sev < obviousMin : true;
        const gold = goldRaw == null ? "missing" : (spec.gold || []).includes(goldRaw) ? "positive" : "negative";
        const pred = predRaw == null ? "missing" : predPos ? "positive" : "negative";
        pairsBy[spec.label].push([gold, pred]); micro.push([gold, pred]);
        const cell = { gold, pred, cell: binaryCell(gold, pred) };
        decisions[uid].per_tag[spec.label] = cell;
        if (spec.label === overallLabel) decisions[uid].overall = cell;
      });
    });
    const perTag = Object.fromEntries(slices.map((s) => [s.label, scoreBinary(pairsBy[s.label])]));
    return { overall: { ...(perTag[overallLabel] || scoreBinary([])) }, micro: scoreBinary(micro),
      per_tag: perTag, decisions, n_videos: uids.length, n_labels: slices.length, slice_mode: true };
  }
  function machineSegments(scope) {
    const body = scope.replace(/^(blind-account-v1:|teach-account-v1:)/, "");
    if (body === scope || !body.includes("|")) return null;
    const [dir, run] = [body.slice(0, body.indexOf("|")), body.slice(body.indexOf("|") + 1)];
    const prefix = `${dir.replace(/^\.\//, "")}/${run}.d`;
    const segments = new Map();
    Object.entries(DATA.files).filter(([path]) => path.startsWith(prefix) && /\.d\d+\.json$/.test(path))
      .forEach(([, rows]) => Object.values(rows).forEach((row) => {
        const uid = String(row.uid || row.no || "");
        (row.wf2?.ev || []).forEach((item) => {
          if (!uid || typeof item.t !== "number") return;
          const tr = Array.isArray(item.tr) ? item.tr : [item.t, item.t];
          segments.set(K(uid, "machine:" + item.id), [Number(tr[0]), Number(tr[1])]);
        });
      }));
    return segments.size ? segments : null;
  }
  const overlap = (a, b) => Math.max(a[0], b[0]) <= Math.min(a[1], b[1]);
  function mergeProblems(segments) {
    const problems = [], seen = new Set();
    segments.forEach((_, i) => {
      if (seen.has(i)) return;
      const group = [i]; seen.add(i);
      for (let k = 0; k < group.length; k++) {
        segments.forEach((other, j) => {
          if (!seen.has(j) && overlap(segments[group[k]], other)) { seen.add(j); group.push(j); }
        });
      }
      problems.push(group.map((index) => segments[index]));
    });
    return problems;
  }
  function maxMatching(adjacency) {
    const owner = new Map();
    const augment = (left, visited) => adjacency[left].some((right) => {
      if (visited.has(right)) return false;
      visited.add(right);
      if (!owner.has(right) || augment(owner.get(right), visited)) { owner.set(right, left); return true; }
      return false;
    });
    return adjacency.reduce((n, _, left) => n + (augment(left, new Set()) ? 1 : 0), 0);
  }
  function mergedEvidence(timed, untimed) {
    const byUid = new Map();
    let predItems = 0, goldItems = 0, tp = 0, nPred = 0, nGold = 0;
    timed.forEach(([uid, segment, gold, pred]) => {
      if (!byUid.has(uid)) byUid.set(uid, [[], []]);
      if (pred === "positive") { byUid.get(uid)[0].push(segment); predItems += 1; }
      if (gold === "positive") { byUid.get(uid)[1].push(segment); goldItems += 1; }
    });
    byUid.forEach(([preds, golds]) => {
      const P = mergeProblems(preds), G = mergeProblems(golds);
      nPred += P.length; nGold += G.length;
      tp += maxMatching(P.map((p) => G.map((g, j) => (p.some((a) => g.some((b) => overlap(a, b))) ? j : -1))
        .filter((j) => j >= 0)));
    });
    return setSummary(tp, nPred - tp, nGold - tp, { n_pred_problems: nPred, n_gold_problems: nGold,
      n_pred_items: predItems, n_gold_items: goldItems, n_untimed: untimed,
      matching: "time_overlap_merged_one_to_one" });
  }
  function computeMetrics(records, uids, labels, slices, segments, exclude) {
    let excluded = {};
    if (exclude) {
      const fd0 = fold(records);
      excluded = Object.fromEntries(exclude.map((entity) => [entity, [...fd0.shared]
        .filter(([key, value]) => { const [, e, role] = key.split("\u001f"); return e === entity && role === "admin" && value.verdict === "accept"; })
        .map(([key]) => key.split("\u001f")[0]).sort()]));
    }
    const drop = new Set(Object.values(excluded).flat());
    records = records.filter((row) => !drop.has(String(row.uid || "")));
    uids = uids.map(String).filter((uid) => !drop.has(uid));
    labels = labels.map(String).filter((label) => !(exclude || []).includes(VIDEO_PREFIX + label));
    const fd = fold(records);
    const tally = { byWho: {}, multi: 0 };
    let video;
    if (slices) {
      video = videoFromSlices(fd, uids, slices, tally);
    } else {
      const perTag = {}, micro = [], states = {}, tagDecisions = {};
      uids.forEach((uid) => { states[uid] = { gold: [], pred: [] }; tagDecisions[uid] = {}; });
      labels.forEach((label) => {
        const entity = VIDEO_PREFIX + label, pairs = [];
        uids.forEach((uid) => {
          const p = pipeline(fd, uid, entity);
          if (p.who) tally.byWho[p.who] = (tally.byWho[p.who] || 0) + 1;
          if (p.count > 1) tally.multi += 1;
          const gold = markState(fd.shared.get(K(uid, entity, "admin")));
          pairs.push([gold, p.pred]); micro.push([gold, p.pred]);
          tagDecisions[uid][label] = { gold, pred: p.pred, cell: binaryCell(gold, p.pred) };
          states[uid].gold.push(gold); states[uid].pred.push(p.pred);
        });
        perTag[label] = scoreBinary(pairs);
      });
      const overall = (values) => values.includes("positive") ? "positive" : values.includes("boundary") ? "boundary"
        : values.includes("missing") ? "missing" : "negative";
      const pairs = uids.map((uid) => [overall(states[uid].gold), overall(states[uid].pred)]);
      const decisions = Object.fromEntries(uids.map((uid, i) => [uid, {
        overall: { gold: pairs[i][0], pred: pairs[i][1], cell: binaryCell(...pairs[i]) }, per_tag: tagDecisions[uid] }]));
      video = { overall: scoreBinary(pairs), micro: scoreBinary(micro), per_tag: perTag, decisions,
        n_videos: uids.length, n_labels: labels.length };
    }

    const universe = new Set();
    fd.shared.forEach((_, key) => { const [u, e] = key.split("\u001f"); if (!e.startsWith(VIDEO_PREFIX)) universe.add(K(u, e)); });
    fd.reviewers.forEach((_, key) => { const [u, e] = key.split("\u001f"); if (!e.startsWith(VIDEO_PREFIX)) universe.add(K(u, e)); });
    fd.evidence.forEach((_, key) => { const [, u, e] = key.split("\u001f"); universe.add(K(u, e)); });
    const ev = { tp: 0, fp: 0, fn: 0, boundary: 0, missing_gold: 0, both_absent: 0, unpredicted_negative: 0, star_credit: 0 };
    const bySource = {}, timed = [];
    let untimed = 0;
    [...universe].sort().forEach((item) => {
      const [uid, entity] = item.split("\u001f");
      const active = ALL_ROLES.filter((role) => fd.evidence.has(K(role, uid, entity)));
      const adminSupplement = active.includes("admin");
      const creatorPositive = active.some((role) => ROLES.includes(role));
      const type = adminSupplement ? "admin_supplement" : creatorPositive ? "annotator_evidence" : "machine_evidence";
      bySource[type] = (bySource[type] || 0) + 1;
      const p = adminSupplement ? { pred: "negative", who: null, count: 0 } : pipeline(fd, uid, entity, creatorPositive);
      if (p.who) tally.byWho[p.who] = (tally.byWho[p.who] || 0) + 1;
      if (p.count > 1) tally.multi += 1;
      const explicit = markState(fd.shared.get(K(uid, entity, "admin")));
      let gold = explicit !== "missing" ? explicit : adminSupplement ? "positive"
        : ["positive", "negative"].includes(p.pred) ? p.pred : "missing";
      if (gold === "boundary" && ["positive", "negative"].includes(p.pred)) { gold = p.pred; ev.star_credit += 1; }
      if (segments && (gold === "positive" || p.pred === "positive")) {
        let segment = null;
        if (active.length) {
          const tr = fd.evidence.get(K([...active].sort()[0], uid, entity)).evidence?.tr;
          segment = tr ? [Number(tr[0]), Number(tr[1])] : null;
        } else segment = segments.get(K(uid, entity)) || null;
        if (segment) timed.push([uid, segment, gold, p.pred]); else untimed += 1;
      }
      if (gold === "boundary" || p.pred === "boundary") ev.boundary += 1;
      else if (gold === "missing") ev.missing_gold += 1;
      else if (p.pred === "missing") ev[gold === "positive" ? "fn" : "unpredicted_negative"] += 1;
      else if (gold === "positive" && p.pred === "positive") ev.tp += 1;
      else if (gold === "negative" && p.pred === "positive") ev.fp += 1;
      else if (gold === "positive" && p.pred === "negative") ev.fn += 1;
      else ev.both_absent += 1;
    });
    const notes = [
      "视频级：双标一致时直接采用；冲突时对已有复核员结论做稳定随机选择。",
      "证据级：评测员未操作且流水线结论明确时按默认接受处理。",
      "评测员 ⭐️（判别边界）按容错计：流水线给 ✅ 记 TP、给 ❎ 记 TN；流水线侧的 ⭐️ 仍单列，不进入 PRF。",
      "证据级·区分细类：按 entity ID 精确匹配；集合场景不定义 TN、Accuracy 或 Specificity。",
    ];
    if (segments) notes.push("证据级·不区分细类：同一视频内时间有重叠的证据先合并为一个问题，"
      + "Pred / Gold 问题间任一证据时间重叠即可配对，再做最大一一匹配；不比较细类标签。");
    if (slices) notes[2] = "严重度切片：Gold 用评测员三档（✅ 明显 / ⭐️ 轻微 / ❎ 无），"
      + "Pred 用复核/双标的「有崩坏」并按其举证 sev 分档（sev≥3 明显，1–2 轻微）。";
    if (exclude) {
      const name = (e) => e.startsWith(VIDEO_PREFIX) ? e.slice(VIDEO_PREFIX.length) : e === "case_flag:dirty" ? "脏数据" : e;
      notes.push(`已剔除评测员终审判 ✅ 的视频 ${drop.size} 条（${Object.entries(excluded)
        .map(([e, rows]) => `${name(e)} ${rows.length}`).join(" / ")}），不进视频级与证据级指标。`);
    }
    return {
      excluded: { n_videos: drop.size, uids: excluded },
      generated_at: new Date().toISOString(),
      policy_version: "blind-quality-v1",
      video,
      evidence: setSummary(ev.tp, ev.fp, ev.fn, { n_universe: universe.size, n_boundary: ev.boundary,
        n_star_credit: ev.star_credit, n_missing_gold: ev.missing_gold, n_both_absent: ev.both_absent,
        n_unpredicted_negative: ev.unpredicted_negative,
        by_source: Object.fromEntries(Object.entries(bySource).sort()), matching: "exact_entity_id", tn_defined: false }),
      evidence_merged: segments ? mergedEvidence(timed, untimed) : null,
      reviewer_selection: { method: "stable_sha256_random_v1", multi_reviewer_decisions: tally.multi,
        selected_by_account: tally.byWho },
      notes,
    };
  }
  function metrics(query, account) {
    if (!isSuperadmin(account)) forbid("仅超级管理员可查看质检指标");
    const scope = query.get("scope") || "";
    if (!/^(blind-account-v1:|teach-account-v1:)/.test(scope)) invalid("缺少或无效的 scope");
    const records = db.records[scope] || [];
    const uids = scopeState(scope).uid_order;
    const parse = (name) => (query.get(name) ? JSON.parse(query.get(name)) : null);
    const labels = parse("labels") || [...new Set(records.map((row) => String(row.entity || ""))
      .filter((e) => e.startsWith(VIDEO_PREFIX)).map((e) => e.slice(VIDEO_PREFIX.length)))].sort();
    if (!uids.length) invalid("当前批次尚未建立 UID 分配");
    if (!labels.length) invalid("当前批次没有视频级标签");
    return computeMetrics(records, uids, labels, parse("slices"), machineSegments(scope), parse("exclude"));
  }

  /* ------------------------------------------------------------ 路由 */
  function route(method, path, query, body, token) {
    if (path === "api/health") return { ok: true, service: "critic-studio", api_version: 1, mock: true };
    if (path === "api/blind/login" && method === "POST") return { ok: true, ...login(body) };
    if (path === "api/reviews") {
      return method === "GET" ? forbid("该批次必须通过账号盲标接口读取") : forbid("该批次必须通过账号盲标接口写入");
    }
    const account = authenticate(token);
    if (path === "api/blind/assign" && method === "POST") return { ok: true, ...assign(body.scope, account, body.uids) };
    if (path === "api/blind/submit" && method === "POST") return { ok: true, ...submit(body.scope, account) };
    if (path === "api/blind/metrics" && method === "GET") return { ok: true, account, metrics: metrics(query, account) };
    if (path === "api/blind/reviews" && method === "GET") {
      return { ok: true, account, ...visibleRecords(query.get("scope") || "", account) };
    }
    if (path === "api/blind/reviews" && method === "POST") {
      const role = writeRole(body.scope, account, body.uid);
      return { ok: true, rec: appendRecord({ ...body, who: account, review_role: role }) };
    }
    throw new HttpError(404, "no such route");
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

  window.fetch = async function (input, init = {}) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (!url.href.startsWith(BASE)) return nativeFetch(input, init);
    let path;
    try { path = decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length)); }
    catch { return nativeFetch(input, init); }
    if (path.startsWith("api/")) {
      const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      try {
        const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
        return json(route(method, path, url.searchParams, body, headers.get("X-Blind-Token")));
      } catch (error) {
        return json({ ok: false, err: error.message }, error.status || 400);
      }
    }
    if (Object.prototype.hasOwnProperty.call(DATA.files, path)) {
      const value = DATA.files[path];
      return new Response(typeof value === "string" ? value : JSON.stringify(value), {
        status: 200, headers: { "Content-Type": path.endsWith(".jsonl")
          ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8" } });
    }
    return nativeFetch(input, init);
  };

  /* ------------------------------------------------------------ 演示账号切换 */
  function session() {
    try { return JSON.parse(storage.get(SESSION_KEY) || "null"); } catch { return null; }
  }
  function useAccount(account) {
    const value = session() || { current: "", tokens: {} };
    value.tokens = value.tokens || {};
    value.current = account;
    value.tokens[account] = tokenOf(account);
    storage.set(SESSION_KEY, JSON.stringify(value));
  }
  // 第一次打开直接以默认账号进入；之后尊重「切换账号（调试）」留下的登出状态。
  if (storage.get(SESSION_KEY) == null && DATA.defaultAccount) useAccount(DATA.defaultAccount);

  const STYLE = `
.demo-switch { margin-top: 9px; padding-top: 9px; border-top: 1px dashed var(--border); }
.demo-switch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 7px; }
.demo-switch .vfilter { width: 100%; cursor: pointer; }
.demo-login-picks { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 2px; }
.blind-login-card .demo-login-picks button { width: auto; padding: 5px 11px; border: 1px solid var(--border, #d7dce5);
  border-radius: 999px; background: transparent; color: var(--text-secondary, #667085); font-size: 12px; font-weight: 600; }
.blind-login-card .demo-login-picks button:hover { border-color: var(--brand, #082dff); color: var(--brand, #082dff); }`;

  function switcher() {
    const box = document.createElement("div");
    box.className = "demo-switch";
    const label = document.createElement("p");
    label.className = "blind-account-label";
    label.textContent = "演示账号 · 点一下即切换";
    const grid = document.createElement("div");
    grid.className = "demo-switch-grid";
    const current = session()?.current;
    DATA.accounts.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vfilter" + (item.account === current ? " on" : "");
      button.textContent = item.label;
      button.title = `账号 ${item.account}`;
      button.onclick = () => { useAccount(item.account); location.reload(); };
      grid.appendChild(button);
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "blind-switch-account";
    reset.textContent = "重置演示数据";
    reset.title = "清掉本浏览器里的改动，回到预置的标注状态";
    reset.onclick = () => {
      if (!confirm("把所有标注恢复到演示初始状态？")) return;
      storage.remove(STORE_KEY);
      location.reload();
    };
    box.append(label, grid, reset);
    return box;
  }
  function decorateLogin(overlay) {
    const form = overlay.querySelector("form");
    if (!form || form.querySelector(".demo-login-picks")) return;
    const picks = document.createElement("div");
    picks.className = "demo-login-picks";
    DATA.accounts.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.onclick = () => {
        form.elements.account.value = item.account;
        form.elements.password.value = DATA.password;
        form.requestSubmit();
      };
      picks.appendChild(button);
    });
    const hint = form.querySelector("p");
    if (hint) hint.textContent = `演示环境：点下面任一角色直接登录（账号见按钮提示，密码 ${DATA.password}）。`;
    form.querySelector("input")?.insertAdjacentElement("beforebegin", picks);
  }
  window.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    document.getElementById("blindSwitchAccount")?.insertAdjacentElement("afterend", switcher());
    new MutationObserver(() => {
      const overlay = document.getElementById("blindLoginOverlay");
      if (overlay) decorateLogin(overlay);
    }).observe(document.body, { childList: true });
  }, { once: true });

  window.StudioMock = { db, reset() { storage.remove(STORE_KEY); location.reload(); } };
})();

