#!/usr/bin/env python3
"""把 10 个候选版本拼成一页对比画廊。

    python3 tools/build_variant_gallery.py
    -> middle_processing/workflow-variants/gallery.html

PNG 以 base64 内联，整页一个文件，拷到哪都能看。
"""
import base64
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / 'middle_processing' / 'workflow-variants'

# stem -> (标题, 结构一句话, 什么时候选它)
NOTES = {
    'v01-instrument': ('Instrument', 'Three coloured lanes, and under each stage a panel drawing what it produces.',
                       'Shows the artefacts without spending a whole column on them.'),
    'v02-numbered': ('Numbered Steps', 'Five columns, each a numbered step with its own stack of detail.',
                     'Best when the page wants the reader to walk the stages in order, like a tutorial.'),
    'v03-two-tier': ('Two-Tier', 'Shipped pipeline on top, candidate upgrades in a dashed tier below.',
                     'Clearest separation of what exists from what is only proposed.'),
    'v04-spine': ('Spine', 'Vertical spine of stages, tools on the left, delivery and experts on the right.',
                  'Fits a tall slot; good if the section is narrow rather than wide.'),
    'v05-artifacts': ('Artifact Flow', 'Names the thing handed between every pair of stages.',
                      'Use when the question is "what exactly moves between stages".'),
    'v06-fanout': ('Expert Fan-out', 'Pipeline compressed to a strip; the MoE verifier split is the subject.',
                   'Use if the point of the figure is the expert split, not the pipeline.'),
    'v07-poster': ('Poster', 'Dark title banner with a stat strip, then five equal cards.',
                   'The most presentation-ready. Reads well shrunk into a slide.'),
    'v08-actor-lanes': ('Actor Lanes', 'Rows are actors (VLM / CV tools / Rubric), columns are stages.',
                        'Answers "who does what" — useful when staffing or attributing cost.'),
    'v09-flywheel': ('Flywheel', 'Pipeline on top, the data loop it feeds underneath.',
                     'Use where the story is the data flywheel, not the single pass.'),
    'v10-dense': ('Dense Figure', 'Paper-figure density: input shelf, grouped stages, inline candidates.',
                  'Closest to an arXiv system figure. Most information per pixel, least air.'),
    'v11-frames': ('Frames · paper', 'Each stage shows what it did to a real frame: constraints, spans, the red box, accept/reject, verdict.',
                   'The most explanatory. Pick this if the figure has to stand alone without the surrounding text.'),
    'v12-editorial': ('Frames · editorial', 'One big frame per stage, the defect boxed in red on the actual picture.',
                      'Currently installed. Reads fastest — you see what is being judged before you read a word.'),
    'v13-dark': ('Frames · dark', 'Same composition on charcoal; the frames carry the colour.',
                 'For slides and dark decks. The photos pop hardest here.'),
}

# v11–v13 的画面来自 imagen 生成（assets/figures/shots/），不是真实用户视频：
# 公开集里的片子带水印，还有一段是真人政治人物的合成视频，都不适合放进对外的图。

