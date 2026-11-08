// ══════════════════════════════════════════════════════════════════════════
// 帧级标注播放器 · 核心
// ══════════════════════════════════════════════════════════════════════════
// 视频 + 时间轴打点 + 画面 grounding 框 + 帧级 JSON。两个宿主共用这一份：
//   · charts/tag-system.html   —— 包在 modal 里，点标签的「Play」打开
//   · charts/annotation-demo.html —— 直接内联成一张卡片（Pointwise 数据示例）
// 宿主只需提供同名 DOM 节点（见下方 refs）并调 mountDemos(demos)；
// 壳的开关/标题/徽章各自实现，核心不关心自己是不是在 modal 里。
//
// 组件源自 skills/chart-blocks/templates/frame-annotation-modal。

const overlay = document.getElementById('overlay');   // modal 宿主才有；内联宿主为 null
const vEl     = document.getElementById('v-el');
const vWrap   = document.getElementById('v-wrap');
const vLayer  = document.getElementById('v-layer');
const vFill   = document.getElementById('v-fill');
const vTrack  = document.getElementById('v-track');
const vTime   = document.getElementById('v-time');
const vPlay   = document.getElementById('v-play');
const vMute   = document.getElementById('v-mute');
const vJumps  = document.getElementById('v-jumps');
const vCtrls  = document.getElementById('v-controls');
const jBody   = document.getElementById('j-body');

// ── 素材路径：相对「项目根」而不是相对本文档 ─────────────────────────────────
// demo.src 在 data/tag-system.json 里写成 `assets/videos/x.mp4`，即相对项目根。
// 这份 HTML 有四种加载方式，各自的 baseURI 不同：
//   · charts/tag-system.html            直接打开  → base 是 charts/
//   · eval/charts/tag-system.html       直接打开  → base 是 eval/charts/
//   · charts/annotation-demo.html       直接打开  → base 是 charts/
//   · build.py 把上面任一份内联成 srcdoc → base 是父页 index.html（项目根）
// srcdoc 文档没有自己的 URL（location 是 about:srcdoc），相对路径按父页解析，
// 所以曾经写死的 `../assets/…` 在博客里会跑到项目根的上一层，视频 404、
// video.error.code=4（Format error）——表现就是「视频不能播放」。
// 这里统一把 base 归一到项目根：截到最后一个 / 为止，再剥掉 charts/、eval/。
//
// 注意：这段刻意不用正则，全用字符串操作。build.py 会把本文件内联进 index.html
// 的 markdown，而 SPA 端 renderDoc 会把一行里成对的美元符号当成行内公式抽走再还原，
// 还原时不解码 &#10; —— 正则里的行尾锚点成对出现就会被吃掉，整段 JS 变成
// SyntaxError，播放器直接不启动。tools/verify.mjs 有一条检查守着这件事。
const ASSET_BASE = (() => {
  const url = document.baseURI.split('#')[0].split('?')[0];
  let dir = url.slice(0, url.lastIndexOf('/') + 1);
  if (dir.endsWith('/charts/')) dir = dir.slice(0, -'charts/'.length);
  if (dir.endsWith('/eval/'))   dir = dir.slice(0, -'eval/'.length);
  return dir;
})();
const srcOf = d => (d.src.indexOf('//') === 0 || d.src.indexOf(':') > -1 || d.src[0] === '/')
                     ? d.src : ASSET_BASE + d.src;

// 当前这组 demo。核心不查 DEMOS —— 由宿主调 mountDemos(demos) 传入，
// 所以同一份核心既能被 modal 壳驱动，也能被内联卡片直接挂载。
let curDemos = [], curIdx = 0, curFrame = -1, pendingSeek = null;
const curDemo = () => curDemos[curIdx];
const fmt = s => { if(!isFinite(s)) return '0:00'; const m=Math.floor(s/60), c=Math.floor(s%60); return m+':'+String(c).padStart(2,'0'); };
const HOLD_DEFAULT = 1.2;
const holdOf = f => (f.hold != null ? f.hold : HOLD_DEFAULT);
const sevOf  = f => (f.severity != null ? f.severity : 2);


