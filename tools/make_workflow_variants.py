#!/usr/bin/env python3
"""Kling-Critic workflow 图的 10 个候选版本，全英文、带插画。

    python3 tools/make_workflow_variants.py

和第一轮的区别：那版只是「彩色方框 + 文字」，太素。这版每个阶段都把它**在做什么**画出来
—— 胶片条、时间轴命中区间、bbox、放大镜、勾叉、梯形 VLM、证据矩阵。
图元在 workflow_kit.py，插画在 workflow_art.py，做法照着 draw-io-blog 那批论文图拆的。

十版是十种结构：
    v01 Instrument   主干 + 每阶段下方一块「仪表」，画出该阶段的产物
    v02 Numbered     五栏大号编号，每栏一幅插画
    v03 Two-Tier     已落地在上 / 备选在下，带图例
    v04 Spine        竖脊，工具在左、交付在右
    v05 Artifact     阶段之间把交接物画出来
    v06 Fan-out      MoE 专家拆分当主角
    v07 Poster       深色横幅 + 指标条，适合放 slide
    v08 Actor Lanes  行是执行者，列是阶段
    v09 Flywheel     主干 + 数据闭环
    v10 Dense        论文插图密度
"""
from __future__ import annotations

import os

from workflow_kit import (Deck, AMBER, BLUE, FAINT, INK, LINE, MINT, MUTE, ROSE,
                          SLATE, TEAL, VIOLET, WHITE)
from workflow_art import (art_filmstrip, art_icon, art_matrix, art_stack, art_timeline)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'middle_processing', 'workflow-variants')

TITLE = 'Kling-Critic · Evidence-Grounded Video Quality Workflow'
SUB = 'Five stages turn a generated clip into a delivered verdict. Dashed blocks are candidate upgrades, not yet shipped.'

# (no, name, one-liner, bullets, group, palette, icon)
STAGES = [
    (1, 'Preprocess', 'Turn the prompt into checkable constraints',
     ['Metadata &amp; integrity check', 'Motion-aware frame sampling', 'Constraint list from prompt + refs'],
     'Perception', BLUE, 'prompt'),
    (2, 'Recall', 'Ground the clip in space and time',
     ['Observations over the full clip', 'Suspect spans with timestamps', 'Reasoning for every span'],
     'Perception', VIOLET, 'vlm'),
    (3, 'Postprocess', 'Enrich each span before judging it',
     ['Crop &amp; zoom on the region', 'Segment and track the subject', 'Read text, depth, motion'],
     'Perception', TEAL, 'zoom'),
    (4, 'Verifier', 'Check evidence one piece at a time',
     ['Accept / reject per evidence', 'Severity 1–3', 'Rubric status'],
     'Alignment', AMBER, 'rubric'),
    (5, 'Aggregate', 'Roll surviving evidence into a verdict',
     ['Score and status', 'Hard failures', 'Annotated evidence frames'],
     'Delivery', MINT, 'report'),
]

TOOLS_PRE = ['frame sampling', 'OCR', 'detection', 'optical flow', 'depth']
TOOLS_POST = ['crop &amp; zoom', 'segmentation', 'tracking', 'IQA']

MOE_R = ('MoE Recall', 'Split one broad question across specialist recallers',
         'Costs more rollouts', ROSE)
MOE_V = ('MoE Verifier', 'Route each defect type to its own specialist',
         'No extra cost · better precision and recall', MINT)
MOE_R_WHY = ['Each recaller owns a narrow question', 'Fewer missed spans on rare defects',
             'One clip now visits several recallers']
MOE_V_WHY = ['A specialist stops guessing outside its family',
             'Rare sub-types stop being drowned by common ones',
             'One clip still visits exactly one verifier']

TAXONOMY = [('Human body', 'torso · hands'), ('Creature', 'anatomy'), ('Object', 'rigid · soft')]
INPUT_LINES = ['Generated video', 'Caption prompt', 'Reference image / audio']


def head(d, x, y, w, size=25, align='left'):
    d.text(x, y, w, 32, TITLE, size=size, color=INK, bold=True, align=align, spacing=-0.3)
    d.text(x, y + 33, w, 18, SUB, size=12, color=MUTE, align=align)


def instrument(d, x, y, w, h, kind, pal):
    """阶段下方那块小「仪表」：把该阶段真正产出的东西画出来，而不是再写一行字。"""
    if kind == 'prompt':
        art_stack(d, x + 6, y + 2, w - 28, h - 16, 3, pal)
        d.text(x + 16, y + 8, w - 48, 14, 'CONSTRAINT LIST', size=8.5, color=pal['deep'],
               bold=True, spacing=0.8)
        for i, frac in enumerate([0.88, 0.6, 0.74]):
            d.box(x + 16, y + 26 + i * 10, (w - 58) * frac, 4, pal['line'], 'none', arc=2)
    elif kind == 'vlm':
        art_timeline(d, x + 8, y + 12, w - 16, [(.14, .3), (.52, .64), (.78, .86)], pal)
        d.text(x + 8, y + 28, w - 16, 14, 'suspect spans on the timeline', size=9.5, color=FAINT)
    elif kind == 'zoom':
        art_filmstrip(d, x + 6, y + 2, w - 12, h - 22, frames=5, bad=2,
                      pal={'line': pal['line'], 'fill': pal['fill'], 'deep': pal['deep']})
        d.text(x + 6, y + h - 18, w - 12, 14, 'the flagged frame, cropped', size=9.5,
               color=FAINT, align='center')
    elif kind == 'rubric':
        for i, (ic, lbl, frac) in enumerate([('check', 'accept', .5), ('cross', 'reject', .34),
                                             ('check', 'accept', .66)]):
            cy = y + 4 + i * 17
            art_icon(d, x + 8, cy, 13, ic)
            d.box(x + 28, cy + 4, (w - 110) * frac, 5, pal['line'], 'none', arc=2)
            d.text(x + w - 72, cy - 1, 62, 14, lbl, size=9, color=FAINT)
    elif kind == 'report':
        d.box(x + 6, y + 2, w - 12, h - 16, WHITE, pal['line'], arc=6)
        d.text(x + 16, y + 8, 90, 13, 'VERDICT', size=8.5, color=pal['deep'], bold=True, spacing=0.8)
        d.text(x + 16, y + 21, 140, 18, 'fail · severity 3', size=11.5, color=INK, bold=True)
        d.box(x + w - 74, y + 10, 56, h - 32, pal['fill'], pal['line'], arc=4)
        d.box(x + w - 64, y + 18, 34, h - 48, 'none', ROSE['line'], arc=2, width=1.6, dashed=True)


