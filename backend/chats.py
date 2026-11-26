import asyncio
import json
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, List, Optional
from urllib.parse import unquote
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from backend.auth import get_current_user, make_initials
from backend.database import get_conn
from backend.ws_manager import ws_manager
import mimetypes

mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("audio/webm", ".webm")
mimetypes.add_type("audio/ogg", ".ogg")
mimetypes.add_type("audio/mp4", ".m4a")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR)))
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api", tags=["chats"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB limit

# Bot Engine Hooks (Step 3 mein bot_api.py khud register karega)
_bot_message_hook: Optional[Callable] = None
_bot_callback_hook: Optional[Callable] = None


def register_bot_hooks(on_message: Callable, on_callback: Callable):
    global _bot_message_hook, _bot_callback_hook
    _bot_message_hook = on_message
    _bot_callback_hook = on_callback


# ==================== REQUEST SCHEMAS ====================
class DirectChatRequest(BaseModel):
    targetUserId: Optional[int] = None
    username: Optional[str] = None


class CreateGroupRequest(BaseModel):
    name: str
    description: str = ""
    memberIds: List[int] = []


class CreateChannelRequest(BaseModel):
    name: str
    username: Optional[str] = None
    description: str = ""


class AddMemberRequest(BaseModel):
    userId: Optional[int] = None
    username: Optional[str] = None


class ChatStateUpdate(BaseModel):
    pinned: Optional[bool] = None
    muted: Optional[bool] = None
    archived: Optional[bool] = None
    unreadCount: Optional[int] = None

class SendMessageRequest(BaseModel):
    text: str = ""
    replyToId: Optional[int] = None
    attachment: Optional[dict] = None
    poll: Optional[dict] = None
    silent: bool = False
    ttlSeconds: Optional[int] = None


class EditMessageRequest(BaseModel):
    text: str


class ReactionRequest(BaseModel):
    emoji: str


class CallbackQueryRequest(BaseModel):
    callbackData: str


# ==================== HELPERS ====================
def fmt_time(ts: int) -> str:
    return datetime.fromtimestamp(ts).strftime("%-I:%M %p") if os.name != "nt" else datetime.fromtimestamp(ts).strftime("%I:%M %p").lstrip("0")


