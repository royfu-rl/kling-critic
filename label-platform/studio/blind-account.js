/* Password-protected blind-annotation account bootstrap. The server owns identity,
   assignment and record filtering; this file only holds the issued session token. */
window.BlindAccount = (() => {
  const storageKey = "critic.blind.account.v1";
  const config = window.PAGE_BLIND_ACCOUNT || {};
  const state = { account: "", token: "", role: "", assignment: null };
  let waitingPoll = 0;
  let lastMetrics = null;
  let selectedMetricLabel = null;
  let metricsView = "l3";
  let inlineLoadedScope = "";
  let adminVideoMetrics = null;
  let adminVideoScope = "";
  let qualityFilter = "all";
  let metricsLoadPromise = null;
  let metricsLoadedScope = "";
  let metricsRefreshTimer = 0;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

  async function request(path, options = {}) {
    const response = await fetch(new URL(path, location.href), {
      credentials: "same-origin", cache: "no-store", ...options,
      headers: { "Content-Type": "application/json",
        ...(state.token ? { "X-Blind-Token": state.token } : {}), ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      const error = new Error(body?.err || `HTTP ${response.status}`);
      error.status = response.status; throw error;
    }
    return body;
  }

  function saved() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (value?.account && value?.token) {
        return { current: value.account, tokens: { [value.account]: value.token } };
      }
      return value;
    }
    catch { return null; }
  }
  function persist() {
    const value = saved() || { current: "", tokens: {} };
    value.current = state.account;
    value.tokens[state.account] = state.token;
    localStorage.setItem(storageKey, JSON.stringify(value));
  }
  function paintIdentity() {
    const name = document.getElementById("blindAccountName");
    const role = document.getElementById("blindAccountRole");
    const status = document.getElementById("blindAssignmentStatus");
    if (name) name.textContent = state.account || "未登录";
    const teaching = !!state.assignment?.teaching || !!window.PAGE_TRAINING_MODE;
    if (role) role.textContent = teaching
      ? (state.role === "annotator_1" ? "培训 · 第一轮标注"
        : state.role === "annotator_2" ? "培训 · 第二轮复标"
        : state.role === "admin" ? "培训 · 并行评测"
        : state.role === "reviewer_3" ? "培训 · 并行复核" : "等待分配")
      : state.role === "annotator_1" ? "第一轮标注"
        : state.role === "annotator_2" ? "第二轮复标"
        : state.role === "admin" && window.PAGE_SEVERITY_RELABEL ? "管理员 · 严重度重标"
        : state.role === "admin" && state.assignment?.superadmin ? "超级管理员 · 质检指标"
        : state.role === "admin" && state.assignment?.god ? "管理员 · 最终评审"
        : state.role === "reviewer_3" && state.assignment?.waiting ? "审核账号 · 等待复核"
        : state.role === "reviewer_3" ? "审核账号 · 复核员 3" : "等待分配";
    if (status && state.assignment) {
      const c = state.assignment.coverage;
      status.textContent = teaching && state.assignment.god
        ? `培训并行评测 · 全批 ${state.assignment.uids.length} 条 · 可查看标注与复核答案`
        : teaching && state.assignment.reviewer
          ? `培训并行复核 · 全批 ${state.assignment.uids.length} 条 · 无需等待标注提交`
        : teaching
          ? `培训全量共享 · ${state.assignment.uids.length} 条 · 已完成 ${state.completed || 0} · 可查看其他账号答案`
        : state.assignment.god && window.PAGE_SEVERITY_RELABEL
        ? `严重度重标 · 全批 ${state.assignment.uids.length} 条`
        : state.assignment.god
        ? `全貌 ${state.assignment.uids.length} 条 · 双标完成 ${c.two} · 单标 ${c.one} · 未分配 ${c.zero}`
        : state.assignment.reviewer && state.assignment.waiting
          ? `等待标注完成 · 已提交 ${state.assignment.submitted_accounts}/${state.assignment.required_accounts} · 双标完成 ${c.two}/${c.zero + c.one + c.two}`
        : state.assignment.reviewer
          ? `我的复核任务 ${state.assignment.uids.length} 条 · 全批双标完成 ${c.two}`
        : `我的任务 ${state.assignment.uids.length} 条 · 已完成 ${state.completed || 0} · 全批双槽 ${c.two}`;
    }
    const submit = document.getElementById("blindSubmitBatch");
    if (submit) {
      submit.hidden = teaching || !!state.assignment?.god || !!state.assignment?.reviewer;
      submit.disabled = !!state.assignment?.submitted;
      submit.textContent = state.assignment?.submitted ? "已提交" : "提交";
    }
    const metrics = document.getElementById("superMetricsOpen");
    if (metrics) metrics.hidden = !state.assignment?.superadmin;
    const inlineL3 = document.getElementById("superL3InlineField");
    if (inlineL3) inlineL3.hidden = !state.assignment?.superadmin;
    document.body.classList.toggle("blind-submitted", !!state.assignment?.submitted);
  }

  function metricPercent(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
  }
  function metricDecimal(value) {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "—";
  }
  function metricNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function metricCard(label, value, note, accent = false) {
    const card = metricNode("div", `metrics-card${accent ? " accent" : ""}`);
    card.append(metricNode("div", "metrics-card-label", label),
      metricNode("div", "metrics-card-value", value),
      metricNode("div", "metrics-card-note", note));
    return card;
  }
  function metricSection(title, note = "") {
    const section = metricNode("section", "metrics-section");
    const head = metricNode("div", "metrics-section-head");
    head.append(metricNode("h3", "", title), metricNode("p", "", note));
    section.appendChild(head);
    return section;
  }
  function confusionMatrix(metric, title) {
    const panel = metricNode("div", "metrics-panel");
    panel.appendChild(metricNode("h4", "", title));
    const matrix = metricNode("div", "metrics-matrix");
    [
      ["", "matrix-head"], ["预测有", "matrix-head"], ["预测无", "matrix-head"],
      ["真实有", "matrix-head"], [metric.tp, "matrix-value matrix-tp"], [metric.fn, "matrix-value matrix-fn"],
      ["真实无", "matrix-head"], [metric.fp, "matrix-value matrix-fp"], [metric.tn, "matrix-value matrix-tn"],
    ].forEach(([value, className]) => matrix.appendChild(metricNode("div", className, value)));
    panel.appendChild(matrix);
    return panel;
  }
  function renderAdminQualityMatrix(metrics = adminVideoMetrics) {
    const box = document.getElementById("cmBox");
    const hint = document.getElementById("cmHint");
    if (!box || !state.assignment?.superadmin) return;
    box.replaceChildren();
    if (!metrics?.video?.overall) {
      if (hint) hint.textContent = `${state.assignment.uids.length} 条`;
      box.appendChild(metricNode("p", "ratio-note", "正在按人标质检口径计算混淆矩阵…"));
      return;
    }
    const row = selectedMetricLabel
      ? metrics.video.per_tag[selectedMetricLabel]
      : metrics.video.overall;
    const sliceName = selectedMetricLabel || "L2 总体";
    if (hint) hint.textContent = `${sliceName} · 可计算 ${row.n_scored}/${row.n_total} · ⭐️按对计 ${row.n_star_credit || 0} · 边界 ${row.n_boundary} · 缺失 ${row.n_missing}`
      + (metrics.excluded?.n_videos ? ` · 已剔除 ${metrics.excluded.n_videos}` : "");
    const matrix = metricNode("div", "cm");
    matrix.append(
      metricNode("div", "cm-h", ""), metricNode("div", "cm-h", "Pred 有"), metricNode("div", "cm-h", "Pred 无"),
      metricNode("div", "cm-h", "Gold 有"));
    [[row.tp, "tp", "TP 命中"], [row.fn, "fn", "FN 漏检"]].forEach(([value, key, label]) => {
      const cell = metricNode("div", `cm-cell ${key}${qualityFilter === key ? " on" : ""}`);
      cell.append(metricNode("span", "cm-n", value), metricNode("span", "cm-lab", label));
      cell.onclick = () => setQualityFilter(qualityFilter === key ? "all" : key, true);
      matrix.appendChild(cell);
    });
    matrix.appendChild(metricNode("div", "cm-h", "Gold 无"));
    [[row.fp, "fp", "FP 误报"], [row.tn, "tn", "TN 正确放过"]].forEach(([value, key, label]) => {
      const cell = metricNode("div", `cm-cell ${key}${qualityFilter === key ? " on" : ""}`);
      cell.append(metricNode("span", "cm-n", value), metricNode("span", "cm-lab", label));
      cell.onclick = () => setQualityFilter(qualityFilter === key ? "all" : key, true);
      matrix.appendChild(cell);
    });
    box.appendChild(matrix);
    const rates = metricNode("div", "rate-row");
    [["Precision", row.precision], ["Recall", row.recall], ["F1", row.f1], ["Accuracy", row.accuracy]]
      .forEach(([label, value]) => {
        const item = metricNode("span");
        item.appendChild(metricNode("b", "", `${label} ${label === "F1" ? metricDecimal(value) : metricPercent(value)}`));
        rates.appendChild(item);
      });
    box.appendChild(rates);
    box.appendChild(metricNode("p", "ratio-note",
      `${sliceName} · 质检口径：评测员终判为 Gold；双标一致时直接取双标结论，冲突时取复核员结论为 Pred。评测员 ⭐️ 按容错计（Pred ✅ 记 TP、❎ 记 TN）；Pred 侧 ⭐️ 与缺失项不进入二分类 PRF。`));
  }
  async function fetchAdminVideoMetrics(force = false) {
    return fetchMetrics(force);
  }
  async function refreshAdminQualityMatrix(force = false) {
    if (!state.assignment?.superadmin) return;
    if (!force && adminVideoScope === state.assignment.scope && adminVideoMetrics) {
      renderAdminQualityMatrix(adminVideoMetrics); return;
    }
    renderAdminQualityMatrix(null);
    try {
      renderAdminQualityMatrix(await fetchAdminVideoMetrics(force));
    } catch (error) {
      const box = document.getElementById("cmBox");
      if (box) box.replaceChildren(metricNode("p", "super-metrics-error", `混淆矩阵加载失败：${error.message}`));
    }
  }
  function qualityCell(uid) {
    if (!state.assignment?.superadmin) return null;
    const metrics = lastMetrics || adminVideoMetrics;
    const decision = metrics?.video?.decisions?.[String(uid)];
    if (!decision) {
      const excluded = Object.values(metrics?.excluded?.uids || {}).some((rows) => rows.includes(String(uid)));
      return excluded ? "excluded" : null;
    }
    const picked = selectedMetricLabel
      ? decision.per_tag?.[selectedMetricLabel]
      : decision.overall;
    return picked?.cell || null;
  }
  function setQualityFilter(filter, notify = false) {
    qualityFilter = ["tp", "fp", "tn", "fn"].includes(filter) ? filter : "all";
    renderAdminQualityMatrix(lastMetrics || adminVideoMetrics);
    if (notify) {
      window.dispatchEvent(new CustomEvent("blind-quality-filter-change", {
        detail: { filter: qualityFilter },
      }));
    }
  }
  function selectMetricLabel(label) {
    selectedMetricLabel = selectedMetricLabel === label ? null : label;
    qualityFilter = "all";
    if (!lastMetrics) return;
    renderInlineL3(lastMetrics);
    renderAdminQualityMatrix(lastMetrics);
    if (document.getElementById("superMetricsDialog")?.open) renderMetrics(lastMetrics);
    window.dispatchEvent(new CustomEvent("blind-quality-slice-change", {
      detail: { label: selectedMetricLabel },
    }));
  }
  function renderInlineL3(metrics) {
    const host = document.getElementById("superL3Inline");
    if (!host || !state.assignment?.superadmin) return;
    const video = metrics.video;
    if (selectedMetricLabel && !video.per_tag[selectedMetricLabel]) selectedMetricLabel = null;
    host.replaceChildren();
    const wrap = metricNode("div", "l3 super-l3-inline");
    const head = metricNode("div", "l3-head");
    head.append(
      metricNode("span", "l3-title", "L3 维度切片"),
      metricNode("span", "l3-note", selectedMetricLabel
        ? `当前只看「${selectedMetricLabel}」· 再点一次回到 L2 总体`
        : "点标签切到该 L3 的二分类"));
    wrap.appendChild(head);

    const chips = metricNode("div", "l3-chips");
    const addChip = (label, text, extra = "") => {
      const on = selectedMetricLabel === label;
      const chip = metricNode("button", `l3-chip${on ? " on" : ""}${extra ? ` ${extra}` : ""}`, text);
      chip.type = "button";
      chip.onclick = () => selectMetricLabel(label);
      chips.appendChild(chip);
    };
    addChip(null, "L2 总体", "l2");
    Object.entries(video.per_tag).forEach(([label, row]) =>
      addChip(label, `${label} · F1 ${metricDecimal(row.f1)}`, row.tp + row.fn ? "" : "empty"));
    wrap.appendChild(chips);

    const tableScroller = metricNode("div", "super-l3-table-scroll");
    const table = metricNode("table", "l3-table");
    const header = document.createElement("tr");
    ["L3 标签", "正例", "TP", "FP", "FN", "P", "R", "F1"].forEach((name, index) =>
      header.appendChild(metricNode("th", index ? "num" : "", name)));
    table.appendChild(header);
    Object.entries(video.per_tag).forEach(([label, row]) => {
      const positive = row.tp + row.fn;
      const tr = metricNode("tr", `l3-row${selectedMetricLabel === label ? " on" : ""}${positive ? "" : " empty"}`);
      tr.appendChild(metricNode("td", "", label));
      [positive, row.tp, row.fp, row.fn].forEach((value) => tr.appendChild(metricNode("td", "num", value)));
      [row.precision, row.recall, row.f1].forEach((value) => tr.appendChild(metricNode("td", "num", metricDecimal(value))));
      tr.onclick = () => selectMetricLabel(label);
      table.appendChild(tr);
    });
    tableScroller.appendChild(table);
    wrap.appendChild(tableScroller);
    const open = metricNode("button", "super-l3-expand", "展开完整质检指标");
    open.type = "button";
    open.onclick = openMetrics;
    wrap.appendChild(open);
    host.appendChild(wrap);
  }
  async function fetchMetrics(force = false) {
    const scope = state.assignment.scope;
    if (!force && metricsLoadedScope === scope && lastMetrics) return lastMetrics;
    if (!force && metricsLoadPromise && metricsLoadedScope === scope) return metricsLoadPromise;
    const labels = Array.isArray(window.PAGE_REVIEW_LABELS) ? window.PAGE_REVIEW_LABELS : [];
    const query = new URLSearchParams({ scope, labels: JSON.stringify(labels) });
    if (window.PAGE_REVIEW_VERDICT_SLICES) {
      query.set("slices", JSON.stringify(window.PAGE_REVIEW_VERDICT_SLICES));
    }
    // 评测员终审判 脏数据 / excludeTag(如 时长不一致) 的视频整条不进指标 (1028)
    const excludeTag = window.PAGE_FINAL_BUCKETS?.excludeTag;
    if (excludeTag) query.set("exclude", JSON.stringify([`video_tag:${excludeTag}`, "case_flag:dirty"]));
    metricsLoadedScope = scope;
    const pending = request(`./api/blind/metrics?${query}`, { method: "GET", headers: {}, body: undefined })
      .then((result) => {
        lastMetrics = result.metrics;
        adminVideoMetrics = result.metrics;
        adminVideoScope = scope;
        return result.metrics;
      });
    metricsLoadPromise = pending;
    try { return await pending; }
    finally { if (metricsLoadPromise === pending) metricsLoadPromise = null; }
  }
  async function refreshInlineMetrics(force = false) {
    if (!state.assignment?.superadmin) return;
    const scope = state.assignment.scope;
    if (!force && inlineLoadedScope === scope && lastMetrics) {
      renderInlineL3(lastMetrics); return;
    }
    const host = document.getElementById("superL3Inline");
    if (host) host.replaceChildren(metricNode("p", "super-l3-loading", "正在计算 L3 指标…"));
    try {
      const metrics = await fetchMetrics(force);
      inlineLoadedScope = scope;
      renderInlineL3(metrics);
    } catch (error) {
      inlineLoadedScope = "";
      if (host) host.replaceChildren(metricNode("p", "super-metrics-error", `L3 指标加载失败：${error.message}`));
    }
  }
  function invalidateQualityMetrics() {
    if (!state.assignment?.superadmin) return;
    metricsLoadedScope = ""; adminVideoScope = ""; inlineLoadedScope = "";
    if (metricsRefreshTimer) clearTimeout(metricsRefreshTimer);
    metricsRefreshTimer = setTimeout(async () => {
      metricsRefreshTimer = 0;
      try {
        const metrics = await fetchMetrics(true);
        inlineLoadedScope = state.assignment.scope;
        renderAdminQualityMatrix(metrics);
        renderInlineL3(metrics);
        if (document.getElementById("superMetricsDialog")?.open) renderMetrics(metrics);
        window.dispatchEvent(new Event("blind-quality-metrics-change"));
      } catch {}
    }, 250);
  }
  function renderMetrics(metrics) {
    const body = document.getElementById("superMetricsBody");
    if (!body) return;
    lastMetrics = metrics;
    body.replaceChildren();
    const video = metrics.video, overall = video.overall, micro = video.micro;
    const l3Mode = metricsView === "l3";
    if (selectedMetricLabel && !video.per_tag[selectedMetricLabel]) selectedMetricLabel = null;
    const active = l3Mode && selectedMetricLabel ? video.per_tag[selectedMetricLabel] : overall;
    const activeTitle = selectedMetricLabel
      || window.PAGE_REVIEW_METRIC_L2_TITLE
      || "L2 总体 · 任一质检问题";
    const overview = metricSection(l3Mode ? "视频级 · L3 维度切片" : "视频级总体",
      `Gold：评测员终判 · Pred：双标一致或冲突复核 · ${video.n_videos} 条视频`);

    const l3 = metricNode("div", "metrics-l3");
    const l3Head = metricNode("div", "metrics-l3-head");
    l3Head.append(
      metricNode("strong", "metrics-l3-title", "L3 维度切片"),
      metricNode("span", "metrics-l3-note", selectedMetricLabel
        ? `当前只看「${selectedMetricLabel}」· 再点一次回到 L2 总体`
        : "当前查看 L2 总体 · 点击标签进入 L3"));
    const chips = metricNode("div", "metrics-l3-chips");
    const addChip = (label, text) => {
      const chip = metricNode("button", `metrics-l3-chip${selectedMetricLabel === label ? " on" : ""}`, text);
      chip.type = "button";
      chip.onclick = () => selectMetricLabel(label);
      chips.appendChild(chip);
    };
    addChip(null, `L2 总体 · F1 ${metricDecimal(overall.f1)}`);
    Object.entries(video.per_tag).forEach(([label, row]) => addChip(label, `${label} · F1 ${metricDecimal(row.f1)}`));
    l3.append(l3Head, chips);
    if (l3Mode) overview.appendChild(l3);

    const cards = metricNode("div", "metrics-cards");
    if (l3Mode) {
      cards.append(
        metricCard(`${selectedMetricLabel ? "L3" : "L2"} F1`, metricPercent(active.f1), `${active.n_scored}/${active.n_total} 条可计算`, true),
        metricCard("Precision", metricPercent(active.precision), `FP ${active.fp} · TP ${active.tp}`),
        metricCard("Recall", metricPercent(active.recall), `FN ${active.fn} · TP ${active.tp}`),
        metricCard("Accuracy", metricPercent(active.accuracy), `TN ${active.tn} · ⭐️按对计 ${active.n_star_credit || 0} · 边界 ${active.n_boundary || 0}`));
    } else {
      cards.append(
        metricCard("样本级 F1", metricPercent(overall.f1), `${overall.n_scored}/${overall.n_total} 条可计算`, true),
        metricCard("标签 Micro Precision", metricPercent(micro.precision), `FP ${micro.fp} · TP ${micro.tp}`),
        metricCard("标签 Micro Recall", metricPercent(micro.recall), `FN ${micro.fn} · TP ${micro.tp}`),
        metricCard("标签 Micro F1", metricPercent(micro.f1), `${micro.n_scored}/${micro.n_total} 个标签判定`));
    }
    overview.appendChild(cards);
    const grid = metricNode("div", "metrics-grid");
    grid.style.marginTop = "12px";
    grid.append(confusionMatrix(active, l3Mode ? activeTitle
      : `样本级 · ${window.PAGE_REVIEW_METRIC_L2_TITLE || "任一合理性问题"}`),
      confusionMatrix(micro, "全部 L3 标签 · Micro"));
    overview.appendChild(grid);
    if (l3Mode) {
      const tableWrap = metricNode("div", "metrics-table-wrap");
      tableWrap.style.marginTop = "12px";
      const table = metricNode("table", "metrics-table");
      const thead = document.createElement("thead"), hr = document.createElement("tr");
      ["L3 标签", "正例", "TP", "FP", "FN", "P", "R", "F1"]
        .forEach((name) => hr.appendChild(metricNode("th", "", name)));
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = document.createElement("tbody");
      Object.entries(video.per_tag).forEach(([label, row]) => {
        const tr = document.createElement("tr");
        tr.className = `metrics-l3-row${selectedMetricLabel === label ? " on" : ""}`;
        tr.title = selectedMetricLabel === label ? "再次点击回到 L2 总体" : `查看「${label}」`;
        tr.onclick = () => selectMetricLabel(label);
        [label, row.tp + row.fn, row.tp, row.fp, row.fn, metricDecimal(row.precision), metricDecimal(row.recall),
          metricDecimal(row.f1)]
          .forEach((value, index) => tr.appendChild(metricNode("td", index === 0 || index === 7 ? "metric-strong" : "", value)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); tableWrap.appendChild(table); overview.appendChild(tableWrap);
    }
    body.appendChild(overview);

    const evidence = metrics.evidence;
    if (!l3Mode) {
      const evidenceSection = metricSection("证据级", "集合匹配：仅定义 TP / FP / FN，不定义 TN、Accuracy、Specificity");
      evidenceSection.appendChild(metricNode("h4", "metrics-subhead", "区分细类 · 按证据 ID 精确匹配"));
      const evCards = metricNode("div", "metrics-cards");
      evCards.append(
        metricCard("Evidence F1", metricPercent(evidence.f1), `TP ${evidence.tp} · FP ${evidence.fp} · FN ${evidence.fn}`, true),
        metricCard("Precision", metricPercent(evidence.precision), `预测为真 ${evidence.tp + evidence.fp}`),
        metricCard("Recall", metricPercent(evidence.recall), `Gold 真集 ${evidence.tp + evidence.fn}`),
        metricCard("证据全集", evidence.n_universe, `边界 ${evidence.n_boundary} · Gold 缺失 ${evidence.n_missing_gold}`));
      evidenceSection.appendChild(evCards);
      const merged = metrics.evidence_merged;
      evidenceSection.appendChild(metricNode("h4", "metrics-subhead", "不区分细类 · 合并为问题 · 时间重叠 · 一一匹配"));
      const mergedCards = metricNode("div", "metrics-cards");
      if (merged) {
        mergedCards.append(
          metricCard("Evidence F1", metricPercent(merged.f1), `TP ${merged.tp} · FP ${merged.fp} · FN ${merged.fn}`, true),
          metricCard("Precision", metricPercent(merged.precision), `预测问题 ${merged.n_pred_problems}（由 ${merged.n_pred_items} 条证据合并）`),
          metricCard("Recall", metricPercent(merged.recall), `Gold 问题 ${merged.n_gold_problems}（由 ${merged.n_gold_items} 条证据合并）`),
          metricCard("匹配规则", "时间重叠", `不比较细类标签 · 无时间段未计入 ${merged.n_untimed}`));
      } else {
        mergedCards.append(metricCard("Evidence F1", "—", "服务端未返回此指标：需重启服务，或该批次缺少机标时间段数据", true));
      }
      evidenceSection.appendChild(mergedCards);
      const sourceWrap = metricNode("div", "metrics-table-wrap"); sourceWrap.style.marginTop = "12px";
      const sourceTable = metricNode("table", "metrics-table");
      [["证据构成", ""], ["机标证据", evidence.by_source.machine_evidence || 0],
        ["标注员补充", evidence.by_source.annotator_evidence || 0],
        ["评测员补漏", evidence.by_source.admin_supplement || 0],
        ["双方均判无", evidence.n_both_absent || 0]]
        .forEach(([name, value], index) => {
          if (index === 0) {
            const tr = document.createElement("tr");
            tr.append(metricNode("th", "", name), metricNode("th", "", "数量"));
            sourceTable.appendChild(metricNode("thead", "")); sourceTable.tHead.appendChild(tr);
          } else {
            const tr = document.createElement("tr"); tr.append(metricNode("td", "", name), metricNode("td", "metric-strong", value));
            (sourceTable.tBodies[0] || sourceTable.appendChild(document.createElement("tbody"))).appendChild(tr);
          }
        });
      sourceWrap.appendChild(sourceTable); evidenceSection.appendChild(sourceWrap); body.appendChild(evidenceSection);
    }

    const notes = metricNode("ul", "metrics-notes");
    metrics.notes.forEach((note) => notes.appendChild(metricNode("li", "", note)));
    notes.appendChild(metricNode("li", "", `多复核员稳定随机选择：${metrics.reviewer_selection.multi_reviewer_decisions} 个判定。`));
    body.appendChild(notes);
    document.getElementById("superMetricsOverviewTab")?.classList.toggle("on", !l3Mode);
    document.getElementById("superMetricsL3Tab")?.classList.toggle("on", l3Mode);
    const subtitle = document.getElementById("superMetricsSubtitle");
    if (subtitle) subtitle.textContent = `${l3Mode ? "视频级 L3 分标签指标" : "视频级混淆矩阵与证据级集合 PRF"} · 更新于 ${new Date(metrics.generated_at).toLocaleString()}`;
  }
  async function refreshMetrics() {
    const body = document.getElementById("superMetricsBody");
    if (!body || !state.assignment?.superadmin) return;
    body.replaceChildren(metricNode("p", "super-metrics-loading", "正在读取封板记录并计算指标…"));
    try {
      const metrics = await fetchMetrics(true);
      inlineLoadedScope = state.assignment.scope;
      renderInlineL3(metrics);
      renderMetrics(metrics);
    } catch (error) {
      body.replaceChildren(metricNode("p", "super-metrics-error", `指标加载失败：${error.message}`));
    }
  }
  function openMetrics() {
    if (!state.assignment?.superadmin) return;
    const dialog = document.getElementById("superMetricsDialog");
    if (!dialog) return;
    metricsView = "l3";
    document.getElementById("superMetricsOverviewTab")?.classList.remove("on");
    document.getElementById("superMetricsL3Tab")?.classList.add("on");
    if (!dialog.open) dialog.showModal();
    refreshMetrics();
  }
  function showLogin(message = "") {
    let overlay = document.getElementById("blindLoginOverlay");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "blindLoginOverlay";
      overlay.className = "blind-login-overlay";
      overlay.innerHTML = `<form class="blind-login-card">
        <div class="blind-login-kicker">双人独立盲标 · 调试版</div>
        <h1>登录标注系统</h1>
        <p>请输入管理员分配的账号和密码。登录成功后，本浏览器会保存会话。</p>
        <input name="account" autocomplete="username" maxlength="64" placeholder="九位数字账号" required />
        <input name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="密码" required />
        <button type="submit">进入我的任务</button>
        <div class="blind-login-error" role="alert"></div>
        <small>请勿共享账号、密码或浏览器会话。</small>
      </form>`;
      document.body.appendChild(overlay);
      const form = overlay.querySelector("form");
      form.onsubmit = async (event) => {
        event.preventDefault();
        const account = form.elements.account.value.trim();
        const password = form.elements.password.value;
        const old = saved();
        const error = overlay.querySelector(".blind-login-error");
        const button = form.querySelector("button");
        error.textContent = ""; button.disabled = true; button.textContent = "登录中…";
        try {
          state.token = old?.tokens?.[account] || "";
          const result = await request("./api/blind/login", {
            method: "POST", body: JSON.stringify({ account, password, token: state.token || undefined }),
          });
          state.account = result.account; state.token = result.token; persist(); paintIdentity();
          overlay.remove(); resolveReady();
        } catch (e) { error.textContent = e.message; }
        finally { button.disabled = false; button.textContent = "进入我的任务"; }
      };
    }
    overlay.querySelector(".blind-login-error").textContent = message;
    const old = saved();
    if (old?.current) overlay.querySelector("input").value = old.current;
  }
  async function bootstrap() {
    const old = saved();
    const token = old?.tokens?.[old?.current];
    if (!old?.current || !token) { showLogin(); return; }
    state.account = old.current; state.token = token;
    try {
      const result = await request("./api/blind/login", {
        method: "POST", body: JSON.stringify({ account: old.current, token }),
      });
      state.account = result.account; state.token = result.token; paintIdentity(); resolveReady();
    } catch (e) { state.account = ""; state.token = ""; showLogin(e.message); }
  }
  async function assign(scope, rows) {
    const uids = rows.map(row => String(row.uid || row.no));
    const result = await request("./api/blind/assign", {
      method: "POST", body: JSON.stringify({ scope, uids }),
    });
    // 严重度重标页不走双标，算不出质检指标，超管在这里按普通管理员走。
    if (window.PAGE_SEVERITY_RELABEL) result.superadmin = false;
    const wasWaiting = !!state.assignment?.waiting;
    if (state.assignment?.scope && state.assignment.scope !== result.scope) {
      lastMetrics = null; adminVideoMetrics = null;
      metricsLoadedScope = ""; adminVideoScope = ""; inlineLoadedScope = "";
      selectedMetricLabel = null; qualityFilter = "all";
    }
    state.role = result.role; state.assignment = result; paintIdentity();
    if (result.superadmin) refreshAdminQualityMatrix().catch(() => {});
    if (result.superadmin) refreshInlineMetrics().catch(() => {});
    if (waitingPoll) { clearTimeout(waitingPoll); waitingPoll = 0; }
    if (result.reviewer && result.waiting) {
      // A reviewer page can stay open while the final annotator submits.
      // Recheck server truth instead of freezing the first waiting snapshot.
      waitingPoll = setTimeout(async () => {
        try {
          const next = await request("./api/blind/assign", {
            method: "POST", body: JSON.stringify({ scope, uids }),
          });
          state.role = next.role; state.assignment = next; paintIdentity();
          if (!next.waiting) location.reload();
          else assign(scope, rows).catch(() => {});
        } catch { waitingPoll = setTimeout(() => assign(scope, rows).catch(() => {}), 5000); }
      }, 5000);
    } else if (wasWaiting && !result.waiting) {
      location.reload();
    }
    return result;
  }
  function updateCompletion(completed, total) {
    state.completed = completed; state.total = total; paintIdentity();
  }
  async function submitBatch() {
    if (!state.assignment || state.assignment.god || state.assignment.submitted) return;
    if (!confirm(`确认提交 ${state.assignment.uids.length} 条任务？`)) return;
    const button = document.getElementById("blindSubmitBatch");
    if (button) { button.disabled = true; button.textContent = "提交校验中…"; }
    try {
      const result = await request("./api/blind/submit", {
        method: "POST", body: JSON.stringify({ scope: state.assignment.scope }),
      });
      state.assignment = { ...state.assignment, ...result };
      paintIdentity();
      alert(`已提交 ${result.count} 条。`);
      location.reload();
    } catch (e) {
      alert(e.message);
      if (button) button.disabled = false;
      paintIdentity();
    }
  }
  function switchAccount() {
    state.account = ""; state.token = ""; state.role = ""; state.assignment = null;
    try {
      const value = saved() || { current: "", tokens: {} };
      value.current = "";
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
    location.reload();
  }

  window.PAGE_READY = ready;
  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("blindSwitchAccount")?.addEventListener("click", switchAccount);
    document.getElementById("blindSubmitBatch")?.addEventListener("click", submitBatch);
    document.getElementById("superMetricsOpen")?.addEventListener("click", openMetrics);
    document.getElementById("superMetricsRefresh")?.addEventListener("click", refreshMetrics);
    document.getElementById("superMetricsOverviewTab")?.addEventListener("click", () => {
      metricsView = "overview"; if (lastMetrics) renderMetrics(lastMetrics);
    });
    document.getElementById("superMetricsL3Tab")?.addEventListener("click", () => {
      metricsView = "l3"; if (lastMetrics) renderMetrics(lastMetrics);
    });
    document.getElementById("superMetricsClose")?.addEventListener("click", () =>
      document.getElementById("superMetricsDialog")?.close());
    window.addEventListener("review-storage", invalidateQualityMetrics);
    paintIdentity(); bootstrap();
  }, { once: true });

  window.ReviewStorage = {
    async read(scope) {
      const result = await request(`./api/blind/reviews?scope=${encodeURIComponent(scope)}`, {
        method: "GET", headers: {}, body: undefined,
      });
      return result.records;
    },
    async save(record) {
      const uuid = () => crypto.randomUUID?.() || Date.now() + "-" + Math.random().toString(16).slice(2);
      const rec = { ...record, op_id: record.op_id || uuid(), ts: record.ts || new Date().toISOString() };
      const result = await request("./api/blind/reviews", { method: "POST", body: JSON.stringify(rec) });
      return result.rec;
    },
    pending() { return []; }, async retry() {}, download() {},
    diagnostic: { mode: window.PAGE_TRAINING_MODE ? "server-enforced-training" : "server-enforced-blind" },
    get status() { return window.PAGE_TRAINING_MODE ? "培训协作服务" : "双人盲标服务"; },
  };
  return { state, ready, assign, paintIdentity, updateCompletion, submitBatch, switchAccount,
    renderAdminQualityMatrix, qualityCell, setQualityFilter,
    get account() { return state.account; }, get role() { return state.role; },
    get submitted() { return !!state.assignment?.submitted; },
    get isGod() { return !!state.assignment?.god; },
    get isSuperadmin() { return !!state.assignment?.superadmin; } };
})();

