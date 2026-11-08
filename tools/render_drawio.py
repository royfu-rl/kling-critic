#!/usr/bin/env python3
"""assets/figures/<name>.drawio -> assets/figures/<name>.jpg：编辑器连不上时的静态兜底。

    python3 tools/render_drawio.py critic-workflow

用 draw.io 官方 viewer 在 headless Chromium 里渲染，兜底图和编辑器里看到的一致。
- 依赖：pip install playwright && python3 -m playwright install chromium
- viewer：优先用同级 draw-io-blog/scripts/viewer-static.min.js，没有就从 viewer.diagrams.net 下载到 /tmp
- 中文要本机有 Noto Sans SC（/usr/share/fonts 或 ~/.fonts），否则会渲染成方块
"""
import os
import re
import sys
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, 'assets', 'figures')
LOCAL_VIEWER = os.path.join(os.path.dirname(ROOT), 'draw-io-blog', 'scripts', 'viewer-static.min.js')
MOUNT = """xml => new GraphViewer(document.getElementById('c'), mxUtils.parseXml(xml).documentElement,
    {border: 16, toolbar: null, nav: false, resize: true, highlight: 'none', lightbox: false})"""


def viewer() -> str:
    if os.path.exists(LOCAL_VIEWER):
        return LOCAL_VIEWER
    path = '/tmp/viewer-static.min.js'
    if not os.path.exists(path):
        urllib.request.urlretrieve('https://viewer.diagrams.net/js/viewer-static.min.js', path)
    return path


def main(name: str) -> None:
    src, png, jpg = (os.path.join(FIG, f'{name}.{ext}') for ext in ('drawio', 'png', 'jpg'))
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    with sync_playwright() as p:
        browser = p.chromium.launch(proxy={'server': proxy} if proxy else None)
        page = browser.new_page(viewport={'width': 3000, 'height': 2000}, device_scale_factor=2)
        # Google Fonts 走代理时好时坏，加载一半会退回衬线体；直接用本机同名字体
        page.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'), lambda route: route.abort())
        page.set_content('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="c"></div>')
        page.add_script_tag(path=viewer())
        page.evaluate(MOUNT, open(src, encoding='utf-8').read())
        page.wait_for_selector('#c svg')
        page.wait_for_timeout(1500)
        page.evaluate('document.fonts.ready')
        page.locator('#c svg').first.screenshot(path=png)
        browser.close()
    Image.open(png).convert('RGB').save(jpg, quality=90)
    os.remove(png)
    print(jpg)


if __name__ == '__main__':
    main(sys.argv[1])

