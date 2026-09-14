import hmac
import json
import os
import secrets
import threading
import time
import uuid
from collections import OrderedDict, defaultdict, deque
from datetime import timedelta
from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix


def required_environment(name, minimum_length=1):
    value = os.environ.get(name, "").strip()
    if len(value) < minimum_length:
        raise RuntimeError(f"{name} must be configured before the relay can start.")
    return value


APP_USERNAME = required_environment("APP_USERNAME", 3)
APP_PASSWORD = required_environment("APP_PASSWORD", 10)
FLASK_SECRET_KEY = required_environment("FLASK_SECRET_KEY", 32)
BRIDGE_TOKEN = required_environment("BRIDGE_TOKEN", 32)
BRIDGE_ONLINE_SECONDS = 20
JOB_TTL_SECONDS = 15 * 60
MAX_JOBS = 250

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config.update(
    SECRET_KEY=FLASK_SECRET_KEY,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1") != "0",
    MAX_CONTENT_LENGTH=256 * 1024,
)


class RelayState:
    def __init__(self):
        self.lock = threading.RLock()
        self.jobs = OrderedDict()
        self.bridge_seen_at = 0.0
        self.bridge_mode = "offline"
        self.bridge_version = None

    def cleanup(self):
        now = time.time()
        expired = [
            job_id
            for job_id, job in self.jobs.items()
            if now - job["created_at"] > JOB_TTL_SECONDS
        ]
        for job_id in expired:
            self.jobs.pop(job_id, None)
        while len(self.jobs) > MAX_JOBS:
            self.jobs.popitem(last=False)

    def touch_bridge(self, payload=None):
        self.bridge_seen_at = time.time()
        payload = payload or {}
        self.bridge_mode = str(payload.get("mode") or self.bridge_mode or "connected")[:40]
        self.bridge_version = str(payload.get("version") or self.bridge_version or "unknown")[:40]

    def bridge_online(self):
        return time.time() - self.bridge_seen_at <= BRIDGE_ONLINE_SECONDS


relay = RelayState()
submission_windows = defaultdict(deque)
login_windows = defaultdict(deque)


def csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def valid_csrf(value):
    expected = session.get("csrf_token", "")
    return bool(expected and value and hmac.compare_digest(expected, value))


def rate_allowed(bucket, key, limit, seconds):
    now = time.time()
    values = bucket[key]
    while values and now - values[0] > seconds:
        values.popleft()
    if len(values) >= limit:
        return False
    values.append(now)
    return True


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("user") != APP_USERNAME:
            if request.path.startswith("/api/"):
                return jsonify(error="Authentication required."), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def bridge_authorized():
    authorization = request.headers.get("Authorization", "")
    expected = f"Bearer {BRIDGE_TOKEN}"
    return hmac.compare_digest(authorization, expected)


def bridge_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not bridge_authorized():
            return jsonify(error="Bridge authentication failed."), 401
        return view(*args, **kwargs)

    return wrapped


@app.after_request
def security_headers(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    return response


@app.get("/healthz")
def healthz():
    return jsonify(ok=True)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        client_key = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0]
        if not rate_allowed(login_windows, client_key, 8, 5 * 60):
            error = "Too many attempts. Please wait before trying again."
        elif not valid_csrf(request.form.get("csrf_token", "")):
            error = "The login page expired. Please try again."
        else:
            username_ok = hmac.compare_digest(request.form.get("username", ""), APP_USERNAME)
            password_ok = hmac.compare_digest(request.form.get("password", ""), APP_PASSWORD)
            if username_ok and password_ok:
                session.clear()
                session["user"] = APP_USERNAME
                session["csrf_token"] = secrets.token_urlsafe(32)
                session.permanent = True
                return redirect(url_for("home"))
            time.sleep(0.35)
            error = "The username or password is incorrect."
    return render_template("login.html", csrf_token=csrf_token(), error=error)


@app.post("/logout")
@login_required
def logout():
    if not valid_csrf(request.form.get("csrf_token", "")):
        return "Invalid request", 400
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
@login_required
def home():
    return render_template("index.html", csrf_token=csrf_token(), username=APP_USERNAME)


@app.get("/relay-test")
@login_required
def relay_test():
    return render_template("relay_test.html", csrf_token=csrf_token(), username=APP_USERNAME)


