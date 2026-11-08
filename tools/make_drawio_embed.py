#!/usr/bin/env python3
"""assets/figures/<name>.drawio -> assets/figures/<name>.html：可在博客里直接编辑的 draw.io 图。

页面嵌 embed.diagrams.net 的编辑器（JSON 协议），把 .drawio 原文内联进去加载：
  - 改动自动存成本浏览器草稿（localStorage），刷新不丢；「恢复原图」清掉草稿
  - 草稿按原图版本存（键里带 .drawio 的哈希）：原图一重新生成，旧草稿就不再加载
  - 「下载 .drawio」/ 编辑器里的「保存」把当前图存到本地；改完把文件放回 assets/figures/ 再重建
  - 「全屏编辑」走 template.html 的 kc-expand 协议；单独打开时用浏览器全屏
  - 编辑器 45 秒内没握手就先显示静态预览图 <name>.jpg，之后握手成功会自动切回编辑器
  - 页面加 ?editor=<url> 可换成自建的 draw.io 实例（diagrams.net 慢或不通时用）

正文里这样引用（路径相对 3d/3d.md 所在目录，build.py 会把它内联成 srcdoc）：
  <div class="wide-embed"><iframe src="../assets/figures/<name>.html" style="height:680px;border:0"></iframe></div>

用法：python3 scripts/make_drawio_embed.py evaluation-pipeline "BlenderWorld 评测流水线"
"""
import base64
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, 'assets', 'figures')

