import json
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import collector


REFRESH_LOCK = threading.Lock()
DATA_PATH = Path("data/latest.json")


class AppHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_refresh(self):
        if not REFRESH_LOCK.acquire(blocking=False):
            self._send_json({"ok": False, "error": "Odświeżanie już trwa."}, status=HTTPStatus.CONFLICT)
            return

        try:
            collector.run(out_path=str(DATA_PATH))
            generated_at = None
            if DATA_PATH.exists():
                with DATA_PATH.open("r", encoding="utf-8") as file:
                    generated_at = json.load(file).get("generated_at")
            self._send_json({"ok": True, "generated_at": generated_at})
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
        finally:
            REFRESH_LOCK.release()

    def do_POST(self):
        if self.path != "/api/refresh":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return
        self._handle_refresh()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/refresh":
            self._handle_refresh()
            return
        super().do_GET()


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", 8000), AppHandler)
    print("Serving at http://localhost:8000")
    httpd.serve_forever()