def moe_pair(d, x, y, w, gap=34, h=186, taxonomy=True):
    """两块候选增强（+ 可选的崩坏细分），内容固定，位置由调用方定。"""
    for (nm, desc, note, pal), why, i in zip([MOE_R, MOE_V], [MOE_R_WHY, MOE_V_WHY], range(2)):
        bx = x + i * (w + gap)
        d.box(bx, y, w, h, WHITE, pal['line'], arc=14, dashed=True)
        art_icon(d, bx + 18, y + 16, 26, 'experts' if i else 'vlm', accent=pal['line'])
        d.text(bx + 54, y + 16, w - 72, 22, nm, size=15, color=pal['deep'], bold=True)
        d.text(bx + 54, y + 38, w - 76, 18, desc, size=11.5, color=MUTE)
        d.divider(bx + 18, y + 62, w - 36, color=pal['fill'])
        for j, line in enumerate(why):
            d.text(bx + 18, y + 76 + j * 22, w - 36, 20, '— ' + line, size=11, color=INK)
        d.chip(bx + 18, y + h - 34, 14 + len(note) * 6.0, 22, note, fill=pal['fill'], color=pal['deep'])
    if not taxonomy:
        return
    tx = x + 2 * (w + gap)
    d.box(tx, y, w, h, WHITE, MINT['line'], arc=14, dashed=True)
    d.text(tx + 18, y + 16, w - 36, 22, 'Collapse, split by defect type', size=13.5, color=INK, bold=True)
    d.text(tx + 18, y + 38, w - 36, 18, 'the split the verifier would route on', size=11, color=MUTE)
    for i, (t, sub_) in enumerate(TAXONOMY):
        yy = y + 66 + i * 36
        d.box(tx + 18, yy, 148, 30, MINT['fill'], 'none', arc=9)
        d.text(tx + 30, yy, 134, 30, t, size=11.5, color=MINT['deep'], bold=True)
        d.text(tx + 178, yy, w - 198, 30, sub_, size=11, color=FAINT)


def save(d: Deck, stem: str):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f'{stem}.drawio')
    open(p, 'w', encoding='utf-8').write(d.xml())
    print(f'  {stem}.drawio  {os.path.getsize(p) / 1024:.1f} KB  ({d.w}×{d.h})')


# ── v01 Instrument ────────────────────────────────────────────────────────
def v01():
    d = Deck('v01 instrument', 1760, 840)
    head(d, 48, 34, 1100)

    for label, pal, bx, bw in [('Perception', BLUE, 48, 1004), ('Alignment', AMBER, 1084, 318),
                               ('Delivery', MINT, 1434, 278)]:
        d.panel(bx, 124, bw, 376, pal['band'], arc=20)
        d.kicker(bx + 20, 140, 240, label, color=pal['line'])

    xs, w = [78, 408, 738, 1114, 1464], 300
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.box(x, 168, w, 134, WHITE, pal['line'], arc=15, shadow=True)
        d.panel(x, 168, w, 5, pal['line'], arc=3, shadow=False)
        art_icon(d, x + 18, 186, 30, ic, accent=pal['line'])
        d.ellipse(x + w - 38, 186, 24, 24, pal['line'], 'none')
        d.text(x + w - 38, 186, 24, 24, str(n), size=12, color=WHITE, bold=True, align='center')
        d.text(x + 58, 186, w - 108, 24, name, size=16, color=pal['deep'], bold=True)
        d.text(x + 58, 210, w - 80, 18, one, size=11, color=MUTE)
        for j, b in enumerate(bullets[:2]):
            d.text(x + 18, 240 + j * 20, w - 36, 18, '· ' + b, size=10.8, color=INK)
        instrument(d, x, 318, w, 72, ic, pal)
        if i < 4:
            d.arrow([(x + w + 6, 235), (xs[i + 1] - 6, 235)], pal['line'], width=2.4)

    for x, tools, pal in [(78, TOOLS_PRE[:3], BLUE), (738, TOOLS_POST[:3], TEAL)]:
        d.kicker(x, 412, 300, 'CV tools here')
        d.toolrow(x, 430, 300, tools, pal=pal)

    d.kicker(48, 528, 480, 'Candidate upgrades · not yet shipped')
    d.panel(48, 552, 1664, 236, SLATE['band'], arc=20, shadow=False)
    d.frame(48, 552, 1664, 236, LINE, arc=20, dashed=True)
    moe_pair(d, 78, 578, 500)
    d.arrow([(558, 390), (558, 578)], VIOLET['line'], dashed=True)
    d.arrow([(1178, 390), (1178, 578)], AMBER['line'], dashed=True)
    return d, 'v01-instrument'


# ── v02 Numbered ──────────────────────────────────────────────────────────
def v02():
    d = Deck('v02 numbered', 1700, 760)
    head(d, 48, 34, 1100)
    cw, gap = 304, 24
    for i, (n, name, one, bullets, group, pal, ic) in enumerate(STAGES):
        x = 48 + i * (cw + gap)
        d.text(x, 122, cw, 18, f'STEP {n}', size=11, color=pal['line'], bold=True, spacing=1.2)
        d.text(x, 142, cw, 34, name, size=24, color=INK, bold=True, spacing=-0.4)
        d.text(x, 180, cw - 10, 38, one + '.', size=12.5, color=MUTE)

        d.panel(x, 230, cw, 146, pal['band'], arc=16, shadow=False)
        art_icon(d, x + 20, 250, 34, ic, accent=pal['line'])
        instrument(d, x + 62, 244, cw - 82, 72, ic, pal)

        d.panel(x, 392, cw, 230, '#fcfcfd', arc=16, shadow=False)
        d.frame(x, 392, cw, 230, pal['fill'], arc=16)
        for j, b in enumerate(bullets):
            y = 414 + j * 70
            d.box(x + 18, y, cw - 36, 56, WHITE, pal['fill'], arc=11, shadow=True)
            d.ellipse(x + 34, y + 22, 12, 12, pal['line'], 'none')
            d.text(x + 56, y, cw - 78, 56, b, size=11.5, color=INK)
        d.kicker(x, 638, cw, group, color=pal['line'])
        if i < 4:
            d.arrow([(x + cw + 4, 300), (x + cw + gap - 4, 300)], pal['line'], width=2.4)
    d.divider(48, 684, 1604)
    d.text(48, 698, 1300, 18,
           'Dashed upgrades (MoE recall / MoE verifier) are covered in the companion diagram.',
           size=11.5, color=FAINT)
    return d, 'v02-numbered'


