#!/usr/bin/env python3
"""draw.io 图元库：把 mxGraph XML 的样板收掉，只剩「画什么」。

手法照着 /mmu_mllm_hdd_4/deep-research/draw-io-blog 里那批论文图拆出来的：
  - 底板用无描边 + 阴影的圆角块（panel），颜色分区，不参与前景
  - 标题文字单独一层 text cell，不塞进方框的 value —— 这样字号、行高、颜色能精确控
  - 图标用 mxGraph 内置形状（cylinder / document / hexagon / step …），不依赖外链图片
  - 细节靠 chip / note / divider 这些小件堆出来，而不是把字都挤进一个框

所有坐标是绝对像素，画布左上角为原点。
"""
from __future__ import annotations

import html
import xml.etree.ElementTree as ET

# ── 调色板 ────────────────────────────────────────────────────────────────
INK = '#14181d'
MUTE = '#5b636e'
FAINT = '#8d96a3'
LINE = '#d9dee5'
WHITE = '#ffffff'

BLUE = {'fill': '#e8f0fe', 'line': '#3b74e8', 'deep': '#1a47a8', 'band': '#f1f6ff'}
MINT = {'fill': '#e2f5ec', 'line': '#1f9d63', 'deep': '#0f6b41', 'band': '#eefaf4'}
AMBER = {'fill': '#fdf0dd', 'line': '#d4890f', 'deep': '#92610b', 'band': '#fff8ec'}
ROSE = {'fill': '#fdeaec', 'line': '#d94452', 'deep': '#9b2430', 'band': '#fff1f3'}
VIOLET = {'fill': '#f0eafc', 'line': '#7b4fd4', 'deep': '#4f2e94', 'band': '#f7f3ff'}
TEAL = {'fill': '#e0f3f5', 'line': '#1b8a96', 'deep': '#0d5a62', 'band': '#eefafb'}
SLATE = {'fill': '#eef1f5', 'line': '#7b8798', 'deep': '#49525f', 'band': '#f6f8fa'}

FONT = 'Helvetica'


def esc(s: str) -> str:
    return html.escape(s, quote=True)


# Helvetica 下英文小写字母的平均宽度，按字号比例缩放。用来预估一段文字会折成几行
# —— 卡片里每行都按固定行距堆叠的话，折行的那条就会压到下一条上去。
CHAR_W = 0.50


