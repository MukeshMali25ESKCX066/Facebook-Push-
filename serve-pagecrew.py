from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BACKEND = "http://127.0.0.1:4000"
FRONTEND = Path(__file__).resolve().parent / "frontend" / "public"


class PageCrewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy()
            return
        route = urlsplit(self.path)
        if route.path.rstrip("/") == "/advanced-hybrid":
            self.path = "/advanced-hybrid.html" + (f"?{route.query}" if route.query else "")
        requested = (FRONTEND / urlsplit(self.path).path.lstrip("/")).resolve()
        if not requested.is_relative_to(FRONTEND.resolve()) or not requested.is_file():
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy()
            return
        self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.proxy()
            return
        self.send_error(404)

    def do_PATCH(self):
        if self.path.startswith("/api/"):
            self.proxy()
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.proxy()
            return
        self.send_error(404)

    def proxy(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else None
        request = Request(
            BACKEND + self.path,
            data=body,
            method=self.command,
            headers={
                key: value
                for key, value in self.headers.items()
                if key.lower() not in {"host", "content-length", "connection"}
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                data = response.read()
                self.send_response(response.status)
                for key, value in response.headers.items():
                    if key.lower() not in {"connection", "content-length", "transfer-encoding"}:
                        self.send_header(key, value)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as error:
            data = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except URLError as error:
            self.send_error(502, str(error.reason))


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 5173), PageCrewHandler).serve_forever()
