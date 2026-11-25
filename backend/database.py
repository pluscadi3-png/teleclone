import json
import os
import sqlite3
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR)))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "teleclone.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # 1. Users & Bots Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        bio TEXT DEFAULT '',
        avatar_color TEXT DEFAULT 'linear-gradient(135deg, #667eea, #764ba2)',
        is_bot INTEGER DEFAULT 0,
        verified INTEGER DEFAULT 0,
        bot_owner_id INTEGER,
        bot_token TEXT UNIQUE,
        webhook_url TEXT DEFAULT '',
        webhook_secret TEXT DEFAULT '',
        bot_commands_json TEXT DEFAULT '[]',
        last_seen INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (bot_owner_id) REFERENCES users(id) ON DELETE SET NULL
    );
    """)
    # 7. Stories Table (24-hour Text + Photo Stories)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT DEFAULT '',
        media_url TEXT DEFAULT '',
        bg_color TEXT DEFAULT 'linear-gradient(155deg, #667eea, #764ba2)',
        likes_json TEXT DEFAULT '[]',
        views_json TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    # 8. Contacts Table (Real Saved Contacts)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        owner_id INTEGER NOT NULL,
        contact_user_id INTEGER NOT NULL,
        custom_name TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, contact_user_id),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 9. Call Logs Table (Outgoing, Incoming & Missed Calls)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caller_id INTEGER NOT NULL,
        callee_id INTEGER NOT NULL,
        call_type TEXT DEFAULT 'voice',
        status TEXT DEFAULT 'completed',
        duration TEXT DEFAULT '0:00',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    # 10. Users table mein profile photo column add karein (safe migration)
    try:
        cur.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT '';")
    except sqlite3.OperationalError:
        pass

    # 11. Profile Posts & Archived Posts Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS profile_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        caption TEXT DEFAULT '',
        media_url TEXT DEFAULT '',
        bg_color TEXT DEFAULT 'linear-gradient(135deg, #667eea, #764ba2)',
        archived INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    # 12. Messages table mein auto-delete expiry column add karein
    try:
        cur.execute("ALTER TABLE messages ADD COLUMN expires_at INTEGER DEFAULT NULL;")
    except sqlite3.OperationalError:
        pass
    
    
    # 2. OTP Verification Codes (Auth Login)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0
    );
    """)

    # 3. Chats (personal, group, channel, bot, saved, secret)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT DEFAULT '',
        username TEXT UNIQUE,
        description TEXT DEFAULT '',
        avatar_color TEXT DEFAULT 'linear-gradient(135deg, #3390ec, #6c5ce7)',
        created_by INTEGER,
        pinned_message_id INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    """)

    # 4. Chat Members & Per-User State (Pin, Mute, Archive, Admin Role)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_members (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        muted INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        unread_count INTEGER DEFAULT 0,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, user_id),
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 5. Messages (Text, Attachments, Polls, Reactions, Inline Keyboards)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        text TEXT DEFAULT '',
        reply_to_id INTEGER,
        attachment_json TEXT,
        poll_json TEXT,
        inline_keyboard_json TEXT,
        reactions_json TEXT DEFAULT '{}',
        status TEXT DEFAULT 'sent',
        edited INTEGER DEFAULT 0,
        silent INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 6. Bot Updates Queue (Powers BOTH /getUpdates Long Polling & Webhooks)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bot_updates (
        update_id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        delivered INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Performance Indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bot_updates_bot ON bot_updates(bot_id, update_id);")

    # Seed Official System @BotFather if missing
    existing_bf = cur.execute(
        "SELECT id FROM users WHERE LOWER(username) = 'botfather'"
    ).fetchone()

    if not existing_bf:
        bf_commands = json.dumps([
            {"command": "/newbot", "description": "Create a new bot & API token"},
            {"command": "/mybots", "description": "List & manage your bots"},
            {"command": "/setwebhook", "description": "Configure bot webhook URL"},
            {"command": "/help", "description": "Show Bot API guide"}
        ])
        cur.execute(
            """
            INSERT INTO users (
                phone, username, name, bio, avatar_color,
                is_bot, verified, bot_token, bot_commands_json,
                last_seen, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,
                "BotFather",
                "BotFather",
                "Official TeleClone bot to create and manage bots & HTTP API tokens.",
                "linear-gradient(135deg, #3390ec, #6c5ce7)",
                1,
                1,
                "SYSTEM_BOTFATHER_INTERNAL",
                bf_commands,
                int(time.time()),
                int(time.time()),
            ),
        )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"✅ Database initialized successfully at: {DB_PATH}")