#!/usr/bin/env python3
"""领域图形：把 Kling-Critic 这条链路上真实存在的东西画出来，而不是一堆彩色方框。

参考 /mmu_mllm_hdd_4/deep-research/draw-io-blog 里那批论文图的做法 —— 它们好看的原因
不是配色，是图里有**东西**：CLIP 画相似度矩阵和梯形编码器，InstructGPT 画小人和神经网，
AgentThink 画一排图标。20 张图里内联了 216 个 SVG 图标、77 个梯形。

所以这里提供两类件：
  icon_*()   返回 data URI，配 shape=image 用，是小插画（视频帧、胶片、bbox、放大镜…）
  art_*()    直接往 Deck 上画的组合图形（胶片条、时间轴、证据矩阵、梯形编码器）

图标统一 outline 风格，1.6 描边，跟随传入的颜色。
"""
from __future__ import annotations

import base64
from urllib.parse import quote

INK = '#14181d'


def _uri(svg: str) -> str:
    """draw.io 自己的写法是 data:<mime>,<base64>（逗号后直接跟 base64，没有 ;base64）。
    用标准的 ;base64, 它认不出来，图标会整个不画。"""
    b64 = base64.b64encode(svg.encode('utf-8')).decode()
    return f'data:image/svg+xml,{b64}'


def _wrap(body: str, size: int = 40) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}">{body}</svg>')


def _s(c: str, w: float = 1.7) -> str:
    return f'fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'


# ── 图标 ──────────────────────────────────────────────────────────────────

def icon_clip(c=INK, accent='#3b74e8') -> str:
    """一段视频：带播放三角的画面框。"""
    return _uri(_wrap(
        f'<rect x="4" y="8" width="32" height="24" rx="3" {_s(c)}/>'
        f'<path d="M17 16l8 4-8 4z" fill="{accent}" stroke="none"/>'
        f'<path d="M4 14h32M4 26h32" stroke="{c}" stroke-width="1" opacity=".35"/>'))


def icon_film(c=INK, accent='#7b4fd4') -> str:
    """胶片：多帧 + 齿孔，表示逐帧看。"""
    holes = ''.join(f'<rect x="{6 + i * 7}" y="7" width="3" height="2.6" rx="0.6" fill="{c}" opacity=".5"/>'
                    f'<rect x="{6 + i * 7}" y="30.4" width="3" height="2.6" rx="0.6" fill="{c}" opacity=".5"/>'
                    for i in range(4))
    return _uri(_wrap(
        f'<rect x="3" y="5" width="34" height="30" rx="3" {_s(c)}/>' + holes +
        f'<rect x="7" y="13" width="11" height="14" rx="1.5" fill="{accent}" opacity=".22" stroke="none"/>'
        f'<rect x="22" y="13" width="11" height="14" rx="1.5" {_s(c, 1.3)}/>'))


def icon_bbox(c=INK, accent='#d94452') -> str:
    """画面上的一个框：证据的最小单位。"""
    return _uri(_wrap(
        f'<rect x="3" y="7" width="34" height="26" rx="3" {_s(c)}/>'
        f'<path d="M8 28c3-6 6-9 9-9s5 3 8 6" stroke="{c}" stroke-width="1.2" fill="none" opacity=".45"/>'
        f'<rect x="15" y="12" width="15" height="13" rx="1.5" fill="none" stroke="{accent}" '
        f'stroke-width="2.2" stroke-dasharray="4 2.4"/>'))


def icon_zoom(c=INK, accent='#1b8a96') -> str:
    """放大镜：局部放大再看一眼。"""
    return _uri(_wrap(
        f'<rect x="3" y="6" width="26" height="20" rx="2.5" {_s(c, 1.4)} opacity=".55"/>'
        f'<circle cx="23" cy="22" r="9" fill="#fff" stroke="{accent}" stroke-width="2.2"/>'
        f'<path d="M29.5 28.5L36 35" stroke="{accent}" stroke-width="2.6" stroke-linecap="round"/>'
        f'<path d="M19 22h8M23 18v8" stroke="{accent}" stroke-width="1.5" stroke-linecap="round"/>'))


