// ══════════════════════════════════════════════════════════════════════════
// 标注 MODAL 壳 —— 把播放器核心包进一个 macOS 风格的弹窗
// ══════════════════════════════════════════════════════════════════════════
// 只做三件事：填标题栏、开关 overlay、被 iframe 内联时跟父页协商全屏。
// 播放逻辑全在 60-player.js，内联版（annotation-demo）共用同一份。

// 宿主入口。key 查 DEMOS，dim/sub 作面包屑，prio 染色标题徽章。
function openModal(key, dim, sub, prio, title){
  document.getElementById('m-title').textContent = title || key;
  document.getElementById('m-path').textContent  = dim + ' › ' + sub;
  const mb = document.getElementById('m-badge');
  if (prio){
    mb.style.display = ''; mb.textContent = prio;
    mb.className = 'mbadge pbadge'; mb.dataset.p = prio;
    mb.style.background = getComputedStyle(document.documentElement)
                            .getPropertyValue('--' + prio.toLowerCase());
    mb.style.color = '#fff';
  } else mb.style.display = 'none';

  // overlay 先显示，再 mount —— 否则 video wrapper 尺寸为 0，框会量歪。
  // 被内联时这两个 class 必须与 .overlay.on 落在同一帧：.kc-expanded 单独在场会
  // 让 body 露白底，两者齐备才走 background:transparent（见 50-modal.css）。
  if (IN_IFRAME){
    document.body.classList.add('kc-expanded');
    document.body.classList.add('kc-modal-open');
  }
  overlay.classList.add('on');
  document.body.style.overflow = 'hidden';

  if (!mountDemos(DEMOS[key])){
    // 没数据就别开：此时 .kc-expanded 已经把图表藏了，开出来是一片空白全屏
    console.warn('[tag-system] 没有 demo 数据：' + key);
    closeModal();
    return;
  }
  // modal 已成形。必须等这一帧真正提交给合成器之后再通知父页显影 —— 在 rAF 里发
  // 消息等于「绘制前」就喊好了，父页显影时合成器手上还是上一帧的全屏标签树。
  if (IN_IFRAME) afterPaint(() => {
    window.parent.postMessage({type: 'kc-modal-ready'}, '*');
  });
}

function closeModal(){
  overlay.classList.remove('on'); vEl.pause(); vEl.removeAttribute('src'); vEl.load();
  document.body.style.overflow = '';
  if (IN_IFRAME){
    // 关键：先别摘 .kc-expanded / .kc-modal-open。
    // 这两个 class 一摘，.wrap 立刻恢复 visible、body 立刻恢复白底。而父页此刻
    // 可能已经把 iframe 缩回行内尺寸 —— 于是要么图表以全屏尺寸画一两帧（旧 bug），
    // 要么行内尺寸的 iframe 里是一片空白矩形（第一次修完后剩下的那半个 bug）。
    // 两边靠 kc-collapse / kc-collapse-ack / kc-revealed 三次握手对齐，
    // 所有中间态都发生在父页 opacity:0 之下，一帧都不上屏。
    window.parent.postMessage({type: 'kc-collapse'}, '*');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(reveal, 400);   // 父页不认这套协议时的兜底
  }
}

// 收回全屏后才恢复图表可见性。两个 class 一起摘：只摘 .kc-expanded 会让 body 恢复
// 白底（transparent 规则要求两者同时在场），那就是一整屏白色盖在 scrim 上。
function reveal(){
  clearTimeout(revealTimer);
  document.body.classList.remove('kc-modal-open');
  document.body.classList.remove('kc-expanded');
  // 图表已经恢复，但此刻父页把 iframe 按在 opacity:0，什么都没上屏。等这一帧真的
  // 提交之后再回一条，父页才能在「子页已经是行内尺寸的图表」这一帧上撤遮罩+显影。
  if (IN_IFRAME) afterPaint(() => {
    window.parent.postMessage({type: 'kc-revealed'}, '*');
  });
}
window.addEventListener('message', e => {
  if (e.data && e.data.type === 'kc-collapse-ack') reveal();
});

document.getElementById('m-close').onclick = closeModal;
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Parent confirms the iframe is now fullscreen. Its viewport update is cross-process
// and async, so poll our own innerWidth until it catches up before opening — otherwise
// the modal still draws small and then jumps.
//
// But rAF may never fire in a background tab / hidden iframe / headless capture, and
// this is the ONLY path that opens the modal once .kc-expanded has hidden our content.
// Without the setTimeout backstop that case is a permanent white screen.
//
// pendingOpen 是 selectChip 存下的 {key, tag, dim, sub, prio}（skill 原版是个布尔，
// 因为它只有一组固定数据；这里必须把参数带回来，否则开出来的是标题为空的 modal）。
window.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'kc-expand-ack' || !pendingOpen) return;
  const p = pendingOpen;
  pendingOpen = null;
  // 立刻藏掉图表本体。父页此刻已经把 iframe 放大到全屏，我们的布局正在按全屏重排；
  // 这两个 class 晚一帧加上，合成器就会先提交一帧「清晰的全屏标签树」（flash.png）。
  // 父页仍是 opacity:0，所以这里藏起来不会被看见，只是保证下一帧上屏时已经是空的。
  document.body.classList.add('kc-expanded');
  document.body.classList.add('kc-modal-open');
  let opened = false;
  const go = () => { if (opened) return; opened = true; openModal(p.key, p.dim, p.sub, p.prio, p.tag); };
  const targetW = (e.data.vw || 0) * 0.9;      // allow 10% slack
  let tries = 0;
  (function tryOpen(){
    if (opened) return;
    if (++tries > 30 || !targetW || window.innerWidth >= targetW) go();
    else requestAnimationFrame(tryOpen);
  })();
  setTimeout(go, 250);                          // hard backstop when rAF doesn't run
});