def safe_json(raw: Optional[str], fallback: Any):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def ensure_member(conn, chat_id: int, user_id: int):
    row = conn.execute(
        "SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?",
        (chat_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Aap is chat ke member nahi hain")
    return row


def serialize_message(conn, row, viewer_user_id: Optional[int] = None) -> dict:
    sender = conn.execute(
        "SELECT id, name, username, is_bot FROM users WHERE id = ?", (row["sender_id"],)
    ).fetchone()

    reply_obj = None
    if row["reply_to_id"]:
        r_msg = conn.execute(
            """
            SELECT m.id, m.text, u.name AS sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.id = ?
            """,
            (row["reply_to_id"],),
        ).fetchone()
        if r_msg:
            reply_obj = {
                "id": r_msg["id"],
                "author": r_msg["sender_name"],
                "text": (r_msg["text"] or "Attachment")[:80],
            }

    raw_reactions = safe_json(row["reactions_json"], {})
    formatted_reactions = {}
    for emoji, user_ids in raw_reactions.items():
        if isinstance(user_ids, list) and len(user_ids) > 0:
            formatted_reactions[emoji] = {
                "count": len(user_ids),
                "mine": viewer_user_id in user_ids if viewer_user_id else False,
            }

    return {
        "id": row["id"],
        "chatId": row["chat_id"],
        "senderId": row["sender_id"],
        "sender": "me" if (viewer_user_id and row["sender_id"] == viewer_user_id) else "them",
        "senderName": sender["name"] if sender else "Unknown",
        "senderUsername": ("@" + sender["username"]) if sender else "",
        "text": row["text"] or "",
        "time": fmt_time(row["created_at"]),
        "timestamp": row["created_at"] * 1000,
        "expiresAt": (row["expires_at"] * 1000) if ("expires_at" in row.keys() and row["expires_at"]) else None,
        "status": row["status"] or "sent",
        "edited": bool(row["edited"]),
        "silent": bool(row["silent"]),
        "replyTo": reply_obj,
        "attachment": safe_json(row["attachment_json"], None),
        "poll": safe_json(row["poll_json"], None),
        "inlineKeyboard": safe_json(row["inline_keyboard_json"], None),
        "reactions": formatted_reactions,
    }


def serialize_chat_for_user(conn, chat_id: int, user_id: int) -> Optional[dict]:
    chat = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    mem = conn.execute(
        "SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id)
    ).fetchone()
    if not chat or not mem:
        return None

    chat_type = chat["type"]
    name = chat["title"] or "Chat"
    username = ("@" + chat["username"].lstrip("@")) if chat["username"] else ""
    avatar_color = chat["avatar_color"]
    avatar_url = ""
    description = chat["description"] or ""
    is_bot = False
    verified = False
    online = False
    status_text = ""
    bot_commands = []
    bot_token = None
    peer_user_id = None
    members_list = []

    if chat_type == "saved":
        name = "Saved Messages"
        username = "@saved"
        status_text = "Personal cloud storage"
    elif chat_type in ("personal", "bot", "secret"):
        peer = conn.execute(
            """
            SELECT u.* FROM chat_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.chat_id = ? AND cm.user_id != ?
            LIMIT 1
            """,
            (chat_id, user_id),
        ).fetchone()
        if peer:
            peer_user_id = peer["id"]
            name = f"🔒 {peer['name']}" if chat_type == "secret" else peer["name"]
            username = "@" + peer["username"].lstrip("@")
            avatar_color = peer["avatar_color"]
            avatar_url = peer["avatar_url"] if "avatar_url" in peer.keys() and peer["avatar_url"] else ""
            description = peer["bio"] or ""
            is_bot = bool(peer["is_bot"])
            verified = bool(peer["verified"])
            online = ws_manager.is_online(peer["id"])
            if is_bot:
                status_text = "bot"
                bot_commands = safe_json(peer["bot_commands_json"], [])
                if peer["bot_owner_id"] == user_id:
                    bot_token = peer["bot_token"]
            else:
                status_text = "online" if online else "last seen recently"
    else:
        # Group or Channel
        m_rows = conn.execute(
            """
            SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.is_bot, cm.role
            FROM chat_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.chat_id = ?
            """,
            


            (chat_id,),
        ).fetchall()
        online_count = sum(1 for r in m_rows if ws_manager.is_online(r["id"]))
        if chat_type == "group":
            status_text = f"{len(m_rows)} members, {online_count} online"
        else:
            status_text = f"{len(m_rows)} subscriber{'s' if len(m_rows) != 1 else ''}"

        members_list = [
            {

                "id": r["id"],
                "name": r["name"],
                "username": "@" + r["username"].lstrip("@"),
                "initials": make_initials(r["name"]),
                "color": r["avatar_color"],
                "role": r["role"].capitalize(),
                "isBot": bool(r["is_bot"]),
                "avatarUrl": r["avatar_url"] or "",
            }
            for r in m_rows
        ]

    last_msg = conn.execute(
        """
        SELECT m.*, u.name AS sender_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.chat_id = ?
        ORDER BY m.id DESC LIMIT 1
        """,
        (chat_id,),
    ).fetchone()

    if last_msg:
        att = safe_json(last_msg["attachment_json"], None)
        poll = safe_json(last_msg["poll_json"], None)
        preview = (
            last_msg["text"]
            or (f"📎 {att.get('label') or att.get('name', 'Media')}" if att else "")
            or (f"📊 Poll: {poll.get('question', '')}" if poll else "Message")
        )
        last_text = preview.replace("\n", " ")[:70]
        last_sender = "You" if last_msg["sender_id"] == user_id else (last_msg["sender_name"] if chat_type == "group" else "")
        last_time = fmt_time(last_msg["created_at"])
        last_ts = last_msg["created_at"] * 1000
    else:
        last_text = "No messages yet"
        last_sender = ""
        last_time = fmt_time(chat["created_at"])
        last_ts = chat["created_at"] * 1000

    initials = "🔖" if chat_type == "saved" else ("🤖" if username.lower() == "@botfather" else make_initials(name.replace("🔒 ", "")))

    return {
        "id": chat["id"],
        "type": chat_type,
        "isSecret": chat_type == "secret",
        "name": name,
        "username": username,
        "initials": initials,
        "avatarColor": avatar_color,
        "avatarUrl": avatar_url,
        "description": description,
        "verified": verified,
        "isBot": is_bot,
        "peerUserId": peer_user_id,
        "botToken": bot_token,
        "botCommands": bot_commands,
        "online": online,
        "statusText": status_text,
        "pinned": bool(mem["pinned"]),
        "muted": bool(mem["muted"]),
        "archived": bool(mem["archived"]),
        "unreadCount": mem["unread_count"],
        "pinnedMessageId": chat["pinned_message_id"],
        "lastMessage": last_text,
        "lastSender": last_sender,
        "lastTime": last_time,
        "lastTimestamp": last_ts,
        "members": members_list,
    }


# ==================== CHAT & SEARCH ENDPOINTS ====================
@router.get("/chats")
def list_chats(user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT chat_id FROM chat_members WHERE user_id = ?", (user["id"],)
        ).fetchall()
        chats = []
        for r in rows:
            item = serialize_chat_for_user(conn, r["chat_id"], user["id"])
            if item:
                chats.append(item)
        chats.sort(key=lambda c: (not c["pinned"], -c["lastTimestamp"]))
        return {"ok": True, "chats": chats}
    finally:
        conn.close()


@router.get("/search")
def global_search(q: str = Query(default="", min_length=1), user: dict = Depends(get_current_user)):
    """Real registered users, bots, aur public groups/channels search karta hai."""
    term = f"%{q.strip().lstrip('@')}%"
    conn = get_conn()
    try:
        u_rows = conn.execute(
            """
            SELECT id, name, username, bio, avatar_color, is_bot, verified
            FROM users
            WHERE id != ? AND (username LIKE ? OR name LIKE ? OR phone LIKE ?)
            LIMIT 20
            """,
            (user["id"], term, term, term),
        ).fetchall()

        c_rows = conn.execute(
            """
            SELECT id, type, title, username, description, avatar_color
            FROM chats
            WHERE type IN ('group', 'channel') AND (title LIKE ? OR username LIKE ?)
            LIMIT 15
            """,
            (term, term),
        ).fetchall()

        users = [
            {
                "id": u["id"],
                "name": u["name"],
                "username": "@" + u["username"].lstrip("@"),
                "initials": "🤖" if u["username"].lower() == "botfather" else make_initials(u["name"]),
                "bio": u["bio"] or "",
                "avatarColor": u["avatar_color"],
                
            
                
                "isBot": bool(u["is_bot"]),
                "verified": bool(u["verified"]),
                "online": ws_manager.is_online(u["id"]),
            }
            for u in u_rows
        ]
        channels = [
            {
                "id": c["id"],
                "type": c["type"],
                "name": c["title"],
                "username": ("@" + c["username"]) if c["username"] else "",
                "initials": make_initials(c["title"]),
                "description": c["description"] or "",
                "avatarColor": c["avatar_color"],
            }
            for c in c_rows
        ]
        return {"ok": True, "users": users, "chats": channels}
    finally:
        conn.close()


@router.post("/chats/direct")
async def open_or_create_direct(body: DirectChatRequest, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        if body.targetUserId:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (body.targetUserId,)).fetchone()
        elif body.username:
            uname = body.username.strip().lstrip("@")
            target = conn.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (uname,)).fetchone()
        else:
            raise HTTPException(status_code=400, detail="targetUserId ya username dein")

        if not target:
            raise HTTPException(status_code=404, detail="User ya bot nahi mila")
        if target["id"] == user["id"]:
            raise HTTPException(status_code=400, detail="Saved Messages use karein")

        chat_type = "bot" if target["is_bot"] else "personal"
        existing = conn.execute(
            """
            SELECT c.id FROM chats c
            JOIN chat_members m1 ON c.id = m1.chat_id AND m1.user_id = ?
            JOIN chat_members m2 ON c.id = m2.chat_id AND m2.user_id = ?
            WHERE c.type = ?
            LIMIT 1
            """,
            (user["id"], target["id"], chat_type),
        ).fetchone()

        if existing:
            return {"ok": True, "chat": serialize_chat_for_user(conn, existing["id"], user["id"])}

        now = int(time.time())
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO chats (type, title, created_by, created_at) VALUES (?, ?, ?, ?)",
            (chat_type, target["name"], user["id"], now),
        )
        new_id = cur.lastrowid
        cur.execute(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
            (new_id, user["id"], now),
        )
        cur.execute(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
            (new_id, target["id"], now),
        )
        conn.commit()
        chat_data = serialize_chat_for_user(conn, new_id, user["id"])
        return {"ok": True, "chat": chat_data}
    finally:
        conn.close()