def icon_timeline(c=INK, accent='#d4890f') -> str:
    """时间轴 + 命中的区间。"""
    return _uri(_wrap(
        f'<path d="M4 20h32" {_s(c, 1.6)}/>'
        f'<rect x="12" y="16" width="11" height="8" rx="2" fill="{accent}" stroke="none"/>'
        f'<path d="M6 14v12M36 14v12" {_s(c, 1.3)} opacity=".5"/>'
        f'<circle cx="12" cy="20" r="2.2" fill="#fff" stroke="{accent}" stroke-width="1.6"/>'
        f'<circle cx="23" cy="20" r="2.2" fill="#fff" stroke="{accent}" stroke-width="1.6"/>'))


def icon_check(c='#1f9d63') -> str:
    return _uri(_wrap(f'<circle cx="20" cy="20" r="15" fill="{c}" opacity=".14" stroke="none"/>'
                      f'<path d="M12.5 20.5l5 5 10-11" {_s(c, 2.8)}/>'))


def icon_cross(c='#d94452') -> str:
    return _uri(_wrap(f'<circle cx="20" cy="20" r="15" fill="{c}" opacity=".14" stroke="none"/>'
                      f'<path d="M14 14l12 12M26 14L14 26" {_s(c, 2.8)}/>'))


def icon_rubric(c=INK, accent='#1f9d63') -> str:
    """评分表：勾选项 + 分数。"""
    rows = ''.join(f'<path d="M11 {13 + i * 7}l2 2 3.5-4" stroke="{accent}" stroke-width="1.7" '
                   f'fill="none" stroke-linecap="round"/>'
                   f'<path d="M21 {14 + i * 7}h9" stroke="{c}" stroke-width="1.5" opacity=".45" '
                   f'stroke-linecap="round"/>' for i in range(3))
    return _uri(_wrap(f'<rect x="6" y="4" width="28" height="32" rx="3" {_s(c)}/>' + rows))


def icon_tools(c=INK, accent='#1b8a96') -> str:
    """工具箱：确定性 CV 工具。"""
    return _uri(_wrap(
        f'<path d="M5 15h30v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" {_s(c)}/>'
        f'<path d="M15 15V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6" {_s(c)}/>'
        f'<rect x="16" y="20" width="8" height="7" rx="1.5" fill="{accent}" stroke="none" opacity=".8"/>'))


def icon_vlm(c=INK, accent='#7b4fd4') -> str:
    """VLM：一只眼睛加节点网络。"""
    return _uri(_wrap(
        f'<path d="M4 20s6-9 16-9 16 9 16 9-6 9-16 9S4 20 4 20z" {_s(c)}/>'
        f'<circle cx="20" cy="20" r="5.5" fill="{accent}" opacity=".2" stroke="none"/>'
        f'<circle cx="20" cy="20" r="5.5" {_s(accent, 1.8)}/>'
        f'<circle cx="20" cy="20" r="1.8" fill="{accent}" stroke="none"/>'))


def icon_experts(c=INK, accent='#1f9d63') -> str:
    """专家拆分：一分三。"""
    return _uri(_wrap(
        f'<circle cx="8" cy="20" r="4" fill="{accent}" opacity=".22" stroke="none"/>'
        f'<circle cx="8" cy="20" r="4" {_s(accent, 1.7)}/>'
        + ''.join(f'<circle cx="31" cy="{9 + i * 11}" r="3.4" {_s(c, 1.6)}/>'
                  f'<path d="M12.4 20q7 0 10-{(20 - (9 + i * 11)) * 0.9:.1f}" {_s(c, 1.3)} opacity=".6"/>'
                  for i in range(3))))


def icon_report(c=INK, accent='#3b74e8') -> str:
    """交付：带红框截图的报告。"""
    return _uri(_wrap(
        f'<path d="M9 4h14l8 8v24a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" {_s(c)}/>'
        f'<path d="M23 4v8h8" {_s(c, 1.4)}/>'
        f'<rect x="12" y="19" width="16" height="11" rx="1.5" fill="{accent}" opacity=".16" stroke="none"/>'
        f'<rect x="15" y="21.5" width="8" height="6" rx="1" fill="none" stroke="#d94452" '
        f'stroke-width="1.8" stroke-dasharray="3 2"/>'))


