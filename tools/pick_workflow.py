#!/usr/bin/env python3
"""选定某个候选版本，装成正文里用的那张 workflow 图。

    python3 tools/pick_workflow.py v01-banded

做三件事：
  1. 候选 .drawio      -> assets/figures/critic-workflow.drawio
  2. 候选 .png         -> assets/figures/critic-workflow.jpg（编辑器连不上时的兜底）
  3. 重新生成          assets/figures/critic-workflow.html（页面内可编辑的 draw.io）

之后跑 `python3 build.py` 即可。harness.md 里的 iframe 路径不用动。
"""
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VARIANTS = ROOT / 'middle_processing' / 'workflow-variants'
FIG = ROOT / 'assets' / 'figures'


def main() -> None:
    if len(sys.argv) != 2:
        stems = sorted(p.stem for p in VARIANTS.glob('*.drawio'))
        sys.exit('usage: pick_workflow.py <variant>\n  ' + '\n  '.join(stems))
    stem = sys.argv[1].removesuffix('.drawio')
    src = VARIANTS / f'{stem}.drawio'
    png = VARIANTS / f'{stem}.png'
    if not src.exists():
        sys.exit(f'no such variant: {src}')

    shutil.copyfile(src, FIG / 'critic-workflow.drawio')
    print(f'  drawio  <- {stem}.drawio')
    if png.exists():
        Image.open(png).convert('RGB').save(FIG / 'critic-workflow.jpg', quality=88)
        print(f'  jpg     <- {stem}.png  (static fallback)')
    else:
        print('  jpg     skipped — run tools/render_variants.py first')

    subprocess.run([sys.executable, str(ROOT / 'tools' / 'make_drawio_embed.py'),
                    'critic-workflow', 'Kling-Critic Workflow'], check=True)
    print(f'\npicked {stem}. now run:  python3 build.py')


if __name__ == '__main__':
    main()

