/* =========================================================
   TELECLONE LIVE BACKEND & WEBSOCKET BRIDGE (STEP 4)
   Replaces all local demo/fake data with live FastAPI server
   ========================================================= */

(function () {
  const JWT_KEY = "teleclone_live_jwt";
  const $ = (id) => document.getElementById(id);

  const authEls = {
    screen: $("auth-screen"),
    heading: $("auth-heading"),
    sub: $("auth-sub"),
    stepPhone: $("auth-step-phone"),
    stepOtp: $("auth-step-otp"),
    phoneInput: $("auth-phone-input"),
    sendOtpBtn: $("auth-send-otp-btn"),
    demoOtpBox: $("auth-demo-otp-box"),
    otpInput: $("auth-otp-input"),
    regFields: $("auth-register-fields"),
    nameInput: $("auth-name-input"),
    userInput: $("auth-username-input"),
    verifyBtn: $("auth-verify-otp-btn"),
    backBtn: $("auth-back-phone-btn"),
    error: $("auth-error")
  };

  let currentUser = null;
  let ws = null;
  let wsReconnectTimer = null;
  let wsPingTimer = null;
  let lastTypingSent = 0;
  let searchDebounce = null;
  let pendingPhone = "";
  let isNewUserFlow = false;

  // ==================== 1. IMMEDIATELY WIPE ALL FAKE DUMMY DATA ====================
  function clearFakeDummyData() {
    const state = Store.getState();
    state.chats = [];
    state.stories = [];
    state.contacts = [];
    state.calls = [];
    state.activeChatId = null;
    state.accounts = [
      {
        id: "loading",
        name: "Signing in...",
        username: "@user",
        phone: "",
        initials: "TC",
        color: "linear-gradient(135deg, #667eea, #764ba2)",
        bio: ""
      }
    ];
    state.activeAccountId = "loading";
    if (window.App) window.App.renderAll();
  }

  // ==================== 2. HTTP API CLIENT ====================
  function getToken() {
    return localStorage.getItem(JWT_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(JWT_KEY, token);
    else localStorage.removeItem(JWT_KEY);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: isFormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setToken("");
      showAuthScreen("Session expired. Please sign in again.");
      throw new Error(data.detail || "Unauthorized");
    }
    if (!res.ok) {
      throw new Error(data.detail || `Request failed (${res.status})`);
    }
    return data;
  }

  // ==================== 3. NORMALIZERS (STRING IDS FOR UI COMPATIBILITY) ====================
  function normalizeMessage(m) {
    const myId = currentUser ? String(currentUser.id) : "";
    return {
      ...m,
      id: String(m.id),
      chatId: String(m.chatId),
      senderId: String(m.senderId),
      sender: myId && String(m.senderId) === myId ? "me" : "them"
    };
  }

  function normalizeChat(c, existingMessages = null) {
    return {
      ...c,
      id: String(c.id),
      peerUserId: c.peerUserId ? String(c.peerUserId) : null,
      pinnedMessageId: c.pinnedMessageId ? String(c.pinnedMessageId) : null,
      botStarted: true,
      messages: existingMessages !== null ? existingMessages : []
    };
  }

  function resolveChatId(chatId) {
    if (!chatId) return null;
    const chats = Store.getState().chats;
    if (chatId === "chat_saved") {
      const saved = chats.find((c) => c.type === "saved");
      return saved ? saved.id : null;
    }
    if (chatId === "chat_botfather") {
      const bf = chats.find((c) => (c.username || "").toLowerCase() === "@botfather");
      return bf ? bf.id : null;
    }
    return String(chatId);
  }

  // ==================== 4. SYNC CHATS & MESSAGES FROM SERVER ====================
  async function syncChats() {
    const res = await api("/api/chats");
    const state = Store.getState();
    const oldMap = new Map(state.chats.map((c) => [String(c.id), c.messages || []]));

    state.chats = (res.chats || []).map((c) => normalizeChat(c, oldMap.get(String(c.id)) || []));
    if (window.App) window.App.renderAll();
    if (window.ChatUI && state.activeChatId) {
      window.ChatUI.renderActiveChat(true);
    }
  }

  async function loadChatMessages(chatId) {
    const cid = resolveChatId(chatId);
    if (!cid) return;
    try {
      const res = await api(`/api/chats/${cid}/messages?limit=80`);
      const chat = Store.getChatById(cid);
      if (!chat) return;
      chat.messages = (res.messages || []).map(normalizeMessage);
      chat.unreadCount = 0;
      if (window.App) window.App.renderAll();
      if (window.ChatUI && Store.getState().activeChatId === cid) {
        window.ChatUI.renderActiveChat();
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }

  // ==================== 5. REAL-TIME WEBSOCKET ENGINE ====================
  window.TCWS = {
    send(payload) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return true;
      }
      return false;
    },
    isOpen() {
      return Boolean(ws && ws.readyState === WebSocket.OPEN);
    }
  };

  function connectWebSocket() {
    const token = getToken();
    if (!token) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      clearInterval(wsPingTimer);
      wsPingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const state = Store.getState();

      if (data && typeof data.type === "string" && data.type.startsWith("call_")) {
        window.dispatchEvent(new CustomEvent("tc-call-signal", { detail: data }));
        return;
      }

      if (data.type === "new_message") {
        const cid = String(data.chatId);
        const msg = normalizeMessage(data.message);
        let chat = Store.getChatById(cid);

        if (!chat) {
          await syncChats();
          chat = Store.getChatById(cid);
        }
        if (!chat) return;

        if (!Array.isArray(chat.messages)) chat.messages = [];
        const reconciled =
          msg.sender === "me" && window.TCOptimistic
            ? window.TCOptimistic.reconcileIncoming(cid, msg)
            : false;
        if (!reconciled && !chat.messages.some((m) => String(m.id) === msg.id)) {
          chat.messages.push(msg);
        }

        const preview =
          msg.text ||
          (msg.attachment ? `📎 ${msg.attachment.label || msg.attachment.name || "Media"}` : "Message");
        chat.lastMessage = preview.replace(/\n/g, " ").slice(0, 70);
        chat.lastSender = msg.sender === "me" ? "You" : chat.type === "group" ? msg.senderName : "";
        chat.lastTime = msg.time;
        chat.lastTimestamp = msg.timestamp || Date.now();

        if (state.activeChatId === cid) {
          chat.unreadCount = 0;
          if (msg.sender !== "me") {
            // Mark read on server silently
            api(`/api/chats/${cid}/messages?limit=1`).catch(() => {});
          }
          if (window.ChatUI) window.ChatUI.renderActiveChat();
        } else if (msg.sender !== "me") {
          chat.unreadCount = (chat.unreadCount || 0) + 1;
        }

        if (window.App) window.App.renderAll();
      } else if (data.type === "message_edited") {
        const chat = Store.getChatById(String(data.chatId));
        if (!chat) return;
        const m = (chat.messages || []).find((x) => String(x.id) === String(data.msgId));
        if (m) {
          m.text = data.text;
          m.edited = true;
          if (window.ChatUI && state.activeChatId === chat.id) window.ChatUI.renderActiveChat(true);
        }
      } else if (data.type === "message_updated") {
        const cid = String(data.chatId);
        const updated = normalizeMessage(data.message);
        const chat = Store.getChatById(cid);
        if (!chat) return;
        const idx = (chat.messages || []).findIndex((x) => String(x.id) === updated.id);
        if (idx !== -1) {
          chat.messages[idx] = updated;
          if (window.ChatUI && state.activeChatId === cid) window.ChatUI.renderActiveChat(true);
        }
      } else if (data.type === "message_deleted") {
        const chat = Store.getChatById(String(data.chatId));
        if (!chat) return;
        chat.messages = (chat.messages || []).filter((x) => String(x.id) !== String(data.msgId));
        if (window.App) window.App.renderAll();
        if (window.ChatUI && state.activeChatId === chat.id) window.ChatUI.renderActiveChat(true);
      } else if (data.type === "messages_read") {
        const chat = Store.getChatById(String(data.chatId));
        if (!chat) return;
        (chat.messages || []).forEach((m) => {
          if (m.sender === "me") m.status = "read";
        });
        if (window.ChatUI && state.activeChatId === chat.id) window.ChatUI.renderActiveChat(true);
      } else if (data.type === "chat_pinned") {
        const chat = Store.getChatById(String(data.chatId));
        if (!chat) return;
        chat.pinnedMessageId = data.pinnedMessageId ? String(data.pinnedMessageId) : null;
        if (window.ChatUI && state.activeChatId === chat.id) window.ChatUI.renderActiveChat(true);
      } else if (data.type === "chat_created" || data.type === "chat_updated") {
        await syncChats();
      } else if (data.type === "user_status") {
        const uid = String(data.userId);
        state.chats.forEach((c) => {
          if (c.peerUserId === uid && !c.isBot) {
            c.online = !!data.online;
            c.statusText = data.online ? "online" : "last seen recently";
          }
        });
        if (window.App) window.App.renderAll();
        if (window.ChatUI && state.activeChatId) window.ChatUI.renderActiveChat(true);
        } else if (data.type === "story_posted") {
        await loadLiveStories();
      } else if (data.type === "typing") {
        if (state.activeChatId === String(data.chatId) && window.ChatUI) {
          window.ChatUI.setTempStatus("typing...");
        }
      }
    };

    ws.onclose = () => {
      clearInterval(wsPingTimer);
      if (getToken()) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(connectWebSocket, 3000);
      }
    };
  }

  function disconnectWebSocket() {
    clearTimeout(wsReconnectTimer);
    clearInterval(wsPingTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  // ==================== 6. OVERRIDE STORE & BOT ENGINE FOR LIVE API ====================
  function patchStoreAndModules() {
    // Keep Store.save() for local visual settings only (not overwriting live server chats)
    const origGetChatById = Store.getChatById.bind(Store);
    Store.getChatById = function (chatId) {
      const resolved = resolveChatId(chatId);
      if (!resolved) return null;
      return origGetChatById(resolved);
    };

    // Disable local fake bot & fake human auto-replies
    if (window.BotEngine) {
      window.BotEngine.onUserMessage = function () {};
      window.BotEngine.onCallbackQuery = async function (chatId, msgId, callbackData) {
        if (callbackData && callbackData.startsWith("bf:open:")) {
          const targetId = callbackData.replace("bf:open:", "");
          await syncChats();
          if (window.App) window.App.openChat(String(targetId));
          return;
        }
        try {
          const res = await api(`/api/chats/${chatId}/messages/${msgId}/callback`, {
            method: "POST",
            body: { callbackData }
          });
          if (res.toast && window.App) window.App.showToast(res.toast);
        } catch (err) {
          if (window.App) window.App.showToast(err.message);
        }
      };
    }

    // Override addMessage -> Upload media (if data URL) + POST /api/chats/{id}/messages
   // Override addMessage -> Instant optimistic bubble + upload + POST /api/chats/{id}/messages
    Store.addMessage = function (chatId, msgData) {
      const cid = resolveChatId(chatId);
      if (!cid) return null;

      const rawAtt = msgData.attachment || null;
      const existingTempId = rawAtt && rawAtt._tempId ? rawAtt._tempId : null;
      let cleanAtt = rawAtt ? { ...rawAtt } : null;
      if (cleanAtt) {
        delete cleanAtt._tempId;
        delete cleanAtt._uploading;
      }

      const tempId = existingTempId
        ? existingTempId
        : window.TCOptimistic
        ? window.TCOptimistic.pushPending(cid, { ...msgData, attachment: cleanAtt })
        : null;

      (async () => {
        try {
          let attachment = cleanAtt;
          if (attachment && attachment.src && attachment.src.startsWith("data:")) {
            const blob = await fetch(attachment.src).then((r) => r.blob());
            const fd = new FormData();
            fd.append("file", blob, attachment.name || "photo.png");
            const up = await api("/api/upload", { method: "POST", body: fd });
            attachment = up.attachment;
          }

          const res = await api(`/api/chats/${cid}/messages`, {
            method: "POST",
            body: {
              text: msgData.text || "",
              replyToId: msgData.replyTo?.id ? Number(msgData.replyTo.id) : null,
              attachment,
              poll: msgData.poll || null,
              silent: !!msgData.silent
            }
          });
          if (tempId && window.TCOptimistic) {
            window.TCOptimistic.markSent(
              cid,
              tempId,
              res && res.message ? normalizeMessage(res.message) : null
            );
          }
        } catch (err) {
          if (tempId && window.TCOptimistic) {
            window.TCOptimistic.markFailed(cid, tempId);
          }
          if (window.App) window.App.showToast(err.message);
        }
      })();
      return null;
    };

    Store.editMessage = function (chatId, msgId, newText) {
      const cid = resolveChatId(chatId);
      api(`/api/chats/${cid}/messages/${msgId}`, {
        method: "PUT",
        body: { text: newText }
      }).catch((e) => window.App && window.App.showToast(e.message));
    };

    Store.deleteMessage = function (chatId, msgId) {
      const cid = resolveChatId(chatId);
      api(`/api/chats/${cid}/messages/${msgId}`, { method: "DELETE" }).catch(
        (e) => window.App && window.App.showToast(e.message)
      );
    };

    Store.toggleReaction = function (chatId, msgId, emoji) {
      const cid = resolveChatId(chatId);
      api(`/api/chats/${cid}/messages/${msgId}/react`, {
        method: "POST",
        body: { emoji }
      }).catch((e) => window.App && window.App.showToast(e.message));
    };

    Store.pinMessage = function (chatId, msgId) {
      const cid = resolveChatId(chatId);
      if (!msgId) return;
      api(`/api/chats/${cid}/messages/${msgId}/pin`, { method: "POST" }).catch(
        (e) => window.App && window.App.showToast(e.message)
      );
    };

    Store.togglePin = function (chatId) {
      const chat = Store.getChatById(chatId);
      if (!chat) return false;
      chat.pinned = !chat.pinned;
      api(`/api/chats/${chat.id}/state`, { method: "PUT", body: { pinned: chat.pinned } }).catch(() => {});
      return chat.pinned;
    };

    Store.toggleMute = function (chatId) {
      const chat = Store.getChatById(chatId);
      if (!chat) return false;
      chat.muted = !chat.muted;
      api(`/api/chats/${chat.id}/state`, { method: "PUT", body: { muted: chat.muted } }).catch(() => {});
      return chat.muted;
    };

    Store.toggleArchive = function (chatId) {
      const chat = Store.getChatById(chatId);
      if (!chat) return false;
      chat.archived = !chat.archived;
      api(`/api/chats/${chat.id}/state`, { method: "PUT", body: { archived: chat.archived } }).catch(() => {});
      return chat.archived;
    };

    Store.deleteChat = function (chatId) {
      const cid = resolveChatId(chatId);
      if (!cid) return;
      const state = Store.getState();
      state.chats = state.chats.filter((c) => c.id !== cid);
      if (state.activeChatId === cid) state.activeChatId = null;
      api(`/api/chats/${cid}`, { method: "DELETE" }).catch(() => {});
    };

    Store.createGroupChat = function ({ name, description, members }) {
      const memberIds = (members || []).map((m) => Number(m.id)).filter((n) => !isNaN(n));
      api("/api/chats/group", {
        method: "POST",
        body: { name, description, memberIds }
      })
        .then(async (res) => {
          await syncChats();
          if (res.chat && window.App) window.App.openChat(String(res.chat.id));
        })
        .catch((e) => window.App && window.App.showToast(e.message));
      return { id: null, name };
    };

    Store.createChannelChat = function ({ name, username, description }) {
      api("/api/chats/channel", {
        method: "POST",
        body: { name, username, description }
      })
        .then(async (res) => {
          await syncChats();
          if (res.chat && window.App) window.App.openChat(String(res.chat.id));
        })
        .catch((e) => window.App && window.App.showToast(e.message));
      return { id: null, name };
    };

    Store.addMemberToGroup = function (chatId, member) {
      const cid = resolveChatId(chatId);
      api(`/api/chats/${cid}/members`, {
        method: "POST",
        body: { username: member.username }
      })
        .then(() => syncChats())
        .catch((e) => window.App && window.App.showToast(e.message));
      return true;
    };

    Store.updateActiveProfile = function ({ name, username, bio }) {
      api("/api/auth/profile", {
        method: "PUT",
        body: { name, username, bio }
      })
        .then((res) => {
          if (res.user) applyLoggedInUser(res.user);
        })
        .catch((e) => window.App && window.App.showToast(e.message));
      return Store.getActiveAccount();
    };

    // Hook into chat open to load real message history from DB
    const prevOpen = window.App.openChat;
    // Fix: Sidebar se chat click karte hi DB se messages load hon
    const prevOnChatOpened = window.onChatOpened;
    window.onChatOpened = function (chatId) {
      const resolved = resolveChatId(chatId);
      if (typeof prevOnChatOpened === "function") prevOnChatOpened(resolved || chatId);
      if (resolved) loadChatMessages(resolved);
    };
    window.App.openChat = function (chatId) {
      const resolved = resolveChatId(chatId);
      if (!resolved) return;
      prevOpen(resolved);
      loadChatMessages(resolved);
    };

    // Emit typing over WS
    const msgInput = $("msg-input");
    if (msgInput) {
      msgInput.addEventListener("input", () => {
        const cid = Store.getState().activeChatId;
        const now = Date.now();
        if (cid && ws && ws.readyState === WebSocket.OPEN && now - lastTypingSent > 2000) {
          lastTypingSent = now;
          ws.send(JSON.stringify({ type: "typing", chatId: Number(cid) }));
        }
      });
    }
  }

  // ==================== 7. GLOBAL DIRECTORY SEARCH (FIND REAL USERS, BOTS & CHANNELS) ====================
  function setupGlobalDirectorySearch() {
    const searchInput = $("global-search");
    const chatList = $("chat-list");
    if (!searchInput || !chatList) return;

    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      const q = searchInput.value.trim();
      if (q.length < 2) return;

      searchDebounce = setTimeout(async () => {
        try {
          const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
          if (searchInput.value.trim() !== q) return;

          const users = res.users || [];
          const chats = res.chats || [];
          if (users.length === 0 && chats.length === 0) return;

          // Purana global block hatayein
          const old = $("global-directory-block");
          if (old) old.remove();

          const wrap = document.createElement("div");
          wrap.id = "global-directory-block";
          wrap.innerHTML = `
            <div class="global-search-header">Global Search (Users, Bots & Channels)</div>
            ${users
              .map(
                (u) => `
              <div class="global-result-item" data-start-dm="${u.id}">
                <div class="avatar avatar-md" style="background:${u.avatarColor}">${App.escapeHtml(u.initials)}</div>
                <div class="chat-content">
                  <div class="chat-name-wrap">
                    <span class="chat-name">${App.escapeHtml(u.name)}</span>
                    ${u.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                    ${u.verified ? '<span class="verified-badge">✔</span>' : ""}
                  </div>
                  <div class="chat-last-msg">${App.escapeHtml(u.username)} • Tap to message</div>
                </div>
              </div>
            `
              )
              .join("")}
            ${chats
              .map(
                (c) => `
              <div class="global-result-item" data-join-chat="${c.id}">
                <div class="avatar avatar-md" style="background:${c.avatarColor}">${App.escapeHtml(c.initials)}</div>
                <div class="chat-content">
                  <div class="chat-name">${App.escapeHtml(c.name)}</div>
                  <div class="chat-last-msg">${App.escapeHtml(c.username || c.type)} • Tap to join</div>
                </div>
              </div>
            `
              )
              .join("")}
          `;
          chatList.appendChild(wrap);
        } catch (err) {
          console.warn("Global search error:", err);
        }
      }, 280);
    });

    chatList.addEventListener("click", async (e) => {
      const dmItem = e.target.closest("[data-start-dm]");
      if (dmItem) {
        try {
          const res = await api("/api/chats/direct", {
            method: "POST",
            body: { targetUserId: Number(dmItem.dataset.startDm) }
          });
          $("search-clear-btn")?.click();
          await syncChats();
          if (res.chat && window.App) window.App.openChat(String(res.chat.id));
        } catch (err) {
          if (window.App) window.App.showToast(err.message);
        }
        return;
      }

      const joinItem = e.target.closest("[data-join-chat]");
      if (joinItem) {
        try {
          const res = await api(`/api/chats/${joinItem.dataset.joinChat}/join`, { method: "POST" });
          $("search-clear-btn")?.click();
          await syncChats();
          if (res.chat && window.App) window.App.openChat(String(res.chat.id));
        } catch (err) {
          if (window.App) window.App.showToast(err.message);
        }
      }
    });
  }

  // ==================== 8. AUTH SCREEN & SESSION BOOT ====================
  function applyLoggedInUser(user) {
    currentUser = user;
    const state = Store.getState();
    const acc = {
      id: String(user.id),
      name: user.name,
      username: user.username,
      phone: user.phone,
      initials: user.initials,
      color: user.avatarColor,
      avatarUrl: user.avatarUrl || "",
      bio: user.bio || ""
    };
    state.accounts = [acc];
    state.activeAccountId = acc.id;
    state.stories = [
      { id: "st_1", name: "My Story", initials: acc.initials, color: "#54a9eb", isMine: true, seen: false }
    ];
    if (window.App) window.App.renderAll();
  }

  function showAuthScreen(errorMsg = "") {
    disconnectWebSocket();
    clearFakeDummyData();
    authEls.error.textContent = errorMsg;
    authEls.stepPhone.classList.remove("hidden");
    authEls.stepOtp.classList.add("hidden");
    authEls.screen.classList.remove("hidden");
  }

  function injectLogoutButton() {
    const menu = document.querySelector(".drawer-menu");
    if (!menu || $("live-logout-btn")) return;
    const btn = document.createElement("button");
    btn.id = "live-logout-btn";
    btn.className = "drawer-item";
    btn.style.color = "var(--danger-color)";
    btn.innerHTML = `<span class="drawer-icon">🚪</span><span>Log Out</span>`;
    btn.addEventListener("click", () => {
      if (!confirm("Log out of TeleClone?")) return;
      setToken("");
      showAuthScreen();
      if (window.App) window.App.showToast("Logged out");
    });
    menu.appendChild(btn);
  }

  async function bootLiveSession() {
    if (!getToken()) {
      showAuthScreen();
      return;
    }
    try {
      const me = await api("/api/auth/me");
      applyLoggedInUser(me.user);
      authEls.screen.classList.add("hidden");
      await syncChats();
      await loadLiveStories();
      connectWebSocket();
    } catch {
      showAuthScreen();
    }
  }

  function bindAuthEvents() {
    authEls.sendOtpBtn.addEventListener("click", async () => {
      const phone = authEls.phoneInput.value.trim();
      authEls.error.textContent = "";
      if (!phone) return (authEls.error.textContent = "Please enter your phone number.");

      authEls.sendOtpBtn.disabled = true;
      try {
        const res = await api("/api/auth/request-otp", {
          method: "POST",
          body: { phone }
        });
        pendingPhone = res.phone;
        isNewUserFlow = !!res.isNewUser;

        authEls.stepPhone.classList.add("hidden");
        authEls.stepOtp.classList.remove("hidden");
        authEls.regFields.classList.toggle("hidden", !isNewUserFlow);
        authEls.heading.textContent = isNewUserFlow ? "Create Account" : "Enter Login Code";
        authEls.sub.textContent = `Code sent for ${pendingPhone}`;

        if (res.demoOtp) {
          authEls.demoOtpBox.innerHTML = `Your Login OTP Code: <strong style="font-size:16px;letter-spacing:2px;">${res.demoOtp}</strong>`;
          authEls.demoOtpBox.classList.remove("hidden");
          authEls.otpInput.value = res.demoOtp;
        } else {
          authEls.demoOtpBox.classList.add("hidden");
        }
        authEls.otpInput.focus();
      } catch (err) {
        authEls.error.textContent = err.message;
      } finally {
        authEls.sendOtpBtn.disabled = false;
      }
    });

    authEls.verifyBtn.addEventListener("click", async () => {
      const code = authEls.otpInput.value.trim();
      const name = authEls.nameInput.value.trim();
      const username = authEls.userInput.value.trim();
      authEls.error.textContent = "";

      if (!code) return (authEls.error.textContent = "Please enter the 5-digit code.");
      if (isNewUserFlow && !name) return (authEls.error.textContent = "Please enter your name.");

      authEls.verifyBtn.disabled = true;
      try {
        const res = await api("/api/auth/verify-otp", {
          method: "POST",
          body: { phone: pendingPhone, code, name: name || null, username: username || null }
        });

        if (res.needsRegistration) {
          isNewUserFlow = true;
          authEls.regFields.classList.remove("hidden");
          authEls.error.textContent = "Please enter your name to finish creating your account.";
          return;
        }

        setToken(res.token);
        applyLoggedInUser(res.user);
        authEls.screen.classList.add("hidden");
        await syncChats();
        await loadLiveStories();
        connectWebSocket();
        if (window.App) window.App.showToast(`Welcome, ${res.user.name}!`);
      } catch (err) {
        authEls.error.textContent = err.message;
      } finally {
        authEls.verifyBtn.disabled = false;
      }
    });

    authEls.backBtn.addEventListener("click", () => {
      authEls.stepOtp.classList.add("hidden");
      authEls.stepPhone.classList.remove("hidden");
      authEls.heading.textContent = "Sign in to TeleClone";
      authEls.sub.textContent = "Enter your phone number to receive a login code.";
      authEls.error.textContent = "";
    });
  }
// ==================== 9. FIX: DIRECT PIC/FILE UPLOAD & LIVE STORIES ====================
  const LIVE_STORY_BGS = [
    "linear-gradient(155deg, #667eea, #764ba2)",
    "linear-gradient(155deg, #11998e, #38ef7d)",
    "linear-gradient(155deg, #fc466b, #3f5efb)",
    "linear-gradient(155deg, #f7971e, #ffd200)",
    "linear-gradient(155deg, #0f2027, #203a43, #2c5364)"
  ];
  let liveStoryTimer = null;

  async function loadLiveStories() {
    if (!currentUser) return;
    try {
      const res = await api("/api/stories");
      const serverStories = res.stories || [];
      const myLive = serverStories.find((s) => s.isMine);
      const others = serverStories.filter((s) => !s.isMine);

      const mySlot = myLive || {
        id: "st_mine",
        name: "My Story",
        initials: currentUser.initials,
        color: currentUser.avatarColor || "#54a9eb",
        isMine: true,
        hasLiveStory: false,
        seen: false
      };

      Store.getState().stories = [mySlot, ...others];
      if (window.App) window.App.renderAll();
    } catch (err) {
      console.warn("Stories load error:", err);
    }
  }

  function closeLiveStoryViewer() {
    clearInterval(liveStoryTimer);
    liveStoryTimer = null;
    $("story-viewer")?.classList.add("hidden");
    if ($("story-reply-input")) $("story-reply-input").value = "";
  }

  function openLiveStoryViewer(story) {
    const viewer = $("story-viewer");
    const canvas = $("story-viewer-canvas");
    const textEl = $("story-viewer-text");
    const avatarEl = $("story-viewer-avatar");
    const nameEl = $("story-viewer-name");
    const timeEl = $("story-viewer-time");
    const likeBtn = $("story-like-btn");
    const replyInput = $("story-reply-input");
    const sendBtn = $("story-send-reply-btn");
    const closeBtn = $("story-viewer-close");
    const fill = $("story-progress-fill");
    if (!viewer) return;

    avatarEl.textContent = story.initials;
    avatarEl.style.background = story.color;
    nameEl.textContent = story.name;
    timeEl.textContent = `${story.time || "Just now"} • 👁️ ${story.viewsCount || 0} • ❤️ ${story.likesCount || 0}`;
    canvas.style.background = story.bg || LIVE_STORY_BGS[0];

    if (story.mediaUrl) {
      textEl.innerHTML = `
        <img src="${story.mediaUrl}" alt="Story" style="max-width:100%;max-height:52vh;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.4);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />
        ${story.text ? `<div style="font-size:17px;font-weight:600;">${App.escapeHtml(story.text)}</div>` : ""}
      `;
    } else {
      textEl.textContent = story.text || "";
    }

    likeBtn.textContent = story.liked ? "❤️" : "🤍";
    fill.style.width = "0%";
    viewer.classList.remove("hidden");

    if (story.dbId && !story.isMine) {
      api(`/api/stories/${story.dbId}/view`, { method: "POST" })
        .then(() => loadLiveStories())
        .catch(() => {});
    }

    closeBtn.onclick = closeLiveStoryViewer;
    viewer.onclick = (e) => {
      if (e.target === viewer) closeLiveStoryViewer();
    };

    likeBtn.onclick = async () => {
      if (!story.dbId) return;
      try {
        const res = await api(`/api/stories/${story.dbId}/like`, { method: "POST" });
        story.liked = res.liked;
        story.likesCount = res.likesCount;
        likeBtn.textContent = res.liked ? "❤️" : "🤍";
        timeEl.textContent = `${story.time || "Just now"} • 👁️ ${story.viewsCount || 0} • ❤️ ${res.likesCount}`;
      } catch {}
    };

    const sendReply = async () => {
      const txt = (replyInput.value || "").trim();
      if (!txt) return;
      try {
        let targetChatId = resolveChatId("chat_saved");
        if (!story.isMine && story.userId) {
          const dm = await api("/api/chats/direct", {
            method: "POST",
            body: { targetUserId: Number(story.userId) }
          });
          if (dm.chat) targetChatId = String(dm.chat.id);
        }
        if (targetChatId) {
          await api(`/api/chats/${targetChatId}/messages`, {
            method: "POST",
            body: { text: `💬 Replied to ${story.name}'s story:\n${txt}` }
          });
          if (window.App) window.App.showToast("Story reply sent!");
        }
      } catch (err) {
        if (window.App) window.App.showToast(err.message);
      }
      closeLiveStoryViewer();
    };

    sendBtn.onclick = sendReply;
    replyInput.onkeydown = (e) => {
      if (e.key === "Enter") sendReply();
    };

    clearInterval(liveStoryTimer);
    let pct = 0;
    liveStoryTimer = setInterval(() => {
      if (document.activeElement === replyInput) return;
      pct += 1.4;
      fill.style.width = Math.min(pct, 100) + "%";
      if (pct >= 100) closeLiveStoryViewer();
    }, 100);
  }

  function openLiveStoryCreator() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    let selectedBg = LIVE_STORY_BGS[0];
    title.textContent = "Post a Story (Photo or Text)";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Photo (Optional)</label>
        <input id="live-story-file" class="form-input" type="file" accept="image/*" />
      </div>
      <div class="form-group">
        <label class="form-label">Caption / Text Status</label>
        <textarea id="live-story-text" class="form-textarea" rows="3" placeholder="Write something for your 24h story..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Background Color</label>
        <div id="live-story-bgs" style="display:flex;gap:10px;">
          ${LIVE_STORY_BGS.map(
            (g, i) => `<button type="button" data-bg="${i}" style="width:36px;height:36px;border-radius:50%;background:${g};border:${i === 0 ? "3px solid var(--accent-color)" : "2px solid transparent"};"></button>`
          ).join("")}
        </div>
      </div>
      <button id="live-story-publish" class="primary-btn">✨ Publish Story</button>
    `;
    modal.classList.remove("hidden");

    $("live-story-bgs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-bg]");
      if (!b) return;
      selectedBg = LIVE_STORY_BGS[Number(b.dataset.bg)];
      $("live-story-bgs").querySelectorAll("button").forEach((x) => (x.style.border = "2px solid transparent"));
      b.style.border = "3px solid var(--accent-color)";
    });

    $("live-story-publish").addEventListener("click", async () => {
      const btn = $("live-story-publish");
      const text = ($("live-story-text").value || "").trim();
      const file = $("live-story-file").files?.[0] || null;
      if (!text && !file) return window.App && window.App.showToast("Please select a photo or enter some text");

      btn.disabled = true;
      btn.textContent = "Publishing...";
      try {
        let mediaUrl = "";
        if (file) {
          const fd = new FormData();
          fd.append("file", file, file.name);
          const up = await api("/api/upload", { method: "POST", body: fd });
          mediaUrl = up.attachment?.src || "";
        }
        await api("/api/stories", {
          method: "POST",
          body: { text, mediaUrl, bg: selectedBg }
        });
        modal.classList.add("hidden");
        await loadLiveStories();
        if (window.App) window.App.showToast("Story posted live! ✨");
        const mine = Store.getState().stories.find((s) => s.isMine && s.hasLiveStory);
        if (mine) openLiveStoryViewer(mine);
      } catch (err) {
        if (window.App) window.App.showToast("Story failed: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "✨ Publish Story";
      }
    });
  }

  function openLiveStoryChoiceModal(story) {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    title.textContent = "My Story";
    body.innerHTML = `
      <button id="st-choice-view" class="primary-btn">👁️ View My Story (${story.viewsCount || 0} views)</button>
      <button id="st-choice-new" class="secondary-btn">➕ Post New Story</button>
      <button id="st-choice-del" class="danger-btn">🗑️ Delete Current Story</button>
    `;
    modal.classList.remove("hidden");

    $("st-choice-view").onclick = () => {
      modal.classList.add("hidden");
      openLiveStoryViewer(story);
    };
    $("st-choice-new").onclick = () => openLiveStoryCreator();
    $("st-choice-del").onclick = async () => {
      try {
        await api(`/api/stories/${story.dbId}`, { method: "DELETE" });
        modal.classList.add("hidden");
        await loadLiveStories();
        if (window.App) window.App.showToast("Story deleted");
      } catch (err) {
        if (window.App) window.App.showToast(err.message);
      }
    };
  }

  function patchLiveUploadsAndStories() {
    // 1. Safe off-screen file input (kuch browsers display:none input block kar detay hain)
    const fileInput = $("chat-file-input");
    if (fileInput) {
      fileInput.classList.remove("hidden");
      fileInput.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";

      fileInput.addEventListener(
        "change",
        async (e) => {
          e.stopImmediatePropagation();
          const file = e.target.files?.[0];
          const cid = resolveChatId(Store.getState().activeChatId);
          e.target.value = "";
          if (!file || !cid) return;

          const msgInput = $("msg-input");
          const caption = (msgInput?.value || "").trim();
          if (msgInput) {
            msgInput.value = "";
            msgInput.style.height = "auto";
          }

          const tempId = window.TCOptimistic
            ? window.TCOptimistic.pushPendingFile(cid, file, caption)
            : null;

          try {
            const fd = new FormData();
            fd.append("file", file, file.name);
            const up = await api("/api/upload", { method: "POST", body: fd });
            const res = await api(`/api/chats/${cid}/messages`, {
              method: "POST",
              body: { text: caption, attachment: up.attachment }
            });
            if (tempId && window.TCOptimistic) {
              window.TCOptimistic.markSent(
                cid,
                tempId,
                res && res.message ? normalizeMessage(res.message) : null
              );
            }
          } catch (err) {
            if (tempId && window.TCOptimistic) {
              window.TCOptimistic.markFailed(cid, tempId);
            }
            if (window.App) window.App.showToast("Upload failed: " + err.message);
          }
        },
        true
      );
        
      // 2. Direct 1-Tap 📷 Photo Button neeche composer mein add karein
      const attachBtn = $("attach-btn");
      if (attachBtn && !$("quick-photo-btn")) {
        const picBtn = document.createElement("button");
        picBtn.id = "quick-photo-btn";
        picBtn.type = "button";
        picBtn.className = "icon-btn";
        picBtn.title = "Send Photo";
        picBtn.textContent = "📷";
        picBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          fileInput.accept = "image/*";
          fileInput.click();
        });
        attachBtn.parentNode.insertBefore(picBtn, attachBtn);
      }
    }

    // 3. Stories Bar Click Override (Text + Photo Story, 100% Live DB)
    const storiesBar = $("stories-bar");
    if (storiesBar) {
      storiesBar.addEventListener(
        "click",
        (e) => {
          const item = e.target.closest(".story-item");
          if (!item) return;
          e.stopImmediatePropagation();
          const storyId = item.dataset.storyId;
          const story = Store.getState().stories.find((s) => String(s.id) === String(storyId));
          if (!story) return;

          if (story.isMine) {
            if (story.hasLiveStory) openLiveStoryChoiceModal(story);
            else openLiveStoryCreator();
          } else {
            openLiveStoryViewer(story);
          }
        },
        true
      );
    }
  }
  // ==================== 10. FIX: LIVE PEN BUTTON (NEW CHAT / GROUP / CHANNEL) ====================
  function openLiveNewChatModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    title.textContent = "New Message";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Search registered user or @bot</label>
        <input id="live-dm-search" class="form-input" type="text" placeholder="Type name or @username..." autocomplete="off" />
      </div>
      <div id="live-dm-results" style="max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;padding:16px;">
          Type a user's name or @username to search.
        </div>
      </div>
    `;
    modal.classList.remove("hidden");

    const input = $("live-dm-search");
    const resultsBox = $("live-dm-results");
    input.focus();

    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 1) {
        resultsBox.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);text-align:center;padding:16px;">Type a user's name or @username to search.</div>`;
        return;
      }
      timer = setTimeout(async () => {
        try {
          const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
          const users = res.users || [];
          if (users.length === 0) {
            resultsBox.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);text-align:center;padding:16px;">No users found.</div>`;
            return;
          }
          resultsBox.innerHTML = users
            .map(
              (u) => `
            <div class="list-card-row" data-pick-uid="${u.id}">
              <div class="avatar avatar-sm" style="background:${u.avatarColor}">${App.escapeHtml(u.initials)}</div>
              <div style="flex:1;">
                <div style="font-weight:600;display:flex;align-items:center;gap:5px;">
                  <span>${App.escapeHtml(u.name)}</span>
                  ${u.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);">${App.escapeHtml(u.username)}</div>
              </div>
              <span style="color:var(--accent-color);font-weight:600;font-size:13px;">Chat</span>
            </div>
          `
            )
            .join("");
        } catch (err) {
          resultsBox.innerHTML = `<div style="color:var(--danger-color);font-size:13px;padding:10px;">${App.escapeHtml(err.message)}</div>`;
        }
      }, 220);
    });

    resultsBox.addEventListener("click", async (e) => {
      const row = e.target.closest("[data-pick-uid]");
      if (!row) return;
      try {
        const res = await api("/api/chats/direct", {
          method: "POST",
          body: { targetUserId: Number(row.dataset.pickUid) }
        });
        modal.classList.add("hidden");
        await syncChats();
        if (res.chat && window.App) window.App.openChat(String(res.chat.id));
      } catch (err) {
        if (window.App) window.App.showToast(err.message);
      }
    });
  }

  function openLiveNewGroupModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    const knownPeers = Store.getState()
      .chats.filter((c) => c.peerUserId && (c.username || "").toLowerCase() !== "@botfather")
      .map((c) => ({
        id: Number(c.peerUserId),
        name: c.name,
        username: c.username,
        initials: c.initials,
        color: c.avatarColor,
        isBot: c.isBot
      }));

    const selectedMap = new Map();
    title.textContent = "New Group";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Group Name</label>
        <input id="live-grp-name" class="form-input" type="text" placeholder="e.g. Friends Group" />
      </div>
      <div class="form-group">
        <label class="form-label">Description (Optional)</label>
        <input id="live-grp-desc" class="form-input" type="text" placeholder="About this group..." />
      </div>
      <div class="form-group">
        <label class="form-label">Add Members / Bots (Search @username)</label>
        <input id="live-grp-search" class="form-input" type="text" placeholder="Search users or @bots to add..." autocomplete="off" />
      </div>
      <div id="live-grp-selected" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
      <div id="live-grp-candidates" class="checklist-box"></div>
      <button id="live-grp-create" class="primary-btn">Create Group</button>
    `;
    modal.classList.remove("hidden");

    const candBox = $("live-grp-candidates");
    const selBox = $("live-grp-selected");
    const searchInput = $("live-grp-search");

    const renderSelected = () => {
      selBox.innerHTML = Array.from(selectedMap.values())
        .map(
          (u) => `<span class="role-pill" style="cursor:pointer;" data-rem-uid="${u.id}">${App.escapeHtml(u.name)} ✕</span>`
        )
        .join("");
    };

    const renderCandidates = (list) => {
      if (!list.length) {
        candBox.innerHTML = `<div style="font-size:12.5px;color:var(--text-secondary);padding:10px;text-align:center;">Search @username above to add members (optional).</div>`;
        return;
      }
      candBox.innerHTML = list
        .map(
          (u) => `
        <div class="list-card-row" data-add-uid="${u.id}">
          <div class="avatar avatar-sm" style="background:${u.color || u.avatarColor};width:32px;height:32px;font-size:12px;">${App.escapeHtml(u.initials)}</div>
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:600;">${App.escapeHtml(u.name)} ${u.isBot ? '<span class="bot-badge">BOT</span>' : ""}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);">${App.escapeHtml(u.username)}</div>
          </div>
          <span style="color:var(--accent-color);font-weight:700;">${selectedMap.has(Number(u.id)) ? "✓" : "+ Add"}</span>
        </div>
      `
        )
        .join("");
    };

    let currentList = knownPeers;
    renderCandidates(currentList);

    let timer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      if (!q) {
        currentList = knownPeers;
        renderCandidates(currentList);
        return;
      }
      timer = setTimeout(async () => {
        try {
          const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
          currentList = (res.users || []).filter((u) => (u.username || "").toLowerCase() !== "@botfather");
          renderCandidates(currentList);
        } catch {}
      }, 220);
    });

    candBox.addEventListener("click", (e) => {
      const row = e.target.closest("[data-add-uid]");
      if (!row) return;
      const uid = Number(row.dataset.addUid);
      const userObj = currentList.find((u) => Number(u.id) === uid);
      if (!userObj) return;
      if (selectedMap.has(uid)) selectedMap.delete(uid);
      else selectedMap.set(uid, userObj);
      renderSelected();
      renderCandidates(currentList);
    });

    selBox.addEventListener("click", (e) => {
      const pill = e.target.closest("[data-rem-uid]");
      if (!pill) return;
      selectedMap.delete(Number(pill.dataset.remUid));
      renderSelected();
      renderCandidates(currentList);
    });

    $("live-grp-create").addEventListener("click", async () => {
      const name = $("live-grp-name").value.trim();
      if (!name) return window.App && window.App.showToast("Please enter a group name");
      try {
        const res = await api("/api/chats/group", {
          method: "POST",
          body: {
            name,
            description: $("live-grp-desc").value.trim(),
            memberIds: Array.from(selectedMap.keys())
          }
        });
        modal.classList.add("hidden");
        await syncChats();
        if (res.chat && window.App) {
          window.App.openChat(String(res.chat.id));
          window.App.showToast(`Group "${name}" created!`);
        }
      } catch (err) {
        if (window.App) window.App.showToast(err.message);
      }
    });
  }

  function openLiveNewChannelModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    title.textContent = "New Channel";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Channel Name</label>
        <input id="live-ch-name" class="form-input" type="text" placeholder="e.g. Tech Updates" />
      </div>
      <div class="form-group">
        <label class="form-label">Public @username</label>
        <input id="live-ch-user" class="form-input" type="text" placeholder="@tech_updates" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="live-ch-desc" class="form-textarea" rows="2" placeholder="Channel description..."></textarea>
      </div>
      <button id="live-ch-create" class="primary-btn">Create Channel</button>
    `;
    modal.classList.remove("hidden");

    $("live-ch-create").addEventListener("click", async () => {
      const name = $("live-ch-name").value.trim();
      if (!name) return window.App && window.App.showToast("Please enter a channel name");
      try {
        const res = await api("/api/chats/channel", {
          method: "POST",
          body: {
            name,
            username: $("live-ch-user").value.trim(),
            description: $("live-ch-desc").value.trim()
          }
        });
        modal.classList.add("hidden");
        await syncChats();
        if (res.chat && window.App) {
          window.App.openChat(String(res.chat.id));
          window.App.showToast(`Channel "${name}" created!`);
        }
      } catch (err) {
        if (window.App) window.App.showToast(err.message);
      }
    });
  }

  function patchLiveFabPen() {
    const fabBtn = $("fab-btn") || document.querySelector(".fab-btn");
    let fabMenu = $("fab-menu") || document.querySelector(".fab-menu");
    if (!fabBtn) return;

    if (!fabMenu) {
      fabMenu = document.createElement("div");
      fabMenu.id = "fab-menu";
      fabMenu.className = "fab-menu hidden";
      fabBtn.parentNode.appendChild(fabMenu);
    }

    fabMenu.style.zIndex = "95";
    fabMenu.innerHTML = `
      <button type="button" class="fab-menu-item" data-live-fab="new-chat">💬 New Message</button>
      <button type="button" class="fab-menu-item" data-live-fab="new-group">👥 New Group</button>
      <button type="button" class="fab-menu-item" data-live-fab="new-channel">📢 New Channel</button>
      <button type="button" class="fab-menu-item" data-live-fab="new-bot">🤖 Create Bot (@BotFather)</button>
    `;

    fabBtn.addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        e.stopPropagation();
        fabMenu.classList.toggle("hidden");
      },
      true
    );

    fabMenu.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("[data-live-fab]");
        if (!btn) return;
        e.stopImmediatePropagation();
        e.stopPropagation();
        fabMenu.classList.add("hidden");

        const act = btn.dataset.liveFab;
        if (act === "new-chat") openLiveNewChatModal();
        else if (act === "new-group") openLiveNewGroupModal();
        else if (act === "new-channel") openLiveNewChannelModal();
        else if (act === "new-bot") {
          const bfId = resolveChatId("chat_botfather");
          if (bfId && window.App) window.App.openChat(bfId);
        }
      },
      true
    );

    document.addEventListener("click", (e) => {
      if (!fabMenu.classList.contains("hidden") && !e.target.closest("#fab-menu") && !e.target.closest("#fab-btn")) {
        fabMenu.classList.add("hidden");
      }
    });
  }
  // ==================== INIT ====================
  clearFakeDummyData();
  patchStoreAndModules();
  setupGlobalDirectorySearch();
  injectLogoutButton();
  bindAuthEvents();
  bootLiveSession();
  patchLiveUploadsAndStories();
  patchLiveFabPen();
})();