# ── v03 Two-Tier ──────────────────────────────────────────────────────────
def v03():
    d = Deck('v03 two tier', 1760, 880)
    head(d, 48, 34, 1100)

    d.panel(48, 126, 240, 212, SLATE['band'], arc=18)
    d.kicker(70, 144, 200, 'Input')
    art_icon(d, 70, 164, 26, 'clip')
    for i, s in enumerate(INPUT_LINES):
        d.text(104, 162 + i * 22, 172, 20, s, size=11, color=INK)
    art_stack(d, 70, 240, 150, 72, 3, SLATE)

    xs, w = [320, 604, 888, 1172, 1456], 232
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.box(x, 126, w, 212, pal['fill'], pal['line'], arc=15, shadow=True)
        art_icon(d, x + 16, 142, 26, ic, accent=pal['line'])
        d.ellipse(x + w - 34, 142, 22, 22, pal['line'], 'none')
        d.text(x + w - 34, 142, 22, 22, str(n), size=11.5, color=WHITE, bold=True, align='center')
        d.text(x + 50, 142, w - 92, 22, name, size=15, color=pal['deep'], bold=True)
        d.text(x + 16, 174, w - 32, 32, one, size=10.8, color=MUTE)
        for j, b in enumerate(bullets):
            d.text(x + 16, 210 + j * 20, w - 32, 18, '· ' + b, size=10.3, color=INK)
        instrument(d, x + 4, 274, w - 8, 56, ic, pal)
        if i < 4:
            d.arrow([(x + w + 6, 232), (xs[i + 1] - 6, 232)], pal['line'], width=2.4)
    d.flow(288, 232, 314, 232, SLATE['line'])

    for x, tools, pal in [(320, TOOLS_PRE[:2], BLUE), (888, TOOLS_POST[:2], TEAL)]:
        d.kicker(x, 350, 240, 'CV tools')
        d.toolrow(x, 368, 232, tools, pal=pal)

    d.kicker(48, 430, 520, 'Tier 2 · candidate upgrades, not yet shipped')
    d.panel(48, 454, 1664, 300, '#fbfbfc', arc=20, shadow=False)
    d.frame(48, 454, 1664, 300, LINE, arc=20, dashed=True)
    moe_pair(d, 80, 484, 500)
    d.arrow([(720, 338), (720, 484)], VIOLET['line'], dashed=True)
    d.arrow([(1288, 338), (1288, 484)], AMBER['line'], dashed=True)

    d.legend(48, 788, [(BLUE['line'], 'Perception'), (AMBER['line'], 'Human alignment'),
                       (MINT['line'], 'Delivery'), (LINE, 'Candidate upgrade')], title='Legend')
    return d, 'v03-two-tier'


# ── v04 Spine ─────────────────────────────────────────────────────────────
def v04():
    d = Deck('v04 spine', 1500, 940)
    head(d, 48, 34, 1000)

    sx = 452
    d.panel(sx - 16, 126, 452, 736, SLATE['band'], arc=22, shadow=False)
    for i, (n, name, one, bullets, _g, pal, ic) in enumerate(STAGES):
        y = 150 + i * 142
        d.box(sx, y, 420, 120, WHITE, pal['line'], arc=15, shadow=True)
        d.panel(sx, y, 5, 120, pal['line'], arc=3, shadow=False)
        art_icon(d, sx + 20, y + 16, 28, ic, accent=pal['line'])
        d.ellipse(sx + 386, y + 16, 22, 22, pal['line'], 'none')
        d.text(sx + 386, y + 16, 22, 22, str(n), size=11.5, color=WHITE, bold=True, align='center')
        d.text(sx + 58, y + 16, 300, 22, name, size=15.5, color=pal['deep'], bold=True)
        d.text(sx + 58, y + 38, 318, 18, one, size=11, color=MUTE)
        instrument(d, sx + 14, y + 60, 392, 52, ic, pal)
        if i < 4:
            d.arrow([(sx + 210, y + 120), (sx + 210, y + 142)], pal['line'], width=2.4)

    d.panel(48, 150, 352, 120, SLATE['fill'], arc=16, shadow=True)
    d.kicker(70, 166, 300, 'Input')
    art_icon(d, 70, 186, 26, 'clip')
    for i, s in enumerate(INPUT_LINES):
        d.text(106, 184 + i * 22, 282, 18, s, size=11.5, color=INK)
    d.arrow([(400, 210), (sx - 8, 210)], SLATE['line'])

    for y, ttl, tools, pal in [(330, 'CV tools · preprocess', TOOLS_PRE, BLUE),
                               (600, 'CV tools · postprocess', TOOLS_POST, TEAL)]:
        d.kicker(48, y, 352, ttl)
        art_icon(d, 48, y + 20, 24, 'tools', accent=pal['line'])
        d.toolrow(82, y + 22, 318, tools[:3], pal=pal)
        d.arrow([(400, y + 30), (sx - 8, y + 30)], pal['line'], dashed=True, head='none')

    ex = 936
    d.frame(ex, 330, 512, 344, LINE, arc=18, dashed=True)
    d.kicker(ex + 22, 348, 400, 'Candidate · MoE verifier')
    art_icon(d, ex + 22, 368, 26, 'experts', accent=MINT['line'])
    d.text(ex + 58, 366, 430, 34, MOE_V[1], size=12, color=MUTE)
    d.chip(ex + 22, 408, 258, 24, MOE_V[2], fill=MINT['fill'], color=MINT['deep'])
    for i, (t, s) in enumerate(TAXONOMY):
        y = 450 + i * 66
        d.box(ex + 22, y, 196, 52, WHITE, MINT['line'], arc=11, dashed=True)
        d.text(ex + 38, y + 8, 170, 18, t, size=12, color=INK, bold=True)
        d.text(ex + 38, y + 26, 170, 16, s, size=10.5, color=FAINT)
        d.arrow([(ex, 476), (ex + 16, y + 26)], MINT['line'], dashed=True, head='none', rounded=False)

    d.panel(936, 150, 512, 120, MINT['band'], arc=16)
    d.kicker(958, 166, 300, 'Delivered', color=MINT['line'])
    art_icon(d, 958, 186, 26, 'report', accent=MINT['line'])
    d.text(994, 184, 436, 56,
           'Score · status · hard failures · annotated evidence frames, written back to the review platform.',
           size=12, color=INK)
    d.arrow([(888, 762), (1192, 762), (1192, 270)], MINT['line'], width=2.4)
    return d, 'v04-spine'


