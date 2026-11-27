import asyncio
import json
import re
import secrets
import time
from typing import Any, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.chats import ensure_member, safe_json, serialize_message
from backend.database import get_conn
from backend.ws_manager import ws_manager

router = APIRouter(tags=["bot_api"])

# @BotFather multi-step state (user_id -> session dict)
_bf_sessions: dict[int, dict[str, Any]] = {}

BOT_AVATAR_COLORS = [
    "linear-gradient(135deg, #6c5ce7, #a29bfe)",
    "linear-gradient(135deg, #00b894, #55efc4)",
    "linear-gradient(135deg, #0984e3, #74b9ff)",
    "linear-gradient(135deg, #e84393, #fd79a8)",
    "linear-gradient(135deg, #f39c12, #f1c40f)",
]


# ==================== REQUEST SCHEMAS (TELEGRAM-COMPATIBLE) ====================
class BotSendMessageReq(BaseModel):
    chat_id: int
    text: str
    reply_to_message_id: Optional[int] = None
    reply_markup: Optional[dict] = None
    disable_notification: bool = False


class BotEditMessageReq(BaseModel):
    chat_id: int
    message_id: int
    text: str
    reply_markup: Optional[dict] = None


class BotDeleteMessageReq(BaseModel):
    chat_id: int
    message_id: int


class BotSetWebhookReq(BaseModel):
    url: str
    secret_token: Optional[str] = ""


class BotCommandItem(BaseModel):
    command: str
    description: str


class BotSetCommandsReq(BaseModel):
    commands: List[BotCommandItem]


# ==================== INTERNAL HELPERS ====================
def generate_bot_token(bot_user_id: int) -> str:
    secret = "AA" + secrets.token_urlsafe(24)
    return f"{bot_user_id}:{secret}"


def get_bot_by_token(token: str):
    if not token or token == "SYSTEM_BOTFATHER_INTERNAL":
        raise HTTPException(status_code=401, detail="Invalid bot token")
    conn = get_conn()
    try:
        bot = conn.execute(
            "SELECT * FROM users WHERE bot_token = ? AND is_bot = 1", (token,)
        ).fetchone()
        if not bot:
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid bot token")
        return dict(bot)
    finally:
        conn.close()


def extract_inline_keyboard(reply_markup: Optional[dict]) -> Optional[list]:
    if not isinstance(reply_markup, dict):
        return None
    kb = reply_markup.get("inline_keyboard")
    return kb if isinstance(kb, list) else None