@router.post("/chats/group")
async def create_group(body: CreateGroupRequest, user: dict = Depends(get_current_user)):
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Group name zaroori hai")

    now = int(time.time())
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO chats (type, title, description, avatar_color, created_by, created_at)
            VALUES ('group', ?, ?, 'linear-gradient(135deg, #f093fb, #f5576c)', ?, ?)
            """,
            (name, body.description.strip()[:200], user["id"], now),
        )
        chat_id = cur.lastrowid
        cur.execute(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
            (chat_id, user["id"], now),
        )
        for mid in set(body.memberIds):
            if mid == user["id"]:
                continue
            u = conn.execute("SELECT id, is_bot FROM users WHERE id = ?", (mid,)).fetchone()
            if u:
                role = "admin" if u["is_bot"] else "member"
                cur.execute(
                    "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
                    (chat_id, mid, role, now),
                )
        conn.commit()
        chat_data = serialize_chat_for_user(conn, chat_id, user["id"])
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(chat_id, {"type": "chat_created", "chatId": chat_id})
    return {"ok": True, "chat": chat_data}


@router.post("/chats/channel")
def create_channel(body: CreateChannelRequest, user: dict = Depends(get_current_user)):
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Channel name zaroori hai")

    uname = None
    if body.username and body.username.strip():
        uname = re.sub(r"[^a-zA-Z0-9_]", "", body.username.strip().lstrip("@"))

    now = int(time.time())
    conn = get_conn()
    try:
        if uname:
            taken = conn.execute("SELECT id FROM chats WHERE LOWER(username) = LOWER(?)", (uname,)).fetchone()
            if taken:
                raise HTTPException(status_code=409, detail="Channel @username pehle se lia ja chuka hai")

        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO chats (type, title, username, description, avatar_color, created_by, created_at)
            VALUES ('channel', ?, ?, ?, 'linear-gradient(135deg, #4facfe, #00f2fe)', ?, ?)
            """,
            (name, uname, body.description.strip()[:200], user["id"], now),
        )
        chat_id = cur.lastrowid
        cur.execute(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
            (chat_id, user["id"], now),
        )
        conn.commit()
        return {"ok": True, "chat": serialize_chat_for_user(conn, chat_id, user["id"])}
    finally:
        conn.close()


