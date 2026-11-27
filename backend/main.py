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
from backend.social_api import router as social_router
from backend.database import init_db
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

@app.get("/api/health")
def health_check():
    return {"ok": True, "status": "online", "service": "teleclone"}


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