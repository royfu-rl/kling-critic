/* 右侧面板：selectChip —— Demo 置顶 → Rubric → Rules → 治理动作 */
function selectChip(el, t, sub, dim, subj, prio, isAfter, subRules, dimRules){
  document.querySelectorAll('.chip.sel').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel'); selected = el;
  const type = subj ? '<span class="badge b-subj">主观</span>' : '<span class="badge b-obj">客观</span>';
  let html = '<h3>'+t.n+' '+type;
  if (bodyEl.classList.contains('after') && prio)
    html += '<span class="pbadge" data-p="'+prio+'">'+prio+'</span>';
  else if (bodyEl.classList.contains('after') && !t.gone && t.prioTBD)
    html += '<span class="pbadge" data-p="TBD">P 待补</span>';
  html += '</h3>';
  html += '<p class="path">'+dim+' › '+sub+'</p>';
  if (t.facets){
    html += '<div class="kv"><div class="k">细分（facets）</div><div class="rel">'+
            t.facets.map(x => '<span class="r">+'+x+'</span>').join('')+'</div></div>';
  }
  if (t.note){ html += '<div class="kv"><div class="k">备注</div><div>'+t.note+'</div></div>'; }
  const demos = demosFor(t);
  // Demo 置顶：多模态锚点比文字定义更快定调；91 个标签里只有 7 个有 demo，
  // 没有的直接不占位（旧版在这里放一个 disabled 的空按钮，等于给 84 个标签开头塞了个死按钮）。
  if (demos){
    html += '<div class="kv"><div class="k">多模态 Demo</div>'
          + '<button class="demobtn" id="open-demo">▷ Play · '+demos.length+' 条标注数据</button></div>';
  }
  // after 模式：Rubric（解释 + 常见 Case）→ Rules（三级合并、按动词分组）→ 治理动作
  if (isAfter){
    if (t.rubric && !t.gone){
      const todo = t.rubric.status === 'TODO';
      html += '<div class="card rub'+(todo ? ' rub-todo' : '')+'">'
            + '<div class="ct">Rubric'+(todo ? ' <span class="todo">待补写</span>' : '')+'</div>'
            + '<div><b>解释：</b>'+md(t.rubric.what)+'</div>';
      if (t.rubric.symptoms && t.rubric.symptoms.length)
        html += '<div style="margin-top:7px"><b>常见 Case：</b><div class="syms">'
              + t.rubric.symptoms.map(s => '<span>'+md(s)+'</span>').join('') + '</div></div>';
      if (t.rubric.requires)
        html += '<div style="margin-top:7px"><b>成立条件：</b>'+md(t.rubric.requires)+'</div>';
      html += '</div>';
    }
    const myRules = rulesFor(t, subRules, dimRules);
    if (myRules.length){
      html += '<div class="kv"><div class="k">Rules</div>' + rulesHTML(myRules) + '</div>';
    }
    // 治理动作是给体系维护者看的留痕，不参与判定 → 沉到最底
    if (t.act && t.act !== '维持'){
      html += '<div class="card '+(t.gone ? 'dup' : 'stmt')+'">'
            + '<div class="ct">处理动作 · '+t.act+'</div>';
      if (t.from) html += '<div>原标签：'+md(t.from)+'</div>';
      if (t.why)  html += '<div style="margin-top:7px;color:var(--ink-soft)">'+md(t.why)+'</div>';
      if (t.gone) html += '<div class="fix">该标签<b>不在治理后体系中</b>。</div>';
      html += '</div>';
    }
  }
  // 陈述式 note（仅 before：after 体系已把陈述式全部改写为缺陷式）
  if (!isAfter && STMT.has(t.n)){
    html += '<div class="card stmt">'
          + '<div class="ct">陈述式标签</div>'
          + '<div>该标签是对属性的陈述，而非缺陷描述——「'+t.n+'」本身不是问题，其<b>反面</b>才是问题。</div>'
          + '<div class="fix">治理建议：改写为缺陷式表述（如 <b>音频一致性 → 音频不一致</b>），标签直接对应可判定的问题。</div></div>';
  }
  // boundary issue card（仅 before）
  if (!isAfter && t.flag && t.g && ISSUES[t.g]){
    const iss = ISSUES[t.g];
    const cls  = iss.kind === 'confusion' ? 'warn' : 'dup';
    html += '<div class="card '+cls+'">'
          + '<div class="ct">边界问题 · '+iss.label+'</div>'
          + '<div>'+iss.title+'</div>'
          + '<div style="margin-top:7px;color:var(--ink-soft)">'+iss.desc+'</div>'
          + '<div class="kv"><div class="k">相关标签</div><div class="rel">'
          +   iss.members.map(m => '<span class="r">'+m+'</span>').join('')
          + '</div></div>'
          + '<div class="fix">治理建议：'+iss.fix+'</div></div>';
  } else if (!isAfter && !STMT.has(t.n)) {
    html += '<p class="ph">该标签边界清晰，无已知混淆 / 重复问题。</p>';
  }
  panel.innerHTML = html;
  const btn = document.getElementById('open-demo');
  if (btn) btn.onclick = () => {
    // DEMOS 以治理前的标签名为键，改名过的标签（崩坏 ← 明显崩坏）要用 demoKey 取数，
    // 但标题仍显示当前名字。两者混用会让 modal 取到 undefined → 空白全屏。
    const key = t.demoKey || t.n;
    if (IN_IFRAME){
      // 三阶段握手，任何一帧都不能画出「半成品」（闪烁的根因都在这里）：
      //   ① 这里只发消息，不动 DOM —— 图表保持原样。曾经在这一步就加 .kc-expanded
      //      把树藏掉，可那时 iframe 还是行内 820px，于是原地闪出一块白（flash.png）。
      //   ② 父页铺 scrim、把 iframe 放大到全屏，但先 opacity:0 藏着（见 template.html）。
      //   ③ 收到 kc-expand-ack 才加 class + 开 modal，再回 kc-modal-ready 让父页显影。
      pendingOpen = {key, tag: t.n, dim, sub, prio};
      window.parent.postMessage({type: 'kc-expand'}, '*');
      // 兜底：若 300ms 内没收到父页 ack（父页不认这套协议），仍照常开 modal
      setTimeout(() => { if (pendingOpen){ const p = pendingOpen; pendingOpen = null; openModal(p.key, p.dim, p.sub, p.prio, p.tag); } }, 300);
    } else {
      openModal(key, dim, sub, prio, t.n);
    }
  };
}