def wrapped_lines(s: str, width: float, size: float) -> int:
    """估算 s 在 width 像素内、size 字号下会占几行（<br> 算硬换行）。"""
    total = 0
    for part in s.split('<br>'):
        plain = part.replace('&amp;', '&').replace('&nbsp;', ' ')
        per_line = max(1.0, width / (size * CHAR_W))
        total += max(1, -(-len(plain) // int(per_line)))
    return total


def rich(s: str) -> str:
    """draw.io 的 html 标签：value 里的 HTML 要先转义一次才能塞进 XML 属性。"""
    return html.escape(s, quote=True)


class Deck:
    """一张图。add_* 按调用顺序叠放，先调的在底层。"""

    def __init__(self, name: str, w: int, h: int, bg: str = WHITE):
        self.name = name
        self.w, self.h = w, h
        self.bg = bg
        self.cells: list[str] = []
        self.n = 0

    def _id(self, prefix: str = 'c') -> str:
        self.n += 1
        return f'{prefix}{self.n}'

    def _cell(self, value: str, style: str, x: float, y: float, w: float, h: float) -> str:
        cid = self._id()
        self.cells.append(
            f'<mxCell id="{cid}" value="{value}" style="{style}" vertex="1" parent="1">'
            f'<mxGeometry x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" as="geometry"/></mxCell>')
        return cid

    # ── 底板 ──────────────────────────────────────────────────────────────
    def panel(self, x, y, w, h, fill, arc=22, shadow=True, stroke='none', dashed=False, opacity=100):
        st = (f'rounded=1;absoluteArcSize=1;arcSize={arc};fillColor={fill};strokeColor={stroke};'
              f'strokeWidth=1.6;shadow={1 if shadow else 0};opacity={opacity};')
        if dashed:
            st += 'dashed=1;dashPattern=10 6;'
        return self._cell('', st, x, y, w, h)

    def frame(self, x, y, w, h, stroke, arc=20, dashed=False, fill='none', width=1.6):
        st = (f'rounded=1;absoluteArcSize=1;arcSize={arc};fillColor={fill};strokeColor={stroke};'
              f'strokeWidth={width};shadow=0;')
        if dashed:
            st += 'dashed=1;dashPattern=9 6;'
        return self._cell('', st, x, y, w, h)

    # ── 文字 ──────────────────────────────────────────────────────────────
    def text(self, x, y, w, h, s, size=13, color=INK, bold=False, align='left',
             valign='middle', lh=1.35, spacing=0.0, family=FONT):
        body = f'<div style="line-height:{size * lh:.1f}px;letter-spacing:{spacing}px">{s}</div>'
        st = (f'text;html=1;whiteSpace=wrap;fontFamily={family};fontSize={size};fontColor={color};'
              f'align={align};verticalAlign={valign};spacing=0;spacingTop=0;spacingLeft=0;'
              f'spacingRight=0;spacingBottom=0;fontStyle={1 if bold else 0};')
        return self._cell(rich(body), st, x, y, w, h)

    # ── 方块 ──────────────────────────────────────────────────────────────
    def box(self, x, y, w, h, fill, stroke, arc=14, shadow=False, dashed=False,
            width=1.6, opacity=100):
        st = (f'rounded=1;absoluteArcSize=1;arcSize={arc};fillColor={fill};strokeColor={stroke};'
              f'strokeWidth={width};shadow={1 if shadow else 0};opacity={opacity};')
        if dashed:
            st += 'dashed=1;dashPattern=8 5;'
        return self._cell('', st, x, y, w, h)

    def card(self, x, y, w, h, title, lines=(), pal=BLUE, num=None, shadow=True,
             dashed=False, title_size=15, body_size=11.5, fill=None, accent_bar=True):
        """一张阶段卡：底色块 + 顶部色条 + 标题 + 若干说明行。"""
        self.box(x, y, w, h, fill or pal['fill'], pal['line'], arc=16, shadow=shadow, dashed=dashed)
        if accent_bar:
            self.panel(x + 14, y + 13, 4, h - 26, pal['line'], arc=4, shadow=False)
        tx = x + (26 if accent_bar else 14)
        tw = w - (40 if accent_bar else 28)
        ty = y + 11
        if num is not None:
            self.ellipse(x + w - 36, y + 10, 24, 24, pal['line'], 'none')
            self.text(x + w - 36, y + 10, 24, 24, str(num), size=12, color=WHITE, bold=True, align='center')
            tw -= 26
        self.text(tx, ty, tw, 20, title, size=title_size, color=pal['deep'], bold=True)
        cy = ty + 23
        for ln in lines:
            rows = wrapped_lines(ln, tw, body_size)
            lh = rows * (body_size * 1.32)
            self.text(tx, cy, tw, lh, ln, size=body_size, color=MUTE, valign='top')
            cy += lh + 3
        return x, y, w, h

    def chip(self, x, y, w, h, s, fill=SLATE['fill'], stroke='none', color=MUTE, size=10.5, bold=False):
        self.box(x, y, w, h, fill, stroke, arc=h)
        self.text(x, y, w, h, s, size=size, color=color, bold=bold, align='center')
        return x, y, w, h

    def ellipse(self, x, y, w, h, fill, stroke, width=1.6):
        st = f'ellipse;fillColor={fill};strokeColor={stroke};strokeWidth={width};shadow=0;'
        return self._cell('', st, x, y, w, h)

    def shape(self, x, y, w, h, kind, fill, stroke, direction=None, width=1.6):
        """kind: cylinder3 / document / hexagon / step / parallelogram / triangle / cloud"""
        st = f'shape={kind};fillColor={fill};strokeColor={stroke};strokeWidth={width};html=1;'
        if direction:
            st += f'direction={direction};'
        if kind == 'cylinder3':
            st += 'boundedLbl=1;size=7;'
        return self._cell('', st, x, y, w, h)

    def divider(self, x, y, w, color=LINE, width=1.2, dashed=False):
        st = f'line;strokeColor={color};strokeWidth={width};html=1;'
        if dashed:
            st += 'dashed=1;dashPattern=6 4;'
        return self._cell('', st, x, y, w, 8)

    # ── 连线 ──────────────────────────────────────────────────────────────
    def arrow(self, pts, color, width=2.0, dashed=False, head='blockThin', rounded=True, opacity=100):
        cid = self._id('e')
        st = (f'edgeStyle=orthogonalEdgeStyle;rounded={1 if rounded else 0};html=1;'
              f'strokeColor={color};strokeWidth={width};endArrow={head};endFill=1;endSize=6;'
              f'opacity={opacity};')
        if dashed:
            st += 'dashed=1;dashPattern=6 4;'
        pt = ''.join(f'<mxPoint x="{x:.1f}" y="{y:.1f}"/>' for x, y in pts[1:-1])
        geo = (f'<mxGeometry relative="1" as="geometry">'
               f'<mxPoint x="{pts[0][0]:.1f}" y="{pts[0][1]:.1f}" as="sourcePoint"/>'
               f'<mxPoint x="{pts[-1][0]:.1f}" y="{pts[-1][1]:.1f}" as="targetPoint"/>'
               + (f'<Array as="points">{pt}</Array>' if pt else '') + '</mxGeometry>')
        self.cells.append(f'<mxCell id="{cid}" style="{st}" edge="1" parent="1">{geo}</mxCell>')
        return cid

    def flow(self, ax, ay, bx, by, color, **kw):
        """两点之间的横向箭头。"""
        return self.arrow([(ax, ay), (bx, by)], color, **kw)

    # ── 组合件 ────────────────────────────────────────────────────────────
    def kicker(self, x, y, w, s, color=FAINT, size=10.5, align='left'):
        return self.text(x, y, w, 14, s.upper(), size=size, color=color, bold=True,
                         align=align, spacing=1.3)

    def toolrow(self, x, y, w, items, pal=SLATE, h=19, gap=6, size=10):
        """一行工具小标签，自动按宽度排布。"""
        cx = x
        for it in items:
            tw = 12 + len(it) * 5.9
            if cx + tw > x + w:
                break
            self.chip(cx, y, tw, h, it, fill=pal['fill'], color=pal['deep'], size=size)
            cx += tw + gap
        return cx

    def legend(self, x, y, items, title=None, size=10.5, gap=18):
        """items: [(色, 文案), …]，横排。"""
        cx = x
        if title:
            self.text(cx, y, 70, 16, title, size=size, color=FAINT, bold=True)
            cx += 72
        for color, label in items:
            self.box(cx, y + 4, 11, 11, color, 'none', arc=3)
            self.text(cx + 16, y, 10 + len(label) * 6.1, 16, label, size=size, color=MUTE)
            cx += 16 + 10 + len(label) * 6.1 + gap
        return cx

    # ── 输出 ──────────────────────────────────────────────────────────────
    def xml(self) -> str:
        bg = f' background="{self.bg}"' if self.bg else ''
        body = ''.join(self.cells)
        out = (f'<mxfile host="drawio"><diagram name="{esc(self.name)}" id="{esc(self.name)}">'
               f'<mxGraphModel grid="0" gridSize="10" page="0" math="0"{bg} '
               f'pageWidth="{self.w}" pageHeight="{self.h}">'
               f'<root><mxCell id="0"/><mxCell id="1" parent="0"/>{body}</root>'
               f'</mxGraphModel></diagram></mxfile>')
        ET.fromstring(out)   # 自检：必须是合法 XML
        return out