# ── v05 Artifact ──────────────────────────────────────────────────────────
def v05():
    d = Deck('v05 artifacts', 1960, 700)
    head(d, 48, 34, 1100)

    # 间距要放得下中间那枚交接物（60 宽）外加两段箭头，否则箭头会被挤成反向
    xs, w = [48, 438, 828, 1218, 1608], 250
    arts = [('film', 'sampled frames<br>+ constraints'), ('timeline', 'suspect spans'),
            ('bbox', 'cropped evidence'), ('check', 'accepted evidence')]
    for (n, name, one, bullets, _g, pal, ic), x in zip(STAGES, xs):
        d.box(x, 150, w, 158, WHITE, pal['line'], arc=15, shadow=True)
        d.panel(x, 150, w, 5, pal['line'], arc=3, shadow=False)
        art_icon(d, x + 16, 168, 28, ic, accent=pal['line'])
        d.ellipse(x + w - 36, 168, 22, 22, pal['line'], 'none')
        d.text(x + w - 36, 168, 22, 22, str(n), size=11.5, color=WHITE, bold=True, align='center')
        d.text(x + 52, 168, w - 94, 22, name, size=15, color=pal['deep'], bold=True)
        d.text(x + 16, 200, w - 32, 32, one, size=10.8, color=MUTE)
        for j, b in enumerate(bullets):
            d.text(x + 16, 234 + j * 20, w - 32, 18, '· ' + b, size=10.3, color=INK)
    for i, (ic, cap) in enumerate(arts):
        cx, gap, pal = xs[i] + w, xs[i + 1] - xs[i] - w, STAGES[i][5]
        mid = cx + gap / 2
        d.box(mid - 30, 194, 60, 62, pal['band'], pal['fill'], arc=12)
        art_icon(d, mid - 15, 206, 30, ic, accent=pal['line'])
        d.text(cx, 262, gap, 34, cap, size=10, color=MUTE, align='center')
        d.flow(cx + 8, 225, mid - 34, 225, pal['line'], width=2.2)
        d.flow(mid + 34, 225, xs[i + 1] - 8, 225, STAGES[i + 1][5]['line'], width=2.2)

    d.kicker(48, 338, 400, 'Tools called along the way')
    art_icon(d, 48, 356, 24, 'tools', accent=BLUE['line'])
    d.toolrow(82, 358, 640, TOOLS_PRE, pal=BLUE)
    d.toolrow(760, 358, 600, TOOLS_POST, pal=TEAL)

    d.kicker(48, 416, 520, 'Candidate upgrades · not yet shipped')
    d.panel(48, 440, 1864, 218, SLATE['band'], arc=18, shadow=False)
    d.frame(48, 440, 1864, 218, LINE, arc=18, dashed=True)
    moe_pair(d, 78, 466, 566, h=176)
    return d, 'v05-artifacts'


# ── v06 Fan-out ───────────────────────────────────────────────────────────
def v06():
    d = Deck('v06 fanout', 1640, 900)
    head(d, 48, 34, 1050)

    xs, w = [48, 362, 676, 990, 1304], 282
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        hero = name == 'Verifier'
        d.box(x, 128, w, 76, WHITE if hero else '#fcfcfd', pal['line'] if hero else LINE,
              arc=14, shadow=hero, width=1.8 if hero else 1.2)
        art_icon(d, x + 14, 144, 24, ic, accent=pal['line'] if hero else '#aab3bf')
        d.text(x + 46, 142, w - 70, 22, f'{n} · {name}', size=14,
               color=pal['deep'] if hero else FAINT, bold=True)
        d.text(x + 46, 164, w - 62, 18, one, size=10.5, color=MUTE if hero else '#a9b1bc')
        if i < 4:
            d.flow(x + w + 4, 166, xs[i + 1] - 4, 166, SLATE['line'], width=1.6, opacity=60)

    d.text(48, 242, 900, 28, 'Inside the verifier: one specialist per defect family',
           size=20, color=INK, bold=True)
    d.text(48, 272, 980, 18, MOE_V[1] + ' — ' + MOE_V[2] + '.', size=12.5, color=MUTE)

    d.panel(48, 312, 1544, 480, AMBER['band'], arc=22, shadow=False)
    d.frame(48, 312, 1544, 480, AMBER['fill'], arc=22, dashed=True)

    d.box(96, 492, 208, 112, WHITE, AMBER['line'], arc=14, shadow=True)
    art_icon(d, 182, 504, 36, 'bbox', accent=AMBER['line'])
    d.text(96, 544, 208, 24, 'Collapse', size=16, color=AMBER['deep'], bold=True, align='center')
    d.text(96, 568, 208, 30, 'one broad label, hard<br>to judge as a whole', size=10.5,
           color=MUTE, align='center')

    fy = 352
    for t, kids, pal in [('Human body', ['Torso', 'Hands'], MINT), ('Creature', ['Anatomy'], TEAL),
                         ('Object', ['Rigid', 'Soft'], VIOLET)]:
        d.box(420, fy, 226, 84, pal['fill'], pal['line'], arc=13)
        art_icon(d, 436, fy + 28, 26, 'experts', accent=pal['line'])
        d.text(470, fy + 14, 164, 22, t, size=14, color=pal['deep'], bold=True)
        d.text(470, fy + 38, 170, 32, 'specialist verifier', size=10.5, color=MUTE)
        d.arrow([(304, 548), (362, 548), (362, fy + 42), (414, fy + 42)], AMBER['line'], width=1.8)
        for j, k in enumerate(kids):
            kx = 708 + j * 158
            d.box(kx, fy + 20, 140, 46, WHITE, pal['line'], arc=10, dashed=True)
            d.text(kx, fy + 20, 140, 46, k, size=11.5, color=INK, align='center')
            d.arrow([(646, fy + 42), (kx - 6, fy + 42)], pal['line'], width=1.4, dashed=True, head='none')
        fy += 146

    d.panel(1056, 352, 488, 382, WHITE, arc=16)
    d.kicker(1084, 376, 380, 'Why split at all')
    art_matrix(d, 1326, 400, 26, 3, 3, MINT, head_c=['body', 'creat.', 'object'])
    d.text(1084, 398, 190, 60, 'each clip visits<br>exactly one cell', size=11, color=MUTE)
    for i, (k, v) in enumerate([('Precision', 'a specialist stops guessing outside its family'),
                                ('Recall', 'rare sub-types stop being drowned by common ones'),
                                ('Cost', 'unchanged — one clip still visits one verifier')]):
        y = 504 + i * 76
        d.text(1084, y, 160, 20, k, size=13.5, color=INK, bold=True)
        d.text(1084, y + 22, 432, 40, v, size=11.5, color=MUTE)
        if i < 2:
            d.divider(1084, y + 62, 432)
    return d, 'v06-fanout'


