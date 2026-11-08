#!/usr/bin/env bash
# 一键复现 critic-blog/assets/ 下的全部静态素材。
#
#   bash assets/setup-assets.sh              # 缺什么补什么
#   bash assets/setup-assets.sh --force      # 全部重下
#   bash assets/setup-assets.sh --check      # 只校验，不下载
#
# 素材分两类：
#   可下载 —— logos/ 36 个机构标识、papers/ 11 张论文架构图、figures/ 站点 logo、
#             clips/ 18 段调研配图视频、videos/ 7 段质检 demo 视频、
#             js/ + css/ 页面运行时（marked + KaTeX）
#   随仓库 —— demos/ 交互组件（是代码不是素材，无下载源，只校验存在）
#
# 网络：默认走日本 squid，访问 HuggingFace / jsDelivr / Google 需要它；脚本已内置。
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE=0; CHECK_ONLY=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "未知参数 $a"; exit 2 ;;
  esac
done

export https_proxy="${https_proxy:-http://oversea-squid1.jp.txyun:11080}"
export http_proxy="${http_proxy:-$https_proxy}"

ok=0; skip=0; fail=0
say() { printf '%s\n' "$*"; }
hr()  { printf '%s\n' "────────────────────────────────────────────────────────"; }

# 校验魔数而不是只看大小：curl 拿到 HTML 错误页时大小也可能过关
is_image() {
  local f="$1" head
  [ -s "$f" ] || return 1
  head=$(head -c 8 "$f" | od -An -tx1 | tr -d ' \n')
  case "$head" in
    89504e47*|ffd8ff*|00000100*|52494646*) return 0 ;;   # PNG / JPEG / ICO / RIFF-WEBP
    *) return 1 ;;
  esac
}
is_mp4()  { [ -s "$1" ] && head -c 12 "$1" | od -An -c | grep -q 'f   t   y   p'; }
is_text() { [ -s "$1" ] && [ "$(stat -c%s "$1")" -gt 1000 ]; }

fetch() {   # fetch <url> <dest> <validator>
  local url="$1" dest="$2" val="$3"
  if [ "$FORCE" -eq 0 ] && "$val" "$dest" 2>/dev/null; then skip=$((skip+1)); return 0; fi
  [ "$CHECK_ONLY" -eq 1 ] && { say "  缺失 $(basename "$dest")"; fail=$((fail+1)); return 1; }
  mkdir -p "$(dirname "$dest")"
  curl -sSL --max-time 180 --retry 2 -o "$dest.part" "$url" 2>/dev/null
  if "$val" "$dest.part" 2>/dev/null; then mv "$dest.part" "$dest"; ok=$((ok+1)); return 0; fi
  rm -f "$dest.part"; say "  失败 $(basename "$dest")  <- $url"; fail=$((fail+1)); return 1
}

# ────────────────────────── 1. 机构标识 logos/ ──────────────────────────
hr; say "1/6  机构标识 logos/   （surveys/ 里的论文表格用）"
[ -f "$HERE/logos.tsv" ] || { say "缺 logos.tsv，无法继续"; exit 1; }
while IFS=$'\t' read -r name url; do
  [ -z "${name:-}" ] && continue
  fetch "$url" "$HERE/logos/$name.png" is_image
done < "$HERE/logos.tsv"
say "  $(ls "$HERE/logos" 2>/dev/null | wc -l) / $(grep -c . "$HERE/logos.tsv") 个"

# ────────────────────────── 2. 论文架构图 papers/ + 站点 logo ──────────────────────────
# 出处见 surveys/agent-eval.html 底部的 Image Sources：全部取自各论文 arXiv HTML 版原图，
# 宽度超过 1600px 的等比压缩。下面的路径是逐张按图注里的 Figure 号解析出来的，勿手写。
hr; say "2/6  论文架构图 papers/ + 站点 logo figures/"
AX=https://arxiv.org/html
for spec in \
  "open-ea.png|$AX/2608.09666v1/tpami-data-pipe.png" \
  "videogen-eval.png|$AX/2503.23452v1/agent.png" \
  "vista.png|$AX/2510.15831v1/images/VISTA.png" \
  "vqqa.png|$AX/2603.12310v1/paper_content/figures/vqqa_framework.png" \
  "videoargus.png|$AX/2608.05485v1/fig/flow.png" \
  "skyra.png|$AX/2512.15693v1/method_overview.png" \
  "artifact-bench.png|$AX/2605.18984v1/mainfig.png" \
  "trace.png|$AX/2605.16740v1/framework.png" \
  "videoscience.png|$AX/2512.02942v1/figures/data.png" \
  "aigve-macs.png|$AX/2507.01255v1/main_figure.png" \
  "directorbench.png|$AX/2605.30090v1/directorbench_overview_editable_v3.png" ; do
  fetch "${spec##*|}" "$HERE/papers/${spec%%|*}" is_image
