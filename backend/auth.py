import hmac
import os
import re
import secrets
import time
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from backend.database import get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "teleclone_dev_secret_change_on_railway_99182")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days
OTP_TTL_SECONDS = 300  # 5 minutes
ALLOW_DEMO_OTP = os.getenv("ALLOW_DEMO_OTP", "true").lower() == "true"

AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #11998e, #38ef7d)",
    "linear-gradient(135deg, #3390ec, #6c5ce7)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #f7971e, #ffd200)",
    "linear-gradient(135deg, #0984e3, #00cec9)",
]


# ==================== REQUEST SCHEMAS ====================
class OtpRequest(BaseModel):
    phone: str


class OtpVerifyRequest(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None
    username: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None


# ==================== HELPERS ====================
def normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", (phone or "").strip())
    if not cleaned.startswith("+") and len(cleaned) >= 10:
        cleaned = "+" + cleaned
    if len(cleaned) < 8 or len(cleaned) > 16:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number (e.g. +923001234567)")
    return cleaned


def clean_username(raw: str) -> str:
    u = re.sub(r"[^a-zA-Z0-9_]", "", (raw or "").strip().lstrip("@"))
    if len(u) < 4 or len(u) > 32:
        raise HTTPException(status_code=400, detail="Username must be 4 to 32 characters (letters, numbers, or _)")
    return u


def make_initials(name: str) -> str:
    parts = [w[0] for w in (name or "U").strip().split() if w]
    return "".join(parts).upper()[:2] or "U"


def serialize_user(row) -> dict:
    return {
        "id": row["id"],
        "phone": row["phone"] or "",
        "username": "@" + row["username"].lstrip("@"),
        "name": row["name"],
        "initials": make_initials(row["name"]),
        "bio": row["bio"] or "",
        "avatarColor": row["avatar_color"],
        "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() and row["avatar_url"] else "",
        "isBot": bool(row["is_bot"]),
        "verified": bool(row["verified"]),
        "lastSeen": row["last_seen"],
    }


def create_jwt_token(user_id: int) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except Exception:
        return None


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login required")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        return serialize_user(row)
    finally:
        conn.close()


def setup_starter_chats(conn, user_id: int):
    """Creates Saved Messages and @BotFather starter chats for a new user."""
    now = int(time.time())
    cur = conn.cursor()

    # 1. Saved Messages
    cur.execute(
        """
        INSERT INTO chats (type, title, username, description, avatar_color, created_by, created_at)
        VALUES ('saved', 'Saved Messages', NULL, 'Your personal cloud storage',
                'linear-gradient(135deg, #2b86c5, #4facfe)', ?, ?)
        """,
        (user_id, now),
    )
    saved_chat_id = cur.lastrowid
    cur.execute(
        """
        INSERT INTO chat_members (chat_id, user_id, role, pinned, joined_at)
        VALUES (?, ?, 'owner', 1, ?)
        """,
        (saved_chat_id, user_id, now),
    )

    # 2. Official @BotFather Chat
    bf = cur.execute("SELECT id FROM users WHERE LOWER(username) = 'botfather'").fetchone()
    if bf:
        bf_id = bf["id"]
        cur.execute(
            """
            INSERT INTO chats (type, title, username, description, avatar_color, created_by, created_at)
            VALUES ('bot', 'BotFather', NULL, 'Official bot creation & management',
                    'linear-gradient(135deg, #3390ec, #6c5ce7)', ?, ?)
            """,
            (bf_id, now),
        )
        bf_chat_id = cur.lastrowid
        cur.execute(
            """
            INSERT INTO chat_members (chat_id, user_id, role, pinned, unread_count, joined_at)
            VALUES (?, ?, 'member', 1, 1, ?)
            """,
            (bf_chat_id, user_id, now),
        )
        cur.execute(
            """
            INSERT INTO chat_members (chat_id, user_id, role, joined_at)
            VALUES (?, ?, 'owner', ?)
            """,
            (bf_chat_id, bf_id, now),
        )
        cur.execute(
            """
            INSERT INTO messages (chat_id, sender_id, text, status, created_at)
            VALUES (?, ?, ?, 'sent', ?)
            """,
            (
                bf_chat_id,
                bf_id,
                "Welcome to TeleClone! Main **@BotFather** hoon.\n"
                "Send `/newbot` to create your own bot and HTTP API token.",
                now,
            ),
        )


# ==================== ENDPOINTS ====================
@router.post("/request-otp")
def request_otp(body: OtpRequest):
    phone = normalize_phone(body.phone)
    code = f"{secrets.randbelow(90000) + 10000}"  # 5-digit secure OTP
    now = int(time.time())
    expires_at = now + OTP_TTL_SECONDS

    conn = get_conn()
    try:
        # Purane unused OTPs invalidate kar dein
        conn.execute("UPDATE otp_codes SET used = 1 WHERE phone = ? AND used = 0", (phone,))
        conn.execute(
            "INSERT INTO otp_codes (phone, code, expires_at, used) VALUES (?, ?, ?, 0)",
            (phone, code, expires_at),
        )
        existing = conn.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone()
        conn.commit()
    finally:
        conn.close()

    resp = {
        "ok": True,
        "phone": phone,
        "isNewUser": existing is None,
        "expiresIn": OTP_TTL_SECONDS,
    }
    if ALLOW_DEMO_OTP:
        resp["demoOtp"] = code
    return resp


@router.post("/verify-otp")
def verify_otp(body: OtpVerifyRequest):
    phone = normalize_phone(body.phone)
    submitted_code = (body.code or "").strip()
    now = int(time.time())

    conn = get_conn()
    try:
        otp_row = conn.execute(
            """
            SELECT * FROM otp_codes
            WHERE phone = ? AND used = 0 AND expires_at >= ?
            ORDER BY id DESC LIMIT 1
            """,
            (phone, now),
        ).fetchone()

        if not otp_row or not hmac.compare_digest(otp_row["code"], submitted_code):
            raise HTTPException(status_code=400, detail="Invalid ya expired OTP code")

        user_row = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()

        # Agar naya user hai aur name abhi nahi bheja gaya to registration step mangwayein
        if not user_row and not (body.name and body.name.strip()):
            return {
                "ok": True,
                "needsRegistration": True,
                "phone": phone,
            }

        # OTP ko single-use mark karein
        conn.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (otp_row["id"],))

        if user_row:
            conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now, user_row["id"]))
            conn.commit()
            updated_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
            token = create_jwt_token(updated_row["id"])
            return {"ok": True, "token": token, "user": serialize_user(updated_row)}

        # Naya account create karein
        display_name = body.name.strip()[:64]
        if body.username and body.username.strip():
            uname = clean_username(body.username)
        else:
            base = re.sub(r"[^a-zA-Z0-9]", "", display_name.lower())[:12] or "user"
            uname = f"{base}_{secrets.randbelow(9000) + 1000}"

        taken = conn.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (uname,)).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="This @username is already taken")

        color = AVATAR_GRADIENTS[secrets.randbelow(len(AVATAR_GRADIENTS))]
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (phone, username, name, bio, avatar_color, is_bot, last_seen, created_at)
            VALUES (?, ?, ?, '', ?, 0, ?, ?)
            """,
            (phone, uname, display_name, color, now, now),
        )
        new_user_id = cur.lastrowid

        setup_starter_chats(conn, new_user_id)
        conn.commit()

        new_row = conn.execute("SELECT * FROM users WHERE id = ?", (new_user_id,)).fetchone()
        token = create_jwt_token(new_user_id)
        return {"ok": True, "token": token, "user": serialize_user(new_row)}
    finally:
        conn.close()


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"ok": True, "user": user}


class PrivacyUpdateRequest(BaseModel):
    phonePrivacy: str = "everybody"

@router.put("/profile")
def update_profile(body: ProfileUpdateRequest, user: dict = Depends(get_current_user)):
    conn = get_conn()


def ensure_privacy_column(conn):
    try:
        conn.execute("ALTER TABLE users ADD COLUMN phone_privacy TEXT DEFAULT 'everybody'")
        conn.commit()
    except Exception:
        pass


def can_view_phone(conn, target_user_id: int, viewer_user_id: int) -> bool:
    if not target_user_id or int(target_user_id) == int(viewer_user_id):
        return True
    ensure_privacy_column(conn)
    row = conn.execute(
        "SELECT phone_privacy FROM users WHERE id = ?",
        (target_user_id,),
    ).fetchone()
    setting = (row["phone_privacy"] if row and row["phone_privacy"] else "everybody").lower()
    if setting == "nobody":
        return False
    if setting == "contacts":
        try:
            in_contacts = conn.execute(
                "SELECT 1 FROM contacts WHERE user_id = ? AND contact_user_id = ? LIMIT 1",
                (target_user_id, viewer_user_id),
            ).fetchone()
            return bool(in_contacts)
        except Exception:
            return False
    return True


@router.get("/privacy")
def get_privacy_settings(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_privacy_column(conn)
        row = conn.execute(
            "SELECT phone_privacy FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        val = (row["phone_privacy"] if row and row["phone_privacy"] else "everybody").lower()
        return {"ok": True, "phonePrivacy": val}
    finally:
        conn.close()


@router.put("/privacy")
def update_privacy_settings(body: PrivacyUpdateRequest, user: dict = Depends(get_current_user)):
    val = (body.phonePrivacy or "everybody").strip().lower()
    if val not in {"everybody", "contacts", "nobody"}:
        raise HTTPException(status_code=400, detail="Invalid privacy option")
    conn = get_conn()
    try:
        ensure_privacy_column(conn)
        conn.execute(
            "UPDATE users SET phone_privacy = ? WHERE id = ?",
            (val, user["id"]),
        )
        conn.commit()
        return {"ok": True, "phonePrivacy": val}
    finally:
        conn.close()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        new_name = (body.name.strip()[:64] if body.name and body.name.strip() else row["name"])
        new_bio = (body.bio.strip()[:160] if body.bio is not None else row["bio"])
        new_username = row["username"]

        if body.username and body.username.strip():
            candidate = clean_username(body.username)
            conflict = conn.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
                (candidate, user["id"]),
            ).fetchone()
            if conflict:
                raise HTTPException(status_code=409, detail="This @username is already taken")
            new_username = candidate

        conn.execute(
            "UPDATE users SET name = ?, username = ?, bio = ? WHERE id = ?",
            (new_name, new_username, new_bio, user["id"]),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        return {"ok": True, "user": serialize_user(updated)}
    finally:
        conn.close()

        # ==================== GOOGLE OAUTH (NO-OTP PHONE SIGNUP) ====================
import json
import urllib.error
import urllib.parse
import urllib.request
from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")


class GoogleCompleteRequest(BaseModel):
    setupToken: str
    name: str
    phone: str
    username: Optional[str] = None


def ensure_google_auth_schema(conn):
    for stmt in [
        "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN google_sub TEXT",
        "ALTER TABLE users ADD COLUMN email TEXT",
    ]:
        try:
            conn.execute(stmt)
        except Exception:
            pass

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS google_auth_sessions (
            sid TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            payload_json TEXT DEFAULT '{}',
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()


def get_public_base_url(request: Request) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    return f"{proto}://{host}"


def save_google_session(conn, sid: str, status: str, payload: dict):
    now = int(time.time())
    conn.execute("DELETE FROM google_auth_sessions WHERE created_at < ?", (now - 900,))
    conn.execute(
        """
        INSERT INTO google_auth_sessions (sid, status, payload_json, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET status = excluded.status, payload_json = excluded.payload_json, created_at = excluded.created_at
        """,
        (sid, status, json.dumps(payload), now),
    )
    conn.commit()


def create_google_setup_token(google_sub: str, email: str, name: str, picture: str) -> str:
    now = int(time.time())
    payload = {
        "purpose": "google_setup",
        "google_sub": google_sub,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": now,
        "exp": now + 900,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def render_app_return_html(sid: str, action: str, title: str, message: str, is_error: bool = False) -> HTMLResponse:
    deep_link = f"teleclone://auth?sid={urllib.parse.quote(sid)}&action={urllib.parse.quote(action)}"
    accent = "#ef4444" if is_error else "#67b346"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{title}</title>
<style>
  body {{ margin:0; min-height:100vh; background:#000; color:#fff; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; padding:20px; text-align:center; }}
  .card {{ max-width:340px; width:100%; background:#14151a; border:1px solid rgba(255,255,255,0.08); border-radius:22px; padding:26px 20px; }}
  .dot {{ width:58px; height:58px; border-radius:50%; background:{accent}; margin:0 auto 14px; display:flex; align-items:center; justify-content:center; font-size:28px; }}
  h2 {{ margin:0 0 8px; font-size:20px; }}
  p {{ margin:0 0 20px; font-size:14px; color:#9ca3af; line-height:1.45; }}
  a.btn {{ display:block; text-decoration:none; background:#67b346; color:#fff; font-weight:700; padding:13px 16px; border-radius:14px; font-size:15px; }}
</style>
</head>
<body>
  <div class="card">
    <div class="dot">{"!" if is_error else "✓"}</div>
    <h2>{title}</h2>
    <p>{message}</p>
    <a class="btn" href="{deep_link}">Return to TeleClone</a>
  </div>
  <script>
    setTimeout(function() {{ window.location.href = {json.dumps(deep_link)}; }}, 250);
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/google/config")
def google_auth_config():
    return {"ok": True, "enabled": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)}


@router.get("/google/start")
def google_auth_start(request: Request, sid: str = "", mode: str = "web", action: str = "login"):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured on the server yet")

    clean_sid = re.sub(r"[^a-zA-Z0-9_-]", "", sid or "")[:64] or secrets.token_urlsafe(18)
    clean_mode = "app" if mode == "app" else "web"
    clean_action = "add" if action == "add" else "login"

    conn = get_conn()
    try:
        ensure_google_auth_schema(conn)
        save_google_session(conn, clean_sid, "pending", {"action": clean_action})
    finally:
        conn.close()

    redirect_uri = f"{get_public_base_url(request)}/api/auth/google/callback"
    state = f"{clean_sid}|{clean_mode}|{clean_action}"

    params = urllib.parse.urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
            "state": state,
        }
    )
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
def google_auth_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
):
    parts = (state or "").split("|")
    sid = re.sub(r"[^a-zA-Z0-9_-]", "", parts[0])[:64] if parts and parts[0] else secrets.token_urlsafe(12)
    mode = parts[1] if len(parts) > 1 and parts[1] == "app" else "web"
    action = parts[2] if len(parts) > 2 and parts[2] == "add" else "login"

    conn = get_conn()
    try:
        ensure_google_auth_schema(conn)

        if error or not code:
            err_msg = error or "Google sign-in was cancelled"
            save_google_session(conn, sid, "error", {"detail": err_msg})
            if mode == "app":
                return render_app_return_html(sid, action, "Sign-in Cancelled", err_msg, is_error=True)
            return RedirectResponse(url=f"/?google_sid={urllib.parse.quote(sid)}&google_action={urllib.parse.quote(action)}")

        redirect_uri = f"{get_public_base_url(request)}/api/auth/google/callback"
        token_data = urllib.parse.urlencode(
            {
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
        ).encode("utf-8")

        token_req = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(token_req, timeout=15) as resp:
            token_json = json.loads(resp.read().decode("utf-8"))

        access_token = token_json.get("access_token", "")
        if not access_token:
            raise ValueError("Failed to obtain Google access token")

        info_req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(info_req, timeout=15) as resp:
            profile = json.loads(resp.read().decode("utf-8"))

        google_sub = str(profile.get("sub") or "").strip()
        email = str(profile.get("email") or "").strip().lower()
        name = str(profile.get("name") or email.split("@")[0] or "User").strip()[:64]
        picture = str(profile.get("picture") or "").strip()

        if not google_sub:
            raise ValueError("Could not verify Google account ID")

        user_row = conn.execute(
            "SELECT * FROM users WHERE google_sub = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?)) LIMIT 1",
            (google_sub, email),
        ).fetchone()

        if user_row:
            now = int(time.time())
            conn.execute(
                "UPDATE users SET google_sub = ?, email = ?, last_seen = ? WHERE id = ?",
                (google_sub, email, now, user_row["id"]),
            )
            conn.commit()
            updated = conn.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
            jwt_token = create_jwt_token(updated["id"])
            save_google_session(
                conn,
                sid,
                "login",
                {"token": jwt_token, "user": serialize_user(updated), "action": action},
            )
        else:
            setup_token = create_google_setup_token(google_sub, email, name, picture)
            save_google_session(
                conn,
                sid,
                "needs_profile",
                {
                    "setupToken": setup_token,
                    "email": email,
                    "name": name,
                    "picture": picture,
                    "action": action,
                },
            )
    except Exception as exc:
        err_msg = str(exc) or "Google verification failed"
        save_google_session(conn, sid, "error", {"detail": err_msg})
        if mode == "app":
            return render_app_return_html(sid, action, "Login Failed", err_msg, is_error=True)
        return RedirectResponse(url=f"/?google_sid={urllib.parse.quote(sid)}&google_action={urllib.parse.quote(action)}")
    finally:
        conn.close()

    if mode == "app":
        return render_app_return_html(
            sid,
            action,
            "Google Verified!",
            "Your Google account has been verified. Tap the button below or return to the TeleClone app.",
        )
    return RedirectResponse(url=f"/?google_sid={urllib.parse.quote(sid)}&google_action={urllib.parse.quote(action)}")


@router.get("/google/poll")
def google_auth_poll(sid: str):
    clean_sid = re.sub(r"[^a-zA-Z0-9_-]", "", sid or "")[:64]
    if not clean_sid:
        raise HTTPException(status_code=400, detail="Missing session id")

    conn = get_conn()
    try:
        ensure_google_auth_schema(conn)
        row = conn.execute(
            "SELECT status, payload_json, created_at FROM google_auth_sessions WHERE sid = ?",
            (clean_sid,),
        ).fetchone()
        if not row:
            return {"ok": True, "status": "pending"}
        payload = json.loads(row["payload_json"] or "{}")
        status = row["status"]
        if status in {"login", "needs_profile", "error"}:
            conn.execute("DELETE FROM google_auth_sessions WHERE sid = ?", (clean_sid,))
            conn.commit()
        return {"ok": True, "status": status, **payload}
    finally:
        conn.close()


@router.post("/google/complete")
def google_auth_complete(body: GoogleCompleteRequest):
    try:
        claims = jwt.decode(body.setupToken, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if claims.get("purpose") != "google_setup":
            raise HTTPException(status_code=400, detail="Invalid setup session")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Session expired — please continue with Google again")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Google session")

    google_sub = str(claims.get("google_sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    picture = str(claims.get("picture") or "").strip()

    display_name = (body.name or "").strip()[:64]
    if not display_name:
        raise HTTPException(status_code=400, detail="Please enter your name")

    phone = normalize_phone(body.phone)
    now = int(time.time())

    conn = get_conn()
    try:
        ensure_google_auth_schema(conn)

        # Agar Google account pehle hi ban chuka ho to seedha login kar dein
        existing_google = conn.execute(
            "SELECT * FROM users WHERE google_sub = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?)) LIMIT 1",
            (google_sub, email),
        ).fetchone()
        if existing_google:
            token = create_jwt_token(existing_google["id"])
            return {"ok": True, "token": token, "user": serialize_user(existing_google)}

        phone_taken = conn.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone()
        if phone_taken:
            raise HTTPException(status_code=409, detail="This phone number is already registered to another account")

        if body.username and body.username.strip():
            uname = clean_username(body.username)
        else:
            base = re.sub(r"[^a-zA-Z0-9]", "", display_name.lower())[:12] or "user"
            uname = f"{base}_{secrets.randbelow(9000) + 1000}"

        taken = conn.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (uname,)).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="This @username is already taken")

        color = AVATAR_GRADIENTS[secrets.randbelow(len(AVATAR_GRADIENTS))]
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (phone, username, name, bio, avatar_color, avatar_url, google_sub, email, is_bot, last_seen, created_at)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, 0, ?, ?)
            """,
            (phone, uname, display_name, color, picture, google_sub, email, now, now),
        )
        new_user_id = cur.lastrowid
        setup_starter_chats(conn, new_user_id)
        conn.commit()

        new_row = conn.execute("SELECT * FROM users WHERE id = ?", (new_user_id,)).fetchone()
        token = create_jwt_token(new_user_id)
        return {"ok": True, "token": token, "user": serialize_user(new_row)}
    finally:
        conn.close()