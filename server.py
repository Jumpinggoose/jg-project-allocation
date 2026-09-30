#!/usr/bin/env python3
"""Cloud-ready server for the JG Project Allocation application.

Features:
- Shared JSON persistence with atomic writes and rotating backups
- Optimistic revision checks to prevent silent concurrent overwrites
- Email/password login with Admin, Editor, and Viewer roles
- Secure session cookies and basic login rate limiting
- Render-compatible host, port, and persistent-disk configuration

Required production environment variable:
    JG_USERS_JSON

Example value:
[
  {"email":"theo@example.com","name":"Theo","role":"admin","password":"use-a-strong-password"},
  {"email":"apeksha@example.com","name":"Apeksha","role":"editor","password":"use-another-strong-password"}
]
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sys
import tempfile
import threading
import time
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("JG_DATA_DIR", str(BASE_DIR))).expanduser().resolve()
DATA_FILE = DATA_DIR / "data.json"
BACKUP_DIR = DATA_DIR / "backups"
AUDIT_FILE = DATA_DIR / "audit.jsonl"
INITIAL_DATA_FILE = BASE_DIR / "initial-data.json"

MAX_DATA_BODY_BYTES = 5 * 1024 * 1024
MAX_LOGIN_BODY_BYTES = 32 * 1024
MAX_BACKUPS = max(5, int(os.environ.get("JG_MAX_BACKUPS", "50")))
SESSION_HOURS = max(1, int(os.environ.get("JG_SESSION_HOURS", "12")))
SESSION_TTL_SECONDS = SESSION_HOURS * 60 * 60
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_ATTEMPT_LIMIT = 8
SESSION_COOKIE_NAME = "jg_session"

DATA_LOCK = threading.Lock()
SESSION_LOCK = threading.Lock()
LOGIN_LOCK = threading.Lock()
SESSIONS: dict[str, dict[str, Any]] = {}
LOGIN_ATTEMPTS: dict[str, list[float]] = {}

PUBLIC_PATHS = {
    "/login.html",
    "/login.css",
    "/login.js",
    "/icon.svg",
    "/manifest.json",
}
BLOCKED_PATHS = {
    "/data.json",
    "/initial-data.json",
    "/server.py",
    "/render.yaml",
    "/.gitignore",
    "/README.md",
    "/DEPLOYMENT_GUIDE.md",
    "/USER_ACCOUNTS_TEMPLATE.json",
}
ALLOWED_ROLES = {"admin", "editor", "viewer"}


class RevisionConflict(RuntimeError):
    def __init__(self, current: dict[str, Any]) -> None:
        super().__init__("The shared data changed after this page was loaded.")
        self.current = current


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def load_users() -> dict[str, dict[str, str]]:
    raw = os.environ.get("JG_USERS_JSON", "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"WARNING: JG_USERS_JSON is not valid JSON: {exc}", file=sys.stderr)
        return {}

    if not isinstance(parsed, list):
        print("WARNING: JG_USERS_JSON must be a JSON array.", file=sys.stderr)
        return {}

    users: dict[str, dict[str, str]] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email", "")).strip().lower()
        name = str(item.get("name", "")).strip() or email
        role = str(item.get("role", "editor")).strip().lower()
        password = str(item.get("password", ""))
        password_hash = str(item.get("passwordHash", ""))
        active = item.get("active", True) is not False

        if not active or not email or "@" not in email or role not in ALLOWED_ROLES:
            continue
        if not password and not password_hash:
            continue

        users[email] = {
            "email": email,
            "name": name,
            "role": role,
            "password": password,
            "passwordHash": password_hash,
        }
    return users


USERS = load_users()


def verify_password(candidate: str, user: dict[str, str]) -> bool:
    stored_hash = user.get("passwordHash", "")
    if stored_hash:
        # Supported format: pbkdf2_sha256$260000$salt_hex$digest_hex
        try:
            algorithm, iterations_text, salt_hex, digest_hex = stored_hash.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            iterations = int(iterations_text)
            calculated = hashlib.pbkdf2_hmac(
                "sha256",
                candidate.encode("utf-8"),
                bytes.fromhex(salt_hex),
                iterations,
            ).hex()
            return hmac.compare_digest(calculated, digest_hex)
        except (TypeError, ValueError):
            return False

    return hmac.compare_digest(candidate, user.get("password", ""))


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        shutil.copyfile(INITIAL_DATA_FILE, DATA_FILE)


def _read_data_unlocked() -> dict[str, Any]:
    ensure_storage()
    try:
        with DATA_FILE.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not read shared data: {exc}") from exc

    if not isinstance(data, dict):
        raise RuntimeError("Shared data must contain a JSON object")
    data.setdefault("revision", 0)
    return data


def read_data() -> dict[str, Any]:
    with DATA_LOCK:
        return _read_data_unlocked()


def validate_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object")
    if not isinstance(data.get("members"), list):
        raise ValueError("members must be an array")
    if not isinstance(data.get("projects"), list):
        raise ValueError("projects must be an array")
    if len(data["members"]) > 1000 or len(data["projects"]) > 10000:
        raise ValueError("Data exceeds the supported size")
    return data


def create_backup(current: dict[str, Any]) -> None:
    revision = safe_int(current.get("revision"), 0)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = BACKUP_DIR / f"data-r{revision:06d}-{stamp}.json"
    try:
        with backup_path.open("w", encoding="utf-8") as handle:
            json.dump(current, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
    except OSError as exc:
        print(f"WARNING: Could not create backup: {exc}", file=sys.stderr)
        return

    backups = sorted(BACKUP_DIR.glob("data-r*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for old_path in backups[MAX_BACKUPS:]:
        try:
            old_path.unlink()
        except OSError:
            pass


def append_audit(user: dict[str, str], saved: dict[str, Any]) -> None:
    event = {
        "time": saved.get("meta", {}).get("lastUpdated", utc_now_iso()),
        "revision": safe_int(saved.get("revision"), 0),
        "user": {
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "role": user.get("role", ""),
        },
        "projectCount": len(saved.get("projects", [])),
        "memberCount": len(saved.get("members", [])),
    }
    try:
        with AUDIT_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError as exc:
        print(f"WARNING: Could not append audit record: {exc}", file=sys.stderr)


def write_data(data: dict[str, Any], user: dict[str, str]) -> dict[str, Any]:
    ensure_storage()
    with DATA_LOCK:
        current = _read_data_unlocked()
        current_revision = safe_int(current.get("revision"), 0)
        expected_revision = safe_int(data.get("revision"), 0)
        if expected_revision != current_revision:
            raise RevisionConflict(current)

        create_backup(current)

        clean = dict(data)
        clean["revision"] = current_revision + 1
        meta = clean.get("meta") if isinstance(clean.get("meta"), dict) else {}
        meta["lastUpdated"] = utc_now_iso()
        meta["lastUpdatedBy"] = {
            "email": user.get("email", ""),
            "name": user.get("name", ""),
        }
        clean["meta"] = meta

        fd, temp_name = tempfile.mkstemp(prefix="jg-data-", suffix=".json", dir=DATA_DIR)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(clean, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, DATA_FILE)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

        append_audit(user, clean)
        return clean


def cleanup_sessions() -> None:
    now = time.time()
    expired = [token for token, session in SESSIONS.items() if float(session.get("expiresAt", 0)) <= now]
    for token in expired:
        SESSIONS.pop(token, None)


def create_session(user: dict[str, str]) -> str:
    token = secrets.token_urlsafe(32)
    with SESSION_LOCK:
        cleanup_sessions()
        SESSIONS[token] = {
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "expiresAt": time.time() + SESSION_TTL_SECONDS,
        }
    return token


def get_session_from_cookie(cookie_header: str | None) -> tuple[str | None, dict[str, Any] | None]:
    if not cookie_header:
        return None, None
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
    except Exception:
        return None, None
    morsel = cookie.get(SESSION_COOKIE_NAME)
    if not morsel:
        return None, None
    token = morsel.value
    with SESSION_LOCK:
        cleanup_sessions()
        session = SESSIONS.get(token)
        if not session:
            return token, None
        return token, dict(session)


def delete_session(token: str | None) -> None:
    if not token:
        return
    with SESSION_LOCK:
        SESSIONS.pop(token, None)


def client_ip(headers: Any, fallback: str) -> str:
    forwarded = str(headers.get("X-Forwarded-For", "")).split(",", 1)[0].strip()
    return forwarded or fallback


def login_allowed(ip: str) -> bool:
    now = time.time()
    with LOGIN_LOCK:
        attempts = [stamp for stamp in LOGIN_ATTEMPTS.get(ip, []) if now - stamp < LOGIN_WINDOW_SECONDS]
        LOGIN_ATTEMPTS[ip] = attempts
        return len(attempts) < LOGIN_ATTEMPT_LIMIT


def record_login_failure(ip: str) -> None:
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS.setdefault(ip, []).append(time.time())


def clear_login_failures(ip: str) -> None:
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS.pop(ip, None)


class JGHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class JGHandler(SimpleHTTPRequestHandler):
    server_version = "JGAllocation/1.4"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
            "base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
        )
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def current_session(self) -> tuple[str | None, dict[str, Any] | None]:
        return get_session_from_cookie(self.headers.get("Cookie"))

    def require_auth(self, *, write: bool = False) -> dict[str, Any] | None:
        _token, session = self.current_session()
        if not session:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Authentication required"})
            return None
        if write and session.get("role") not in {"admin", "editor"}:
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "This account has view-only access"})
            return None
        return session

    def read_json_body(self, max_bytes: int) -> Any:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if content_length <= 0:
            raise ValueError("Request body is empty")
        if content_length > max_bytes:
            raise OverflowError("Request body is too large")
        try:
            return json.loads(self.rfile.read(content_length).decode("utf-8"))
        except UnicodeDecodeError as exc:
            raise ValueError("Request body must be UTF-8") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("Request body must be valid JSON") from exc

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "time": utc_now_iso(),
                    "authConfigured": bool(USERS),
                    "storage": str(DATA_DIR),
                },
            )
            return

        if path == "/api/session":
            _token, session = self.current_session()
            if not session:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"authenticated": False})
                return
            self.send_json(
                HTTPStatus.OK,
                {
                    "authenticated": True,
                    "user": {
                        "email": session.get("email", ""),
                        "name": session.get("name", ""),
                        "role": session.get("role", "viewer"),
                    },
                },
            )
            return

        if path == "/api/data":
            if not self.require_auth():
                return
            try:
                self.send_json(HTTPStatus.OK, {"data": read_data()})
            except RuntimeError as exc:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return

        if path.startswith("/api/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if path in BLOCKED_PATHS or path.startswith("/backups/") or path == "/audit.jsonl":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        _token, session = self.current_session()
        if path in {"/", "/index.html"}:
            if not session:
                self.send_redirect("/login.html")
                return
            self.path = "/index.html"
            super().do_GET()
            return

        if path == "/login.html" and session:
            self.send_redirect("/")
            return

        if path not in PUBLIC_PATHS and not session:
            self.send_redirect("/login.html")
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path == "/api/login":
            ip = client_ip(self.headers, self.client_address[0])
            if not login_allowed(ip):
                self.send_json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "Too many login attempts. Try again later."})
                return
            if not USERS:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "User accounts have not been configured."})
                return
            try:
                payload = self.read_json_body(MAX_LOGIN_BODY_BYTES)
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be an object")
                email = str(payload.get("email", "")).strip().lower()
                password = str(payload.get("password", ""))
            except OverflowError as exc:
                self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": str(exc)})
                return
            except ValueError as exc:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
                return

            user = USERS.get(email)
            if not user or not verify_password(password, user):
                record_login_failure(ip)
                time.sleep(0.25)
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Email or password is incorrect."})
                return

            clear_login_failures(ip)
            token = create_session(user)
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "user": {"email": user["email"], "name": user["name"], "role": user["role"]},
                },
                cookie_token=token,
            )
            return

        if path == "/api/logout":
            token, _session = self.current_session()
            delete_session(token)
            self.send_json(HTTPStatus.OK, {"ok": True}, clear_cookie=True)
            return

        self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_PUT(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/data":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        session = self.require_auth(write=True)
        if not session:
            return

        try:
            payload = self.read_json_body(MAX_DATA_BODY_BYTES)
            saved = write_data(validate_data(payload), session)
        except OverflowError as exc:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": str(exc)})
            return
        except (ValueError, TypeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        except RevisionConflict as exc:
            self.send_json(
                HTTPStatus.CONFLICT,
                {
                    "error": str(exc),
                    "data": exc.current,
                },
            )
            return
        except (OSError, RuntimeError) as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Save failed: {exc}"})
            return

        self.send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "revision": saved["revision"],
                "lastUpdated": saved["meta"]["lastUpdated"],
                "lastUpdatedBy": saved["meta"].get("lastUpdatedBy"),
            },
        )

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Allow", "GET, POST, PUT, OPTIONS")
        self.end_headers()

    def send_redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_json(
        self,
        status: HTTPStatus,
        payload: dict[str, Any],
        *,
        cookie_token: str | None = None,
        clear_cookie: bool = False,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))

        if cookie_token:
            secure = os.environ.get("JG_SECURE_COOKIES", "").lower() in {"1", "true", "yes"} or bool(os.environ.get("RENDER"))
            cookie_parts = [
                f"{SESSION_COOKIE_NAME}={cookie_token}",
                "Path=/",
                "HttpOnly",
                "SameSite=Strict",
                f"Max-Age={SESSION_TTL_SECONDS}",
            ]
            if secure:
                cookie_parts.append("Secure")
            self.send_header("Set-Cookie", "; ".join(cookie_parts))
        elif clear_cookie:
            secure = os.environ.get("JG_SECURE_COOKIES", "").lower() in {"1", "true", "yes"} or bool(os.environ.get("RENDER"))
            cookie_parts = [
                f"{SESSION_COOKIE_NAME}=",
                "Path=/",
                "HttpOnly",
                "SameSite=Strict",
                "Max-Age=0",
            ]
            if secure:
                cookie_parts.append("Secure")
            self.send_header("Set-Cookie", "; ".join(cookie_parts))

        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    default_host = "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1"
    parser = argparse.ArgumentParser(description="Run the JG Project Allocation web app")
    parser.add_argument("--host", default=os.environ.get("HOST", default_host), help="Host/IP to bind")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="Port to use")
    parser.add_argument("--open", action="store_true", help="Open the app in the default browser")
    args = parser.parse_args()

    ensure_storage()
    server = JGHTTPServer((args.host, args.port), JGHandler)
    display_host = "localhost" if args.host in {"127.0.0.1", "0.0.0.0"} else args.host
    url = f"http://{display_host}:{args.port}"

    print("\nJG Project Allocation is running")
    print(f"Open: {url}")
    print(f"Storage: {DATA_DIR}")
    print(f"Configured users: {len(USERS)}")
    if not USERS:
        print("WARNING: No login accounts are configured. Set JG_USERS_JSON.")
    print("Press Ctrl+C to stop.\n")

    if args.open:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
