import time
from typing import Dict, Optional, Set

from fastapi import WebSocket

from backend.database import get_conn


class ConnectionManager:
    def __init__(self):
        # user_id -> set of active WebSocket connections (multi-device/tabs)
        self.active: Dict[int, Set[WebSocket]] = {}

    def is_online(self, user_id: int) -> bool:
        return bool(self.active.get(user_id))

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        first_connection = user_id not in self.active or len(self.active[user_id]) == 0
        self.active.setdefault(user_id, set()).add(ws)

        now = int(time.time())
        conn = get_conn()
        try:
            conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now, user_id))
            conn.commit()
        finally:
            conn.close()

        if first_connection:
            await self.broadcast_presence(user_id, online=True, last_seen=now)

    async def disconnect(self, user_id: int, ws: WebSocket):
        conns = self.active.get(user_id)
        if conns and ws in conns:
            conns.remove(ws)
            if not conns:
                del self.active[user_id]
                now = int(time.time())
                conn = get_conn()
                try:
                    conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now, user_id))
                    conn.commit()
                finally:
                    conn.close()
                await self.broadcast_presence(user_id, online=False, last_seen=now)

    async def send_to_user(self, user_id: int, event: dict):
        conns = list(self.active.get(user_id, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(user_id, ws)

    async def broadcast_to_chat(
        self, chat_id: int, event: dict, exclude_user_id: Optional[int] = None
    ):
        conn = get_conn()
        try:
            rows = conn.execute(
                "SELECT user_id FROM chat_members WHERE chat_id = ?", (chat_id,)
            ).fetchall()
        finally:
            conn.close()

        for row in rows:
            uid = row["user_id"]
            if exclude_user_id is not None and uid == exclude_user_id:
                continue
            if self.is_online(uid):
                await self.send_to_user(uid, event)

    async def broadcast_presence(self, user_id: int, online: bool, last_seen: int):
        """Notifies only online users who share a chat with this user."""
        conn = get_conn()
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT cm2.user_id
                FROM chat_members cm1
                JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
                WHERE cm1.user_id = ? AND cm2.user_id != ?
                """,
                (user_id, user_id),
            ).fetchall()
        finally:
            conn.close()

        event = {
            "type": "user_status",
            "userId": user_id,
            "online": online,
            "lastSeen": last_seen,
        }
        for row in rows:
            if self.is_online(row["user_id"]):
                await self.send_to_user(row["user_id"], event)


ws_manager = ConnectionManager()