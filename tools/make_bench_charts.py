#!/usr/bin/env python3
"""data/bench.json -> assets/figures/bench-video.html、bench-qc.html（页头两张分面柱状图）。

用法：python3 tools/make_bench_charts.py && python3 build.py
  - 版式照 kat-coder-rl-blog/assets/figures/pro-bench.html：每个 benchmark 一个面板，每个模型一根柱，
    我们的模型（hi）用品牌蓝渐变，其余灰；柱顶是厂商 logo，柱下是斜 45° 的模型名
  - 缺数据的格子画成淡色「—」；placeholder 模型画斜纹，tooltip 标「示意值」
  - 页面高度通过 postMessage({type:'kc-height'}) 报给 template.html，iframe 自动贴合
"""
import base64, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGOS = {'abc': 'assets/figures/kling-logo.png', **{k: f'assets/logos/model-{k}.png'
                                                for k in ('gemini', 'qwen', 'seed', 'gpt', 'deepseek')}}

PAGE = r'''<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<!-- 生成文件，别手改：data/bench.json + tools/make_bench_charts.py -->
<style>
  :root{
    --font:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --ink:#1a1a1a;--muted:#9a9aa0;--muted2:#b8b8be;--border:#e6e6e6;
    --accent:#2f6bff;--accent-deep:#1b3fae;  /* Kling brand blue (template --brand) → deep */
  }
  *{box-sizing:border-box;}
  body{margin:0;background:transparent;font-family:var(--font);color:var(--ink);
    -webkit-font-smoothing:antialiased;padding:4px 2px;display:flex;justify-content:center;}
  .card{width:100%;max-width:1340px;}
  .grid{display:grid;grid-template-columns:repeat(__COLS__,1fr);gap:14px;}
  @media (max-width:860px){.grid{grid-template-columns:repeat(2,1fr);}}
  @media (max-width:620px){.grid{grid-template-columns:1fr;}}
  .panel{min-width:0;background:#fafafb;border:1px solid var(--border);border-radius:12px;padding:12px 12px 6px;}
  .panel.avg{background:#f3f6ff;border-color:#dbe5ff;}
  .panel-name{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.3;}
  .panel-dom{font-size:11px;font-weight:500;color:var(--muted2);margin-left:5px;}
  .note{font-size:12.5px;color:var(--muted);margin:14px 0 0;line-height:1.5;max-width:860px;}
  svg text{font-family:var(--font);}
  .barrect{transition:y .5s cubic-bezier(.22,.61,.36,1),height .5s cubic-bezier(.22,.61,.36,1);}
  .grp:hover .barrect{filter:brightness(1.05);}
  @media (prefers-reduced-motion:reduce){.barrect{transition:none;}}
  #tip{position:fixed;z-index:50;pointer-events:none;background:#111;color:#fff;border-radius:8px;
    padding:8px 11px;font-size:12.5px;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.25);
    opacity:0;transition:opacity .12s;white-space:nowrap;}
  #tip .t-cat{font-weight:600;margin-bottom:2px;} #tip .t-dim{color:#cfcfd4;} #tip .t-ph{color:#ffd27a;}
</style>
</head>
<body>
<div class="card">
  <div class="grid" id="grid"></div>
  <p class="note" id="note"></p>
</div>
<div id="tip"></div>
<script>
const DATA  = __DATA__;
const LOGOS = __LOGOS__;

const tip=document.getElementById("tip");
function showTip(html,e){tip.innerHTML=html;tip.style.opacity=1;moveTip(e);}
function moveTip(e){const pad=14;let x=e.clientX+pad,y=e.clientY+pad;const r=tip.getBoundingClientRect();
  if(x+r.width>innerWidth)x=e.clientX-r.width-pad;if(y+r.height>innerHeight)y=e.clientY-r.height-pad;
  tip.style.left=x+"px";tip.style.top=y+"px";}
function hideTip(){tip.style.opacity=0;}
const NS="http://www.w3.org/2000/svg";
const el=(n,a)=>{const x=document.createElementNS(NS,n);for(const k in a)x.setAttribute(k,a[k]);return x;};

// one bar per model, in DATA.models order; a model missing from p.scores is drawn as "—"
const bars=p=>DATA.models.map(m=>{
  const c=p.scores[m.key], v=typeof c==="object"&&c?c.v:c;
  return {...m,value:v,missing:v==null,meta:(c&&c.meta)||m.meta};
});

let UID=0;
function renderPanel(p){
  const W=320,H=258,padL=26,padR=10,padT=26,padB=74, max=100, ticks=[0,50,100];
  const baseY=H-padB, topY=padT, plotH=baseY-topY, y=v=>baseY-(v/max)*plotH;
  const bs=bars(p), slot=(W-padL-padR)/bs.length, barW=Math.min(26,slot*0.56), uid=++UID;

  const wrap=document.createElement("div");wrap.className="panel"+(p.avg?" avg":"");
  wrap.innerHTML=`<span class="panel-name">${p.name}</span>`+(p.dom?`<span class="panel-dom">${p.dom}</span>`:"");
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,width:"100%",style:"display:block;margin-top:8px;overflow:visible",role:"img","aria-label":p.name});
  svg.innerHTML=`<defs>
    <linearGradient id="hl${uid}" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent-deep)"/></linearGradient>
    <linearGradient id="gr${uid}" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#d4d4d4"/><stop offset="100%" stop-color="#b3b3b3"/></linearGradient>
    <pattern id="ph${uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="6" fill="#fff" opacity=".42"/></pattern>
    <clipPath id="rr${uid}" clipPathUnits="objectBoundingBox"><rect width="1" height="1" rx=".24"/></clipPath></defs>`;

  ticks.forEach(t=>{
    svg.appendChild(el("line",{x1:padL,x2:W-padR,y1:y(t),y2:y(t),stroke:"#e6e6e6","stroke-width":1,opacity:t===0?.9:.55}));
    const lab=el("text",{x:padL-6,y:y(t)+3.5,"text-anchor":"end","font-size":10,fill:"#9a9aa0"});lab.textContent=t;svg.appendChild(lab);
  });
  svg.appendChild(el("line",{x1:padL,x2:padL,y1:topY-4,y2:baseY,stroke:"#d8d8dc","stroke-width":1}));
  svg.appendChild(el("line",{x1:padL,x2:W-padR,y1:baseY,y2:baseY,stroke:"#c8c8ce","stroke-width":1}));

  bs.forEach((b,i)=>{
    const cx=padL+slot*(i+0.5), ty=b.missing?baseY:y(b.value), h=baseY-ty;
    const g=el("g",{class:"grp"});
    const attrs=(fill)=>({class:"barrect",x:cx-barW/2,y:baseY,width:barW,height:0,rx:3,fill});
    const rects=[el("rect",attrs(`url(#${b.hi?"hl":"gr"}${uid})`))];
    if(b.placeholder) rects.push(el("rect",attrs(`url(#ph${uid})`)));   // hatched = placeholder number
    rects.forEach(r=>{g.appendChild(r);
      if(!b.missing) requestAnimationFrame(()=>requestAnimationFrame(()=>{r.setAttribute("y",ty);r.setAttribute("height",Math.max(0,h));}));});

    const sc=el("text",{x:cx,y:b.missing?baseY-6:ty-7,"text-anchor":"middle","font-size":11,"font-family":"var(--mono)",
      "font-weight":b.hi?700:600,fill:b.missing?"#c4c4c8":b.hi?"var(--accent-deep)":"#6b7280"});
    sc.textContent=b.missing?"—":b.value.toFixed(1);g.appendChild(sc);

    if(!b.missing&&LOGOS[b.logo]){
      const s=13;
      g.appendChild(el("image",{href:LOGOS[b.logo],x:cx-s/2,y:ty+5,width:s,height:s,"clip-path":`url(#rr${uid})`,opacity:b.hi?1:.92}));
    }
    const lyb=baseY+9;
    const t=el("text",{x:cx,y:lyb,"text-anchor":"end","font-size":9,"font-weight":b.hi?700:500,
      fill:b.hi?"var(--accent)":b.missing?"#a8adb6":"#5b6270",transform:`rotate(-45 ${cx} ${lyb})`});
    t.textContent=b.label;g.appendChild(t);

    const hit=el("rect",{x:cx-slot/2,y:topY-6,width:slot,height:plotH+10,fill:"transparent"});
    const tipHtml=`<div class="t-cat">${b.label} · ${p.name}</div><b>${b.missing?"未报告":b.value.toFixed(1)}</b>`+
      (b.meta?` <span class="t-dim">· ${b.meta}</span>`:"")+(b.placeholder&&!b.missing?` <span class="t-ph">· 示意值，待替换</span>`:"");
    hit.addEventListener("mousemove",e=>showTip(tipHtml,e));hit.addEventListener("mouseleave",hideTip);
    g.appendChild(hit);svg.appendChild(g);
  });
  wrap.appendChild(svg);
  return wrap;
}

const grid=document.getElementById("grid");
DATA.panels.forEach(p=>grid.appendChild(renderPanel(p)));
const note=document.getElementById("note");if(DATA.note)note.textContent=DATA.note;else note.remove();
addEventListener("scroll",hideTip,true);

// report our height so the parent (template.html, kc-height) can fit the iframe without a scrollbar
const card=document.querySelector(".card");
const report=()=>parent.postMessage({type:"kc-height",h:card.getBoundingClientRect().height+10},"*");
new ResizeObserver(report).observe(card);
// the parent may attach its kc-height listener after we first report (srcdoc runs early), so report again a few times
addEventListener("load",report);[0,300,1000,2500].forEach(t=>setTimeout(report,t));
</script>
</body>
</html>
'''