done
# arXiv 原图有的宽到 3000+ px，页面只用到 1600，等比压下来省一半体积
if [ "$CHECK_ONLY" -eq 0 ]; then
  python3 - "$HERE/papers" <<'PY' 2>/dev/null || true
import os, sys
from PIL import Image
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if not f.endswith(".png"): continue
    p = os.path.join(d, f); im = Image.open(p)
    if im.width > 1600:
        im.convert("RGB").resize((1600, round(im.height*1600/im.width)), Image.LANCZOS).save(p)
        print(f"    压缩 {f} -> 1600px")
PY
fi
fetch "https://www.google.com/s2/favicons?domain=abcai.com&sz=128" "$HERE/figures/abc-logo.png" is_image

# ────────────────────────── 3. 质检 demo 视频 videos/ ──────────────────────────
# 4 段来自 TIGER-Lab/VideoFeedback（公开集，带人工 5 维度评分），标注 demo 直接用它们；
# 3 段 10 秒测试片是早期占位素材，还有 4 个维度的 demo 挂在上面。
hr; say "3/6  质检 demo 视频 videos/"
VFB="https://huggingface.co/datasets/hexuan21/VideoFeedback-videos-mp4/resolve/main"
for spec in \
  "vf_6004655.mp4|$VFB/6/6004655.mp4" \
  "vf_1003674.mp4|$VFB/1/1003674.mp4" \
  "vf_3005976.mp4|$VFB/3/3005976.mp4" \
  "vf_1003702.mp4|$VFB/1/1003702.mp4" ; do
  fetch "${spec##*|}" "$HERE/videos/${spec%%|*}" is_mp4
done
for spec in \
  "bunny10.mp4|https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4" \
  "jelly10.mp4|https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4" \
  "sintel10.mp4|https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4" ; do
  fetch "${spec##*|}" "$HERE/videos/${spec%%|*}" is_mp4
done

# ────────────────────────── 4. 调研配图视频 clips/ ──────────────────────────
# surveys/ 里的交互组件用。benchmark 数据集的样本视频装在几百 MB 的 zip 里，
# 这里读远程 zip 的中央目录定位后按字节区间只取需要的那一条，不下整包。
hr; say "4/6  调研配图视频 clips/   （surveys/ 的交互组件用）"