const AUTOSELECT_FIRST = true;   // 打开即定位到第一个问题帧并暂停，首屏就有画面+框

// ── json panel ────────────────────────────────────────────────────────────
function groundingOf(f){
  if (f.grounding) return f.grounding;
  if (f.box) return 'bbox%: ['+f.box.x+','+f.box.y+','+(f.box.x+f.box.w)+','+(f.box.y+f.box.h)+']';
  return undefined;
}
// 面板里吐的 JSON 必须与 data/data.md 里公布的标注协议同构 —— 那份是对外的
// schema，demo 是它的实例，两边键名对不上就等于给了两套协议。
// 所以这里只做换名与换算，不新增语义：
//   frame / frame_range ← time、hold 按 FPS 换算
//   bbox                ← grounding 的像素坐标，从 [x1,y1,x2,y2] 转成协议规定的 [y1,x1,y2,x2]
//   observation         ← 帧上已有的客观描述
//   instruction_expect  ← 协议规定「仅当存在参考素材或生成指令时填写」，demo 没有参考素材，故缺省不出现
const FPS = 4;                       // 质检抽帧口径：4 fps
function pxBox(f){                   // "bbox: [x1,y1,x2,y2]" -> [y1,x1,y2,x2]
  const m = /\[([\d\s,.-]+)\]/.exec(f.grounding || '');
  if (!m) return undefined;
  const n = m[1].split(',').map(v => Number(v.trim()));
  if (n.length !== 4 || n.some(v => !isFinite(v))) return undefined;
  return [n[1], n[0], n[3], n[2]];
}
// 真实数据集里这些字段本来就有（人工画框 / 模型标注都按同一份协议存），
// 有就直接用，只有旧的手写 demo 才需要从 time/hold 反推。
function frameObj(f, i){
  const fr  = f.frame != null ? f.frame
            : (f.time != null ? Math.round(f.time*FPS) : undefined);
  const end = (fr!=null) ? fr + Math.max(1, Math.round(holdOf(f)*FPS)) : undefined;
  return { evidence_id: f.evidence_id || String((i!=null?i:0)+1),
           frame: fr,
           bbox: f.bbox || pxBox(f),
           frame_range: f.frame_range || ((fr!=null && end!=null) ? [fr, end] : undefined),
           instruction_expect: f.instruction_expect,
           observation: f.observation || f.reasoning,
           dimension: f.dimension };
}
function jsonHTML(f, i){
  const obj = frameObj(f, i);
  const lines = ['<span class="jp">{</span>'];
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined);
  keys.forEach((k,i) => {
    const comma = i < keys.length-1 ? '<span class="jp">,</span>' : '';
    const v = obj[k];
    const val = typeof v==='number'
      ? '<span class="jn">'+v+'</span>'
      : Array.isArray(v)
        ? '<span class="jp">[</span><span class="jn">'+v.join('</span><span class="jp">, </span><span class="jn">')+'</span><span class="jp">]</span>'
        : '<span class="js">"'+String(v).replace(/</g,'&lt;')+'"</span>';
    lines.push('  <span class="jk">"'+k+'"</span><span class="jp">: </span>'+val+comma);
  });
  lines.push('<span class="jp">}</span>');
  return lines.join('\n');
}
// ── timeline markers + jump chips ─────────────────────────────────────────
const demoDur = d => Math.max(...d.frames.map(f=>f.time)) + 3;

