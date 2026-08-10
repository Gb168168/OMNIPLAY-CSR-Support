# -*- coding: utf-8 -*-
"""本地測試後端(dev only,絕不對外)——同時是給正式後端的「可執行 API 合約」。

用法:
    python dev-server/server.py            # 聽 http://localhost:4000
    python dev-server/server.py 5001       # 換 port

前端撥開關(瀏覽器 console):
    localStorage.setItem('csrApiBase', 'http://localhost:4000'); location.reload();

資料存在 dev-server/data/<collection>.json,測試帳號見 data/staff.json(首跑自動建立)。
API 合約詳見 README.md;正式後端(尚堉)照同樣的路徑/格式實作即可無縫切換。
"""
import json
import re
import secrets
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
LOCK = threading.Lock()
TOKENS = {}  # token -> staff id(記憶體;重啟即失效)

SEED_STAFF = [
    {"id": "devadmin000000000001", "account": "OMNIPLAY", "password": "dev123",
     "code": "OMNIPLAY", "name": "測試管理員", "status": "啟用"},
    {"id": "devuser0000000000002", "account": "tester", "password": "dev123",
     "code": "GB999999", "name": "測試客服", "status": "啟用"},
]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def coll_path(name):
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", name):
        raise ValueError("collection 名稱不合法")
    return DATA_DIR / f"{name}.json"


def load_coll(name):
    path = coll_path(name)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_coll(name, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    coll_path(name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def resolve_sentinels(value):
    """{"__serverTimestamp": true} → 伺服器當下時間(ISO 8601 字串)"""
    if isinstance(value, dict):
        if value.get("__serverTimestamp") is True:
            return now_iso()
        return {k: resolve_sentinels(v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_sentinels(v) for v in value]
    return value


def apply_patch(record, patch):
    """部分更新;key 含「.」= 巢狀欄位(Firestore update 的 field path 語意)"""
    for key, value in patch.items():
        if "." in key:
            parts = key.split(".")
            node = record
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = value
        else:
            record[key] = value
    return record


def gen_id():
    return secrets.token_hex(10)


class Handler(BaseHTTPRequestHandler):
    server_version = "CSRDevServer/1.0"

    # ---- helpers ----
    def _send(self, status, payload=None):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*") or "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _auth_staff_id(self):
        header = self.headers.get("Authorization") or ""
        if header.startswith("Bearer "):
            return TOKENS.get(header[7:])
        return None

    def log_message(self, fmt, *args):
        sys.stderr.write("[dev-server] %s\n" % (fmt % args))

    # ---- routing ----
    def do_OPTIONS(self):
        self._send(204)

    def do_POST(self):
        if self.path == "/api/auth/login":
            return self._login()
        self._csr("POST")

    def do_GET(self):
        self._csr("GET")

    def do_PUT(self):
        self._csr("PUT")

    def do_PATCH(self):
        self._csr("PATCH")

    def do_DELETE(self):
        self._csr("DELETE")

    # ---- auth ----
    def _login(self):
        try:
            body = self._body()
        except Exception:
            return self._send(400, {"error": "JSON 格式錯誤"})
        account = str(body.get("account") or "").strip()
        password = str(body.get("password") or "")
        with LOCK:
            staff_map = load_coll("staff")
        match = next((dict(v, id=k) for k, v in staff_map.items()
                      if str(v.get("account") or "").lower() == account.lower()), None)
        if not match or str(match.get("password") or "") != password:
            return self._send(401, {"error": "帳號或密碼錯誤"})
        if match.get("status") == "停用":
            return self._send(403, {"error": "帳號已停用"})
        token = secrets.token_urlsafe(32)
        TOKENS[token] = match["id"]
        return self._send(200, {"token": token, "staff": {
            "id": match["id"], "code": match.get("code", ""),
            "name": match.get("name", ""), "account": match.get("account", "")}})

    # ---- /api/csr/<collection>[/<id>] ----
    def _csr(self, method):
        m = re.fullmatch(r"/api/csr/([A-Za-z0-9_\-]+)(?:/([^/?]+))?", self.path.split("?")[0])
        if not m:
            return self._send(404, {"error": "路徑不存在"})
        if not self._auth_staff_id():
            return self._send(401, {"error": "未登入或 token 失效"})
        name, doc_id = m.group(1), m.group(2)
        try:
            with LOCK:
                coll = load_coll(name)
                if method == "GET" and doc_id is None:
                    return self._send(200, [dict(v, id=k) for k, v in coll.items()])
                if method == "GET":
                    if doc_id not in coll:
                        return self._send(404, {"error": "文件不存在"})
                    return self._send(200, dict(coll[doc_id], id=doc_id))
                if method == "POST" and doc_id is None:
                    new_id = gen_id()
                    coll[new_id] = resolve_sentinels(self._body())
                    save_coll(name, coll)
                    return self._send(200, {"id": new_id})
                if method == "PUT" and doc_id:
                    coll[doc_id] = resolve_sentinels(self._body())
                    save_coll(name, coll)
                    return self._send(200, {"id": doc_id})
                if method == "PATCH" and doc_id:
                    if doc_id not in coll:
                        return self._send(404, {"error": "文件不存在"})
                    coll[doc_id] = apply_patch(coll[doc_id], resolve_sentinels(self._body()))
                    save_coll(name, coll)
                    return self._send(200, {"id": doc_id})
                if method == "DELETE" and doc_id:
                    coll.pop(doc_id, None)
                    save_coll(name, coll)
                    return self._send(204)
        except ValueError as error:
            return self._send(400, {"error": str(error)})
        except json.JSONDecodeError:
            return self._send(400, {"error": "JSON 格式錯誤"})
        return self._send(405, {"error": "方法不支援"})


def seed():
    with LOCK:
        if not coll_path("staff").exists():
            save_coll("staff", {row["id"]: {k: v for k, v in row.items() if k != "id"} for row in SEED_STAFF})
            print("已建立測試帳號:OMNIPLAY / dev123(管理員)、tester / dev123")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    seed()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"CSR dev server: http://localhost:{port}(只聽 localhost,Ctrl+C 停止)")
    server.serve_forever()


if __name__ == "__main__":
    main()