extract_from_remote_zip() {   # <zip_url> <entry_name> <dest>
  python3 - "$1" "$2" "$3" <<'PY'
import sys, urllib.request, struct, zlib, os
url, entry, dest = sys.argv[1], sys.argv[2], sys.argv[3]
def rng(a, b):
    r = urllib.request.Request(url, headers={"Range": f"bytes={a}-{b}"})
    with urllib.request.urlopen(r, timeout=240) as f: return f.read()
with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as f:
    total = int(f.headers["Content-Length"])
tail = rng(total - 300000, total - 1)
j = tail.rfind(b"PK\x06\x07")                       # zip64 定位器
if j >= 0:
    z64 = struct.unpack("<Q", tail[j+8:j+16])[0]
    h = rng(z64, z64 + 55)
    cd_size, cd_off = struct.unpack("<Q", h[40:48])[0], struct.unpack("<Q", h[48:56])[0]
else:
    i = tail.rfind(b"PK\x05\x06")
    cd_size, cd_off = struct.unpack("<I", tail[i+12:i+16])[0], struct.unpack("<I", tail[i+16:i+20])[0]
cd = rng(cd_off, cd_off + cd_size - 1)
p = 0
while p < len(cd) - 4 and cd[p:p+4] == b"PK\x01\x02":
    meth = struct.unpack("<H", cd[p+10:p+12])[0]
    csize, usize = struct.unpack("<II", cd[p+20:p+28])
    nlen, elen, clen = struct.unpack("<HHH", cd[p+28:p+34])
    off = struct.unpack("<I", cd[p+42:p+46])[0]
    name = cd[p+46:p+46+nlen].decode("utf-8", "replace")
    extra = cd[p+46+nlen:p+46+nlen+elen]
    q = 0
    while q < len(extra) - 3:                        # zip64 扩展字段补真实偏移
        hid, hsz = struct.unpack("<HH", extra[q:q+4]); body = extra[q+4:q+4+hsz]; b = 0
        if hid == 1:
            if usize == 0xFFFFFFFF: usize = struct.unpack("<Q", body[b:b+8])[0]; b += 8
            if csize == 0xFFFFFFFF: csize = struct.unpack("<Q", body[b:b+8])[0]; b += 8
            if off   == 0xFFFFFFFF: off   = struct.unpack("<Q", body[b:b+8])[0]; b += 8
        q += 4 + hsz
    if name == entry:
        h = rng(off, off + 29)
        nl, el = struct.unpack("<HH", h[26:30])
        s = off + 30 + nl + el
        data = rng(s, s + csize - 1)
        if meth == 8: data = zlib.decompress(data, -15)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(data)
        print(f"    {os.path.basename(dest)}  {len(data)/1e6:.2f} MB（只传 {csize/1e6:.2f} MB）")
        sys.exit(0)
    p += 46 + nlen + elen + clen
sys.exit(f"条目未找到: {entry}")
PY
}
grab_clip() {   # <dest> <zip_url> <entry>
  local dest="$1"
  if [ "$FORCE" -eq 0 ] && is_mp4 "$dest"; then skip=$((skip+1)); return 0; fi
  [ "$CHECK_ONLY" -eq 1 ] && { say "  缺失 $(basename "$dest")"; fail=$((fail+1)); return 1; }
  if extract_from_remote_zip "$2" "$3" "$dest"; then ok=$((ok+1)); else
    say "  失败 $(basename "$dest")"; fail=$((fail+1)); fi
}

grab_clip "$HERE/clips/MA6GY.mp4" \
  "https://huggingface.co/datasets/jwnt4/charades-sta-test/resolve/main/videos_small.zip" "MA6GY.mp4"
grab_clip "$HERE/clips/5478970215.mp4" \
  "https://huggingface.co/datasets/lmms-lab/NExTQA/resolve/main/videos.zip" "NExTVideo/5478970215.mp4"

VGRB="https://huggingface.co/datasets/Ruihang/VideoGen-RewardBench/resolve/main/videos.zip"
for spec in \
  "vgrb_cog_102.mp4|videos/CogVideoX/Cog5B_00102.mp4" \
  "vgrb_kling_102.mp4|videos/kling1.5/kling1.5_00102.mp4" \
  "vgrb_easyanim_102.mp4|videos/easyanimatev4/Easyanimatev4_00102.mp4" \
  "vgrb_cog_103.mp4|videos/CogVideoX/Cog5B_00103.mp4" \
  "vgrb_opensora_103.mp4|videos/opensora1.2/OpenSora1.2_00103.mp4" ; do
  grab_clip "$HERE/clips/${spec%%|*}" "$VGRB" "${spec##*|}"
done

# 直链取自各数据集官方 csv 的 video_url 字段，逐条核对过，勿手写路径
for spec in \
  "videophy_ok.mp4|https://videophysics.s3.amazonaws.com/LaVIE/fluid_fluid/Honey_diffusing_into_warm_milk._1.mp4" \
  "videophy_sem_ok_phys_bad.mp4|https://videophysics.s3.amazonaws.com/vc2/fluid_fluid/Honey_diffusing_into_warm_milk_0.mp4" \
  "videophy_both_bad.mp4|https://videophysics.s3.amazonaws.com/OpenSora/solid_solid/Stamp_presses_into_the_ink_pad._1.mp4" \
  "videophy2_hammer.mp4|https://storage.cdn-luma.com/dream_machine/e9f85d1c-b458-43c4-aea5-2c5bc6c31a04/15d74bec-9e76-43bc-b943-ec3e2d571492_result.mp4" \
  "videophy2_paper.mp4|https://videophysics2testvideos.s3.us-east-2.amazonaws.com/wan_videophy2_test_hard_upsampled/A_hand_rips_a_sheet_of_printer_paper_in_half,_creating_a_jagged_tear.mp4" \
  "videophy2_longjump.mp4|https://videophysics2testvideos.s3.us-east-2.amazonaws.com/videocrafter_videophy2_hard/A_long_jump_is_captured_from_a_low_angle__the_jumper_s_body_creating_a_distinct_parabolic_curve_.mp4" \
  "vf_align_fail.mp4|$VFB/2/2002231.mp4" \
  "vf_factual_fail.mp4|$VFB/4/4001748.mp4" \
  "vf_static.mp4|$VFB/5/5000835.mp4" ; do
  fetch "${spec##*|}" "$HERE/clips/${spec%%|*}" is_mp4