PAGE = r'''<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--bg:#fff;--bg-soft:#f6f7f9;--ink:#111418;--ink-soft:#5b636e;--line:#e4e7ec;--brand:#2f6bff;--warn:#b45309}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
    font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .wrap{display:flex;flex-direction:column;height:100%;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}
  body.full .wrap{border-radius:0;border:0}
  .bar{display:flex;align-items:center;gap:6px;padding:7px 10px;background:var(--bg-soft);border-bottom:1px solid var(--line);flex-wrap:wrap}
  .bar b{font-weight:700;margin-right:6px}
  .st{color:var(--ink-soft);margin-right:auto;min-width:0}
  .st.dirty{color:var(--warn)}
  button{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer}
  button:hover{border-color:var(--brand);color:var(--brand)}
  button:disabled{opacity:.45;cursor:default;border-color:var(--line);color:var(--ink)}
  .stage{position:relative;flex:1;min-height:0}
  .stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .fallback{position:absolute;inset:0;display:none;overflow:auto;padding:12px;background:var(--bg)}
  .fallback p{margin:0 0 10px;color:var(--warn)}
  .fallback img{width:100%;height:auto;display:block}
  body.offline .fallback{display:block}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <b>__TITLE__</b>
    <span class="st" id="st">正在加载 draw.io 编辑器…</span>
    <button id="full">全屏编辑</button>
    <button id="dl" disabled>下载 .drawio</button>
    <button id="png" disabled>导出 PNG</button>
    <button id="svg" disabled>导出 SVG</button>
    <button id="reset" disabled>恢复原图</button>
  </div>
  <div class="stage">
    <iframe id="ed" title="draw.io 编辑器" allow="clipboard-read; clipboard-write"
      src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min&lang=zh&saveAndExit=0&noExitBtn=1&libraries=1"></iframe>
    <div class="fallback">
      <p>draw.io 编辑器还没加载出来（需要浏览器能访问 embed.diagrams.net；网络慢时要一两分钟，好了会自动切换），下面是静态预览。</p>
      <img alt="__TITLE__" src="data:image/jpeg;base64,__PREVIEW__" __PREVHIDE__>
    </div>
  </div>
</div>
<script>
(function () {
  var NAME = __NAME__;
  var ORIGINAL = __XML__;
  var KEY = 'vc-blog:drawio:' + NAME + ':' + __VER__;
  var ed = document.getElementById('ed');
  var st = document.getElementById('st');
  var btn = function (id) { return document.getElementById(id); };
  var embedded = window.parent !== window;
  var xml = ORIGINAL, ready = false, full = false;

  // ?editor=<url> 换一个 draw.io 实例（自建镜像，或本地协议桩做自测）；默认用官方 embed
  var override = (location.search.match(/[?&]editor=([^&]+)/) || [])[1];
  if (override) ed.src = decodeURIComponent(override);

  function store(get, val) {           // localStorage 在 file:// 或隐私模式下可能抛错，失败就当没有草稿
    try { return get ? localStorage.getItem(KEY) : (val == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, val)); }
    catch (e) { return null; }
  }
  function status(text, dirty) { st.textContent = text; st.className = 'st' + (dirty ? ' dirty' : ''); }
  function post(msg) { ed.contentWindow.postMessage(JSON.stringify(msg), '*'); }
  function save(name, href) {
    var a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function saveXml() {
    var url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    save(NAME + '.drawio', url); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function load(src) { post({ action: 'load', xml: src, autosave: 1, fit: 1, border: 16, maxFitScale: 1 }); }

  window.addEventListener('message', function (e) {
    // 博客父页的 kc-expand 协议：父页放大 / 还原好 iframe 后回 ack，我们确认
    if (e.source === window.parent && e.data && typeof e.data === 'object') {
      if (e.data.type === 'kc-expand-ack') { window.parent.postMessage({ type: 'kc-modal-ready' }, '*'); }
      if (e.data.type === 'kc-collapse-ack') { window.parent.postMessage({ type: 'kc-revealed' }, '*'); }
      return;
    }
    if (e.source !== ed.contentWindow || typeof e.data !== 'string') return;
    var m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.event === 'init') {
      ready = true; document.body.classList.remove('offline');
      ['dl', 'png', 'svg', 'reset'].forEach(function (id) { btn(id).disabled = false; });
      var draft = store(true);
      if (draft && draft !== ORIGINAL) { xml = draft; status('已恢复本浏览器里上次的修改（还没下载）', true); }
      else status('可直接编辑；改动自动存在本浏览器，要留档请点「下载 .drawio」', false);
      load(xml);
    } else if (m.event === 'autosave') {
      xml = m.xml; store(false, xml); status('有修改，已暂存在本浏览器；要留档请点「下载 .drawio」', true);
    } else if (m.event === 'save') {
      xml = m.xml; store(false, xml); saveXml();
      post({ action: 'status', message: '已下载到本地', modified: false });
      status('已下载 ' + NAME + '.drawio', false);
    } else if (m.event === 'export' && m.data) {
      save(NAME + (m.format.indexOf('svg') >= 0 ? '.svg' : '.png'), m.data);
    }
  });

  btn('dl').onclick = saveXml;
  btn('png').onclick = function () { post({ action: 'export', format: 'xmlpng', spinKey: 'export', scale: 2, border: 12 }); };
  btn('svg').onclick = function () { post({ action: 'export', format: 'xmlsvg', spinKey: 'export', border: 12 }); };
  btn('reset').onclick = function () {
    if (!confirm('丢掉本浏览器里的修改，恢复原图？')) return;
    store(false, null); xml = ORIGINAL; load(xml); status('已恢复原图', false);
  };
  btn('full').onclick = function () {
    full = !full;
    document.body.classList.toggle('full', full);
    btn('full').textContent = full ? '退出全屏' : '全屏编辑';
    if (embedded) window.parent.postMessage({ type: full ? 'kc-expand' : 'kc-collapse' }, '*');
    else if (full) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    else document.fullscreenElement && document.exitFullscreen();
  };
  setTimeout(function () {           // 网络慢时编辑器要一两分钟；先给静态预览，init 到了会自动切回编辑器
    if (!ready) { document.body.classList.add('offline'); status('编辑器还在加载，先显示静态预览；加载好会自动切换', true); }
  }, 45000);
})();
</script>
</body>
</html>
'''


def main():
    name = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else name
    xml = open(os.path.join(FIG, f'{name}.drawio'), encoding='utf-8').read()
    # The static preview only covers the case where embed.diagrams.net never answers.
    # It is optional: without <name>.jpg the page just waits on the editor.
    jpg = os.path.join(FIG, f'{name}.jpg')
    preview = base64.b64encode(open(jpg, 'rb').read()).decode() if os.path.exists(jpg) else ''
    js = lambda s: json.dumps(s, ensure_ascii=False).replace('</', '<\\/')   # 字符串里的 </ 不能结束 <script>
    ver = hashlib.sha1(xml.encode('utf-8')).hexdigest()[:10]
    html = (PAGE.replace('__TITLE__', title).replace('__NAME__', js(name)).replace('__VER__', js(ver))
                .replace('__PREVIEW__', preview).replace('__PREVHIDE__', '' if preview else 'style="display:none"').replace('__XML__', js(xml)))
    out = os.path.join(FIG, f'{name}.html')
    open(out, 'w', encoding='utf-8').write(html)
    print(f'{out}  {len(html) / 1024:.0f} KB')


if __name__ == '__main__':
    main()

