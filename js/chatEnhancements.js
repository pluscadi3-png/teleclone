(() => {
  "use strict";

  const ZW_MARK = "\u200B";
  const ZW_ZERO = "\u200C";
  const ZW_ONE = "\u200D";

  const ICONS = {
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    msg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  };

  let cachedMe = null;
  let selectMode = false;
  let selectChatId = null;
  const selectedMsgIds = new Set();

  function showToast(msg) {
    let t = document.getElementById("tcQuickToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "tcQuickToast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove("show"), 2500);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function getAuthHeader() {
    const keys = ["token", "auth_token", "access_token", "teleclone_token", "jwt", "tc_token"];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.length > 15) return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i)) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) return `Bearer ${v}`;
    }
    return "";
  }

  async function apiJson(url, opts = {}) {
    const auth = getAuthHeader();
    const headers = { ...(opts.headers || {}) };
    if (auth) headers.Authorization = auth;
    if (opts.body && typeof opts.body === "object") {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body && typeof opts.body === "object" ? JSON.stringify(opts.body) : opts.body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || `Error ${res.status}`);
    return data;
  }

  async function getCurrentUserInfo() {
    if (cachedMe && cachedMe.name) return cachedMe;
    const st = getStoreObj();
    if (st && typeof st.getState === "function") {
      const s = st.getState();
      const u = s.user || s.currentUser || s.profile;
      if (u && (u.name || u.fullName || u.username)) {
        cachedMe = {
          id: u.id || u.userId || null,
          name: u.name || u.fullName || u.username || "User",
          username: (u.username || "").replace(/^@/, "")
        };
      }
    }
    if (!cachedMe || !cachedMe.id) {
      for (const ep of ["/api/auth/me", "/api/me"]) {
        try {
          const res = await apiJson(ep);
          const u = res.user || res;
          if (u && (u.name || u.username || u.id)) {
            cachedMe = {
              id: u.id || u.user_id || null,
              name: u.name || u.full_name || u.username || "User",
              username: (u.username || "").replace(/^@/, "")
            };
            break;
          }
        } catch (_) {}
      }
    }
    return cachedMe || { id: null, name: "User", username: "" };
  }

  // ===== 1. Invisible Forward Metadata Encoder / Parser =====
  function encodeForwardMeta(meta) {
    try {
      const clean = {};
      if (meta.n) clean.n = String(meta.n).slice(0, 60);
      if (meta.u) clean.u = String(meta.u).replace(/^@/, "").slice(0, 40);
      if (meta.i) clean.i = Number(meta.i) || String(meta.i);
      const bytes = new TextEncoder().encode(JSON.stringify(clean));
      let bits = "";
      for (let b = 0; b < bytes.length; b++) {
        const bin = bytes[b].toString(2).padStart(8, "0");
        for (let k = 0; k < 8; k++) {
          bits += bin[k] === "1" ? ZW_ONE : ZW_ZERO;
        }
      }
      return ZW_MARK + bits + ZW_MARK;
    } catch (_) {
      return "";
    }
  }

  function decodeForwardMeta(bitsStr) {
    if (!bitsStr || bitsStr.length % 8 !== 0) return null;
    try {
      const bytes = new Uint8Array(bitsStr.length / 8);
      for (let i = 0; i < bytes.length; i++) {
        let val = 0;
        for (let b = 0; b < 8; b++) {
          val = (val << 1) | (bitsStr[i * 8 + b] === ZW_ONE ? 1 : 0);
        }
        bytes[i] = val;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return null;
    }
  }

  function parseForwarded(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    const match = rawText.match(
      /^↪️(?:\u200B([\u200C\u200D]+)\u200B)?\s*Forwarded from\s+([^\n:]+):?(?:\r?\n([\s\S]*))?$/
    );
    if (!match) return null;

    const meta = match[1] ? decodeForwardMeta(match[1]) : null;
    const name = ((meta && meta.n) || match[2] || "User").trim();
    const username = ((meta && meta.u) || "").replace(/^@/, "").trim();
    const userId = (meta && meta.i) || "";
    const body = (match[3] || "").trim();

    return { name, username, userId, body };
  }

  function buildForwardedText(senderMeta, bodyText) {
    const safeName = (senderMeta.name || "User").trim();
    const encoded = encodeForwardMeta({
      n: safeName,
      u: senderMeta.username || "",
      i: senderMeta.userId || ""
    });
    const header = `↪️${encoded} Forwarded from ${safeName}`;
    const cleanBody = (bodyText || "").trim();
    return cleanBody ? `${header}\n${cleanBody}` : header;
  }

  function renderForwardHeader(fwdInfo) {
    if (!fwdInfo || !fwdInfo.name) return "";
    return `
      <div class="msg-forward-header"
           data-fwd-name="${escapeHtml(fwdInfo.name)}"
           data-fwd-username="${escapeHtml(fwdInfo.username || "")}"
           data-fwd-uid="${escapeHtml(String(fwdInfo.userId || ""))}">
        <span class="msg-fwd-label">Forwarded from</span>
        <span class="msg-fwd-author">${escapeHtml(fwdInfo.name)}</span>
      </div>
    `;
  }

  // ===== 2. Reply Click -> Jump & Highlight =====
  function jumpToRepliedMessage(replyBox) {
    const container =
      replyBox.closest("#messages-container, .messages-container, .messages, .chat-messages") || document;
    const replyId = (replyBox.getAttribute("data-reply-id") || "").trim();
    const replyText = (replyBox.getAttribute("data-reply-text") || "").trim();
    const currentRow = replyBox.closest(".msg-row");

    let targetRow = null;
    if (replyId) {
      const allRows = container.querySelectorAll(".msg-row[data-msg-id]");
      for (const row of allRows) {
        if (String(row.getAttribute("data-msg-id")) === replyId) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow && replyText) {
      const cleanNeedle = replyText.replace(/^📎\s*/, "").trim().toLowerCase();
      const rows = Array.from(container.querySelectorAll(".msg-row"));
      const limitIdx = currentRow ? rows.indexOf(currentRow) : rows.length;
      for (let i = limitIdx - 1; i >= 0; i--) {
        const row = rows[i];
        const msgText = (row.querySelector(".msg-text")?.textContent || "").trim().toLowerCase();
        const fileName = (row.querySelector(".msg-file-name")?.textContent || "").trim().toLowerCase();
        const hasPhoto = !!row.querySelector(".msg-media-img") && cleanNeedle.includes("photo");
        const hasVideo = !!row.querySelector(".msg-video-wrap") && cleanNeedle.includes("video");
        const hasVoice = !!row.querySelector(".msg-voice-card") && cleanNeedle.includes("voice");

        if (
          (msgText && (msgText === cleanNeedle || msgText.includes(cleanNeedle))) ||
          (fileName && fileName.includes(cleanNeedle)) ||
          hasPhoto ||
          hasVideo ||
          hasVoice
        ) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) {
      showToast("Original message not found in this chat");
      return;
    }

    targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
    targetRow.classList.remove("tc-reply-flash");
    void targetRow.offsetWidth;
    targetRow.classList.add("tc-reply-flash");
    clearTimeout(targetRow._flashTid);
    targetRow._flashTid = setTimeout(() => {
      targetRow.classList.remove("tc-reply-flash");
    }, 2000);
  }

  // ===== 3. Media Download & Fullscreen Lightbox =====
  async function downloadMediaFile(src, fallbackName) {
    if (!src) return;
    const absUrl = new URL(src, window.location.origin);
    const baseName = fallbackName || decodeURIComponent(absUrl.pathname.split("/").pop() || "media");

    if ("caches" in window && absUrl.pathname.startsWith("/uploads/")) {
      caches
        .open("teleclone-media-v1")
        .then((c) => fetch(absUrl.href).then((r) => (r.ok ? c.put(absUrl.pathname, r) : null)))
        .catch(() => {});
    }

    let downloadUrl = absUrl.href;
    if (absUrl.origin === window.location.origin && absUrl.pathname.startsWith("/uploads/")) {
      const uploadedName = absUrl.pathname.split("/").pop();
      downloadUrl = `/api/media/download/${encodeURIComponent(uploadedName)}`;
    }

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = baseName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1200);
    showToast("Downloading...");
  }

  function closeMediaViewer() {
    const el = document.getElementById("tcMediaViewer");
    if (!el) return;
    const vid = el.querySelector("video");
    if (vid) {
      try { vid.pause(); } catch (_) {}
      vid.src = "";
    }
    el.remove();
  }

  function openMediaViewer(type, src, name) {
    closeMediaViewer();
    if (!src) return;

    const viewer = document.createElement("div");
    viewer.id = "tcMediaViewer";
    viewer.className = "tc-media-viewer";

    const safeSrc = escapeHtml(src);
    const safeName = escapeHtml(name || (type === "video" ? "Video" : "Photo"));

    const bodyHtml =
      type === "video"
        ? `<video id="tcMvVideo" class="tc-mv-video" src="${safeSrc}" controls autoplay playsinline></video>`
        : `<img id="tcMvImg" class="tc-mv-img" src="${safeSrc}" alt="${safeName}" />`;

    viewer.innerHTML = `
      <div class="tc-mv-topbar">
        <div class="tc-mv-title">${safeName}</div>
        <div class="tc-mv-actions">
          <button type="button" class="tc-mv-btn tc-mv-dl" id="tcMvDownloadBtn" title="Download">
            ${ICONS.download}<span>Download</span>
          </button>
          <button type="button" class="tc-mv-btn tc-mv-close" id="tcMvCloseBtn" title="Close">
            ${ICONS.close}
          </button>
        </div>
      </div>
      <div class="tc-mv-stage" id="tcMvStage">${bodyHtml}</div>
    `;

    viewer.querySelector("#tcMvCloseBtn").addEventListener("click", closeMediaViewer);
    viewer.querySelector("#tcMvDownloadBtn").addEventListener("click", () => {
      downloadMediaFile(src, name);
    });
    viewer.querySelector("#tcMvStage").addEventListener("click", (e) => {
      if (e.target.id === "tcMvStage") closeMediaViewer();
    });

    const imgEl = viewer.querySelector("#tcMvImg");
    if (imgEl) {
      imgEl.addEventListener("click", (e) => {
        e.stopPropagation();
        imgEl.classList.toggle("zoomed");
      });
    }

    document.body.appendChild(viewer);
  }

  // ===== 4. Multi-Select Mode inside Chat =====
  function getActiveChatSafe() {
    const st = getStoreObj();
    if (!st) return null;
    if (typeof st.getActiveChat === "function") return st.getActiveChat();
    if (typeof st.getState === "function") {
      const s = st.getState();
      return (s.chats || []).find((c) => String(c.id) === String(s.activeChatId)) || null;
    }
    return null;
  }

  function ensureSelectBar() {
    let bar = document.getElementById("tcSelectBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "tcSelectBar";
    bar.className = "tc-select-bar hidden";
    bar.innerHTML = `
      <button type="button" class="tc-sb-btn tc-sb-cancel" id="tcSbCancel" title="Cancel">${ICONS.close}</button>
      <div class="tc-sb-count" id="tcSbCount">0 selected</div>
      <div class="tc-sb-actions">
        <button type="button" class="tc-sb-btn tc-sb-del" id="tcSbDelete" title="Delete Selected">
          ${ICONS.trash}<span>Delete</span>
        </button>
        <button type="button" class="tc-sb-btn tc-sb-fwd" id="tcSbForward" title="Forward Selected">
          ${ICONS.forward}<span>Forward</span>
        </button>
      </div>
    `;

    bar.querySelector("#tcSbCancel").addEventListener("click", exitSelectMode);

    bar.querySelector("#tcSbForward").addEventListener("click", () => {
      const chat = getActiveChatSafe();
      if (!chat || !selectedMsgIds.size) return;
      const orderedMsgs = (chat.messages || []).filter((m) => selectedMsgIds.has(String(m.id)));
      if (!orderedMsgs.length) return;
      openForwardModal(orderedMsgs, chat, () => exitSelectMode());
    });

    bar.querySelector("#tcSbDelete").addEventListener("click", () => {
      const st = getStoreObj();
      const chat = getActiveChatSafe();
      if (!st || !chat || !selectedMsgIds.size) return;
      const ids = Array.from(selectedMsgIds);
      ids.forEach((id) => {
        try { st.deleteMessage(chat.id, id); } catch (_) {}
      });
      exitSelectMode();
      if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      if (window.ChatUI && typeof window.ChatUI.renderActiveChat === "function") {
        window.ChatUI.renderActiveChat(true);
      }
      showToast(ids.length === 1 ? "Message deleted" : `${ids.length} messages deleted`);
    });

    document.body.appendChild(bar);
    return bar;
  }

  function syncSelectionVisuals() {
    const bar = document.getElementById("tcSelectBar");
    if (!selectMode) {
      document.body.classList.remove("tc-select-mode");
      if (bar) bar.classList.add("hidden");
      document.querySelectorAll(".msg-row.tc-msg-selected").forEach((r) => {
        r.classList.remove("tc-msg-selected");
      });
      document.querySelectorAll(".tc-msg-chk").forEach((c) => c.remove());
      return;
    }

    const activeChat = getActiveChatSafe();
    if (!activeChat || String(activeChat.id) !== String(selectChatId)) {
      exitSelectMode();
      return;
    }

    document.body.classList.add("tc-select-mode");
    const sb = ensureSelectBar();
    sb.classList.remove("hidden");

    const countEl = sb.querySelector("#tcSbCount");
    const fwdBtn = sb.querySelector("#tcSbForward");
    const delBtn = sb.querySelector("#tcSbDelete");
    if (countEl) countEl.textContent = `${selectedMsgIds.size} selected`;
    if (fwdBtn) fwdBtn.disabled = selectedMsgIds.size === 0;
    if (delBtn) delBtn.disabled = selectedMsgIds.size === 0;

    document.querySelectorAll("#messages-container .msg-row[data-msg-id]").forEach((row) => {
      const mid = String(row.getAttribute("data-msg-id"));
      const isSel = selectedMsgIds.has(mid);
      row.classList.toggle("tc-msg-selected", isSel);

      let chk = row.querySelector(":scope > .tc-msg-chk");
      if (!chk) {
        chk = document.createElement("div");
        chk.className = "tc-msg-chk";
        row.insertBefore(chk, row.firstChild);
      }
      chk.innerHTML = isSel ? ICONS.check : "";
    });
  }

  function enterSelectMode(initialMsgId) {
    const chat = getActiveChatSafe();
    if (!chat) return;
    selectMode = true;
    selectChatId = String(chat.id);
    selectedMsgIds.clear();
    if (initialMsgId !== undefined && initialMsgId !== null) {
      selectedMsgIds.add(String(initialMsgId));
    }
    syncSelectionVisuals();
  }

  function toggleMsgSelection(msgId) {
    if (!selectMode) return;
    const key = String(msgId);
    if (selectedMsgIds.has(key)) selectedMsgIds.delete(key);
    else selectedMsgIds.add(key);

    if (selectedMsgIds.size === 0) {
      exitSelectMode();
      return;
    }
    syncSelectionVisuals();
  }

  function exitSelectMode() {
    selectMode = false;
    selectChatId = null;
    selectedMsgIds.clear();
    syncSelectionVisuals();
  }

  // ===== 5. Resolve Original Sender Metadata Before Forwarding =====
  async function resolveSenderMetaForMessage(msg, sourceChat, chatInfoCache) {
    // 1. Agar yeh message pehle se forwarded hai to asli original sender barkarar rakhein
    const existingFwd = parseForwarded(msg.text);
    if (existingFwd && existingFwd.name) {
      return {
        name: existingFwd.name,
        username: existingFwd.username || "",
        userId: existingFwd.userId || ""
      };
    }

    // 2. Agar yeh message mera apna bheja hua hai to mera asli naam + username + id lagayein
    if (msg.sender === "me") {
      const me = await getCurrentUserInfo();
      return {
        name: me.name || "User",
        username: me.username || "",
        userId: me.id || ""
      };
    }

    // 3. Doosre user ka message (DM / Group / Channel)
    let name = msg.senderName || (sourceChat && sourceChat.name) || "User";
    let username = (msg.senderUsername || "").replace(/^@/, "");
    let userId = msg.senderId || msg.sender_id || msg.userId || msg.user_id || "";

    if (sourceChat && sourceChat.type === "personal") {
      if (!username && sourceChat.username) username = String(sourceChat.username).replace(/^@/, "");
      if (!userId) userId = sourceChat.peerUserId || sourceChat.otherUserId || sourceChat.targetUserId || "";

      // Agar username ya userId abhi bhi empty ho to /api/chats/{id}/info se 1 baar fetch karein
      if ((!username || !userId) && sourceChat.id) {
        const key = String(sourceChat.id);
        if (!chatInfoCache.has(key)) {
          try {
            const info = await apiJson(`/api/chats/${sourceChat.id}/info`);
            chatInfoCache.set(key, info);
          } catch (_) {
            chatInfoCache.set(key, null);
          }
        }
        const info = chatInfoCache.get(key);
        if (info) {
          const u = info.user || info.peer || info;
          if (!name && u.name) name = u.name;
          if (!username && u.username) username = String(u.username).replace(/^@/, "");
          if (!userId && (u.userId || u.user_id || u.peerUserId)) {
            userId = u.userId || u.user_id || u.peerUserId;
          }
        }
      }
    }

    return { name, username, userId };
  }

  // ===== 6. Multi-Message & Multi-Chat Forward Sheet =====
  function closeForwardModal() {
    const el = document.getElementById("tcForwardBackdrop");
    if (el) el.remove();
  }

  function openForwardModal(msgOrList, sourceChat, onComplete) {
    closeForwardModal();
    const msgs = Array.isArray(msgOrList) ? msgOrList : [msgOrList];
    if (!msgs.length) return;

    const st = getStoreObj();
    if (!st || typeof st.getState !== "function") {
      showToast("Failed to load chats");
      return;
    }

    const allChats = (st.getState().chats || []).slice();
    if (!allChats.length) {
      showToast("No chats available to forward to");
      return;
    }

    allChats.sort((a, b) => {
      if (a.type === "saved" && b.type !== "saved") return -1;
      if (b.type === "saved" && a.type !== "saved") return 1;
      return 0;
    });

    const selectedChatIds = new Set();

    const backdrop = document.createElement("div");
    backdrop.id = "tcForwardBackdrop";
    backdrop.className = "tc-fwd-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeForwardModal();
    });

    let previewLabel = `${msgs.length} messages selected`;
    if (msgs.length === 1) {
      const first = msgs[0];
      const parsed = parseForwarded(first.text);
      const body = parsed ? parsed.body : (first.text || "");
      previewLabel =
        body.trim() ||
        (first.attachment ? `📎 ${first.attachment.label || first.attachment.name || "Media"}` : "Message");
    }

    backdrop.innerHTML = `
      <div class="tc-fwd-sheet">
        <div class="tc-fwd-header">
          <div>
            <div class="tc-fwd-title">Forward ${msgs.length > 1 ? `(${msgs.length} items)` : "to..."}</div>
            <div class="tc-fwd-preview">${escapeHtml(previewLabel.slice(0, 65))}</div>
          </div>
          <button type="button" class="tc-fwd-close" id="tcFwdClose">${ICONS.close}</button>
        </div>
        <div class="tc-fwd-search-wrap">
          <span class="tc-fwd-search-ico">${ICONS.search}</span>
          <input type="text" id="tcFwdSearch" class="tc-fwd-search" placeholder="Search chats, users, groups..." autocomplete="off" />
        </div>
        <div class="tc-fwd-list" id="tcFwdList"></div>
        <div class="tc-fwd-footer">
          <button type="button" id="tcFwdSendBtn" class="tc-fwd-send-btn" disabled>
            ${ICONS.send}<span>Select a chat</span>
          </button>
        </div>
      </div>
    `;

    const listEl = backdrop.querySelector("#tcFwdList");
    const searchEl = backdrop.querySelector("#tcFwdSearch");
    const sendBtn = backdrop.querySelector("#tcFwdSendBtn");

    function updateSendBtn() {
      const count = selectedChatIds.size;
      sendBtn.disabled = count === 0;
      sendBtn.innerHTML =
        count > 0
          ? `${ICONS.send}<span>Forward ${msgs.length > 1 ? `${msgs.length} items ` : ""}to ${count} chat${count > 1 ? "s" : ""}</span>`
          : `${ICONS.send}<span>Select a chat</span>`;
    }

    function renderChatList(filterText) {
      const q = (filterText || "").trim().toLowerCase();
      const filtered = allChats.filter((c) => {
        if (!q) return true;
        const n = (c.name || "").toLowerCase();
        const u = (c.username || "").toLowerCase();
        return n.includes(q) || u.includes(q);
      });

      if (!filtered.length) {
        listEl.innerHTML = `<div class="tc-fwd-empty">No chats found</div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map((c) => {
          const idStr = String(c.id);
          const isSel = selectedChatIds.has(idStr);
          const avatarHtml = c.avatarUrl
            ? `<img src="${escapeHtml(c.avatarUrl)}" alt="" class="tc-fwd-av-img" />`
            : `<div class="tc-fwd-av-fallback">${escapeHtml((c.name || "C").trim()[0].toUpperCase())}</div>`;
          const sub =
            c.type === "saved"
              ? "Saved Messages"
              : c.username
              ? c.username.startsWith("@") ? c.username : `@${c.username}`
              : c.type || "Chat";

          return `
            <div class="tc-fwd-row ${isSel ? "selected" : ""}" data-fwd-id="${escapeHtml(idStr)}">
              <div class="tc-fwd-av">${avatarHtml}</div>
              <div class="tc-fwd-info">
                <div class="tc-fwd-name">${escapeHtml(c.name || "Chat")}</div>
                <div class="tc-fwd-sub">${escapeHtml(sub)}</div>
              </div>
              <div class="tc-fwd-check">${isSel ? ICONS.check : ""}</div>
            </div>
          `;
        })
        .join("");
    }

    listEl.addEventListener("click", (e) => {
      const row = e.target.closest(".tc-fwd-row");
      if (!row) return;
      const cid = row.getAttribute("data-fwd-id");
      if (selectedChatIds.has(cid)) selectedChatIds.delete(cid);
      else selectedChatIds.add(cid);
      renderChatList(searchEl.value);
      updateSendBtn();
    });

    searchEl.addEventListener("input", () => renderChatList(searchEl.value));
    backdrop.querySelector("#tcFwdClose").addEventListener("click", closeForwardModal);

    sendBtn.addEventListener("click", async () => {
      if (!selectedChatIds.size) return;
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span>Forwarding...</span>`;

      const chatInfoCache = new Map();
      const prepared = [];

      for (const m of msgs) {
        const senderMeta = await resolveSenderMetaForMessage(m, sourceChat, chatInfoCache);
        const existingParsed = parseForwarded(m.text);
        const cleanBody = existingParsed ? existingParsed.body : (m.text || "");
        prepared.push({
          text: buildForwardedText(senderMeta, cleanBody),
          attachment: m.attachment ? { ...m.attachment } : null
        });
      }

      const targets = Array.from(selectedChatIds)
        .map((id) => allChats.find((c) => String(c.id) === id))
        .filter(Boolean);

      for (const targetChat of targets) {
        for (let i = 0; i < prepared.length; i++) {
          st.addMessage(targetChat.id, {
            sender: "me",
            text: prepared[i].text,
            attachment: prepared[i].attachment
          });
          if (i < prepared.length - 1) {
            await new Promise((r) => setTimeout(r, 110));
          }
        }
      }

      if (window.App && typeof window.App.renderAll === "function") {
        window.App.renderAll();
      }
      closeForwardModal();
      if (typeof onComplete === "function") onComplete();
      showToast(
        targets.length === 1
          ? `Forwarded ${prepared.length > 1 ? `${prepared.length} items` : "message"}`
          : `Forwarded to ${targets.length} chats`
      );
    });

    renderChatList("");
    updateSendBtn();
    document.body.appendChild(backdrop);
  }

  // ===== 7. Clickable Forwarded Sender Profile Sheet + Direct Message =====
  function closeFwdProfileSheet() {
    const el = document.getElementById("tcFwdProfileBackdrop");
    if (el) el.remove();
  }

  async function openDirectChatWithProfile(profile) {
    const st = getStoreObj();
    const chats = (st && typeof st.getState === "function" && st.getState().chats) || [];

    // 1. Agar apni profile hai to Saved Messages open karein
    const me = await getCurrentUserInfo();
    if (
      (profile.userId && me.id && String(profile.userId) === String(me.id)) ||
      (profile.username && me.username && profile.username.toLowerCase() === me.username.toLowerCase())
    ) {
      const saved = chats.find((c) => c.type === "saved");
      if (saved && window.App && typeof window.App.openChat === "function") {
        closeFwdProfileSheet();
        window.App.openChat(String(saved.id));
        return;
      }
    }

    // 2. Agar is user ke sath pehle se personal chat maujood hai to seedha open karein
    if (profile.existingChatId && window.App && typeof window.App.openChat === "function") {
      closeFwdProfileSheet();
      window.App.openChat(String(profile.existingChatId));
      return;
    }

    // 3. Naya DM chat start karein (/api/chats/direct)
    if (!profile.userId) {
      showToast("User account not found");
      return;
    }

    try {
      const res = await apiJson("/api/chats/direct", {
        method: "POST",
        body: { targetUserId: Number(profile.userId) }
      });

      const newChat = res.chat || res;
      const newChatId = newChat && newChat.id ? String(newChat.id) : null;
      if (!newChatId) throw new Error("Could not create chat");

      // Store mein ensure karein taake openChat() turant load kar le
      if (st && typeof st.getState === "function") {
        const list = st.getState().chats || [];
        if (!list.some((c) => String(c.id) === newChatId)) {
          list.unshift({
            ...newChat,
            id: newChatId,
            name: newChat.name || profile.name || "Chat",
            username: newChat.username || profile.username || "",
            avatarUrl: newChat.avatarUrl || profile.avatarUrl || "",
            type: newChat.type || "personal",
            messages: newChat.messages || []
          });
        }
      }

      closeFwdProfileSheet();
      if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      if (window.App && typeof window.App.openChat === "function") {
        window.App.openChat(newChatId);
      }
    } catch (err) {
      showToast(err.message || "Could not start conversation");
    }
  }

  async function resolveForwardedUserProfile({ name, username, userId }) {
    const cleanName = (name || "").trim();
    const cleanUname = (username || "").replace(/^@/, "").trim();
    const st = getStoreObj();
    const chats = (st && typeof st.getState === "function" && st.getState().chats) || [];

    const result = {
      userId: userId ? Number(userId) || userId : null,
      name: cleanName || "User",
      username: cleanUname,
      bio: "",
      phone: "",
      avatarUrl: "",
      statusText: "",
      existingChatId: null
    };

    // 1. Local existing chats mein check karein
    const existing = chats.find((c) => {
      if (c.type !== "personal") return false;
      if (result.userId && String(c.peerUserId || c.otherUserId || "") === String(result.userId)) return true;
      if (cleanUname && c.username && c.username.replace(/^@/, "").toLowerCase() === cleanUname.toLowerCase()) return true;
      if (cleanName && c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase()) return true;
      return false;
    });

    if (existing) {
      result.existingChatId = String(existing.id);
      result.name = existing.name || result.name;
      result.username = (existing.username || result.username || "").replace(/^@/, "");
      result.avatarUrl = existing.avatarUrl || "";
      result.bio = existing.bio || "";
      result.userId = result.userId || existing.peerUserId || existing.otherUserId || null;

      try {
        const info = await apiJson(`/api/chats/${existing.id}/info`);
        const u = info.user || info.peer || info;
        result.name = u.name || result.name;
        result.username = (u.username || result.username || "").replace(/^@/, "");
        result.bio = u.bio || u.about || result.bio;
        result.phone = u.phone || result.phone;
        result.avatarUrl = u.avatarUrl || u.avatar_url || u.avatar || result.avatarUrl;
        result.statusText = u.online ? "online" : (u.lastSeen || u.status || "");
        if (!result.userId) result.userId = u.userId || u.user_id || u.peerUserId || null;
      } catch (_) {}
    }

    // 2. Global user search (/api/search) se exact userId, avatar, bio uthayein
    const query = cleanUname || cleanName;
    if (query && (!result.userId || !result.avatarUrl || !result.bio)) {
      try {
        const data = await apiJson(`/api/search?q=${encodeURIComponent(query)}`);
        const candidates = [
          ...(Array.isArray(data.users) ? data.users : []),
          ...(Array.isArray(data.results) ? data.results : []),
          ...(Array.isArray(data) ? data : [])
        ];

        const match =
          candidates.find((u) => result.userId && String(u.id || u.userId) === String(result.userId)) ||
          candidates.find(
            (u) => cleanUname && u.username && String(u.username).replace(/^@/, "").toLowerCase() === cleanUname.toLowerCase()
          ) ||
          candidates.find(
            (u) => cleanName && (u.name || u.fullName) && String(u.name || u.fullName).trim().toLowerCase() === cleanName.toLowerCase()
          ) ||
          candidates[0];

        if (match) {
          result.userId = result.userId || match.id || match.userId || match.user_id || null;
          result.name = match.name || match.fullName || match.full_name || result.name;
          result.username = (match.username || result.username || "").replace(/^@/, "");
          result.bio = match.bio || match.about || result.bio;
          result.phone = match.phone || result.phone;
          result.avatarUrl = match.avatarUrl || match.avatar_url || match.avatar || result.avatarUrl;
          result.statusText = match.online ? "online" : (match.lastSeen || result.statusText);
        }
      } catch (_) {}
    }

    return result;
  }

  async function openForwardedSenderProfile({ name, username, userId }) {
    closeFwdProfileSheet();

    const backdrop = document.createElement("div");
    backdrop.id = "tcFwdProfileBackdrop";
    backdrop.className = "tc-fp-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeFwdProfileSheet();
    });

    backdrop.innerHTML = `
      <div class="tc-fp-sheet">
        <button type="button" class="tc-fp-close" id="tcFpClose">${ICONS.close}</button>
        <div class="tc-fp-body" id="tcFpBody">
          <div class="tc-fp-loading">Loading profile...</div>
        </div>
      </div>
    `;
    backdrop.querySelector("#tcFpClose").addEventListener("click", closeFwdProfileSheet);
    document.body.appendChild(backdrop);

    const profile = await resolveForwardedUserProfile({ name, username, userId });
    const bodyEl = backdrop.querySelector("#tcFpBody");
    if (!bodyEl) return;

    const me = await getCurrentUserInfo();
    const isSelf =
      (profile.userId && me.id && String(profile.userId) === String(me.id)) ||
      (profile.username && me.username && profile.username.toLowerCase() === me.username.toLowerCase());

    const avatarHtml = profile.avatarUrl
      ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" class="tc-fp-av-img" />`
      : `<div class="tc-fp-av-fallback">${escapeHtml((profile.name || "U").trim()[0].toUpperCase())}</div>`;

    const canMessage = Boolean(profile.existingChatId || profile.userId || isSelf);
    const msgBtnLabel = isSelf ? "Saved Messages" : "Send Message";

    bodyEl.innerHTML = `
      <div class="tc-fp-hero">
        <div class="tc-fp-avatar">${avatarHtml}</div>
        <div class="tc-fp-name">${escapeHtml(profile.name)}</div>
        ${profile.statusText ? `<div class="tc-fp-status">${escapeHtml(profile.statusText)}</div>` : ""}
      </div>

      <div class="tc-fp-info-card">
        ${
          profile.username
            ? `<div class="tc-fp-row" id="tcFpCopyUser">
                <div>
                  <div class="tc-fp-val">@${escapeHtml(profile.username)}</div>
                  <div class="tc-fp-lbl">Username (tap to copy)</div>
                </div>
                <span class="tc-fp-copy-ico">${ICONS.copy}</span>
              </div>`
            : ""
        }
        ${
          profile.phone
            ? `<div class="tc-fp-row">
                <div>
                  <div class="tc-fp-val">${escapeHtml(profile.phone)}</div>
                  <div class="tc-fp-lbl">Mobile</div>
                </div>
              </div>`
            : ""
        }
        <div class="tc-fp-row">
          <div>
            <div class="tc-fp-val">${escapeHtml(profile.bio || "No bio yet")}</div>
            <div class="tc-fp-lbl">Bio</div>
          </div>
        </div>
      </div>

      <button type="button" class="tc-fp-msg-btn" id="tcFpMsgBtn" ${canMessage ? "" : "disabled"}>
        ${ICONS.msg}<span>${canMessage ? msgBtnLabel : "User Not Found"}</span>
      </button>
    `;

    const copyRow = bodyEl.querySelector("#tcFpCopyUser");
    if (copyRow && profile.username) {
      copyRow.addEventListener("click", () => {
        navigator.clipboard?.writeText(`@${profile.username}`).catch(() => {});
        showToast(`@${profile.username} copied`);
      });
    }

    const msgBtn = bodyEl.querySelector("#tcFpMsgBtn");
    if (msgBtn && canMessage) {
      msgBtn.addEventListener("click", () => openDirectChatWithProfile(profile));
    }

    // Profile avatar tap -> fullscreen viewer
    const avImg = bodyEl.querySelector(".tc-fp-av-img");
    if (avImg && profile.avatarUrl) {
      avImg.addEventListener("click", () => openMediaViewer("photo", profile.avatarUrl, profile.name));
    }
  }

  // ===== Global Click Listeners (Capture Phase) =====
  document.addEventListener(
    "click",
    (e) => {
      // A. Selection Mode Active -> Kisi bhi message par tap karne se tick toggle ho
      if (selectMode) {
        if (e.target.closest("#tcSelectBar, #tcForwardBackdrop")) return;
        const msgRow = e.target.closest("#messages-container .msg-row[data-msg-id]");
        if (msgRow) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          toggleMsgSelection(msgRow.getAttribute("data-msg-id"));
          return;
        }
        if (e.target.closest(".chat-item, #back-to-chats-btn, .back-btn, .bottom-nav")) {
          exitSelectMode();
        }
        return;
      }

      // B. "Forwarded from Name" Click -> Open Original Sender Profile + Message Button
      const fwdHeader = e.target.closest(".msg-forward-header");
      if (fwdHeader) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openForwardedSenderProfile({
          name: fwdHeader.getAttribute("data-fwd-name") || "",
          username: fwdHeader.getAttribute("data-fwd-username") || "",
          userId: fwdHeader.getAttribute("data-fwd-uid") || ""
        });
        return;
      }

      // C. Reply Quote Click -> Jump & Highlight
      const replyBox = e.target.closest(".msg-reply-box");
      if (replyBox) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        jumpToRepliedMessage(replyBox);
        return;
      }

      // D. Chat Photo / Video Click -> Fullscreen Viewer + Download
      const mediaWrap = e.target.closest(".msg-media-wrap");
      if (mediaWrap) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openMediaViewer(
          mediaWrap.getAttribute("data-media-type") || "photo",
          mediaWrap.getAttribute("data-media-src") || "",
          mediaWrap.getAttribute("data-media-name") || ""
        );
        return;
      }

      // E. Document / File Download Button
      const dlBtn = e.target.closest(".msg-file-dl-btn");
      if (dlBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        downloadMediaFile(
          dlBtn.getAttribute("data-dl-src") || "",
          dlBtn.getAttribute("data-dl-name") || "file"
        );
      }
    },
    true
  );

  // Re-render hone par selection checkboxes barkarar rakhein
  window.addEventListener("DOMContentLoaded", () => {
    const mc = document.getElementById("messages-container");
    if (mc) {
      const obs = new MutationObserver(() => {
        if (selectMode) syncSelectionVisuals();
      });
      obs.observe(mc, { childList: true });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMediaViewer();
      closeForwardModal();
      closeFwdProfileSheet();
      if (selectMode) exitSelectMode();
    }
  });

  window.TCChatEnhancements = {
    parseForwarded,
    renderForwardHeader,
    openForwardModal,
    openMediaViewer,
    downloadMediaFile,
    enterSelectMode,
    exitSelectMode
  };
})();