done

# 组件用测试片随 chart-blocks 模板库分发，没有公开直链
CB="/mmu_mllm_hdd_4/deep-research/deep-research/skills/chart-blocks/templates/frame-annotation-modal"
for v in sample.mp4 sample-2.mp4; do
  if [ "$FORCE" -eq 0 ] && is_mp4 "$HERE/clips/$v"; then skip=$((skip+1)); continue; fi
  [ "$CHECK_ONLY" -eq 1 ] && { say "  缺失 $v"; fail=$((fail+1)); continue; }
  if [ -f "$CB/$v" ]; then cp "$CB/$v" "$HERE/clips/$v"; say "    $v  取自 chart-blocks"; ok=$((ok+1))
  else say "  失败 $v  <- chart-blocks 模板库里没有，需手动补"; fail=$((fail+1)); fi
done

# ────────────────────────── 5. 页面运行时 js/ + css/ ──────────────────────────
# build.py 把这三个文件原样内联进 index.html，页面因此不依赖任何 CDN。
hr; say "5/6  页面运行时 js/ + css/"
KV=0.16.9
fetch "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" "$HERE/js/marked.min.js" is_text
fetch "https://cdn.jsdelivr.net/npm/katex@$KV/dist/katex.min.js" "$HERE/js/katex.min.js" is_text
fetch "https://cdn.jsdelivr.net/npm/katex@$KV/dist/contrib/auto-render.min.js" "$HERE/js/katex-auto-render.min.js" is_text

# katex.selfcontained.css = katex.min.css + 20 个 woff2 字体 base64 内嵌
if [ "$FORCE" -eq 1 ] || ! is_text "$HERE/css/katex.selfcontained.css"; then
  if [ "$CHECK_ONLY" -eq 1 ]; then say "  缺失 katex.selfcontained.css"; fail=$((fail+1)); else
    tmp=$(mktemp -d); base="https://cdn.jsdelivr.net/npm/katex@$KV/dist"
    curl -sSL --max-time 90 -o "$tmp/katex.min.css" "$base/katex.min.css"
    grep -o 'fonts/KaTeX_[A-Za-z0-9]*-[A-Za-z0-9]*\.woff2' "$tmp/katex.min.css" | sort -u | while read -r rel; do
      mkdir -p "$tmp/fonts"; curl -sSL --max-time 90 -o "$tmp/$rel" "$base/$rel" 2>/dev/null
    done
    python3 - "$tmp" "$HERE/css/katex.selfcontained.css" <<'PY'
import base64, os, re, sys
d, out = sys.argv[1], sys.argv[2]
css = open(f"{d}/katex.min.css").read()
def sub(m):
    rel = m.group(1); p = os.path.join(d, rel)
    if not os.path.isfile(p): return m.group(0)
    b = base64.b64encode(open(p, "rb").read()).decode()
    return f'url(data:font/woff2;base64,{b})'
css = re.sub(r'url\((fonts/[^)]+\.woff2)\)', sub, css)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w").write(css)
print(f"    katex.selfcontained.css  {len(css)/1e6:.2f} MB（{css.count('base64')} 个字体内嵌）")
PY
    rm -rf "$tmp"; ok=$((ok+1))
  fi
else skip=$((skip+1)); fi

# ────────────────────────── 6. 随仓库分发（只校验） ──────────────────────────
hr; say "6/6  随仓库分发（是代码不是素材，只校验）"
check_count() {   # <dir> <期望个数> <说明>
  local n; n=$(find "$HERE/$1" -type f 2>/dev/null | wc -l)
  if [ "$n" -ge "$2" ]; then say "  ✓ $1  $n 个  —— $3"; skip=$((skip+1))
  else say "  ✗ $1  只有 $n 个（应 ≥ $2）—— $3，需从 git 恢复"; fail=$((fail+1)); fi
}
check_count demos   9  "surveys/ 内嵌的交互组件"

hr
say "完成：下载 $ok  跳过 $skip  失败 $fail"
say "素材总量：$(du -sh "$HERE" 2>/dev/null | cut -f1)"
[ "$fail" -eq 0 ] || exit 1