@router.post("/chats/{chat_id}/join")
def join_public_chat(chat_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        chat = conn.execute("SELECT * FROM chats WHERE id = ? AND type IN ('group', 'channel')", (chat_id,)).fetchone()
        if not chat:
            raise HTTPException(status_code=404, detail="Group ya channel nahi mila")
        conn.execute(
            "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
            (chat_id, user["id"], int(time.time())),
        )
        conn.commit()
        return {"ok": True, "chat": serialize_chat_for_user(conn, chat_id, user["id"])}
    finally:
        conn.close()


@router.post("/chats/{chat_id}/members")
async def add_member(chat_id: int, body: AddMemberRequest, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        chat = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if not chat or chat["type"] != "group":
            raise HTTPException(status_code=400, detail="Sirf group mein members add ho saktay hain")

        if body.userId:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (body.userId,)).fetchone()
        elif body.username:
            target = conn.execute(
                "SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (body.username.strip().lstrip("@"),)
            ).fetchone()
        else:
            raise HTTPException(status_code=400, detail="userId ya username dein")

        if not target:
            raise HTTPException(status_code=404, detail="User/Bot nahi mila")

        role = "admin" if target["is_bot"] else "member"
        conn.execute(
            "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (chat_id, target["id"], role, int(time.time())),
        )
        conn.commit()
        updated = serialize_chat_for_user(conn, chat_id, user["id"])
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(chat_id, {"type": "chat_updated", "chatId": chat_id})
    return {"ok": True, "chat": updated}


@router.put("/chats/{chat_id}/state")
def update_chat_state(chat_id: int, body: ChatStateUpdate, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        updates, params = [], []
        if body.pinned is not None:
            updates.append("pinned = ?")
            params.append(1 if body.pinned else 0)
        if body.muted is not None:
            updates.append("muted = ?")
            params.append(1 if body.muted else 0)
        if body.archived is not None:
            updates.append("archived = ?")
            params.append(1 if body.archived else 0)
        if body.unreadCount is not None:
            updates.append("unread_count = ?")
            params.append(max(0, body.unreadCount))

        if updates:
            params.extend([chat_id, user["id"]])
            conn.execute(
                f"UPDATE chat_members SET {', '.join(updates)} WHERE chat_id = ? AND user_id = ?",
                params,
            )
            conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/chats/{chat_id}")
def leave_or_delete_chat(chat_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        conn.execute("DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user["id"]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ==================== MESSAGES ENDPOINTS ====================
@router.get("/chats/{chat_id}/messages")
async def get_messages(
    chat_id: int,
    limit: int = Query(default=60, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        # Mark unread as 0 & incoming messages as read (double tick ✓✓)
        conn.execute(
            "UPDATE chat_members SET unread_count = 0 WHERE chat_id = ? AND user_id = ?",
            (chat_id, user["id"]),
        )
        cur = conn.execute(
            "UPDATE messages SET status = 'read' WHERE chat_id = ? AND sender_id != ? AND status != 'read'",
            (chat_id, user["id"]),
        )
        marked_read = cur.rowcount > 0
        conn.commit()

        now_ts = int(time.time())
        rows = conn.execute(
            "SELECT * FROM messages WHERE chat_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT ?",
            (chat_id, now_ts, limit),
        ).fetchall()
        rows = list(reversed(rows))
        messages = [serialize_message(conn, r, user["id"]) for r in rows]
    finally:
        conn.close()

    if marked_read:
        await ws_manager.broadcast_to_chat(
            chat_id, {"type": "messages_read", "chatId": chat_id, "readerId": user["id"]}, exclude_user_id=user["id"]
        )
    return {"ok": True, "messages": messages}


@router.post("/chats/{chat_id}/messages")
async def send_message(chat_id: int, body: SendMessageRequest, user: dict = Depends(get_current_user)):
    text = (body.text or "").strip()
    if not text and not body.attachment and not body.poll:
        raise HTTPException(status_code=400, detail="Empty message nahi bhej saktay")

    now = int(time.time())
    conn = get_conn()
    try:
        mem = ensure_member(conn, chat_id, user["id"])
        chat = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if chat["type"] == "channel" and mem["role"] not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Sirf channel admin post kar saktay hain")

    
        ttl = int(body.ttlSeconds) if (body.ttlSeconds and int(body.ttlSeconds) > 0) else None
        expires_at = (now + ttl) if ttl else None

        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO messages (
                chat_id, sender_id, text, reply_to_id,
                attachment_json, poll_json, status, silent, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
            """,
            (
                chat_id,
                user["id"],
                text,
                body.replyToId,
                json.dumps(body.attachment) if body.attachment else None,
                json.dumps(body.poll) if body.poll else None,
                1 if body.silent else 0,
                expires_at,
                now,
            ),
        )
        msg_id = cur.lastrowid

        # Increment unread count for all other members
        conn.execute(
            "UPDATE chat_members SET unread_count = unread_count + 1 WHERE chat_id = ? AND user_id != ?",
            (chat_id, user["id"]),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        msg_for_sender = serialize_message(conn, row, user["id"])
        msg_for_others = serialize_message(conn, row, None)
    finally:
        conn.close()

    # Push live over WebSockets
    await ws_manager.send_to_user(user["id"], {"type": "new_message", "chatId": chat_id, "message": msg_for_sender})
    await ws_manager.broadcast_to_chat(
        chat_id,
        {"type": "new_message", "chatId": chat_id, "message": msg_for_others},
        exclude_user_id=user["id"],
    )

    # Trigger Bot Engine (BotFather + Custom User Bots) asynchronously
    if _bot_message_hook:
        asyncio.create_task(_bot_message_hook(chat_id, msg_id, user, text))

    return {"ok": True, "message": msg_for_sender}


@router.put("/chats/{chat_id}/messages/{msg_id}")
async def edit_message(chat_id: int, msg_id: int, body: EditMessageRequest, user: dict = Depends(get_current_user)):
    new_text = body.text.strip()
    if not new_text:
        raise HTTPException(status_code=400, detail="Text khali nahi ho sakta")

    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        row = conn.execute("SELECT * FROM messages WHERE id = ? AND chat_id = ?", (msg_id, chat_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message nahi mila")
        if row["sender_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Sirf apna message edit kar saktay hain")

        conn.execute("UPDATE messages SET text = ?, edited = 1 WHERE id = ?", (new_text, msg_id))
        conn.commit()
        updated_row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        msg = serialize_message(conn, updated_row, user["id"])
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        chat_id, {"type": "message_edited", "chatId": chat_id, "msgId": msg_id, "text": new_text}
    )
    return {"ok": True, "message": msg}


@router.delete("/chats/{chat_id}/messages/{msg_id}")
async def delete_message(chat_id: int, msg_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        mem = ensure_member(conn, chat_id, user["id"])
        row = conn.execute("SELECT * FROM messages WHERE id = ? AND chat_id = ?", (msg_id, chat_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message nahi mila")
        if row["sender_id"] != user["id"] and mem["role"] not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Delete permission nahi hai")

        conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
        conn.execute(
            "UPDATE chats SET pinned_message_id = NULL WHERE id = ? AND pinned_message_id = ?",
            (chat_id, msg_id),
        )
        conn.commit()
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(chat_id, {"type": "message_deleted", "chatId": chat_id, "msgId": msg_id})
    return {"ok": True}


@router.post("/chats/{chat_id}/messages/{msg_id}/react")
async def react_message(chat_id: int, msg_id: int, body: ReactionRequest, user: dict = Depends(get_current_user)):
    emoji = (body.emoji or "").strip()[:8]
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji required")

    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        row = conn.execute("SELECT * FROM messages WHERE id = ? AND chat_id = ?", (msg_id, chat_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message nahi mila")

        reactions = safe_json(row["reactions_json"], {})
        users_list = reactions.get(emoji, [])
        if user["id"] in users_list:
            users_list.remove(user["id"])
        else:
            users_list.append(user["id"])

        if users_list:
            reactions[emoji] = users_list
        else:
            reactions.pop(emoji, None)

        conn.execute("UPDATE messages SET reactions_json = ? WHERE id = ?", (json.dumps(reactions), msg_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        msg_payload = serialize_message(conn, updated, None)
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        chat_id, {"type": "message_updated", "chatId": chat_id, "message": msg_payload}
    )
    return {"ok": True, "reactions": msg_payload["reactions"]}


@router.post("/chats/{chat_id}/messages/{msg_id}/pin")
async def pin_message(chat_id: int, msg_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        chat = conn.execute("SELECT pinned_message_id FROM chats WHERE id = ?", (chat_id,)).fetchone()
        new_pin = None if (chat and chat["pinned_message_id"] == msg_id) else msg_id
        conn.execute("UPDATE chats SET pinned_message_id = ? WHERE id = ?", (new_pin, chat_id))
        conn.commit()
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        chat_id, {"type": "chat_pinned", "chatId": chat_id, "pinnedMessageId": new_pin}
    )
    return {"ok": True, "pinnedMessageId": new_pin}


@router.post("/chats/{chat_id}/messages/{msg_id}/callback")
async def trigger_inline_callback(
    chat_id: int, msg_id: int, body: CallbackQueryRequest, user: dict = Depends(get_current_user)
):
    conn = get_conn()
    try:
        ensure_member(conn, chat_id, user["id"])
        row = conn.execute("SELECT * FROM messages WHERE id = ? AND chat_id = ?", (msg_id, chat_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message nahi mila")
    finally:
        conn.close()

    if _bot_callback_hook:
        result = await _bot_callback_hook(chat_id, msg_id, user, body.callbackData)
        return {"ok": True, "toast": result or ""}
    return {"ok": True, "toast": ""}
@router.post("/upload")
async def upload_media(request: Request, user: dict = Depends(get_current_user)):
    ctype_header = (request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in ctype_header:
        form = await request.form()
        up_file = form.get("file")
        if up_file is None:
            raise HTTPException(status_code=400, detail="File nahi mili")
        content = await up_file.read()
        raw_filename = getattr(up_file, "filename", None) or "upload.bin"
        file_ctype = getattr(up_file, "content_type", None) or "application/octet-stream"
    else:
        content = await request.body()
        raw_filename = unquote(request.headers.get("x-filename") or "upload.bin")
        file_ctype = request.headers.get("x-file-type") or "application/octet-stream"

    if not content:
        raise HTTPException(status_code=400, detail="File khali (0 bytes) hai")

    max_bytes = 50 * 1024 * 1024  # 50 MB limit
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="File size 50 MB se zyada nahi honi chahiye")

    orig_name = re.sub(r"[^a-zA-Z0-9._-]", "_", raw_filename)[:80] or "upload.bin"
    ext = Path(orig_name).suffix.lower()
    saved_name = f"{int(time.time())}_{secrets.token_hex(6)}{ext}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / saved_name
    dest.write_bytes(content)
    file_url = f"/uploads/{saved_name}"

    is_image = file_ctype.lower().startswith("image/") or ext in {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".jfif"
    }
    is_video = file_ctype.lower().startswith("video/") or ext in {
        ".mp4", ".mov", ".m4v", ".mkv", ".3gp", ".avi"
    }
    is_audio = (not is_video) and (
        file_ctype.lower().startswith("audio/") or ext in {
            ".webm", ".ogg", ".opus", ".mp3", ".m4a", ".wav", ".aac"
        }
    )
    size_str = (
        f"{len(content) / (1024 * 1024):.1f} MB"
        if len(content) >= 1024 * 1024
        else f"{max(1, len(content) // 1024)} KB"
    )

    att_type = "photo" if is_image else ("video" if is_video else ("voice" if is_audio else "file"))
    att_label = "Photo" if is_image else ("Video" if is_video else ("Voice message" if is_audio else orig_name))

    return {
        "ok": True,
        "attachment": {
            "type": att_type,
            "name": orig_name,
            "size": size_str,
            "src": file_url,
            "label": att_label,
        },
    }
    return {
        "ok": True,
        "attachment": {
            "type": "photo" if is_image else "file",
            "name": orig_name,
            "size": size_str,
            "src": file_url,
            "label": "Photo" if is_image else orig_name,
        },
    }
# ==================== AUTO-DELETE / DISAPPEARING MEDIA WATCHER ====================
async def run_expiry_watcher():
    """Har 1 second check karta hai ke kisi message/file ka timer khatam hua to dono taraf se delete kare."""
    while True:
        try:
            now = int(time.time())
            conn = get_conn()
            expired = []
            try:
                expired = conn.execute(
                    "SELECT id, chat_id, attachment_json FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?",
                    (now,),
                ).fetchall()
                if expired:
                    ids = [r["id"] for r in expired]
                    placeholders = ",".join("?" for _ in ids)
                    conn.execute(f"DELETE FROM messages WHERE id IN ({placeholders})", ids)
                    conn.commit()
            finally:
                conn.close()

            affected_chats = set()
            for r in expired:
                cid = r["chat_id"]
                mid = r["id"]
                affected_chats.add(cid)

                # Local upload file bhi disk se saaf karein
                att = safe_json(r["attachment_json"], None)
                if att and isinstance(att.get("src"), str) and att["src"].startswith("/uploads/"):
                    fname = Path(att["src"]).name
                    fpath = UPLOAD_DIR / fname
                    if fpath.exists():
                        try:
                            fpath.unlink()
                        except Exception:
                            pass

                await ws_manager.broadcast_to_chat(
                    cid, {"type": "message_deleted", "chatId": cid, "msgId": mid}
                )

            for cid in affected_chats:
                await ws_manager.broadcast_to_chat(cid, {"type": "chat_updated", "chatId": cid})
        except asyncio.CancelledError:
            break
        except Exception as err:
            print(f"[Expiry Watcher Error] {err}")

        await asyncio.sleep(1)
        
@router.get("/chats/{chat_id}/info")
def get_chat_info(chat_id: int, user: dict = Depends(get_current_user)):
    import sqlite3

    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        tables = {
            r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }

        def cols_of(tbl: str) -> set:
            if tbl not in tables:
                return set()
            return {r[1] for r in cur.execute(f"PRAGMA table_info({tbl})").fetchall()}

        my_id = user.get("id") or user.get("user_id")
        chat = {}
        if "chats" in tables:
            row = cur.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
            if row:
                chat = dict(row)

        other_id = None
        member_count = 0

        # 1. Pehle member tables check karein (column names auto-detect kar ke)
        for tbl in ("chat_members", "chat_participants", "participants", "members"):
            c = cols_of(tbl)
            if "chat_id" in c:
                ucol = next((x for x in ("user_id", "member_id", "account_id") if x in c), None)
                if ucol:
                    rows = cur.execute(
                        f"SELECT {ucol} FROM {tbl} WHERE chat_id = ?", (chat_id,)
                    ).fetchall()
                    ids = [r[0] for r in rows if r[0] is not None]
                    member_count = max(member_count, len(ids))
                    other_id = next((uid for uid in ids if uid != my_id), None)
                    if other_id is not None:
                        break

        # 2. Fallback: chats table ke direct columns (user1_id / user2_id / peer_id)
        if other_id is None and chat:
            for key in ("peer_id", "other_user_id", "target_user_id", "user1_id", "user2_id", "created_by", "owner_id"):
                val = chat.get(key)
                if val is not None and val != my_id:
                    other_id = val
                    break

        # 3. Fallback: messages table mein samne wale sender ko dhoondein
        if other_id is None and "messages" in tables:
            mcols = cols_of("messages")
            scol = next((x for x in ("sender_id", "user_id", "from_user_id") if x in mcols), None)
            if scol and "chat_id" in mcols:
                r = cur.execute(
                    f"SELECT {scol} FROM messages WHERE chat_id = ? AND {scol} != ? ORDER BY id DESC LIMIT 1",
                    (chat_id, my_id or -1),
                ).fetchone()
                if r:
                    other_id = r[0]

        other_user = None
        if "users" in tables:
            u_row = None
            if other_id is not None:
                u_row = cur.execute("SELECT * FROM users WHERE id = ?", (other_id,)).fetchone()
            # 4. Fallback: chat title/name se user match karein
            if not u_row and chat:
                title_guess = (chat.get("title") or chat.get("name") or "").strip().lstrip("@")
                ucols = cols_of("users")
                if title_guess:
                    for col in ("username", "display_name", "name", "full_name"):
                        if col in ucols:
                            u_row = cur.execute(
                                f"SELECT * FROM users WHERE lower({col}) = lower(?) LIMIT 1",
                                (title_guess,),
                            ).fetchone()
                            if u_row:
                                break
            if u_row:
                u = dict(u_row)
                other_user = {
                    "id": u.get("id"),
                    "name": u.get("display_name") or u.get("name") or u.get("full_name") or u.get("username") or "User",
                    "username": u.get("username") or "",
                    "phone": u.get("phone") or u.get("phone_number") or "",
                    "bio": u.get("bio") or u.get("about") or "",
                    "avatar": u.get("avatar_url") or u.get("avatar") or "",
                    "last_seen": u.get("last_seen") or u.get("status") or "",
                    "is_bot": bool(u.get("is_bot", 0)),
                }

        return {
            "ok": True,
            "chat": {
                "id": chat.get("id", chat_id),
                "type": chat.get("type") or chat.get("chat_type") or "private",
                "title": chat.get("title") or chat.get("name") or (other_user["name"] if other_user else "Chat"),
                "avatar": chat.get("avatar_url") or chat.get("avatar") or (other_user["avatar"] if other_user else ""),
                "description": chat.get("description") or chat.get("bio") or "",
                "member_count": member_count or 2,
            },
            "user": other_user,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "chat": {"id": chat_id, "type": "private", "title": "User", "avatar": "", "description": "", "member_count": 2},
            "user": None,
        }
    finally:
        conn.close()