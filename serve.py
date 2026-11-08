#!/usr/bin/env python3
"""site-2 的静态服务器。比 python -m http.server 多三件事:

  1. Range/206 —— http.server 收到 Range 直接回 200 + 全量 Content-Length,
     于是每拖一次进度条就重下整个视频 (中位 7.5MB, 最大 35MB)。这是最痛的。
  2. ETag + 304 —— 帧图/视频反复看时不重传。
  3. 少量并发调优 + 正确 MIME。

素材在 NFS 上 (open+read 中位 2ms / p90 24ms), 所以用线程池扛并发就够,
不需要 aio。

    python serve.py --port 9930
"""
import argparse, os, re, socketserver
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")

MIME = {
    ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".json": "application/json; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
}


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"          # 没这个 keep-alive 不生效

    def log_message(self, fmt, *a):
        pass                               # 十万级素材, 逐条 log 反而拖慢

    def guess_type(self, path):
        return MIME.get(Path(path).suffix.lower(), "application/octet-stream")

    def _etag(self, st):
        return f'"{st.st_mtime_ns:x}-{st.st_size:x}"'

    def send_head(self):
        """SimpleHTTPRequestHandler 不认 Range, 整个重写。"""
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for idx in ("index.html",):
                if os.path.exists(os.path.join(path, idx)):
                    path = os.path.join(path, idx)
                    break
            else:
                return super().send_head()

        try:
            f = open(path, "rb")
            st = os.fstat(f.fileno())
        except OSError:
            self.send_error(404, "Not Found")
            return None

        etag = self._etag(st)
        ctype = self.guess_type(path)

        # 条件请求: 素材是硬链接的不可变文件, 命中率很高
        if self.headers.get("If-None-Match") == etag:
            f.close()
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        rng = self.headers.get("Range")
        m = RANGE_RE.match(rng.strip()) if rng else None
        if m:
            lo_s, hi_s = m.group(1), m.group(2)
            size = st.st_size
            if lo_s:
                lo = int(lo_s)
                hi = int(hi_s) if hi_s else size - 1
            else:
                # bytes=-N  取末尾 N 字节 (播放器探 moov 时会用)
                n = int(hi_s or 0)
                lo, hi = max(0, size - n), size - 1
            hi = min(hi, size - 1)
            if lo > hi or lo >= size:
                f.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            f.seek(lo)
            self._remain = hi - lo + 1
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Range", f"bytes {lo}-{hi}/{size}")
            self.send_header("Content-Length", str(self._remain))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            return f

        self._remain = st.st_size
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(st.st_size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", self.date_time_string(int(st.st_mtime)))
        # data/*.json 会随扩量重新生成, 不能强缓存; 素材是不可变的
        if ctype.startswith("application/json") or path.endswith((".js", ".css", ".html")):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        return f

    def copyfile(self, src, dst):
        """只发 _remain 个字节 —— 206 的时候不能把文件剩余部分全倒出去。"""
        remain = getattr(self, "_remain", None)
        if remain is None:
            return super().copyfile(src, dst)
        buf = 256 * 1024
        while remain > 0:
            chunk = src.read(min(buf, remain))
            if not chunk:
                break
            try:
                dst.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break                      # 用户拖进度条/切走了, 正常
            remain -= len(chunk)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9930)
    ap.add_argument("--root", default=str(Path(__file__).parent))
    a = ap.parse_args()
    os.chdir(a.root)
    srv = Server(("0.0.0.0", a.port), Handler)
    print(f"serving {a.root} on :{a.port}  (Range/206 + ETag)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    raise SystemExit(main())