def icon_prompt(c=INK, accent='#3b74e8') -> str:
    """提示词：一段带约束清单的文本。"""
    return _uri(_wrap(
        f'<rect x="5" y="6" width="30" height="24" rx="3" {_s(c)}/>'
        f'<path d="M13 30l-2 5 7-5z" fill="{c}" stroke="none" opacity=".8"/>'
        + ''.join(f'<path d="M10 {13 + i * 5.5}h{[20, 15, 18][i]}" stroke="{accent if i == 0 else c}" '
                  f'stroke-width="1.7" opacity="{1 if i == 0 else .4}" stroke-linecap="round"/>'
                  for i in range(3))))


ICONS = {
    'clip': icon_clip, 'film': icon_film, 'bbox': icon_bbox, 'zoom': icon_zoom,
    'timeline': icon_timeline, 'check': icon_check, 'cross': icon_cross,
    'rubric': icon_rubric, 'tools': icon_tools, 'vlm': icon_vlm,
    'experts': icon_experts, 'report': icon_report, 'prompt': icon_prompt,
}


# ── 组合图形：直接画在 Deck 上 ────────────────────────────────────────────

def art_filmstrip(d, x, y, w, h, frames=6, bad=3, pal=None, label=None):
    """一条胶片，其中一帧标红 —— 「哪一帧出了问题」。"""
    from workflow_kit import FAINT, LINE, WHITE
    pal = pal or {'line': '#d94452', 'fill': '#fdeaec', 'deep': '#9b2430'}
    fw = (w - (frames - 1) * 6) / frames
    for i in range(frames):
        fx = x + i * (fw + 6)
        hit = i == bad
        d.box(fx, y, fw, h, pal['fill'] if hit else WHITE, pal['line'] if hit else LINE,
              arc=6, width=2.0 if hit else 1.2)
        if hit:
            d.box(fx + fw * .24, y + h * .26, fw * .5, h * .46, 'none', pal['line'], arc=3, width=1.8, dashed=True)
        else:
            d.box(fx + fw * .3, y + h * .36, fw * .4, h * .3, LINE, 'none', arc=3)
    if label:
        d.text(x, y + h + 5, w, 15, label, size=10.5, color=FAINT, align='center')
    return x, y, w, h


def art_timeline(d, x, y, w, spans, pal, label=None, h=10):
    """时间轴 + 若干命中区间。spans 是 [(起, 止)]，取值 0–1。"""
    from workflow_kit import FAINT, LINE
    d.box(x, y, w, h, LINE, 'none', arc=h)
    for a, b in spans:
        d.box(x + w * a, y, max(w * (b - a), 10), h, pal['line'], 'none', arc=h)
    if label:
        d.text(x, y + h + 4, w, 14, label, size=10, color=FAINT)
    return x, y, w, h


def art_encoder(d, x, y, w, h, title, pal, flip=False):
    """梯形编码器 —— CLIP 那张图里用了 77 个，是「这里有个模型」最省地方的画法。"""
    st_dir = 'west' if flip else 'east'
    d._cell('', f'shape=trapezoid;perimeter=trapezoidPerimeter;fillColor={pal["fill"]};'
                f'strokeColor={pal["line"]};strokeWidth=1.8;direction={st_dir};'
                f'arcSize=6;rounded=1;absoluteArcSize=1;', x, y, w, h)
    d.text(x, y, w, h, title, size=12.5, color=pal['deep'], bold=True, align='center')
    return x, y, w, h


def art_icon(d, x, y, size, name, color=INK, accent=None):
    """放一个图标。"""
    fn = ICONS[name]
    # check / cross 这类只有一个颜色，没有 accent 参数
    takes_accent = fn.__code__.co_argcount > 1
    svg = fn(color, accent) if (accent and takes_accent) else fn(color)
    d._cell('', f'shape=image;verticalLabelPosition=bottom;labelBackgroundColor=none;'
                f'verticalAlign=top;aspect=fixed;imageAspect=0;image={svg};', x, y, size, size)
    return x, y, size, size


