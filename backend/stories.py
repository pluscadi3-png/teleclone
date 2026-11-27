import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user, make_initials
from backend.database import get_conn
from backend.ws_manager import ws_manager

router = APIRouter(prefix="/api/stories", tags=["stories"])

STORY_TTL_SECONDS = 60 * 60 * 24  # 24 hours


class CreateStoryReq(BaseModel):
    text: str = ""
    mediaUrl: str = ""
    bg: str = "linear-gradient(155deg, #667eea, #764ba2)"


def safe_list(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except Exception:
        return []


def time_ago(ts: int) -> str:
    diff = max(0, int(time.time()) - ts)
    if diff < 60:
        return "Just now"
    if diff < 3600:
        return f"{diff // 60}m ago"
    return f"{diff // 3600}h ago"


@router.get("")
def list_stories(user: dict = Depends(get_current_user)):
    now = int(time.time())
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT s.*, u.name, u.username, u.avatar_color, u.avatar_url
            FROM stories s
            JOIN users u ON u.id = s.user_id
            WHERE s.expires_at > ?
            ORDER BY s.created_at DESC
            """,
            (now,),
        ).fetchall()

        # Har user ki sabse latest active story dikhayein
        seen_users = set()
        results = []
        for r in rows:
            if r["user_id"] in seen_users:
                continue
            seen_users.add(r["user_id"])
            likes = safe_list(r["likes_json"])
            views = safe_list(r["views_json"])
            is_mine = r["user_id"] == user["id"]
            results.append(
                {
                    "id": str(r["id"]),
                    "dbId": r["id"],
                    "userId": r["user_id"],
                    "name": "My Story" if is_mine else r["name"],
                    "username": "@" + r["username"].lstrip("@"),
                    "initials": make_initials(r["name"]),
                    "color": r["avatar_color"],
                    "avatarUrl": r["avatar_url"] or "",
                    "isMine": is_mine,
                    "hasLiveStory": True,
                    "text": r["text"] or "",
                    "mediaUrl": r["media_url"] or "",
                    "bg": r["bg_color"],
                    "time": time_ago(r["created_at"]),
                    "seen": (user["id"] in views) and not is_mine,
                    "liked": user["id"] in likes,
                    "likesCount": len(likes),
                    "viewsCount": len(views),
                }
            )
        return {"ok": True, "stories": results}
    finally:
        conn.close()


@router.post("")
async def create_story(body: CreateStoryReq, user: dict = Depends(get_current_user)):
    text = (body.text or "").strip()[:300]
    media_url = (body.mediaUrl or "").strip()
    if not text and not media_url:
        raise HTTPException(status_code=400, detail="Please provide text or a photo for your story")

    now = int(time.time())
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO stories (user_id, text, media_url, bg_color, likes_json, views_json, created_at, expires_at)
            VALUES (?, ?, ?, ?, '[]', '[]', ?, ?)
            """,
            (user["id"], text, media_url, body.bg, now, now + STORY_TTL_SECONDS),
        )
        story_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    # Sab online users ko notify karein taake unke stories bar mein foran aa jaye
    for uid in list(ws_manager.active.keys()):
        await ws_manager.send_to_user(uid, {"type": "story_posted", "storyId": story_id})

    return {"ok": True, "storyId": story_id}


@router.post("/{story_id}/view")
def view_story(story_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        row = conn.execute("SELECT views_json FROM stories WHERE id = ?", (story_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        views = safe_list(row["views_json"])
        if user["id"] not in views:
            views.append(user["id"])
            conn.execute("UPDATE stories SET views_json = ? WHERE id = ?", (json.dumps(views), story_id))
            conn.commit()
        return {"ok": True, "viewsCount": len(views)}
    finally:
        conn.close()


@router.post("/{story_id}/like")
def toggle_story_like(story_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        row = conn.execute("SELECT likes_json FROM stories WHERE id = ?", (story_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        likes = safe_list(row["likes_json"])
        if user["id"] in likes:
            likes.remove(user["id"])
            liked = False
        else:
            likes.append(user["id"])
            liked = True
        conn.execute("UPDATE stories SET likes_json = ? WHERE id = ?", (json.dumps(likes), story_id))
        conn.commit()
        return {"ok": True, "liked": liked, "likesCount": len(likes)}
    finally:
        conn.close()


@router.delete("/{story_id}")
async def delete_story(story_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM stories WHERE id = ? AND user_id = ?", (story_id, user["id"]))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Story not found")
    finally:
        conn.close()

    for uid in list(ws_manager.active.keys()):
        await ws_manager.send_to_user(uid, {"type": "story_posted"})
    return {"ok": True}