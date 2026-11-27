import asyncio
import json
import os
import time
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.database import get_conn

router = APIRouter(prefix="/api/push", tags=["push"])

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

_sa_cache: Optional[dict] = None
_sa_loaded = False
_access_token_cache = {"token": "", "exp": 0}


class PushTokenRequest(BaseModel):
    token: str
    platform: Optional[str] = "android"


def ensure_push_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS push_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            platform TEXT DEFAULT 'android',
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)")
    conn.commit()


def _load_service_account() -> Optional[dict]:
    global _sa_cache, _sa_loaded
    if _sa_loaded:
        return _sa_cache
    _sa_loaded = True
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if data.get("project_id") and data.get("client_email") and data.get("private_key"):
            data["private_key"] = data["private_key"].replace("\\n", "\n")
            _sa_cache = data
    except Exception as exc:
        print("[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", exc)
    return _sa_cache


async def _get_fcm_access_token() -> Optional[tuple[str, str]]:
    sa = _load_service_account()
    if not sa:
        return None

    now = int(time.time())
    if _access_token_cache["token"] and now < _access_token_cache["exp"] - 120:
        return sa["project_id"], _access_token_cache["token"]

    claims = {
        "iss": sa["client_email"],
        "scope": FCM_SCOPE,
        "aud": sa.get("token_uri", "https://oauth2.googleapis.com/token"),
        "iat": now,
        "exp": now + 3600,
    }
    assertion = jwt.encode(claims, sa["private_key"], algorithm="RS256")
    if isinstance(assertion, bytes):
        assertion = assertion.decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                sa.get("token_uri", "https://oauth2.googleapis.com/token"),
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion,
                },
            )
            if resp.status_code != 200:
                print("[FCM] OAuth token error:", resp.status_code, resp.text[:200])
                return None
            payload = resp.json()
            token = payload.get("access_token", "")
            expires_in = int(payload.get("expires_in", 3600))
            if token:
                _access_token_cache["token"] = token
                _access_token_cache["exp"] = now + expires_in
                return sa["project_id"], token
    except Exception as exc:
        print("[FCM] OAuth request failed:", exc)
    return None


@router.post("/register")
def register_push_token(body: PushTokenRequest, user: dict = Depends(get_current_user)):
    tok = (body.token or "").strip()
    if len(tok) < 20:
        return {"ok": False, "detail": "Invalid push token"}
    now = int(time.time())
    conn = get_conn()
    try:
        ensure_push_schema(conn)
        conn.execute(
            """
            INSERT INTO push_tokens (token, user_id, platform, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
                user_id = excluded.user_id,
                platform = excluded.platform,
                updated_at = excluded.updated_at
            """,
            (tok, user["id"], (body.platform or "android")[:20], now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/unregister")
def unregister_push_token(body: PushTokenRequest, user: dict = Depends(get_current_user)):
    tok = (body.token or "").strip()
    if not tok:
        return {"ok": True}
    conn = get_conn()
    try:
        ensure_push_schema(conn)
        conn.execute("DELETE FROM push_tokens WHERE token = ? AND user_id = ?", (tok, user["id"]))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.get("/status")
def push_status(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_push_schema(conn)
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM push_tokens WHERE user_id = ?", (user["id"],)
        ).fetchone()
        cnt = row["cnt"] if row else 0
    finally:
        conn.close()
    return {"ok": True, "configured": bool(_load_service_account()), "tokenCount": cnt}


async def send_push_to_user(
    user_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
    channel_id: str = "teleclone_messages",
):
    auth_info = await _get_fcm_access_token()
    if not auth_info:
        return
    project_id, access_token = auth_info

    conn = get_conn()
    try:
        ensure_push_schema(conn)
        rows = conn.execute(
            "SELECT token FROM push_tokens WHERE user_id = ?", (int(user_id),)
        ).fetchall()
        tokens = [r["token"] for r in rows]
    finally:
        conn.close()

    if not tokens:
        return

    str_data = {str(k): str(v) for k, v in (data or {}).items() if v is not None}
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    stale_tokens = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for tok in tokens:
            msg_payload = {
                "message": {
                    "token": tok,
                    "notification": {
                        "title": title[:100],
                        "body": body[:240],
                    },
                    "data": str_data,
                    "android": {
                        "priority": "HIGH",
                        "notification": {
                            "channel_id": channel_id,
                            "sound": "default",
                        },
                    },
                }
            }
            try:
                res = await client.post(url, headers=headers, json=msg_payload)
                if res.status_code in (400, 404):
                    txt = res.text.upper()
                    if "UNREGISTERED" in txt or "NOT_FOUND" in txt or "INVALID_ARGUMENT" in txt:
                        stale_tokens.append(tok)
            except Exception:
                pass

    if stale_tokens:
        conn = get_conn()
        try:
            for st in stale_tokens:
                conn.execute("DELETE FROM push_tokens WHERE token = ?", (st,))
            conn.commit()
        finally:
            conn.close()


async def notify_chat_message(
    chat_id: int,
    sender_id: int,
    sender_name: str,
    text: str = "",
    attachment: Optional[dict] = None,
):
    if not _load_service_account():
        return

    conn = get_conn()
    try:
        ensure_push_schema(conn)
        chat_row = conn.execute(
            "SELECT type, title FROM chats WHERE id = ?", (int(chat_id),)
        ).fetchone()
        members = conn.execute(
            "SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?",
            (int(chat_id), int(sender_id)),
        ).fetchall()
        recipient_ids = [r["user_id"] for r in members]
    finally:
        conn.close()

    if not recipient_ids:
        return

    preview = (text or "").strip()
    if not preview and attachment:
        att_type = (attachment.get("type") or "").lower()
        if att_type == "voice":
            preview = "Voice message"
        elif att_type == "photo":
            preview = "Photo"
        elif att_type == "video":
            preview = "Video"
        else:
            preview = attachment.get("name") or "Attachment"
    if not preview:
        preview = "New message"

    chat_type = (chat_row["type"] if chat_row else "personal") or "personal"
    chat_title = (chat_row["title"] if chat_row else "") or ""

    if chat_type in ("group", "channel") and chat_title:
        notif_title = chat_title
        notif_body = f"{sender_name}: {preview}"
    else:
        notif_title = sender_name or "TeleClone"
        notif_body = preview

    await asyncio.gather(
        *[
            send_push_to_user(
                uid,
                title=notif_title,
                body=notif_body,
                data={"type": "new_message", "chatId": str(chat_id)},
                channel_id="teleclone_messages",
            )
            for uid in recipient_ids
        ],
        return_exceptions=True,
    )


async def notify_incoming_call(
    target_user_id: int,
    caller_name: str,
    call_type: str = "voice",
    chat_id: Optional[int] = None,
):
    if not _load_service_account():
        return
    is_video = str(call_type).lower() == "video"
    title = "Incoming Video Call" if is_video else "Incoming Voice Call"
    body = f"{caller_name or 'Someone'} is calling you on TeleClone"
    await send_push_to_user(
        target_user_id,
        title=title,
        body=body,
        data={
            "type": "incoming_call",
            "callType": "video" if is_video else "voice",
            "chatId": str(chat_id or ""),
            "callerName": caller_name or "Caller",
        },
        channel_id="teleclone_calls",
    )