# ── v07 Poster ────────────────────────────────────────────────────────────
def v07():
    d = Deck('v07 poster', 1760, 860)
    d.panel(0, 0, 1760, 108, INK, arc=0, shadow=False)
    d.text(48, 24, 1100, 32, TITLE, size=25, color=WHITE, bold=True, spacing=-0.3)
    d.text(48, 60, 1200, 20, SUB, size=12.5, color='#aab3c0')
    for i, (n, lbl) in enumerate([('5', 'stages'), ('2', 'VLM passes'), ('9', 'CV tools'), ('1', 'rubric')]):
        x = 1300 + i * 112
        d.text(x, 24, 96, 32, n, size=26, color=WHITE, bold=True, align='center')
        d.text(x, 60, 96, 18, lbl, size=11, color='#aab3c0', align='center')

    xs, w = [48, 388, 728, 1068, 1408], 284
    for i, ((n, name, one, bullets, group, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.panel(x, 156, w, 348, pal['band'], arc=18, shadow=False)
        d.panel(x, 156, w, 6, pal['line'], arc=3, shadow=False)
        art_icon(d, x + 22, 180, 34, ic, accent=pal['line'])
        d.text(x + w - 76, 178, 54, 36, f'0{n}', size=27, color=pal['line'], bold=True, align='right')
        d.text(x + 22, 224, w - 44, 26, name, size=18, color=INK, bold=True)
        d.text(x + 22, 250, w - 44, 36, one, size=12, color=MUTE)
        instrument(d, x + 14, 292, w - 28, 60, ic, pal)
        d.divider(x + 22, 362, w - 44, color=pal['fill'])
        for j, b in enumerate(bullets):
            d.text(x + 22, 374 + j * 32, w - 44, 28, '— ' + b, size=11.5, color=INK)
        d.kicker(x + 22, 474, w - 44, group, color=pal['line'])
        if i < 4:
            d.arrow([(x + w + 12, 330), (xs[i + 1] - 12, 330)], pal['line'], width=2.6)

    d.kicker(48, 530, 500, 'Candidate upgrades · not yet shipped')
    d.panel(48, 554, 1664, 230, SLATE['band'], arc=18, shadow=False)
    d.frame(48, 554, 1664, 230, LINE, arc=18, dashed=True)
    moe_pair(d, 78, 580, 500, h=180)
    d.legend(48, 806, [(BLUE['line'], 'Perception'), (AMBER['line'], 'Human alignment'),
                       (MINT['line'], 'Delivery')], title='Legend')
    return d, 'v07-poster'


# ── v08 Actor Lanes ───────────────────────────────────────────────────────
def v08():
    d = Deck('v08 actor lanes', 1760, 760)
    head(d, 48, 34, 1100)

    lanes = [('VLM', 'the model doing the looking', VIOLET, 'vlm'),
             ('CV tools', 'deterministic signal extractors', TEAL, 'tools'),
             ('Rubric', 'scoring and delivery', MINT, 'rubric')]
    cells = {
        'VLM': ['parse prompt into<br>constraint list', 'ground the clip,<br>recall suspect spans',
                '', 'judge every piece<br>of evidence', ''],
        'CV tools': ['sample frames, read<br>metadata, OCR, depth', '',
                     'crop, zoom, segment,<br>track each span', '', 'render annotated<br>evidence frames'],
        'Rubric': ['', '', '', 'map severity to<br>rubric status', 'score, status,<br>hard failures'],
    }
    lx, lw, cx0, cw, gap = 48, 246, 316, 272, 14
    for i, (n, name, _o, _b, _g, pal, ic) in enumerate(STAGES):
        x = cx0 + i * (cw + gap)
        d.text(x, 126, cw, 18, f'STAGE {n}', size=10.5, color=pal['line'], bold=True,
               spacing=1.1, align='center')
        art_icon(d, x + cw / 2 - 13, 146, 26, ic, accent=pal['line'])
        d.text(x, 176, cw, 24, name, size=16, color=INK, bold=True, align='center')
    for r, (lane, desc, pal, ic) in enumerate(lanes):
        y = 214 + r * 154
        d.panel(lx, y, 1664, 138, pal['band'] if r % 2 == 0 else '#fbfcfd', arc=16, shadow=False)
        art_icon(d, lx + 22, y + 24, 28, ic, accent=pal['line'])
        d.text(lx + 22, y + 58, lw - 40, 26, lane, size=17, color=pal['deep'], bold=True)
        d.text(lx + 22, y + 84, lw - 40, 38, desc, size=11, color=MUTE)
        for i in range(5):
            x = cx0 + i * (cw + gap)
            body = cells[lane][i]
            if not body:
                d.text(x, y, cw, 138, '·', size=16, color='#d3dae2', align='center')
                continue
            d.box(x, y + 22, cw, 94, WHITE, pal['fill'], arc=12, shadow=True)
            d.text(x + 16, y + 22, cw - 32, 94, body, size=11.5, color=INK, align='center')
    for i in range(4):
        x = cx0 + i * (cw + gap) + cw
        d.arrow([(x + 2, 460), (x + gap - 2, 460)], SLATE['line'], width=1.6, opacity=60)
    d.text(48, 692, 1300, 18,
           'Reading down a column shows who touches a stage; reading across a row shows what one actor does end to end.',
           size=11.5, color=FAINT)
    return d, 'v08-actor-lanes'


# ── v09 Flywheel ──────────────────────────────────────────────────────────
def v09():
    d = Deck('v09 flywheel', 1700, 860)
    head(d, 48, 34, 1050)

    xs, w = [48, 372, 696, 1020, 1344], 294
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.box(x, 134, w, 112, WHITE, pal['line'], arc=15, shadow=True)
        d.panel(x, 134, w, 5, pal['line'], arc=3, shadow=False)
        art_icon(d, x + 16, 152, 26, ic, accent=pal['line'])
        d.ellipse(x + w - 34, 152, 22, 22, pal['line'], 'none')
        d.text(x + w - 34, 152, 22, 22, str(n), size=11.5, color=WHITE, bold=True, align='center')
        d.text(x + 50, 150, w - 90, 22, name, size=15, color=pal['deep'], bold=True)
        d.text(x + 50, 172, w - 70, 18, one, size=10.8, color=MUTE)
        for j, b in enumerate(bullets[:2]):
            d.text(x + 16, 198 + j * 20, w - 32, 18, '· ' + b, size=10.3, color=INK)
        if i < 4:
            d.flow(x + w + 5, 190, xs[i + 1] - 5, 190, pal['line'], width=2.4)

    d.panel(48, 314, 1590, 330, MINT['band'], arc=22, shadow=False)
    d.kicker(74, 334, 520, 'The loop that makes the next model better', color=MINT['line'])
    for i, (t, s, ic) in enumerate([('Hard negatives', 'clips the verifier argued over', 'bbox'),
                                    ('Human review', 'two blind passes + arbitration', 'check'),
                                    ('Training set', 'grounded evidence, frame accurate', 'film'),
                                    ('Next critic', 'recall and precision both move', 'vlm')]):
        x = 94 + i * 382
        d.box(x, 378, 326, 122, WHITE, MINT['line'], arc=14, shadow=True)
        art_icon(d, x + 20, 396, 28, ic, accent=MINT['line'])
        d.ellipse(x + 22, 440, 24, 24, MINT['fill'], 'none')
        d.text(x + 22, 440, 24, 24, str(i + 1), size=12, color=MINT['deep'], bold=True, align='center')
        d.text(x + 60, 394, 244, 24, t, size=14.5, color=INK, bold=True)
        d.text(x + 60, 420, 250, 48, s, size=11.5, color=MUTE)
        if i < 3:
            d.flow(x + 332, 440, x + 376, 440, MINT['line'], width=2.2)
    d.arrow([(1490, 190), (1580, 190), (1580, 296), (242, 296), (242, 372)], MINT['line'],
            width=2.2, dashed=True)
    d.text(620, 272, 500, 18, 'verdict + rejected evidence feed the flywheel',
           size=11.5, color=MINT['deep'], align='center')
    d.arrow([(94, 440), (74, 440), (74, 578), (1590, 578), (1590, 230), (1490, 230)],
            MINT['line'], width=2.2, dashed=True)
    d.text(620, 590, 600, 18, 'a better critic shortens the next review cycle',
           size=11.5, color=MUTE, align='center')
    d.text(48, 680, 1400, 18,
           'Dashed upgrades (MoE recall / MoE verifier) sit inside stages 2 and 4 and are covered in the companion diagram.',
           size=11.5, color=FAINT)
    return d, 'v09-flywheel'


# ── v10 Dense ─────────────────────────────────────────────────────────────
def v10():
    d = Deck('v10 dense', 1860, 880)
    d.text(48, 26, 1200, 30, TITLE, size=23, color=INK, bold=True, spacing=-0.3)
    d.text(48, 58, 1300, 18, SUB, size=11.5, color=MUTE)

    d.panel(40, 96, 268, 714, SLATE['band'], arc=20)
    d.kicker(62, 116, 220, 'Input')
    art_icon(d, 62, 136, 26, 'clip')
    for i, s in enumerate(INPUT_LINES):
        d.box(62, 172 + i * 50, 224, 40, WHITE, LINE, arc=10)
        d.text(76, 172 + i * 50, 200, 40, s, size=11.5, color=INK)
    d.divider(62, 334, 224)
    d.kicker(62, 348, 220, 'Tool shelf')
    art_icon(d, 62, 366, 22, 'tools', accent=TEAL['line'])
    for i, t in enumerate(TOOLS_PRE + TOOLS_POST):
        d.chip(62, 398 + i * 28, 224, 22, t, fill=WHITE, stroke=LINE, color=MUTE, size=10.5)

    d.panel(328, 96, 1044, 470, BLUE['band'], arc=20, shadow=False)
    d.frame(328, 96, 1044, 470, BLUE['fill'], arc=20)
    d.kicker(352, 114, 400, 'Perception · recall first', color=BLUE['line'])
    for i, (n, name, one, bullets, _g, pal, ic) in enumerate(STAGES[:3]):
        x = 352 + i * 340
        d.box(x, 142, 316, 206, WHITE, pal['line'], arc=14, shadow=True)
        d.panel(x, 142, 316, 5, pal['line'], arc=3, shadow=False)
        art_icon(d, x + 16, 158, 24, ic, accent=pal['line'])
        d.text(x + 48, 158, 250, 22, f'{n} · {name}', size=14.5, color=pal['deep'], bold=True)
        d.text(x + 16, 188, 284, 30, one, size=10.8, color=MUTE)
        for j, b in enumerate(bullets):
            d.text(x + 16, 220 + j * 22, 284, 20, '· ' + b, size=10.3, color=INK)
        instrument(d, x + 8, 290, 300, 50, ic, pal)
        if i < 2:
            d.arrow([(x + 320, 245), (x + 336, 245)], pal['line'], width=2.2)
    d.kicker(352, 366, 400, 'Evidence produced here')
    for i, s in enumerate(['span', 'bbox', 'observation', 'severity hint']):
        d.chip(352 + i * 156, 388, 142, 24, s, fill=WHITE, stroke=BLUE['fill'], color=BLUE['deep'])
    d.frame(352, 428, 996, 120, BLUE['fill'], arc=14, dashed=True)
    art_icon(d, 372, 444, 24, 'vlm', accent=ROSE['line'])
    d.text(404, 442, 300, 20, MOE_R[0] + ' · candidate', size=12.5, color=ROSE['deep'], bold=True)
    d.text(404, 464, 620, 18, MOE_R[1], size=11, color=MUTE)
    d.chip(404, 488, 150, 24, MOE_R[2], fill=ROSE['fill'], color=ROSE['deep'])
    for i, line in enumerate(MOE_R_WHY[:2]):
        d.text(580, 488 + i * 20, 460, 18, '— ' + line, size=10.5, color=INK)

    d.panel(1392, 96, 428, 470, AMBER['band'], arc=20, shadow=False)
    d.frame(1392, 96, 428, 470, AMBER['fill'], arc=20)
    d.kicker(1416, 114, 300, 'Alignment · precision first', color=AMBER['line'])
    n, name, one, bullets, _g, pal, ic = STAGES[3]
    d.box(1416, 142, 380, 206, WHITE, pal['line'], arc=14, shadow=True)
    d.panel(1416, 142, 380, 5, pal['line'], arc=3, shadow=False)
    art_icon(d, 1432, 158, 24, ic, accent=pal['line'])
    d.text(1464, 158, 300, 22, f'{n} · {name}', size=14.5, color=pal['deep'], bold=True)
    d.text(1432, 188, 348, 30, one, size=10.8, color=MUTE)
    for j, b in enumerate(bullets):
        d.text(1432, 220 + j * 22, 348, 20, '· ' + b, size=10.3, color=INK)
    instrument(d, 1424, 290, 364, 50, ic, pal)
    d.frame(1416, 366, 380, 182, AMBER['fill'], arc=14, dashed=True)
    art_icon(d, 1432, 380, 22, 'experts', accent=MINT['line'])
    d.text(1462, 378, 300, 20, MOE_V[0] + ' · candidate', size=12.5, color=MINT['deep'], bold=True)
    d.text(1432, 402, 348, 18, MOE_V[2], size=10.5, color=MUTE)
    for i, (t, s) in enumerate(TAXONOMY):
        y = 428 + i * 36
        d.box(1432, y, 158, 28, WHITE, MINT['line'], arc=8, dashed=True)
        d.text(1442, y, 144, 28, t, size=10.8, color=INK)
        d.text(1602, y, 190, 28, s, size=10.5, color=FAINT)
    d.arrow([(1348, 245), (1388, 245)], AMBER['line'], width=2.4)

    nn, nm, one5, bullets5, _g5, pal5, ic5 = STAGES[4]
    d.panel(328, 590, 1492, 220, MINT['band'], arc=20, shadow=False)
    art_icon(d, 354, 610, 28, ic5, accent=MINT['line'])
    d.text(392, 608, 400, 26, f'{nn} · {nm}', size=17, color=MINT['deep'], bold=True)
    d.text(392, 636, 560, 20, one5, size=12, color=MUTE)
    for j, b in enumerate(bullets5):
        x = 354 + j * 346
        d.box(x, 672, 316, 112, WHITE, MINT['line'], arc=12, shadow=True)
        d.text(x + 18, 682, 280, 40, b, size=12, color=INK)
        if j == 2:
            instrument(d, x + 10, 720, 296, 52, 'report', MINT)
    d.arrow([(1606, 566), (1606, 590)], MINT['line'], width=2.4)
    return d, 'v10-dense'


ALL = [v01, v02, v03, v04, v05, v06, v07, v08, v09, v10]


# ══════════════════════════════════════════════════════════════════════════
# 下面三版是看过 moodboard（middle_processing/moodboard/）之后重做的。
# 生图模型给出的那几张好看的，共同点是：卡片里有**真实画面**，而不是抽象色块。
# 所以这三版把被检视频的帧直接嵌进去，红框画在真帧上。
# 画面是生成的（无真人、无水印），存在 assets/figures/shots/。
# ══════════════════════════════════════════════════════════════════════════

from workflow_art import art_photo, art_photo_bbox   # noqa: E402

SHOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'assets', 'figures', 'shots')


def shot(name):
    return os.path.join(SHOT, f'{name}.jpg')


# 每个阶段配一张画面 + 该阶段对这张画面做了什么
FILM = ['frame-ok', 'frame-subject', 'frame-broken', 'frame-crowd', 'frame-object']


def v11():
    """moodboard sunburst/a-paper 方向：论文系统图，卡片内嵌真实帧。"""
    d = Deck('v11 frames', 1820, 880)
    head(d, 48, 34, 1100)

    xs, w = [48, 404, 760, 1116, 1472], 300
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.panel(x, 128, w, 416, pal['band'], arc=18, shadow=False)
        d.panel(x, 128, w, 5, pal['line'], arc=3, shadow=False)
        d.ellipse(x + 18, 148, 26, 26, pal['line'], 'none')
        d.text(x + 18, 148, 26, 26, str(n), size=12.5, color=WHITE, bold=True, align='center')
        d.text(x + 54, 148, w - 76, 26, name, size=17, color=INK, bold=True)
        d.text(x + 18, 182, w - 36, 34, one, size=11.5, color=MUTE)

        # 这一阶段对画面做了什么 —— 整张图的主角
        if i == 0:
            art_photo(d, x + 18, 224, 120, 90, shot('frame-ok'))
            d.box(x + 150, 224, w - 170, 90, WHITE, pal['line'], arc=8)
            d.text(x + 162, 232, 90, 14, 'CONSTRAINTS', size=8.5, color=pal['deep'],
                   bold=True, spacing=0.8)
            for j, frac in enumerate([0.86, 0.6, 0.74]):
                art_icon(d, x + 162, 250 + j * 18, 12, 'check')
                d.box(x + 180, 256 + j * 18, (w - 214) * frac, 4, pal['line'], 'none', arc=2)
        elif i == 1:
            art_photo(d, x + 18, 224, w - 36, 68, shot('frame-subject'))
            art_timeline(d, x + 18, 302, w - 36, [(.12, .26), (.48, .62), (.8, .9)], pal)
            d.text(x + 18, 316, w - 36, 14, 'three suspect spans recalled', size=9.5, color=FAINT)
        elif i == 2:
            fw = (w - 36 - 3 * 6) / 4
            for j in range(4):
                fx = x + 18 + j * (fw + 6)
                if j == 2:
                    art_photo_bbox(d, fx, 224, fw, 62, shot('frame-broken'),
                                   box=(.3, .42, .46, .44), label='hind leg')
                else:
                    art_photo(d, fx, 224, fw, 62, shot(FILM[j]))
            art_photo_bbox(d, x + 18, 296, w - 36, 62, shot('frame-broken'),
                           box=(.28, .4, .5, .48))
            d.text(x + 18, 362, w - 36, 14, 'the flagged frame, cropped and zoomed',
                   size=9.5, color=FAINT, align='center')
        elif i == 3:
            for j, (ic2, lbl, pal2) in enumerate([('check', 'accept · sev 2', MINT),
                                                  ('cross', 'reject', ROSE),
                                                  ('check', 'accept · sev 1', MINT)]):
                yy = 224 + j * 46
                d.box(x + 18, yy, w - 36, 40, WHITE, pal2['fill'], arc=9)
                art_photo(d, x + 24, yy + 5, 44, 30, shot(FILM[j]))
                art_icon(d, x + 76, yy + 10, 20, ic2)
                d.text(x + 104, yy, 110, 40, lbl, size=10.5, color=pal2['deep'], bold=True)
                d.box(x + 196, yy + 18, (w - 232) * [0.7, 0.4, 0.55][j], 4, pal2['line'], 'none', arc=2)
        else:
            d.box(x + 18, 224, w - 36, 134, WHITE, pal['line'], arc=10)
            d.text(x + 32, 236, 110, 14, 'VERDICT', size=9, color=pal['deep'], bold=True, spacing=0.9)
            d.text(x + 32, 252, 150, 22, 'fail · severity 3', size=14, color=INK, bold=True)
            art_photo_bbox(d, x + 32, 282, 110, 62, shot('frame-broken'), box=(.3, .4, .46, .46))
            art_photo_bbox(d, x + 152, 282, 110, 62, shot('frame-text'), box=(.22, .3, .56, .4))
            d.text(x + 32, 348, w - 64, 14, 'annotated evidence frames', size=9, color=FAINT)

        for j, b in enumerate(bullets):
            d.text(x + 18, 392 + j * 20, w - 36, 18, '— ' + b, size=10.5, color=INK)
        if i < 4:
            d.arrow([(x + w + 8, 336), (xs[i + 1] - 8, 336)], pal['line'], width=2.6)

    d.kicker(48, 572, 500, 'Candidate upgrades · not yet shipped')
    d.panel(48, 596, 1724, 230, SLATE['band'], arc=18, shadow=False)
    d.frame(48, 596, 1724, 230, LINE, arc=18, dashed=True)
    moe_pair(d, 78, 622, 520, h=180)
    return d, 'v11-frames'


def v12():
    """moodboard sunburst/b-editorial 方向：大色块 + 真实帧当卡片主图。"""
    d = Deck('v12 editorial', 1800, 820)
    head(d, 48, 34, 1100)

    xs, w = [48, 396, 744, 1092, 1440], 312
    for i, ((n, name, one, bullets, _g, pal, ic), x) in enumerate(zip(STAGES, xs)):
        d.ellipse(x, 126, 30, 30, pal['line'], 'none')
        d.text(x, 126, 30, 30, str(n), size=14, color=WHITE, bold=True, align='center')
        d.text(x + 42, 126, w - 42, 30, name, size=19, color=INK, bold=True)
        d.box(x, 172, w, 330, pal['fill'], 'none', arc=18, shadow=True)

        art_photo(d, x + 16, 188, w - 32, 128, shot(FILM[i]))
        if i == 2:
            d.box(x + 16 + (w - 32) * .3, 188 + 128 * .36, (w - 32) * .42, 128 * .46,
                  'none', '#e03131', arc=4, width=2.4, dashed=True)
        if i == 4:
            d.box(x + 16, 188, w - 32, 128, '#0e1116', 'none', arc=8, opacity=55)
            d.text(x + 16, 222, w - 32, 30, 'fail · severity 3', size=18, color=WHITE,
                   bold=True, align='center')
            d.text(x + 16, 252, w - 32, 20, '2 accepted · 1 rejected', size=11, color='#c9d1da',
                   align='center')

        d.text(x + 18, 332, w - 36, 34, one, size=12, color=pal['deep'])
        d.divider(x + 18, 370, w - 36, color=WHITE, width=1.6)
        for j, b in enumerate(bullets):
            d.text(x + 18, 384 + j * 32, w - 36, 28, '— ' + b, size=11.5, color=INK)
        if i < 4:
            d.arrow([(x + w + 8, 336), (xs[i + 1] - 8, 336)], pal['line'], width=3.0)

    d.kicker(48, 530, 500, 'Candidate upgrades · not yet shipped')
    d.panel(48, 554, 1704, 230, '#f7f8fa', arc=18, shadow=False)
    d.frame(48, 554, 1704, 230, LINE, arc=18, dashed=True)
    moe_pair(d, 78, 580, 514, h=180)
    return d, 'v12-editorial'


def v13():
    """moodboard sunburst/e-dark 方向：深色版，真实帧在暗底上更跳。"""
    d = Deck('v13 dark', 1800, 800, bg='#0d1014')
    d.text(48, 34, 1100, 32, TITLE, size=25, color='#ffffff', bold=True, spacing=-0.3)
    d.text(48, 67, 1200, 18, SUB, size=12, color='#8e99a6')

    xs, w = [48, 396, 744, 1092, 1440], 312
    NEON = {1: '#4d9bff', 2: '#b388ff', 3: '#2ee6c8', 4: '#ffc24d', 5: '#5ef08a'}
    for i, ((n, name, one, bullets, _g, _pal, ic), x) in enumerate(zip(STAGES, xs)):
        c = NEON[n]
        d.box(x, 126, w, 356, '#161b22', '#2b323c', arc=16)
        d.panel(x, 126, w, 4, c, arc=2, shadow=False)
        d.ellipse(x + 18, 146, 26, 26, c, 'none')
        d.text(x + 18, 146, 26, 26, str(n), size=12.5, color='#0d1014', bold=True, align='center')
        d.text(x + 54, 146, w - 76, 26, name, size=17, color='#ffffff', bold=True)
        art_photo(d, x + 18, 186, w - 36, 118, shot(FILM[i]))
        if i == 2:
            d.box(x + 18 + (w - 36) * .3, 186 + 118 * .36, (w - 36) * .42, 118 * .46,
                  'none', '#ff5d6c', arc=4, width=2.4, dashed=True)
        if i == 4:
            d.box(x + 18, 186, w - 36, 118, '#0d1014', 'none', arc=8, opacity=58)
            d.text(x + 18, 216, w - 36, 28, 'fail · severity 3', size=17, color='#ff8f9b',
                   bold=True, align='center')
        d.text(x + 18, 318, w - 36, 32, one, size=11.5, color='#9aa5b1')
        d.divider(x + 18, 354, w - 36, color='#2b323c')
        for j, b in enumerate(bullets):
            d.text(x + 18, 366 + j * 30, w - 36, 26, '— ' + b, size=11, color='#d6dde4')
        if i < 4:
            d.arrow([(x + w + 8, 300), (xs[i + 1] - 8, 300)], c, width=2.6)

    d.kicker(48, 512, 500, 'Candidate upgrades · not yet shipped', color='#6f7a87')
    d.box(48, 536, 1704, 222, '#12161b', '#2b323c', arc=18, dashed=True)
    for (nm, desc, note, _p), why, acc, i in zip([MOE_R, MOE_V], [MOE_R_WHY, MOE_V_WHY],
                                                 ['#ff8f9b', '#5ef08a'], range(2)):
        bx = 78 + i * 554
        d.box(bx, 562, 520, 172, '#161b22', acc, arc=14, dashed=True)
        d.text(bx + 20, 578, 300, 22, nm, size=15, color=acc, bold=True)
        d.text(bx + 20, 600, 480, 18, desc, size=11.5, color='#9aa5b1')
        for j, line in enumerate(why):
            d.text(bx + 20, 626 + j * 22, 480, 20, '— ' + line, size=11, color='#d6dde4')
        d.chip(bx + 20, 700, 14 + len(note) * 6.0, 22, note, fill='#1d242c', color=acc)
    tx = 78 + 2 * 554
    d.box(tx, 562, 520, 172, '#161b22', '#2b323c', arc=14, dashed=True)
    d.text(tx + 20, 578, 400, 22, 'Collapse, split by defect type', size=13.5,
           color='#ffffff', bold=True)
    for i, (t, sub_) in enumerate(TAXONOMY):
        yy = 610 + i * 38
        d.box(tx + 20, yy, 150, 30, '#1d242c', 'none', arc=9)
        d.text(tx + 32, yy, 136, 30, t, size=11.5, color='#5ef08a', bold=True)
        d.text(tx + 182, yy, 300, 30, sub_, size=11, color='#6f7a87')
    return d, 'v13-dark'


ALL = ALL + [v11, v12, v13]


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print(f'writing to {OUT}')
    for fn in ALL:
        deck, stem = fn()
        save(deck, stem)

