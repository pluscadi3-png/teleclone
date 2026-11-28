import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user, make_initials, serialize_user
from backend.database import get_conn
from backend.ws_manager import ws_manager

router = APIRouter(prefix="/api", tags=["social"])


class AddContactReq(BaseModel):
    query: str  # @username ya phone number
    customName: Optional[str] = ""


class LogCallReq(BaseModel):
    targetUserId: Optional[int] = None
    chatId: Optional[int] = None
    callType: str = "voice"
    status: str = "completed"
    duration: str = "00:00"
    callId: Optional[str] = None
    direction: Optional[str] = None


# ==================== CONTACTS ====================
@router.get("/contacts")
def list_contacts(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT u.id, u.name, u.username, u.phone, u.avatar_color, u.last_seen, c.custom_name, u.avatar_url
            FROM contacts c
            JOIN users u ON u.id = c.contact_user_id
            WHERE c.owner_id = ? AND u.is_bot = 0
            ORDER BY LOWER(COALESCE(NULLIF(c.custom_name, ''), u.name)) ASC
            """,
            (user["id"],),
        ).fetchall()

        contacts = []
        seen_ids = set()
        for r in rows:
            seen_ids.add(r["id"])
            display = (r["custom_name"] or "").strip() or r["name"]
            online = ws_manager.is_online(r["id"])
            contacts.append(
                {
                    "id": r["id"],
                    "name": display,
                    "username": "@" + r["username"].lstrip("@"),
                    "phone": r["phone"] or "",
                    "initials": make_initials(display),
                    "color": r["avatar_color"],
                    "avatarUrl": r["avatar_url"] or "",
                    "online": online,
                    "statusText": "online" if online else "last seen recently",
                    "saved": True,
                }
            )

        # Jin real users se pehle chat ho chuki hai unhein bhi list mein shamil karein
        peer_rows = conn.execute(
            """
            SELECT DISTINCT u.id, u.name, u.username, u.phone, u.avatar_color
            FROM chat_members cm1
            JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
            JOIN chats ch ON ch.id = cm1.chat_id
            JOIN users u ON u.id = cm2.user_id
            WHERE cm1.user_id = ? AND cm2.user_id != ? AND u.is_bot = 0 AND ch.type = 'personal'
            """,
            (user["id"], user["id"]),
        ).fetchall()

        for r in peer_rows:
            if r["id"] in seen_ids:
                continue
            online = ws_manager.is_online(r["id"])
            contacts.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "username": "@" + r["username"].lstrip("@"),
                    "phone": r["phone"] or "",
                    "initials": make_initials(r["name"]),
                    "color": r["avatar_color"],
                    "online": online,
                    "statusText": "online" if online else "last seen recently",
                    "saved": False,
                }
            )

        return {"ok": True, "contacts": contacts}
    finally:
        conn.close()


@router.post("/contacts")
def add_contact(body: AddContactReq, user: dict = Depends(get_current_user)):
    raw = (body.query or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Please enter a @username or phone number")

    clean_user = raw.lstrip("@")
    conn = get_conn()
    try:
        target = conn.execute(
            """
            SELECT * FROM users
            WHERE is_bot = 0 AND (LOWER(username) = LOWER(?) OR phone = ?)
            LIMIT 1
            """,
            (clean_user, raw),
        ).fetchone()

        if not target:
            raise HTTPException(status_code=404, detail="No TeleClone account found for this @username or phone number")
        if target["id"] == user["id"]:
            raise HTTPException(status_code=400, detail="You cannot add yourself as a contact")

        custom = (body.customName or "").strip()[:64]
        conn.execute(
            """
            INSERT INTO contacts (owner_id, contact_user_id, custom_name, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(owner_id, contact_user_id) DO UPDATE SET custom_name = excluded.custom_name
            """,
            (user["id"], target["id"], custom, int(time.time())),
        )
        conn.commit()
        return {"ok": True, "contactId": target["id"]}
    finally:
        conn.close()


@router.delete("/contacts/{contact_user_id}")
def remove_contact(contact_user_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        conn.execute(
            "DELETE FROM contacts WHERE owner_id = ? AND contact_user_id = ?",
            (user["id"], contact_user_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ==================== CALLS ====================
_CALL_LOGS_SCHEMA_READY = False


def _ensure_call_logs_schema(conn):
    global _CALL_LOGS_SCHEMA_READY
    if _CALL_LOGS_SCHEMA_READY:
        return
    try:
        conn.execute("ALTER TABLE call_logs ADD COLUMN call_key TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_call_logs_key ON call_logs(call_key)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_call_logs_users ON call_logs(caller_id, callee_id, id DESC)")
        conn.commit()
    except Exception:
        pass
    _CALL_LOGS_SCHEMA_READY = True


def _parse_duration_secs(dur: str) -> int:
    try:
        parts = [int(p) for p in str(dur or "0:00").strip().split(":")]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
    except Exception:
        pass
    return 0


def upsert_call_log(
    conn,
    caller_id: int,
    callee_id: int,
    call_type: str = "voice",
    status: str = "missed",
    duration: str = "00:00",
    call_key: str = "",
    created_at: Optional[int] = None,
):
    if not caller_id or not callee_id or int(caller_id) == int(callee_id):
        return None
    _ensure_call_logs_schema(conn)

    cid = int(caller_id)
    rid = int(callee_id)
    ctype = "video" if str(call_type or "").lower() == "video" else "voice"
    raw_st = str(status or "").lower().strip()
    dur_str = str(duration or "00:00").strip() or "00:00"
    dur_secs = _parse_duration_secs(dur_str)

    if raw_st in ("completed", "answered", "picked"):
        norm_status = "completed"
    elif raw_st in ("missed", "declined", "rejected", "cancelled", "offline", "busy"):
        norm_status = "missed"
    else:
        norm_status = "completed" if dur_secs > 0 else "missed"

    key = str(call_key or "").strip()[:80]
    now_ts = int(created_at or time.time())

    existing = None
    if key:
        existing = conn.execute(
            "SELECT * FROM call_logs WHERE call_key = ? ORDER BY id DESC LIMIT 1",
            (key,),
        ).fetchone()
    if not existing:
        existing = conn.execute(
            """
            SELECT * FROM call_logs
            WHERE caller_id = ? AND callee_id = ? AND created_at >= ?
            ORDER BY id DESC LIMIT 1
            """,
            (cid, rid, now_ts - 10),
        ).fetchone()

    if existing:
        old_st = str(existing["status"] or "").lower()
        final_st = "completed" if (old_st == "completed" or norm_status == "completed") else "missed"
        old_secs = _parse_duration_secs(existing["duration"])
        final_dur = dur_str if dur_secs >= old_secs else (existing["duration"] or "00:00")
        final_type = "video" if (existing["call_type"] == "video" or ctype == "video") else "voice"
        conn.execute(
            "UPDATE call_logs SET call_type = ?, status = ?, duration = ?, call_key = COALESCE(NULLIF(call_key, ''), ?) WHERE id = ?",
            (final_type, final_st, final_dur, key, existing["id"]),
        )
        conn.commit()
        return existing["id"]

    cur = conn.execute(
        """
        INSERT INTO call_logs (caller_id, callee_id, call_type, status, duration, created_at, call_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (cid, rid, ctype, norm_status, dur_str, now_ts, key),
    )
    conn.commit()
    return cur.lastrowid


@router.get("/calls")
def list_calls(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        _ensure_call_logs_schema(conn)
        rows = conn.execute(
            """
            SELECT cl.*,
                   u.id AS peer_id, u.name AS peer_name, u.username AS peer_username,
                   u.avatar_color AS peer_color, u.avatar_url AS peer_avatar
            FROM call_logs cl
            JOIN users u ON u.id = CASE WHEN cl.caller_id = ? THEN cl.callee_id ELSE cl.caller_id END
            WHERE cl.caller_id = ? OR cl.callee_id = ?
            ORDER BY cl.id DESC
            LIMIT 60
            """,
            (user["id"], user["id"], user["id"]),
        ).fetchall()

        calls = []
        for r in rows:
            direction = "outgoing" if r["caller_id"] == user["id"] else "incoming"
            calls.append(
                {
                    "id": r["id"],
                    "peerUserId": r["peer_id"],
                    "name": r["peer_name"],
                    "username": "@" + r["peer_username"].lstrip("@"),
                    "initials": make_initials(r["peer_name"]),
                    "color": r["peer_color"],
                    "avatarUrl": r["peer_avatar"] if "peer_avatar" in r.keys() and r["peer_avatar"] else "",
                    "callType": r["call_type"],
                    "direction": direction,
                    "status": r["status"],
                    "duration": r["duration"],
                    "time": fmt_call_time(r["created_at"]),
                }
            )
        return {"ok": True, "calls": calls}
    finally:
        conn.close()


@router.post("/calls/log")
def log_call(body: LogCallReq, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        target_id = body.targetUserId
        if not target_id and body.chatId:
            peer = conn.execute(
                "SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? LIMIT 1",
                (body.chatId, user["id"]),
            ).fetchone()
            if peer:
                target_id = peer["user_id"]

        if not target_id or int(target_id) == int(user["id"]):
            return {"ok": True}

        if str(body.direction or "").lower() == "incoming":
            caller_id = int(target_id)
            callee_id = int(user["id"])
        else:
            caller_id = int(user["id"])
            callee_id = int(target_id)

        upsert_call_log(
            conn,
            caller_id=caller_id,
            callee_id=callee_id,
            call_type=body.callType,
            status=body.status,
            duration=body.duration,
            call_key=body.callId or "",
        )
        return {"ok": True}
    finally:
        conn.close()


# ==================== PROFILE PHOTO & POSTS ====================
class ProfilePhotoReq(BaseModel):
    avatarUrl: str = ""


class CreatePostReq(BaseModel):
    caption: str = ""
    mediaUrl: str = ""
    bg: str = "linear-gradient(135deg, #667eea, #764ba2)"


class ArchivePostReq(BaseModel):
    archived: bool


@router.put("/profile/photo")
async def update_profile_photo(body: ProfilePhotoReq, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE users SET avatar_url = ? WHERE id = ?",
            ((body.avatarUrl or "").strip(), user["id"]),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        serialized = serialize_user(updated)
    finally:
        conn.close()

    # Sab online users ko notify karein taake unki chat list & stories mein nayi DP foran aa jaye
    for uid in list(ws_manager.active.keys()):
        await ws_manager.send_to_user(uid, {"type": "chat_updated"})
        await ws_manager.send_to_user(uid, {"type": "story_posted"})

    return {"ok": True, "user": serialized}

@router.get("/profile/posts")
def list_profile_posts(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT * FROM profile_posts
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user["id"],),
        ).fetchall()
        posts = [
            {
                "id": r["id"],
                "caption": r["caption"] or "",
                "mediaUrl": r["media_url"] or "",
                "bg": r["bg_color"] or "linear-gradient(135deg, #667eea, #764ba2)",
                "archived": bool(r["archived"]),
                "time": fmt_call_time(r["created_at"]),
            }
            for r in rows
        ]
        return {"ok": True, "posts": posts}
    finally:
        conn.close()


@router.post("/profile/posts")
def create_profile_post(body: CreatePostReq, user: dict = Depends(get_current_user)):
    caption = (body.caption or "").strip()[:500]
    media_url = (body.mediaUrl or "").strip()
    if not caption and not media_url:
        raise HTTPException(status_code=400, detail="A photo or text is required to create a post")

    now = int(time.time())
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO profile_posts (user_id, caption, media_url, bg_color, archived, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (user["id"], caption, media_url, body.bg, now),
        )
        post_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "postId": post_id}
    finally:
        conn.close()


@router.put("/profile/posts/{post_id}/archive")
def toggle_archive_post(post_id: int, body: ArchivePostReq, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        cur = conn.execute(
            "UPDATE profile_posts SET archived = ? WHERE id = ? AND user_id = ?",
            (1 if body.archived else 0, post_id, user["id"]),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found")
        return {"ok": True, "archived": body.archived}
    finally:
        conn.close()


@router.delete("/profile/posts/{post_id}")
def delete_profile_post(post_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        cur = conn.execute(
            "DELETE FROM profile_posts WHERE id = ? AND user_id = ?",
            (post_id, user["id"]),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found")
        return {"ok": True}
    finally:
        conn.close()

@router.get("/users/{target_user_id}/posts")
def list_user_public_posts(target_user_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT * FROM profile_posts
            WHERE user_id = ? AND archived = 0
            ORDER BY id DESC
            """,
            (target_user_id,),
        ).fetchall()
        posts = [
            {
                "id": r["id"],
                "caption": r["caption"] or "",
                "mediaUrl": r["media_url"] or "",
                "bg": r["bg_color"] or "linear-gradient(135deg, #667eea, #764ba2)",
                "time": fmt_call_time(r["created_at"]),
            }
            for r in rows
        ]
        return {"ok": True, "posts": posts}
    finally:
        conn.close()       

@router.get("/users/avatars")
def get_all_user_avatars(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, username, avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url != ''"
        ).fetchall()
        by_id = {}
        by_username = {}
        for r in rows:
            url = (r["avatar_url"] or "").strip()
            if not url:
                continue
            by_id[str(r["id"])] = url
            by_username["@" + r["username"].lstrip("@").lower()] = url
        return {"ok": True, "byId": by_id, "byUsername": by_username}
    finally:
        conn.close()

@router.get("/users/avatars")
def get_all_user_avatars(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, username, avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url != ''"
        ).fetchall()
        by_id = {}
        by_username = {}
        for r in rows:
            url = (r["avatar_url"] or "").strip()
            if not url:
                continue
            by_id[str(r["id"])] = url
            by_username["@" + r["username"].lstrip("@").lower()] = url
        return {"ok": True, "byId": by_id, "byUsername": by_username}
    finally:
        conn.close()