def data_uri(path):
    return 'data:image/png;base64,' + base64.b64encode((ROOT / path).read_bytes()).decode()


def with_average(chart):
    """qc 图在最后加一个「平均」面板：每个模型在所有面板上的均值（有缺就不算）。"""
    val = lambda c: c['v'] if isinstance(c, dict) else c
    keys = [m['key'] for m in chart['models']]
    avg = {k: round(sum(val(p['scores'][k]) for p in chart['panels']) / len(chart['panels']), 1)
           for k in keys if all(k in p['scores'] for p in chart['panels'])}
    n = len(chart['panels'])
    return chart['panels'] + [{'name': chart['average'], 'dom': f'{n} reward models', 'scores': avg, 'avg': True}]


def main():
    spec = json.loads((ROOT / 'data/bench.json').read_text())
    logos = json.dumps({k: data_uri(v) for k, v in LOGOS.items()})
    for name, title in (('video', 'Kling-Critic — video benchmarks'), ('qc', 'Kling-Critic — Kling QC reward models')):
        chart = spec[name]
        panels = with_average(chart) if chart.get('average') else chart['panels']
        data = {'models': chart['models'], 'panels': panels, 'note': chart.get('note', '')}
        html = (PAGE.replace('__TITLE__', title).replace('__COLS__', str(chart.get('cols', 3)))
                    .replace('__DATA__', json.dumps(data, ensure_ascii=False)).replace('__LOGOS__', logos))
        out = ROOT / f'assets/figures/bench-{name}.html'
        out.write_text(html)
        print(f'{out.relative_to(ROOT)}  {len(panels)} panels × {len(chart["models"])} models  {len(html) // 1024} KB')


if __name__ == '__main__':
    main()

