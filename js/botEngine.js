/* =========================================================
   TELECLONE BOT ENGINE (@BotFather, INLINE KB & MINI APPS)
   ========================================================= */

(function () {
  // @BotFather multi-step state
  let bfSession = { step: null, tempName: "" };

  function generateBotToken() {
    const botId = Math.floor(100000000 + Math.random() * 899999999);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    let secret = "AA";
    for (let i = 0; i < 28; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${botId}:${secret}`;
  }

  function refreshUI(chatId) {
    if (window.App) window.App.renderAll();
    if (window.ChatUI && Store.getState().activeChatId === chatId) {
      window.ChatUI.renderActiveChat();
    }
  }

  function sendBotReply(chatId, text, extra = {}, delay = 380) {
    // Typing status show karein
    if (window.ChatUI && Store.getState().activeChatId === chatId) {
      window.ChatUI.setTempStatus("typing...");
    }

    setTimeout(() => {
      Store.addMessage(chatId, {
        sender: "them",
        senderName: extra.senderName || "",
        text,
        inlineKeyboard: extra.inlineKeyboard || null
      });
      if (extra.replyKeyboard !== undefined) {
        Store.setReplyKeyboard(chatId, extra.replyKeyboard);
      }
      refreshUI(chatId);
    }, delay);
  }

  // ==================== 1. @BotFather LOGIC ====================
  function handleBotFather(text) {
    const chatId = "chat_botfather";
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "/cancel") {
      bfSession = { step: null, tempName: "" };
      sendBotReply(chatId, "Current operation cancelled. Send /newbot or /mybots to continue.");
      return;
    }

    if (lower === "/start" || lower === "/help") {
      bfSession = { step: null, tempName: "" };
      sendBotReply(
        chatId,
        "I can help you create and manage **TeleClone bots**.\n\n" +
          "Commands:\n" +
          "/newbot - Create a new bot\n" +
          "/mybots - Manage your bots & API tokens\n" +
          "/setcommands - Update bot command menu\n" +
          "/cancel - Cancel current action",
        {
          inlineKeyboard: [
            [
              { text: "➕ Create New Bot", callback_data: "bf:newbot" },
              { text: "🤖 My Bots", callback_data: "bf:mybots" }
            ],
            [{ text: "📖 Bot API Format", callback_data: "bf:api_docs" }]
          ]
        }
      );
      return;
    }

    if (lower === "/newbot") {
      bfSession = { step: "await_name", tempName: "" };
      sendBotReply(
        chatId,
        "Alright, a new bot! How are we going to call it?\nPlease choose a **name** for your bot (e.g. `My Shop Bot`)."
      );
      return;
    }

    if (lower === "/mybots") {
      bfSession = { step: null, tempName: "" };
      showMyBotsMessage(chatId);
      return;
    }

    if (lower === "/setcommands") {
      bfSession = { step: null, tempName: "" };
      const bots = Store.getUserBots();
      if (bots.length === 0) {
        sendBotReply(chatId, "You don't have any bots yet. Send /newbot first.");
        return;
      }
      sendBotReply(chatId, "Choose a bot from /mybots to add custom slash commands directly into its Menu button.");
      return;
    }

    // Step 1: Receive Bot Display Name
    if (bfSession.step === "await_name") {
      if (trimmed.length < 2) {
        sendBotReply(chatId, "Name is too short. Please enter at least 2 characters.");
        return;
      }
      bfSession.tempName = trimmed;
      bfSession.step = "await_username";
      sendBotReply(
        chatId,
        `Good! Now choose a **username** for **${trimmed}**.\n` +
          `It must end in \`bot\` (for example: \`TetrisBot\` or \`my_helper_bot\`).`
      );
      return;
    }

    // Step 2: Receive Bot Username & Create Bot
    if (bfSession.step === "await_username") {
      const clean = trimmed.replace(/^@/, "");
      const valid = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(clean) && clean.toLowerCase().endsWith("bot");
      if (!valid) {
        sendBotReply(
          chatId,
          "❌ Invalid username. Use only letters, numbers, and underscores, and it must end with `bot` (e.g. `NewsAlertBot`)."
        );
        return;
      }

      const exists = Store.getState().chats.some(
        (c) => (c.username || "").toLowerCase() === ("@" + clean).toLowerCase()
      );
      if (exists) {
        sendBotReply(chatId, "Sorry, this username is already taken. Please try another username.");
        return;
      }

      const token = generateBotToken();
      const newBot = Store.createBotChat({
        name: bfSession.tempName,
        username: clean,
        token
      });

      bfSession = { step: null, tempName: "" };

      sendBotReply(
        chatId,
        `✅ Done! Congratulations on your new bot **${newBot.name}** (${newBot.username}).\n\n` +
          `Use this token to access the HTTP Bot API (tap token to copy):\n` +
          `\`${token}\`\n\n` +
          `Your new bot has been added to the sidebar. Tap the button below to test it right away!`,
        {
          inlineKeyboard: [
            [{ text: `💬 Open ${newBot.username}`, callback_data: `bf:open:${newBot.id}` }],
            [{ text: "⚙️ Manage My Bots", callback_data: "bf:mybots" }]
          ]
        }
      );
      return;
    }

    sendBotReply(chatId, "Unrecognized command. Send /newbot to create a bot, or /mybots to manage existing bots.");
  }

  function showMyBotsMessage(chatId, editMsgId = null) {
    const bots = Store.getUserBots();
    if (bots.length === 0) {
      const txt = "You currently have no bots. Send /newbot to create one.";
      if (editMsgId) {
        Store.editMessage(chatId, editMsgId, txt, [[{ text: "➕ Create New Bot", callback_data: "bf:newbot" }]]);
        refreshUI(chatId);
      } else {
        sendBotReply(chatId, txt, {
          inlineKeyboard: [[{ text: "➕ Create New Bot", callback_data: "bf:newbot" }]]
        });
      }
      return;
    }

    const rows = bots.map((b) => [{ text: `🤖 ${b.name} (${b.username})`, callback_data: `bf:manage:${b.id}` }]);
    rows.push([{ text: "➕ Create Another Bot", callback_data: "bf:newbot" }]);

    const txt = "Choose a bot from the list below to view its **API Token** or edit settings:";
    if (editMsgId) {
      Store.editMessage(chatId, editMsgId, txt, rows);
      refreshUI(chatId);
    } else {
      sendBotReply(chatId, txt, { inlineKeyboard: rows });
    }
  }

  // ==================== 2. MEDIA LOBBY BOT DEMO ====================
  function handleLobbyBot(text) {
    const chatId = "chat_lobby_bot";
    const lower = text.trim().toLowerCase();

    if (lower === "/start") {
      sendBotReply(
        chatId,
        "👋 Welcome to **Media Lobby Bot**!\n" +
          "Test both **Inline Buttons** and **Custom Reply Keyboard** live below:",
        {
          inlineKeyboard: [
            [
              { text: "✅ Join Active Lobby", callback_data: "lobby:join" },
              { text: "📊 Live Stats", callback_data: "lobby:refresh" }
            ],
            [{ text: "🚀 Launch Lobby Mini App", callback_data: "miniapp:Lobby Dashboard" }]
          ],
          replyKeyboard: [
            ["📊 Lobby Stats", "📢 Broadcast Demo"],
            ["🚀 Open Mini App", "❌ Hide Keyboard"]
          ]
        }
      );
      return;
    }

    if (lower === "/stats" || lower.includes("lobby stats")) {
      const online = 42 + Math.floor(Math.random() * 18);
      sendBotReply(
        chatId,
        `📊 **Lobby Live Statistics**\n• Active Members: **${online}**\n• Shared Media Today: **184**\n• Worker Threads: **8 Active**`,
        {
          inlineKeyboard: [[{ text: "🔄 Refresh Stats", callback_data: "lobby:refresh" }]]
        }
      );
      return;
    }

    if (lower === "/broadcast" || lower.includes("broadcast demo")) {
      const msg = Store.addMessage(chatId, {
        sender: "them",
        text: "📡 Starting parallel broadcast to 48 members... (0%)"
      });
      refreshUI(chatId);

      setTimeout(() => {
        Store.editMessage(chatId, msg.id, "📡 Broadcasting media... 55% (26/48 delivered)");
        refreshUI(chatId);
      }, 700);

      setTimeout(() => {
        Store.editMessage(chatId, msg.id, "✅ Broadcast Complete! 48/48 members received your message in 1.3s.");
        refreshUI(chatId);
      }, 1500);
      return;
    }

    if (lower.includes("open mini app")) {
      openMiniApp(Store.getChatById(chatId), "Lobby Dashboard");
      return;
    }

    if (lower.includes("hide keyboard")) {
      sendBotReply(chatId, "Custom keyboard hidden. Send /start anytime to bring it back.", {
        replyKeyboard: null
      });
      return;
    }

    sendBotReply(chatId, `📥 Media Lobby Bot received: "${text}"\nTry /start, /stats or /broadcast.`);
  }

  // ==================== 3. USER-CREATED CUSTOM BOTS ====================
  function handleCustomBot(chat, text) {
    const lower = text.trim().toLowerCase();

    if (lower === "/start") {
      sendBotReply(
        chat.id,
        `🤖 Hello! I am **${chat.name}** (${chat.username}).\n` +
          `Status: **Online (Local Bot Engine)**\n\n` +
          `Once connected to the backend, you can run a Python or JS webhook using my token.`,
        {
          inlineKeyboard: [
            [
              { text: "🏓 Ping Bot", callback_data: "bot:ping" },
              { text: "🔌 Webhook JSON", callback_data: "bot:webhook" }
            ],
            [{ text: "🚀 Open Mini App", callback_data: `miniapp:${chat.name} App` }]
          ]
        }
      );
      return;
    }

    if (lower === "/help") {
      const list = (chat.botCommands || [])
        .map((c) => `${c.command} — ${c.description}`)
        .join("\n");
      sendBotReply(chat.id, `📋 **Available Commands:**\n${list}`);
      return;
    }

    if (lower === "/status" || lower === "/ping") {
      sendBotReply(
        chat.id,
        `🟢 **${chat.name}** is running smoothly.\nLatency: \`14ms\`\nToken: \`${(chat.botToken || "").slice(0, 14)}...\``
      );
      return;
    }

    // Echo + simulated Bot API Update JSON
    const payload = JSON.stringify(
      {
        update_id: Math.floor(100000 + Math.random() * 900000),
        message: { from: Store.getActiveAccount().username, text }
      },
      null,
      2
    );
    sendBotReply(
      chat.id,
      `⚡ **Webhook Event Preview:**\n\`${payload}\`\n\n(This JSON payload will be POSTed directly to your bot server.)`
    );
  }

  // ==================== 4. NORMAL CHAT SIMULATED REPLY ====================
  function handleHumanReply(chat, text) {
    if (chat.type === "saved" || chat.type === "channel") return;

    const replies =
      chat.type === "group"
        ? [
            { senderName: "Zain", text: "Awesome! The UI feels super clean and smooth 🔥" },
            { senderName: "Ali", text: "Agreed, everything is coming together nicely." }
          ]
        : [
            { senderName: "", text: `Got it: "${text.slice(0, 40)}" 👍` },
            { senderName: "", text: "Nice! Did you try the @BotFather feature?" }
          ];

    const pick = replies[Math.floor(Math.random() * replies.length)];
    sendBotReply(chat.id, pick.text, { senderName: pick.senderName }, 1100);
  }

  // ==================== 5. INLINE CALLBACK QUERY HANDLER ====================
  function handleCallbackQuery(chatId, msgId, data) {
    const showToast = (t) => window.App && window.App.showToast(t);

    if (data === "bf:newbot") {
      handleBotFather("/newbot");
      return;
    }

    if (data === "bf:mybots") {
      showMyBotsMessage(chatId, msgId);
      return;
    }

    if (data === "bf:api_docs") {
      sendBotReply(
        chatId,
        "📘 **Planned Phase 2 Bot API Endpoints:**\n" +
          "• `POST /bot<TOKEN>/sendMessage`\n" +
          "• `POST /bot<TOKEN>/editMessageText`\n" +
          "• `POST /bot<TOKEN>/setWebhook`\n" +
          "• `GET  /bot<TOKEN>/getUpdates`"
      );
      return;
    }

    if (data.startsWith("bf:open:")) {
      const targetId = data.replace("bf:open:", "");
      if (window.App) window.App.openChat(targetId);
      return;
    }

    if (data.startsWith("bf:manage:")) {
      const targetId = data.replace("bf:manage:", "");
      const bot = Store.getChatById(targetId);
      if (!bot) return showToast("Bot not found");

      Store.editMessage(
        chatId,
        msgId,
        `⚙️ **Manage ${bot.name}** (${bot.username})\n\n` +
          `🔑 API Token (tap to copy):\n\`${bot.botToken || "No token"}\`\n\n` +
          `📋 Registered Commands: **${(bot.botCommands || []).length}**`,
        [
          [
            { text: "🔄 Revoke Token", callback_data: `bf:revoke:${bot.id}` },
            { text: "➕ Add /ping Cmd", callback_data: `bf:addcmd:${bot.id}` }
          ],
          [{ text: `💬 Open ${bot.username}`, callback_data: `bf:open:${bot.id}` }],
          [{ text: "« Back to My Bots", callback_data: "bf:mybots" }]
        ]
      );
      refreshUI(chatId);
      return;
    }

    if (data.startsWith("bf:revoke:")) {
      const targetId = data.replace("bf:revoke:", "");
      const bot = Store.getChatById(targetId);
      if (!bot) return;
      const newToken = generateBotToken();
      Store.updateBotToken(targetId, newToken);
      showToast("New API token generated!");
      handleCallbackQuery(chatId, msgId, `bf:manage:${targetId}`);
      return;
    }

    if (data.startsWith("bf:addcmd:")) {
      const targetId = data.replace("bf:addcmd:", "");
      Store.addBotCommand(targetId, "/ping", "Check bot response speed");
      showToast("Added /ping to bot Menu!");
      handleCallbackQuery(chatId, msgId, `bf:manage:${targetId}`);
      return;
    }

    if (data === "lobby:join") {
      showToast("✅ You joined the Active Lobby!");
      Store.editMessage(
        chatId,
        msgId,
        "🎉 **Joined!** You are now a member of the Active Lobby and can receive live media broadcasts.",
        [
          [
            { text: "✅ Joined", callback_data: "lobby:refresh" },
            { text: "📊 Live Stats", callback_data: "lobby:refresh" }
          ],
          [{ text: "🚀 Launch Lobby Mini App", callback_data: "miniapp:Lobby Dashboard" }]
        ]
      );
      refreshUI(chatId);
      return;
    }

    if (data === "lobby:refresh") {
      const online = 42 + Math.floor(Math.random() * 25);
      const msgs = 180 + Math.floor(Math.random() * 40);
      Store.editMessage(
        chatId,
        msgId,
        `📊 **Lobby Live Statistics** (Updated ${Store.formatTime()})\n` +
          `• Active Members: **${online}**\n` +
          `• Shared Media Today: **${msgs}**\n` +
          `• Worker Threads: **8 Active**`,
        [[{ text: "🔄 Refresh Stats", callback_data: "lobby:refresh" }]]
      );
      refreshUI(chatId);
      showToast("Stats refreshed");
      return;
    }

    if (data === "bot:ping") {
      const ms = 9 + Math.floor(Math.random() * 22);
      showToast(`🏓 Pong! (${ms}ms)`);
      return;
    }

    if (data === "bot:webhook") {
      const bot = Store.getChatById(chatId);
      sendBotReply(
        chatId,
        `🔌 **Sample Webhook Endpoint:**\n\`POST https://your-server.com/webhook\`\n` +
          `Header: \`X-TeleClone-Bot-Token: ${(bot?.botToken || "").slice(0, 12)}...\``
      );
      return;
    }

    if (data.startsWith("miniapp:")) {
      const title = data.replace("miniapp:", "");
      const bot = Store.getChatById(chatId);
      openMiniApp(bot, title);
    }
  }

  // ==================== 6. INTERACTIVE MINI APP MODAL ====================
  function openMiniApp(botChat, title = "Bot Mini App") {
    const modal = document.getElementById("mini-app-modal");
    const titleEl = document.getElementById("mini-app-title");
    const subEl = document.getElementById("mini-app-subtitle");
    const bodyEl = document.getElementById("mini-app-body");

    if (!modal || !bodyEl) return;

    titleEl.textContent = title;
    subEl.textContent = botChat ? botChat.username : "@TeleCloneApp";

    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="padding:16px;border-radius:14px;background:var(--bg-secondary);border:1px solid var(--border-color);">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">Connected Bot</div>
          <div style="font-size:17px;font-weight:700;">${botChat ? botChat.name : "TeleClone"}</div>
          <div style="font-size:12.5px;color:var(--accent-color);margin-top:2px;">WebView Bridge Active ✓</div>
        </div>

        <div style="padding:16px;border-radius:14px;background:var(--bg-secondary);border:1px solid var(--border-color);">
          <div style="font-weight:600;margin-bottom:8px;">Send Data Back to Bot (Telegram WebApp.sendData demo)</div>
          <input id="miniapp-payload-input" type="text" placeholder="Type order ID or command..."
            style="width:100%;padding:10px 12px;border-radius:10px;background:var(--bg-primary);border:1px solid var(--border-color);margin-bottom:10px;color:var(--text-primary);" />
          <button id="miniapp-send-btn"
            style="width:100%;padding:11px;border-radius:10px;background:var(--accent-color);color:#fff;font-weight:700;">
            Send Data to Bot Chat
          </button>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");

    const sendBtn = document.getElementById("miniapp-send-btn");
    const input = document.getElementById("miniapp-payload-input");
    sendBtn.onclick = () => {
      const val = input.value.trim() || "MiniApp Action Confirmed";
      modal.classList.add("hidden");
      if (botChat) {
        Store.addMessage(botChat.id, { sender: "me", text: `📲 [Mini App Data]: ${val}` });
        refreshUI(botChat.id);
        window.BotEngine.onUserMessage(botChat.id, val);
      }
    };
  }

  // ==================== PUBLIC API ====================
  window.BotEngine = {
    onUserMessage(chatId, text) {
      const chat = Store.getChatById(chatId);
      if (!chat) return;

      if (chatId === "chat_botfather") {
        handleBotFather(text);
      } else if (chatId === "chat_lobby_bot") {
        handleLobbyBot(text);
      } else if (chat.isBot) {
        handleCustomBot(chat, text);
      } else {
        handleHumanReply(chat, text);
      }
    },

    onCallbackQuery(chatId, msgId, callbackData) {
      handleCallbackQuery(chatId, msgId, callbackData);
    },

    openMiniApp
  };
})();