function renderJumps(demo){
  vJumps.innerHTML = '';
  demo.frames.forEach((f,i) => {
    const b = document.createElement('button');
    b.className = 'jump'; b.dataset.i = i;
    b.innerHTML = '<span class="jd" data-sev="'+sevOf(f)+'"></span>'+f.time.toFixed(1)+'s · '+f.dimension;
    b.onclick = () => gotoFrame(i, true);
    vJumps.appendChild(b);
  });
}
function renderMarks(demo){
  if (!demo) return;
  vTrack.querySelectorAll('.mark').forEach(m => m.remove());
  // duration isn't known until loadedmetadata — place provisionally, redo later
  const dur = vEl.duration || demoDur(demo);
  demo.frames.forEach((f,i) => {
    const m = document.createElement('div');
    m.className = 'mark'; m.dataset.sev = sevOf(f); m.dataset.i = i;
    m.style.left = Math.min(99, (f.time/dur)*100) + '%';
    m.title = f.time.toFixed(1)+'s · '+f.dimension;
    m.onclick = e => { e.stopPropagation(); gotoFrame(i, true); };
    vTrack.appendChild(m);
  });
  if (curFrame >= 0) markActive(curFrame);
}
function markActive(i){
  document.querySelectorAll('.jump').forEach(j => j.classList.toggle('act', +j.dataset.i === i));
  document.querySelectorAll('.mark').forEach(m => m.classList.toggle('act', +m.dataset.i === i));
}
// ── grounding boxes ───────────────────────────────────────────────────────
// Size the annotation layer to the video's real content rect. `object-fit:contain` letterboxes
// the picture inside the wrapper, so box percentages are only meaningful against
// that inner rect — measuring the wrapper instead offsets every box by the bars.
function fitAnnotationLayer(){
  const cw = vWrap.clientWidth, ch = vWrap.clientHeight;
  const sw = vEl.videoWidth || 16, sh = vEl.videoHeight || 9;
  if (!cw || !ch) return;                      // modal still display:none — nothing to fit
  const scale = Math.min(cw/sw, ch/sh);
  const w = sw*scale, h = sh*scale;
  vLayer.style.width = w+'px';   vLayer.style.height = h+'px';
  vLayer.style.left = (cw-w)/2+'px'; vLayer.style.top = (ch-h)/2+'px';
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A frame's box shows while the playhead is inside [time, time+hold). The selected
// frame also stays boxed while paused, so clicking a marker always shows the box
// even when hold has been scrubbed past.
function activeFrames(){
  const demo = curDemo(); if (!demo) return [];
  const t = vEl.currentTime || 0;
  const set = new Set();
  demo.frames.forEach((f,i) => { if (t >= f.time && t < f.time + holdOf(f)) set.add(i); });
  if (vEl.paused && curFrame >= 0) set.add(curFrame);
  return [...set];
}
function renderBoxes(){
  const demo = curDemo(); if (!demo) return;
  vLayer.innerHTML = activeFrames().map(i => {
    const f = demo.frames[i]; if (!f.box) return '';     // no box → degrade to JSON-only
    const b = f.box;
    const nearTop = b.y < 8 ? ' near-top' : '';
    return '<div class="annotation-box'+nearTop+'" data-sev="'+sevOf(f)+'"'
         + ' style="left:'+b.x+'%;top:'+b.y+'%;width:'+b.w+'%;height:'+b.h+'%">'
         + '<span>'+esc(f.dimension + (f.target ? ' · '+f.target : ''))+'</span></div>';
  }).join('');
}
// ── navigation ────────────────────────────────────────────────────────────
function gotoFrame(i, seek){
  curFrame = i;
  const f = curDemo().frames[i];
  if (seek){
    if (isFinite(vEl.duration)){ vEl.currentTime = f.time; vEl.pause(); }
    else pendingSeek = f.time;   // metadata not in yet — replay the seek on load
  }
  jBody.innerHTML = jsonHTML(f, i);
  markActive(i);
  renderBoxes();
}

function loadDemo(idx){
  curIdx = idx; curFrame = -1; pendingSeek = null;
  const demo = curDemo();
  document.querySelectorAll('.demopill').forEach(p => p.classList.toggle('on', +p.dataset.i === idx));
  document.getElementById('v-cap').innerHTML = demo.caption || '';
  jBody.innerHTML = '<span class="jempty">点击进度条上的问题帧标记查看该帧标注。</span>';
  // fade out before swapping src so the empty/black frame between demos doesn't flash
  vEl.style.opacity = '0'; vLayer.style.opacity = '0';
  vLayer.innerHTML = '';
  vEl.src = srcOf(demo); vEl.load(); vEl.muted = true; vMute.textContent = '🔊';
  vFill.style.width = '0%';
  renderJumps(demo);
  renderMarks(demo);                       // provisional; refined on loadedmetadata
  if (AUTOSELECT_FIRST && demo.frames.length) gotoFrame(0, true);
}



// ── 宿主入口 ──────────────────────────────────────────────────────────────
// 换一组 demo 并渲染第一条。壳负责在调用前把自己显示出来（modal 加 .on / 内联无操作），
// 否则 wrapper 尺寸为 0，fitAnnotationLayer 量不到东西。
function mountDemos(demos){
  curDemos = demos || [];
  if (!curDemos.length) return false;
  const strip = document.getElementById('m-strip');
  if (strip){
    strip.innerHTML = '';
    curDemos.forEach((d, i) => {
      const p = document.createElement('button');
      p.className = 'demopill' + (i === 0 ? ' on' : '');
      p.dataset.i = i; p.textContent = d.label;
      p.onclick = () => loadDemo(i);
      strip.appendChild(p);
    });
  }
  loadDemo(0);
  requestAnimationFrame(fitAnnotationLayer);   // 壳刚显示，布局完成后再量
  return true;
}

// ── video wiring ──────────────────────────────────────────────────────────
vEl.addEventListener('loadedmetadata', () => {
  renderMarks(curDemo());
  vTime.textContent = '0:00 / '+fmt(vEl.duration);
  fitAnnotationLayer();
  if (pendingSeek != null){ vEl.currentTime = pendingSeek; pendingSeek = null; vEl.pause(); }
});
vEl.addEventListener('loadeddata', () => { vEl.style.opacity='1'; vLayer.style.opacity='1'; fitAnnotationLayer(); renderBoxes(); });
vEl.addEventListener('seeked', renderBoxes);
vEl.addEventListener('timeupdate', () => {
  const r = vEl.currentTime / (vEl.duration || 1);
  vFill.style.width = (r*100)+'%';
  vTime.textContent = fmt(vEl.currentTime)+' / '+fmt(vEl.duration);
  renderBoxes();
});
vEl.addEventListener('play',  () => { vPlay.textContent='⏸'; vCtrls.classList.add('show'); });
vEl.addEventListener('pause', () => { vPlay.textContent='▶'; vCtrls.classList.remove('show'); renderBoxes(); });
vPlay.onclick = () => { vEl.paused ? vEl.play() : vEl.pause(); };
vEl.onclick   = () => { vEl.paused ? vEl.play() : vEl.pause(); };
vMute.onclick = () => { vEl.muted = !vEl.muted; vMute.textContent = vEl.muted ? '🔇' : '🔊'; };
addEventListener('resize', fitAnnotationLayer);

// ── draggable progress ────────────────────────────────────────────────────
let dragging = false;
function seekAt(e){
  const rect = vTrack.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX);
  const r = Math.max(0, Math.min(1, (x - rect.left)/rect.width));
  if (isFinite(vEl.duration)) vEl.currentTime = r * vEl.duration;
}
vTrack.addEventListener('mousedown', e => { if(e.target.classList.contains('mark')) return; dragging=true; vCtrls.classList.add('show'); seekAt(e); });
document.addEventListener('mousemove', e => { if(dragging) seekAt(e); });
document.addEventListener('mouseup',   () => { if(dragging){ dragging=false; vCtrls.classList.remove('show'); } });
// ── copy json ─────────────────────────────────────────────────────────────
document.getElementById('j-copy').onclick = () => {
  if (curFrame < 0) return;
  const obj = frameObj(curDemo().frames[curFrame], curFrame);
  Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
    const c = document.getElementById('j-copy'); c.classList.add('copied'); c.textContent='✓';
    setTimeout(() => { c.classList.remove('copied'); c.textContent='⧉'; }, 1600);
  });
};