PAGE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kling-Critic workflow · 10 candidates</title>
<style>
  :root{--bg:#fff;--soft:#f6f7f9;--ink:#14181d;--mute:#5b636e;--faint:#8d96a3;--line:#e4e7ec;--brand:#2f6bff;
    --mono:"SF Mono",ui-monospace,"JetBrains Mono",Menlo,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  *{box-sizing:border-box}
  body{margin:0;background:var(--soft);color:var(--ink);font:14px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
  header{background:#fff;border-bottom:1px solid var(--line);padding:26px var(--g,40px) 20px;position:sticky;top:0;z-index:5}
  h1{margin:0;font-size:22px;letter-spacing:-.02em}
  .sub{margin:6px 0 0;color:var(--mute);font-size:13px}
  nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
  nav a{font:600 11.5px/1 var(--mono);padding:6px 11px;border:1px solid var(--line);border-radius:999px;
    color:var(--mute);text-decoration:none;background:#fff;transition:.12s}
  nav a:hover{border-color:var(--brand);color:var(--brand)}
  main{padding:28px 40px 80px;display:grid;gap:26px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;scroll-margin-top:150px}
  .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:16px 20px 0}
  .tag{font:700 11px/1 var(--mono);letter-spacing:.1em;color:var(--brand);background:#eef3ff;
    padding:5px 9px;border-radius:999px}
  .head h2{margin:0;font-size:18px;letter-spacing:-.01em}
  .head .what{color:var(--mute);font-size:13px}
  .when{margin:8px 20px 0;padding:9px 13px;background:var(--soft);border-left:3px solid var(--brand);
    border-radius:0 8px 8px 0;color:var(--mute);font-size:12.5px}
  .shot{padding:16px 20px 20px}
  .shot img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:10px;cursor:zoom-in}
  .meta{display:flex;gap:16px;padding:0 20px 16px;color:var(--faint);font:11.5px var(--mono)}
  dialog{border:0;padding:0;max-width:98vw;max-height:96vh;background:transparent}
  dialog::backdrop{background:#0e1116f0}
  dialog img{max-width:98vw;max-height:92vh;border-radius:8px;background:#fff}
  dialog .bar{display:flex;justify-content:space-between;align-items:center;color:#cbd3dd;font-size:12.5px;padding:8px 2px}
  dialog button{font:inherit;color:#cbd3dd;background:none;border:1px solid #3a424e;border-radius:999px;
    padding:4px 13px;cursor:pointer}
</style>
</head>
<body>
<header>
  <h1>Kling-Critic workflow · 10 candidates</h1>
  <p class="sub">Same content, ten structures. Pick one and tell me the number — I will wire it into the Harness section and delete the rest.</p>
  <nav>__NAV__</nav>
</header>
<main>__CARDS__</main>
<dialog id="zoom"><div class="bar"><span id="zname"></span><button onclick="zoom.close()">close</button></div><img id="zimg" alt=""></dialog>
<script>
  const zoom = document.getElementById('zoom');
  document.querySelectorAll('.shot img').forEach(img => img.onclick = () => {
    document.getElementById('zimg').src = img.src;
    document.getElementById('zname').textContent = img.dataset.name;
    zoom.showModal();
  });
  zoom.onclick = e => { if (e.target === zoom) zoom.close(); };
</script>
</body>
</html>
'''


def main() -> None:
    shots = sorted(p for p in DIR.glob('*.png') if not p.name.startswith('_'))
    nav, cards = [], []
    for i, p in enumerate(shots, 1):
        title, what, when = NOTES.get(p.stem, (p.stem, '', ''))
        b64 = base64.b64encode(p.read_bytes()).decode()
        from PIL import Image
        w, h = Image.open(p).size
        nav.append(f'<a href="#{p.stem}">{i:02d} · {title}</a>')
        cards.append(
            f'<section class="card" id="{p.stem}">'
            f'<div class="head"><span class="tag">{i:02d}</span><h2>{title}</h2>'
            f'<span class="what">{what}</span></div>'
            f'<p class="when">{when}</p>'
            f'<div class="shot"><img src="data:image/png;base64,{b64}" alt="{title}" data-name="{p.stem}"></div>'
            f'<div class="meta"><span>{p.stem}.drawio</span><span>{w}×{h}px</span>'
            f'<span>{p.stat().st_size / 1024:.0f} KB</span></div>'
            f'</section>')
    out = DIR / 'gallery.html'
    out.write_text(PAGE.replace('__NAV__', ''.join(nav)).replace('__CARDS__', ''.join(cards)), encoding='utf-8')
    print(f'{out}  {out.stat().st_size / 1024 / 1024:.1f} MB  ({len(shots)} variants)')


if __name__ == '__main__':
    main()

