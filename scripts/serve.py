#!/usr/bin/env python3
"""Local dev server: like `python3 -m http.server`, but tells the browser not to
cache anything, so edits to shared/*.js and shared/*.css show up on reload.

    python3 scripts/serve.py [port]      # default 8080
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Serving on http://localhost:{port} (no caching)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
