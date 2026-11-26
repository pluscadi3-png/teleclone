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
        raise HTTPException(status_code=400, detail="Valid phone number likhein (e.g. +923001234567)")
    return cleaned


def clean_username(raw: str) -> str:
    u = re.sub(r"[^a-zA-Z0-9_]", "", (raw or "").strip().lstrip("@"))
    if len(u) < 4 or len(u) > 32:
        raise HTTPException(status_code=400, detail="Username 4 se 32 characters (letters/numbers/_) ka hona chahiye")
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
    """Naye user ke liye sirf Saved Messages aur @BotFather chat create karta hai (zero fake data)."""
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
                "Apna naya real bot aur HTTP API Token banane ke liye `/newbot` bhejein.",
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
            raise HTTPException(status_code=409, detail="Yeh @username pehle se lia ja chuka hai")

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
                raise HTTPException(status_code=409, detail="Yeh @username pehle se maujood hai")
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