async def post_message_as_bot(
    bot_id: int,
    chat_id: int,
    text: str,
    inline_keyboard: Optional[list] = None,
    reply_to_id: Optional[int] = None,
    silent: bool = False,
) -> dict:
    now = int(time.time())
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO messages (
                chat_id, sender_id, text, reply_to_id,
                inline_keyboard_json, status, silent, created_at
            ) VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)
            """,
            (
                chat_id,
                bot_id,
                text,
                reply_to_id,
                json.dumps(inline_keyboard) if inline_keyboard else None,
                1 if silent else 0,
                now,
            ),
        )
        msg_id = cur.lastrowid
        conn.execute(
            "UPDATE chat_members SET unread_count = unread_count + 1 WHERE chat_id = ? AND user_id != ?",
            (chat_id, bot_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        msg_payload = serialize_message(conn, row, None)
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        chat_id, {"type": "new_message", "chatId": chat_id, "message": msg_payload}
    )
    return msg_payload


async def edit_message_as_bot(
    bot_id: int,
    chat_id: int,
    msg_id: int,
    text: str,
    inline_keyboard: Any = "__KEEP__",
) -> dict:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ? AND chat_id = ? AND sender_id = ?",
            (msg_id, chat_id, bot_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bot message not found")

        if inline_keyboard == "__KEEP__":
            conn.execute("UPDATE messages SET text = ?, edited = 1 WHERE id = ?", (text, msg_id))
        else:
            conn.execute(
                "UPDATE messages SET text = ?, inline_keyboard_json = ?, edited = 1 WHERE id = ?",
                (text, json.dumps(inline_keyboard) if inline_keyboard else None, msg_id),
            )
        conn.commit()
        updated = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        msg_payload = serialize_message(conn, updated, None)
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        chat_id, {"type": "message_updated", "chatId": chat_id, "message": msg_payload}
    )
    return msg_payload


async def dispatch_webhook(url: str, secret: str, update_payload: dict):
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-TeleClone-Bot-Api-Secret-Token"] = secret
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(url, json=update_payload, headers=headers)
    except Exception as err:
        print(f"[Webhook Failed] {url}: {err}")


async def enqueue_bot_update(bot_row, payload: dict):
    now = int(time.time())
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO bot_updates (bot_id, payload_json, delivered, created_at) VALUES (?, ?, 0, ?)",
            (bot_row["id"], json.dumps(payload), now),
        )
        update_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    full_update = {"update_id": update_id, **payload}
    webhook_url = (bot_row["webhook_url"] or "").strip()
    if webhook_url:
        asyncio.create_task(dispatch_webhook(webhook_url, bot_row["webhook_secret"] or "", full_update))


# ==================== OFFICIAL SERVER-SIDE @BotFather ====================
async def handle_botfather_message(bf_id: int, chat_id: int, user: dict, text: str):
    uid = user["id"]
    trimmed = (text or "").strip()
    lower = trimmed.lower()
    sess = _bf_sessions.get(uid, {})

    if lower == "/cancel":
        _bf_sessions.pop(uid, None)
        await post_message_as_bot(bf_id, chat_id, "Operation cancelled. Send /newbot or /mybots.")
        return

    if lower in ("/start", "/help"):
        _bf_sessions.pop(uid, None)
        await post_message_as_bot(
            bf_id,
            chat_id,
            "I am **@BotFather** — create and manage real **TeleClone Bots**.\n\n"
            "Commands:\n"
            "/newbot - Create a new bot & HTTP API token\n"
            "/mybots - View your bots, tokens & webhooks\n"
            "/cancel - Cancel current step",
            inline_keyboard=[
                [
                    {"text": "➕ Create New Bot", "callback_data": "bf:newbot"},
                    {"text": "🤖 My Bots", "callback_data": "bf:mybots"},
                ]
            ],
        )
        return

    if lower == "/newbot":
        _bf_sessions[uid] = {"step": "await_name"}
        await post_message_as_bot(
            bf_id,
            chat_id,
            "Alright, a new bot! How are we going to call it?\nPlease send a **name** for your bot (e.g. `My Support Bot`).",
        )
        return

    if lower == "/mybots":
        _bf_sessions.pop(uid, None)
        await send_mybots_menu(bf_id, chat_id, uid)
        return

    # Step 1: Display Name
    if sess.get("step") == "await_name":
        if len(trimmed) < 2:
            await post_message_as_bot(bf_id, chat_id, "Name must be at least 2 characters long.")
            return
        _bf_sessions[uid] = {"step": "await_username", "name": trimmed[:64]}
        await post_message_as_bot(
            bf_id,
            chat_id,
            f"Good! Now choose a **username** for **{trimmed[:64]}**.\n"
            "It must end in `bot` (e.g. `MyHelperBot` or `shop_alert_bot`).",
        )
        return

    # Step 2: Username -> Create Real Bot User + Token + Direct Chat
    if sess.get("step") == "await_username":
        clean = trimmed.lstrip("@")
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9_]{3,31}$", clean) or not clean.lower().endswith("bot"):
            await post_message_as_bot(
                bf_id,
                chat_id,
                "❌ Invalid username. Use only letters, numbers, and underscores, and it must end with `bot`.",
            )
            return

        now = int(time.time())
        conn = get_conn()
        try:
            taken = conn.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (clean,)
            ).fetchone()
            if taken:
                await post_message_as_bot(bf_id, chat_id, "This username is already taken. Please try another one.")
                return

            cur = conn.cursor()
            color = BOT_AVATAR_COLORS[secrets.randbelow(len(BOT_AVATAR_COLORS))]
            default_cmds = json.dumps([
                {"command": "/start", "description": "Start this bot"},
                {"command": "/help", "description": "Show help"},
            ])
            cur.execute(
                """
                INSERT INTO users (
                    phone, username, name, bio, avatar_color,
                    is_bot, verified, bot_owner_id, bot_token,
                    bot_commands_json, last_seen, created_at
                ) VALUES (NULL, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?)
                """,
                (
                    clean,
                    sess["name"],
                    f"Bot created by {user['username']}",
                    color,
                    uid,
                    "TEMP_" + secrets.token_hex(12),
                    default_cmds,
                    now,
                    now,
                ),
            )
            bot_user_id = cur.lastrowid
            token = generate_bot_token(bot_user_id)
            cur.execute("UPDATE users SET bot_token = ? WHERE id = ?", (token, bot_user_id))

            # Owner ke liye naye bot ki chat bhi create kar dein
            cur.execute(
                "INSERT INTO chats (type, title, created_by, created_at) VALUES ('bot', ?, ?, ?)",
                (sess["name"], uid, now),
            )
            bot_chat_id = cur.lastrowid
            cur.execute(
                "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
                (bot_chat_id, uid, now),
            )
            cur.execute(
                "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                (bot_chat_id, bot_user_id, now),
            )
            conn.commit()
        finally:
            conn.close()

        _bf_sessions.pop(uid, None)
        await ws_manager.send_to_user(uid, {"type": "chat_created", "chatId": bot_chat_id})

        await post_message_as_bot(
            bf_id,
            chat_id,
            f"✅ Done! Congratulations on your new bot **{sess['name']}** (@{clean}).\n\n"
            f"Use this HTTP API Token (tap to copy):\n`{token}`\n\n"
            f"API Base URL: `/bot{token}/sendMessage`\n"
            f"Chat ID for testing: `{bot_chat_id}`",
            inline_keyboard=[
                [{"text": f"💬 Open @{clean}", "callback_data": f"bf:open:{bot_chat_id}"}],
                [{"text": "⚙️ Manage My Bots", "callback_data": "bf:mybots"}],
            ],
        )
        return

    # Step 3: Set Webhook URL
    if sess.get("step") == "await_webhook":
        bot_id = sess["bot_id"]
        url = "" if lower == "clear" else trimmed
        if url and not (url.startswith("http://") or url.startswith("https://")):
            await post_message_as_bot(bf_id, chat_id, "Please send a valid `https://` URL (or type `clear` to remove the webhook).")
            return

        conn = get_conn()
        try:
            conn.execute("UPDATE users SET webhook_url = ? WHERE id = ? AND bot_owner_id = ?", (url, bot_id, uid))
            conn.commit()
        finally:
            conn.close()

        _bf_sessions.pop(uid, None)
        await post_message_as_bot(
            bf_id,
            chat_id,
            f"✅ Webhook updated: `{url or 'Disabled (Long Polling Mode)'}`",
        )
        return

    await post_message_as_bot(bf_id, chat_id, "Send /newbot to create a bot, or /mybots to manage your bots.")


async def send_mybots_menu(bf_id: int, chat_id: int, owner_id: int, edit_msg_id: Optional[int] = None):
    conn = get_conn()
    try:
        bots = conn.execute(
            "SELECT id, name, username FROM users WHERE bot_owner_id = ? AND is_bot = 1 ORDER BY id DESC",
            (owner_id,),
        ).fetchall()
    finally:
        conn.close()

    if not bots:
        txt = "You don't have any bots yet. Send /newbot to create your first bot!"
        kb = [[{"text": "➕ Create New Bot", "callback_data": "bf:newbot"}]]
    else:
        txt = "Select a bot to view its **API Token**, revoke it, or configure its **Webhook URL**:"
        kb = [[{"text": f"🤖 {b['name']} (@{b['username']})", "callback_data": f"bf:manage:{b['id']}"}] for b in bots]
        kb.append([{"text": "➕ Create New Bot", "callback_data": "bf:newbot"}])

    if edit_msg_id:
        await edit_message_as_bot(bf_id, chat_id, edit_msg_id, txt, kb)
    else:
        await post_message_as_bot(bf_id, chat_id, txt, kb)


async def handle_botfather_callback(bf_id: int, chat_id: int, msg_id: int, user: dict, data: str) -> str:
    uid = user["id"]

    if data == "bf:newbot":
        await handle_botfather_message(bf_id, chat_id, user, "/newbot")
        return "Send your new bot name"

    if data == "bf:mybots":
        await send_mybots_menu(bf_id, chat_id, uid, edit_msg_id=msg_id)
        return ""

    if data.startswith("bf:manage:"):
        bot_id = int(data.split(":")[2])
        conn = get_conn()
        try:
            bot = conn.execute(
                "SELECT * FROM users WHERE id = ? AND bot_owner_id = ?", (bot_id, uid)
            ).fetchone()
            chat_row = conn.execute(
                """
                SELECT c.id FROM chats c
                JOIN chat_members m1 ON c.id = m1.chat_id AND m1.user_id = ?
                JOIN chat_members m2 ON c.id = m2.chat_id AND m2.user_id = ?
                WHERE c.type = 'bot' LIMIT 1
                """,
                (uid, bot_id),
            ).fetchone()
        finally:
            conn.close()

        if not bot:
            return "Bot not found"

        kb = [
            [
                {"text": "🔄 Revoke Token", "callback_data": f"bf:revoke:{bot_id}"},
                {"text": "🌐 Set Webhook", "callback_data": f"bf:webhook:{bot_id}"},
            ]
        ]
        if chat_row:
            kb.append([{"text": f"💬 Open @{bot['username']}", "callback_data": f"bf:open:{chat_row['id']}"}])
        kb.append([{"text": "« Back to My Bots", "callback_data": "bf:mybots"}])

        await edit_message_as_bot(
            bf_id,
            chat_id,
            msg_id,
            f"⚙️ **Manage {bot['name']}** (@{bot['username']})\n\n"
            f"🔑 API Token (tap to copy):\n`{bot['bot_token']}`\n\n"
            f"🌐 Webhook: `{bot['webhook_url'] or 'Not set (Use /getUpdates)'}`",
            kb,
        )
        return ""

    if data.startswith("bf:revoke:"):
        bot_id = int(data.split(":")[2])
        new_token = generate_bot_token(bot_id)
        conn = get_conn()
        try:
            conn.execute(
                "UPDATE users SET bot_token = ? WHERE id = ? AND bot_owner_id = ?",
                (new_token, bot_id, uid),
            )
            conn.commit()
        finally:
            conn.close()
        await handle_botfather_callback(bf_id, chat_id, msg_id, user, f"bf:manage:{bot_id}")
        return "New API token generated!"

    if data.startswith("bf:webhook:"):
        bot_id = int(data.split(":")[2])
        _bf_sessions[uid] = {"step": "await_webhook", "bot_id": bot_id}
        await post_message_as_bot(
            bf_id,
            chat_id,
            "Send your bot server's `https://...` Webhook URL (or type `clear` to switch to Long Polling).",
        )
        return "Send Webhook URL"

    return ""


# ==================== HOOKS CALLED BY chats.py ====================
async def on_user_message_hook(chat_id: int, msg_id: int, user: dict, text: str):
    """Checks each message to see if @BotFather or a custom bot is in the chat."""
    conn = get_conn()
    try:
        bots = conn.execute(
            """
            SELECT u.* FROM chat_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.chat_id = ? AND u.is_bot = 1 AND u.id != ?
            """,
            (chat_id, user["id"]),
        ).fetchall()
        chat = conn.execute("SELECT id, type, title FROM chats WHERE id = ?", (chat_id,)).fetchone()
    finally:
        conn.close()

    if not bots:
        return

    for bot in bots:
        if bot["username"].lower() == "botfather":
            await handle_botfather_message(bot["id"], chat_id, user, text)
        else:
            payload = {
                "message": {
                    "message_id": msg_id,
                    "from": {
                        "id": user["id"],
                        "name": user["name"],
                        "username": user["username"].lstrip("@"),
                    },
                    "chat": {
                        "id": chat_id,
                        "type": chat["type"] if chat else "bot",
                        "title": chat["title"] if chat else "",
                    },
                    "date": int(time.time()),
                    "text": text,
                }
            }
            await enqueue_bot_update(bot, payload)


async def on_callback_query_hook(chat_id: int, msg_id: int, user: dict, callback_data: str) -> str:
    conn = get_conn()
    try:
        msg = conn.execute("SELECT sender_id FROM messages WHERE id = ? AND chat_id = ?", (msg_id, chat_id)).fetchone()
        if not msg:
            return ""
        bot = conn.execute("SELECT * FROM users WHERE id = ? AND is_bot = 1", (msg["sender_id"],)).fetchone()
    finally:
        conn.close()

    if not bot:
        return ""

    if bot["username"].lower() == "botfather":
        return await handle_botfather_callback(bot["id"], chat_id, msg_id, user, callback_data)

    payload = {
        "callback_query": {
            "id": secrets.token_hex(8),
            "from": {
                "id": user["id"],
                "name": user["name"],
                "username": user["username"].lstrip("@"),
            },
            "message": {"message_id": msg_id, "chat": {"id": chat_id}},
            "data": callback_data,
        }
    }
    await enqueue_bot_update(bot, payload)
    return "Sent to bot..."


# ==================== EXTERNAL TELEGRAM-COMPATIBLE HTTP BOT API ====================
@router.get("/bot{token}/getMe")
def bot_get_me(token: str):
    bot = get_bot_by_token(token)
    return {
        "ok": True,
        "result": {
            "id": bot["id"],
            "is_bot": True,
            "name": bot["name"],
            "username": bot["username"],
            "webhook_url": bot["webhook_url"] or "",
        },
    }


@router.post("/bot{token}/sendMessage")
async def bot_send_message(token: str, body: BotSendMessageReq):
    bot = get_bot_by_token(token)
    conn = get_conn()
    try:
        ensure_member(conn, body.chat_id, bot["id"])
    finally:
        conn.close()

    kb = extract_inline_keyboard(body.reply_markup)
    msg = await post_message_as_bot(
        bot_id=bot["id"],
        chat_id=body.chat_id,
        text=body.text,
        inline_keyboard=kb,
        reply_to_id=body.reply_to_message_id,
        silent=body.disable_notification,
    )
    return {"ok": True, "result": msg}


@router.post("/bot{token}/editMessageText")
async def bot_edit_message(token: str, body: BotEditMessageReq):
    bot = get_bot_by_token(token)
    kb = extract_inline_keyboard(body.reply_markup) if body.reply_markup is not None else "__KEEP__"
    msg = await edit_message_as_bot(bot["id"], body.chat_id, body.message_id, body.text, kb)
    return {"ok": True, "result": msg}


@router.post("/bot{token}/deleteMessage")
async def bot_delete_message(token: str, body: BotDeleteMessageReq):
    bot = get_bot_by_token(token)
    conn = get_conn()
    try:
        ensure_member(conn, body.chat_id, bot["id"])
        conn.execute("DELETE FROM messages WHERE id = ? AND chat_id = ?", (body.message_id, body.chat_id))
        conn.commit()
    finally:
        conn.close()

    await ws_manager.broadcast_to_chat(
        body.chat_id, {"type": "message_deleted", "chatId": body.chat_id, "msgId": body.message_id}
    )
    return {"ok": True, "result": True}


@router.post("/bot{token}/setMyCommands")
def bot_set_commands(token: str, body: BotSetCommandsReq):
    bot = get_bot_by_token(token)
    cleaned = [
        {
            "command": c.command if c.command.startswith("/") else "/" + c.command,
            "description": c.description[:120],
        }
        for c in body.commands[:30]
    ]
    conn = get_conn()
    try:
        conn.execute("UPDATE users SET bot_commands_json = ? WHERE id = ?", (json.dumps(cleaned), bot["id"]))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "result": True}


@router.post("/bot{token}/setWebhook")
def bot_set_webhook(token: str, body: BotSetWebhookReq):
    bot = get_bot_by_token(token)
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE users SET webhook_url = ?, webhook_secret = ? WHERE id = ?",
            (body.url.strip(), (body.secret_token or "").strip(), bot["id"]),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "description": "Webhook was set"}


@router.post("/bot{token}/deleteWebhook")
def bot_delete_webhook(token: str):
    bot = get_bot_by_token(token)
    conn = get_conn()
    try:
        conn.execute("UPDATE users SET webhook_url = '', webhook_secret = '' WHERE id = ?", (bot["id"],))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "description": "Webhook was deleted"}


@router.api_route("/bot{token}/getUpdates", methods=["GET", "POST"])
async def bot_get_updates(
    token: str,
    offset: int = Query(default=0),
    limit: int = Query(default=50, ge=1, le=100),
    timeout: int = Query(default=0, ge=0, le=25),
):
    """Telegram-style Long Polling endpoint for bots without webhooks."""
    bot = get_bot_by_token(token)
    deadline = time.time() + timeout

    while True:
        conn = get_conn()
        try:
            if offset > 0:
                conn.execute(
                    "DELETE FROM bot_updates WHERE bot_id = ? AND update_id < ?",
                    (bot["id"], offset),
                )
                conn.commit()

            rows = conn.execute(
                """
                SELECT update_id, payload_json
                FROM bot_updates
                WHERE bot_id = ? AND update_id >= ?
                ORDER BY update_id ASC
                LIMIT ?
                """,
                (bot["id"], offset, limit),
            ).fetchall()
        finally:
            conn.close()

        if rows or time.time() >= deadline:
            results = [{"update_id": r["update_id"], **safe_json(r["payload_json"], {})} for r in rows]
            return {"ok": True, "result": results}

        await asyncio.sleep(0.4)