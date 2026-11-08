#!/usr/bin/env python3
"""Kim 文档「标注平台使用示范」的本地副本 -> label-platform/kim-rules/index.html

    python3 tools/make_kim_rules.py

为什么是副本而不是直接 iframe Kim：Kim 页面要 SSO，跨站嵌进博客会被拦成登录页。
所以用 kim-docs-agent 把原文导出成 Markdown，图片 / 视频落到本地，再按 Kim 的版式渲染。

重新导出（原文更新后）：
  1. node /mmu_mllm_hdd_4/infra/skills/kim-docs-agent/scripts/kim_docs.mjs download '<meta.json 里的 url>' --out <新目录>
  2. 把 document.md 里的 bs3 签名链接下载到 kim-rules/media/（签名 7 天过期），替换成 media/<文件名>
  3. 更新 kim-rules/document.md 和 meta.json，再跑本脚本
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'label-platform', 'kim-rules')
LINK = re.compile(r'\[([^\]]*)\]\(([^)\s]+)\)')
CELL_TAG = re.compile(r'(</?(?:table|tr|td)>)')


def inline(text: str) -> str:
    """转义后再把 [文字](链接) 变成 <a>"""
    out, pos = [], 0
    for m in LINK.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        out.append(f'<a href="{html.escape(m.group(2))}" target="_blank" rel="noopener">{html.escape(m.group(1))}</a>')
        pos = m.end()
    return ''.join(out) + html.escape(text[pos:])


def table(block: str) -> str:
    parts = []
    for tok in CELL_TAG.split(block):
        if CELL_TAG.fullmatch(tok):
            parts.append(tok)
        else:
            lines = [inline(s) for s in tok.strip('\n').split('\n')]
            parts.append('<br>'.join(lines))
    return '<div class="tbl">' + ''.join(parts) + '</div>'


def render(md: str, title: str):
    body, toc, n = [], [], 0
    lines = md.split('\n')
    if lines and lines[0].strip() == f'# {title}':
        lines = lines[1:]
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith('<table>'):
            block = [lines[i]]
            while '</table>' not in lines[i] and i + 1 < len(lines):
                i += 1
                block.append(lines[i])
            body.append(table('\n'.join(block)))
        elif m := re.match(r'(#{1,3}) (.+)', s):
            level, text = len(m.group(1)), m.group(2).strip()
            n += 1
            body.append(f'<h{level} id="h{n}">{inline(text)}</h{level}>')
            if level <= 2:
                toc.append(f'<a class="l{level}" href="#h{n}">{html.escape(text)}</a>')
        elif m := re.fullmatch(r'!\[[^\]]*\]\(([^)]+)\)', s):
            body.append(f'<figure><img loading="lazy" src="{html.escape(m.group(1))}" alt=""></figure>')
        elif m := re.fullmatch(r'\[视频\]\(([^)]+)\)', s):
            body.append(f'<figure><video controls preload="metadata" src="{html.escape(m.group(1))}"></video></figure>')
        elif s:
            body.append(f'<p>{inline(s)}</p>')
        i += 1
    return '\n'.join(body), '\n'.join(toc)


PAGE = '''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ · Kim 文档副本</title>
<style>
  :root{--ink:#1f2329;--mute:#646a73;--faint:#8f959e;--line:#dee0e3;--soft:#f5f6f7;--brand:#3370ff}
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff;color:var(--ink);
    font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Microsoft YaHei","Noto Sans SC",sans-serif}
  .bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:9px 18px;
    background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);font-size:13px}
  .kim{display:inline-flex;align-items:center;gap:6px;font-weight:600}
  .kim i{width:18px;height:18px;border-radius:5px;background:var(--brand);display:inline-block}
  .crumb{color:var(--faint)}
  .note{margin-left:auto;color:var(--faint)}
  .open{color:var(--brand);text-decoration:none;border:1px solid #c2d4ff;border-radius:6px;padding:3px 10px;white-space:nowrap}
  .open:hover{background:#f0f4ff}
  .layout{display:flex;gap:28px;max-width:1180px;margin:0 auto;padding:0 24px}
  nav{flex:none;width:200px;position:sticky;top:52px;align-self:flex-start;max-height:calc(100vh - 60px);overflow:auto;
    padding:28px 0;font-size:13px;line-height:1.5}
  nav b{display:block;color:var(--faint);font-weight:500;margin-bottom:8px}
  nav a{display:block;color:var(--mute);text-decoration:none;padding:4px 8px;border-radius:4px}
  nav a.l2{padding-left:20px;font-size:12.5px}
  nav a:hover{background:var(--soft);color:var(--ink)}
  main{flex:1;min-width:0;max-width:820px;padding:32px 0 80px}
  .title{font-size:32px;line-height:1.3;font-weight:700;margin:0 0 10px}
  .meta{color:var(--faint);font-size:13px;margin-bottom:28px}
  h1{font-size:24px;line-height:1.4;margin:36px 0 12px;font-weight:700}
  h2{font-size:20px;line-height:1.45;margin:28px 0 10px;font-weight:700}
  h3{font-size:17px;line-height:1.5;margin:22px 0 8px;font-weight:700}
  p{margin:4px 0}
  a{color:var(--brand);text-decoration:none}
  a:hover{text-decoration:underline}
  figure{margin:14px 0}
  img,video{display:block;max-width:100%;border-radius:6px;border:1px solid var(--line)}
  video{width:100%;background:#000}
  .tbl{overflow-x:auto;margin:12px 0}
  table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.65}
  td{border:1px solid var(--line);padding:8px 12px;vertical-align:top}
  tr:first-child td{background:var(--soft);font-weight:600}
  td:first-child{white-space:nowrap;width:1%}
  @media(max-width:860px){nav{display:none}.layout{padding:0 16px}.note{display:none}}
</style>
</head>
<body>
<div class="bar">
  <span class="kim"><i></i>Kim 文档</span><span class="crumb">/ __TITLE__</span>
  <span class="note">本页是 __EXPORTED__ 从 Kim 导出的副本</span>
</div>
<div class="layout">
  <nav><b>目录</b>
__TOC__
  </nav>
  <main>
    <h1 class="title">__TITLE__</h1>
    <div class="meta">__USER__ 最后修改于 __MODIFIED__</div>
__BODY__
  </main>
</div>
</body>
</html>
'''


def main() -> None:
    meta = json.load(open(os.path.join(DIR, 'meta.json'), encoding='utf-8'))
    md = open(os.path.join(DIR, 'document.md'), encoding='utf-8').read()
    body, toc = render(md, meta['title'])
    page = PAGE
    # meta['url'] 是内网 Kim 地址，站点公开发布，不再注入页面
    for k, v in {'__TITLE__': html.escape(meta['title']),
                 '__USER__': html.escape(meta['lastModifiedUser']), '__MODIFIED__': meta['lastModified'],
                 '__EXPORTED__': meta['exported'][:10], '__TOC__': toc, '__BODY__': body}.items():
        page = page.replace(k, v)
    path = os.path.join(DIR, 'index.html')
    open(path, 'w', encoding='utf-8').write(page)
    print(f'{path}  {len(page) / 1024:.1f} KB')


if __name__ == '__main__':
    main()

