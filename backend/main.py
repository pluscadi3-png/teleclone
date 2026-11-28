import os 
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect,  Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.auth import decode_token, router as auth_router
from backend.bot_api import (
    on_callback_query_hook,
    on_user_message_hook,
    router as bot_api_router,
)
from backend.chats import register_bot_hooks, router as chats_router, run_expiry_watcher,  UPLOAD_DIR
from backend.stories import router as stories_router
from backend.social_api import router as social_router, upsert_call_log
from backend.translate_api import router as translate_router
from backend.push import notify_incoming_call, router as push_router
from backend.database import get_conn, init_db
from backend.ws_manager import ws_manager

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    register_bot_hooks(on_user_message_hook, on_callback_query_hook)
    watcher_task = asyncio.create_task(run_expiry_watcher())
    print("🚀 TeleClone Server & Bot Engine Ready!")
    try:
        yield
    finally:
        watcher_task.cancel()
app = FastAPI(title="TeleClone Live Server", version="1.0.0", lifespan=lifespan)

@app.middleware("http")
async def no_cache_frontend_assets(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path.lower()
    if path == "/" or path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API & Bot Routers
app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(bot_api_router)
app.include_router(stories_router)
app.include_router(social_router)
app.include_router(translate_router)
app.include_router(push_router)

@app.get("/api/health")
def health_check():
    return {"ok": True, "status": "online", "service": "teleclone"}


@app.get("/api/calls/ice")
def get_call_ice_servers():
    servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
        {"urls": "stun:stun.cloudflare.com:3478"},
    ]
    turn_url = os.getenv("TURN_URL", "").strip()
    if turn_url:
        entry = {"urls": turn_url}
        if os.getenv("TURN_USERNAME", "").strip():
            entry["username"] = os.getenv("TURN_USERNAME", "").strip()
        if os.getenv("TURN_CREDENTIAL", "").strip():
            entry["credential"] = os.getenv("TURN_CREDENTIAL", "").strip()
        servers.append(entry)
    return {"ok": True, "iceServers": servers}


# ==================== REAL-TIME WEBSOCKET ENDPOINT ====================
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(default="")):
    user_id = decode_token(token)
    if not user_id:
        await ws.close(code=4001)
        return

    await ws_manager.connect(user_id, ws)
    try:
        while True:
            data = await ws.receive_json()
            ev_type = data.get("type")

            if ev_type == "typing":
                chat_id = data.get("chatId")
                if chat_id:
                    await ws_manager.broadcast_to_chat(
                        int(chat_id),
                        {"type": "typing", "chatId": int(chat_id), "userId": user_id},
                        exclude_user_id=user_id,
                    )
            elif ev_type == "ping":
                await ws.send_json({"type": "pong"})
            elif ev_type in {
                "call_offer",
                "call_answer",
                "call_ice",
                "call_ringing",
                "call_reject",
                "call_end",
                "call_busy",
            }:
                target_id = data.get("targetUserId")
                chat_id = data.get("chatId")

                if not target_id and chat_id:
                    conn = get_conn()
                    try:
                        row = conn.execute(
                            "SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? LIMIT 1",
                            (int(chat_id), user_id),
                        ).fetchone()
                        if row:
                            target_id = row["user_id"]
                    finally:
                        conn.close()

                if not target_id:
                    if ev_type == "call_offer":
                        await ws.send_json({"type": "call_offline", "callId": data.get("callId")})
                    continue

                target_id = int(target_id)
                if ev_type == "call_offer":
                    conn = get_conn()
                    try:
                        upsert_call_log(
                            conn,
                            caller_id=user_id,
                            callee_id=target_id,
                            call_type=data.get("callType", "voice"),
                            status="missed",
                            duration="00:00",
                            call_key=str(data.get("callId") or ""),
                        )
                    finally:
                        conn.close()
                elif ev_type == "call_answer":
                    conn = get_conn()
                    try:
                        upsert_call_log(
                            conn,
                            caller_id=target_id,
                            callee_id=user_id,
                            call_type=data.get("callType", "voice"),
                            status="completed",
                            duration="00:01",
                            call_key=str(data.get("callId") or ""),
                        )
                    finally:
                        conn.close()
                if ev_type == "call_offer" and not ws_manager.is_online(target_id):
                    conn = get_conn()
                    try:
                        u_off = conn.execute("SELECT name FROM users WHERE id = ?", (user_id,)).fetchone()
                        c_name = u_off["name"] if u_off else "Someone"
                    finally:
                        conn.close()
                    asyncio.create_task(
                        notify_incoming_call(target_id, c_name, data.get("callType", "voice"), chat_id)
                    )
                    await ws.send_json(
                        {
                            "type": "call_offline",
                            "callId": data.get("callId"),
                            "targetUserId": target_id,
                        }
                    )
                    continue

                relay = dict(data)
                relay["fromUserId"] = user_id
                relay["targetUserId"] = target_id

                if ev_type == "call_offer":
                    conn = get_conn()
                    try:
                        u = conn.execute(
                            "SELECT id, name, username, avatar_color, avatar_url FROM users WHERE id = ?",
                            (user_id,),
                        ).fetchone()
                        if u:
                            relay["caller"] = {
                                "id": u["id"],
                                "name": u["name"],
                                "username": u["username"] or "",
                                "avatarColor": u["avatar_color"] or "linear-gradient(135deg,#334155,#1e293b)",
                                "avatarUrl": u["avatar_url"] if "avatar_url" in u.keys() and u["avatar_url"] else "",
                            }
                    finally:
                        conn.close()

                await ws_manager.send_to_user(target_id, relay)
                if ev_type == "call_offer":
                    c_name = (relay.get("caller") or {}).get("name", "Someone")
                    asyncio.create_task(
                        notify_incoming_call(target_id, c_name, data.get("callType", "voice"), chat_id)
                    )
    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, ws)
    except Exception:
        await ws_manager.disconnect(user_id, ws)


# ==================== STATIC MEDIA & FRONTEND SERVING ====================
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

if (ROOT_DIR / "css").exists():
    app.mount("/css", StaticFiles(directory=str(ROOT_DIR / "css")), name="css")
if (ROOT_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=str(ROOT_DIR / "js")), name="js")
@app.get("/sw.js")
async def serve_service_worker():
    return FileResponse(
        ROOT_DIR / "sw.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Service-Worker-Allowed": "/",
        },
    )
@app.get("/logo.png")
async def serve_logo():
    return FileResponse(ROOT_DIR / "logo.png", media_type="image/png")
@app.get("/api/media/download/{filename}")
async def download_uploaded_media(filename: str):
    safe_name = Path(filename).name
    target = UPLOAD_DIR / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        target,
        filename=safe_name,
        media_type="application/octet-stream",
    )
@app.get("/")
def serve_frontend():
    index_file = ROOT_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"ok": True, "message": "TeleClone Backend is running (index.html not found)"}