def art_stack(d, x, y, w, h, n, pal, offset=5):
    """一摞卡片 —— 表示「很多条」，CLIP 用它画成堆的图像和文本。"""
    from workflow_kit import WHITE
    for i in range(n - 1, 0, -1):
        d.box(x + i * offset, y + i * offset, w, h, WHITE, pal['line'], arc=6, width=1.2)
    d.box(x, y, w, h, pal['fill'], pal['line'], arc=6, width=1.6)
    return x, y, w, h


def art_matrix(d, x, y, cell, rows, cols, pal, diag=True, head_r=None, head_c=None):
    """一张小矩阵 —— CLIP 的相似度矩阵就是这么画的。"""
    from workflow_kit import FAINT, LINE, WHITE
    for r in range(rows):
        for c in range(cols):
            hit = diag and r == c
            d.box(x + c * cell, y + r * cell, cell, cell,
                  pal['fill'] if hit else WHITE, pal['line'] if hit else LINE,
                  arc=3, width=1.4 if hit else 1.0)
    if head_c:
        for c, s in enumerate(head_c[:cols]):
            d.text(x + c * cell, y - 17, cell, 15, s, size=9.5, color=FAINT, align='center')
    if head_r:
        for r, s in enumerate(head_r[:rows]):
            d.text(x - 64, y + r * cell, 58, cell, s, size=9.5, color=FAINT, align='right')
    return x, y, cols * cell, rows * cell


def art_photo(d, x, y, w, h, path, arc=8, crop=True):
    """把一张真实画面嵌进图里 —— moodboard 里好看的那几版，卡片中都有真实缩略图，
    而不是抽象色块。图片以 base64 内联，.drawio 自带素材，拷到哪都不会丢图。"""
    import base64 as _b64
    import os as _os
    from PIL import Image as _Image
    if not _os.path.exists(path):
        from workflow_kit import LINE, SLATE
        d.box(x, y, w, h, SLATE['fill'], LINE, arc=arc)
        return x, y, w, h
    if crop:   # 按目标宽高比居中裁剪，避免被拉变形
        im = _Image.open(path).convert('RGB')
        tw, th = im.width, int(im.width * h / w)
        if th > im.height:
            th, tw = im.height, int(im.height * w / h)
        im = im.crop(((im.width - tw) // 2, (im.height - th) // 2,
                      (im.width + tw) // 2, (im.height + th) // 2))
        im.thumbnail((max(int(w * 2), 80), max(int(h * 2), 80)), _Image.LANCZOS)
        import io as _io
        buf = _io.BytesIO(); im.save(buf, 'JPEG', quality=80, optimize=True)
        raw = buf.getvalue()
    else:
        raw = open(path, 'rb').read()
    # 只能是 shape=image;imageAspect=0;image=data:image/jpeg,<base64>
    #   - 标准的 ;base64, 会退化成占位图标
    #   - 多加 aspect=fixed 或 clipPath 会让图整个不渲染
    uri = 'data:image/jpeg,' + _b64.b64encode(raw).decode()
    d._cell('', f'shape=image;imageAspect=0;image={uri};', x, y, w, h)
    return x, y, w, h


def art_photo_bbox(d, x, y, w, h, path, box=(0.3, 0.3, 0.4, 0.4), color='#e03131', label=None):
    """带红框的画面 —— 证据长什么样。box 是 (左, 上, 宽, 高)，取值 0–1。"""
    art_photo(d, x, y, w, h, path)
    bx, by, bw, bh = box
    d.box(x + w * bx, y + h * by, w * bw, h * bh, 'none', color, arc=3, width=2.2, dashed=True)
    if label:
        from workflow_kit import WHITE
        d.box(x + w * bx, y + h * by - 15, 10 + len(label) * 5.6, 15, color, 'none', arc=3)
        d.text(x + w * bx, y + h * by - 15, 10 + len(label) * 5.6, 15, label,
               size=8.5, color=WHITE, bold=True, align='center')
    return x, y, w, h