@app.get("/api/health")
@login_required
def api_health():
    with relay.lock:
        online = relay.bridge_online()
        return jsonify(
            ok=True,
            intelligence="connected" if online else "unavailable",
            auth="Hosted demo login",
            scope="Connection-only relay demo" if relay.bridge_mode == "echo" else "Local intelligence relay",
            bridge={
                "online": online,
                "mode": relay.bridge_mode if online else "offline",
                "version": relay.bridge_version if online else None,
            },
            privacy={
                "browserSends": ["Current message", "Random browser session ID", "Visible demo workspace state"],
                "staysLocal": ["CMD EFS source files", "Retrieval indexes", "Codex sign-in credentials"],
                "retention": "Request removed when claimed; result removed after browser delivery.",
                "browserRetention": "Visible consultation state remains in the current browser until cleared.",
            },
            error=None if online else "The laptop bridge is offline.",
        )


@app.post("/api/jobs")
@login_required
def create_job():
    if not valid_csrf(request.headers.get("X-CSRF-Token", "")):
        return jsonify(error="The page session expired. Refresh and try again."), 403
    session_key = session.get("rate_key")
    if not session_key:
        session_key = secrets.token_urlsafe(18)
        session["rate_key"] = session_key
    if not rate_allowed(submission_windows, session_key, 8, 60):
        return jsonify(error="Please wait before submitting another request."), 429

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message") or "").strip()
    session_id = str(payload.get("sessionId") or "").strip()
    workspace_state = payload.get("workspaceState") or {}
    with relay.lock:
        bridge_online = relay.bridge_online()
        bridge_mode = relay.bridge_mode if bridge_online else "offline"
    if not bridge_online:
        return jsonify(error="The laptop bridge is offline. Start it before submitting."), 503
    if bridge_mode == "live" and payload.get("liveConsent") is not True:
        return jsonify(error="Acknowledge the live-data notice before submitting."), 400
    if not message or len(message) > 8000:
        return jsonify(error="Enter a message between 1 and 8,000 characters."), 400
    if not session_id or len(session_id) > 80:
        return jsonify(error="A valid browser session is required."), 400
    try:
        workspace_text = json.dumps(workspace_state, separators=(",", ":"))
    except (TypeError, ValueError):
        return jsonify(error="The workspace state is invalid."), 400
    if len(workspace_text) > 160000:
        return jsonify(error="The workspace state is too large."), 400

    job_id = uuid.uuid4().hex
    now = time.time()
    job = {
        "id": job_id,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "attempts": 0,
        "request": {
            "message": message,
            "sessionId": session_id,
            "workspaceState": workspace_state,
        },
        "bridge_mode": bridge_mode,
        "result": None,
        "error": None,
    }
    with relay.lock:
        relay.cleanup()
        relay.jobs[job_id] = job
    return jsonify(jobId=job_id, status="queued"), 202


@app.get("/api/jobs/<job_id>")
@login_required
def get_job(job_id):
    with relay.lock:
        relay.cleanup()
        job = relay.jobs.get(job_id)
        if not job:
            return jsonify(error="This demo job expired or was not found."), 404
        response = {
            "jobId": job["id"],
            "status": job["status"],
            "result": job["result"] if job["status"] == "complete" else None,
            "error": job["error"] if job["status"] == "failed" else None,
        }
        if job["status"] in {"complete", "failed"}:
            relay.jobs.pop(job_id, None)
    return jsonify(response)


@app.post("/bridge/heartbeat")
@bridge_required
def bridge_heartbeat():
    payload = request.get_json(silent=True) or {}
    with relay.lock:
        relay.touch_bridge(payload)
        relay.cleanup()
    return jsonify(ok=True)


@app.post("/bridge/claim")
@bridge_required
def bridge_claim():
    payload = request.get_json(silent=True) or {}
    with relay.lock:
        relay.touch_bridge(payload)
        relay.cleanup()
        now = time.time()
        for job in relay.jobs.values():
            if job["status"] == "processing" and now - job["updated_at"] > 5 * 60:
                job["status"] = "failed"
                job["error"] = "The laptop claimed this request but did not return a result in time. Submit it again."
            if job["status"] != "queued":
                continue
            job["status"] = "processing"
            job["updated_at"] = now
            job["attempts"] += 1
            request_payload = job["request"]
            job["request"] = None
            return jsonify(jobId=job["id"], request=request_payload)
    return "", 204


@app.post("/bridge/jobs/<job_id>/result")
@bridge_required
def bridge_result(job_id):
    payload = request.get_json(silent=True) or {}
    with relay.lock:
        relay.touch_bridge(payload.get("bridge") or {})
        job = relay.jobs.get(job_id)
        if not job:
            return jsonify(error="Job not found."), 404
        if payload.get("ok") is True:
            job["status"] = "complete"
            job["result"] = payload.get("result")
            job["error"] = None
        else:
            job["status"] = "failed"
            job["result"] = None
            job["error"] = str(payload.get("error") or "The local bridge could not complete the request.")[:1000]
        job["updated_at"] = time.time()
    return jsonify(ok=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)

