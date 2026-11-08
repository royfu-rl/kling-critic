#!/usr/bin/env python3
"""把 .drawio 渲染成 PNG —— 用 draw.io 官方 viewer 在 headless chromium 里画。

    python3 tools/render_variants.py                 # 渲染 workflow-variants/ 全部
    python3 tools/render_variants.py a.drawio b.drawio

渲染器借自 /mmu_mllm_hdd_4/deep-research/draw-io-blog/scripts/viewer-static.min.js，
本地文件，不碰 embed.diagrams.net —— 这台机器连不上它。
"""
import argparse
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VARIANTS = ROOT / 'middle_processing' / 'workflow-variants'
VIEWER = Path('/mmu_mllm_hdd_4/deep-research/draw-io-blog/scripts/viewer-static.min.js')

PAGE = ('<!doctype html><html><head><meta charset="utf-8">'
        '<style>body{margin:0;background:#fff}</style></head><body><div id="c"></div></body></html>')
MOUNT = ("xml => new GraphViewer(document.getElementById('c'), mxUtils.parseXml(xml).documentElement,"
         " {border: 20, toolbar: null, nav: false, resize: true, highlight: 'none', lightbox: false})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*', type=Path)
    ap.add_argument('--scale', type=float, default=2)
    args = ap.parse_args()
    files = args.files or sorted(VARIANTS.glob('*.drawio'))
    if not files:
        sys.exit('no .drawio files')
    if not VIEWER.exists():
        sys.exit(f'viewer not found: {VIEWER}')

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 2400, 'height': 1400},
                                device_scale_factor=args.scale)
        # 外链字体时好时坏，加载一半反而让文字退回衬线体；直接断掉，用本机字体
        page.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'), lambda r: r.abort())
        for src in files:
            dst = src.with_suffix('.png')
            page.set_content(PAGE)
            page.add_script_tag(path=str(VIEWER))
            page.evaluate(MOUNT, src.read_text(encoding='utf-8'))
            page.wait_for_selector('#c svg')
            page.wait_for_timeout(900)
            page.locator('#c svg').first.screenshot(path=str(dst))
            print(f'  {dst.name}  {dst.stat().st_size / 1024:.0f} KB', flush=True)
        browser.close()


if __name__ == '__main__':
    main()

