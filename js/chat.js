/* =========================================================
   TELECLONE INTERACTIVE CHAT CONTROLLER (MODULE 2)
   ========================================================= */

(function () {
  const $ = (id) => document.getElementById(id);

  const EMOJIS = [
    "😀", "😂", "😍", "🔥", "👍", "❤️", "🎉", "⚡",
    "🤖", "🚀", "💎", "📌", "😎", "🙏", "👏", "🤔",
    "😅", "🥳", "💯", "✨", "📢", "🔒", "📊", "💻"
  ];

  const els = {
    // Header
    statusEl: $("preview-chat-status"),
    searchToggleBtn: $("chat-search-toggle"),
    callBtn: $("chat-call-btn"),
    moreBtn: $("chat-more-btn"),
    moreMenu: $("chat-more-menu"),
    menuMuteLabel: $("chat-menu-mute-label"),
    // In-chat Search & Pin
    searchBar: $("in-chat-search-bar"),
    searchInput: $("in-chat-search-input"),
    searchCount: $("in-chat-search-count"),
    searchCloseBtn: $("in-chat-search-close"),
    pinnedBar: $("pinned-bar"),
    pinnedBarText: $("pinned-bar-text"),
    unpinBarBtn: $("unpin-bar-btn"),
    // Messages
    messagesContainer: $("messages-container"),
    scrollBottomBtn: $("scroll-bottom-btn"),
    // Reply/Edit Banner
    banner: $("composer-banner"),
    bannerTitle: $("composer-banner-title"),
    bannerText: $("composer-banner-text"),
    bannerClose: $("composer-banner-close"),
    // Popups
    botCmdPopup: $("bot-commands-popup"),
    botCmdList: $("bot-commands-list"),
    emojiPopup: $("emoji-popup"),
    emojiGrid: $("emoji-grid"),
    attachMenu: $("attach-menu"),
    sendOptionsMenu: $("send-options-menu"),
    fileInput: $("chat-file-input"),
    // Composer & Bot Bars
    botStartBar: $("bot-start-bar"),
    botStartBtn: $("bot-start-btn"),
    composer: $("chat-composer"),
    botMenuBtn: $("bot-menu-btn"),
    inputWrap: $("composer-input-wrap"),
    emojiBtn: $("emoji-btn"),
    msgInput: $("msg-input"),
    replyKbToggleBtn: $("reply-kb-toggle-btn"),
    attachBtn: $("attach-btn"),
    recordingBar: $("recording-bar"),
    recTimer: $("rec-timer"),
    recCancelBtn: $("rec-cancel-btn"),
    actionBtn: $("composer-action-btn"),
    botReplyKeyboard: $("bot-reply-keyboard"),
    // Message Context Menu
    msgContextMenu: $("msg-context-menu"),
    msgCtxEdit: $("msg-ctx-edit"),
    // Mini App Modal
    miniAppModal: $("mini-app-modal"),
    miniAppClose: $("mini-app-close")
  };

  // Local Chat State
  let replyingToMsg = null;
  let editingMsgId = null;
  let contextMsgId = null;
  let isRecording = false;
  let recSeconds = 0;
  let recInterval = null;
  let replyKbVisible = true;
  let inChatSearchQuery = "";
  let fileAttachMode = "file";
  let statusResetTimer = null;

  // ==================== HELPERS ====================
  function escapeHtml(str) {
    return window.App
      ? window.App.escapeHtml(str)
      : String(str || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function toast(msg) {
    if (window.App) window.App.showToast(msg);
  }

  function getActiveChat() {
    return Store.getChatById(Store.getState().activeChatId);
  }

  function formatMessageText(rawText) {
    let html = escapeHtml(rawText || "");
    // Code blocks / inline code `...` (tap to copy)
    html = html.replace(/`([^`]+)`/g, '<code class="copyable-code" title="Tap to copy">$1</code>');
    // Bold **...**
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italic *...*
    html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    // Spoiler ||...||
    html = html.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" title="Tap to reveal">$1</span>');
    // Clickable Bot Slash Commands (/newbot, /start, etc.)
    html = html.replace(/(^|\s)(\/[a-zA-Z0-9_]+)/g, '$1<span class="bot-cmd-link" data-cmd="$2">$2</span>');
    return html;
  }

  function closeAllPopups() {
    els.moreMenu.classList.add("hidden");
    els.botCmdPopup.classList.add("hidden");
    els.emojiPopup.classList.add("hidden");
    els.attachMenu.classList.add("hidden");
    els.sendOptionsMenu.classList.add("hidden");
    els.msgContextMenu.classList.add("hidden");
  }

  function resetComposerModes() {
    replyingToMsg = null;
    editingMsgId = null;
    els.banner.classList.add("hidden");
  }

  function updateActionButton() {
    const hasText = els.msgInput.value.trim().length > 0;
    if (isRecording || hasText || editingMsgId) {
      els.actionBtn.textContent = editingMsgId ? "✓" : "➤";
      els.actionBtn.title = editingMsgId ? "Save edit" : "Send (Right-click for Silent/Schedule)";
    } else {
      els.actionBtn.textContent = "🎤";
      els.actionBtn.title = "Record Voice Note";
    }
  }

  function autoResizeInput() {
    els.msgInput.style.height = "auto";
    els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 120) + "px";
  }

  function scrollToBottom(instant = false) {
    els.messagesContainer.scrollTo({
      top: els.messagesContainer.scrollHeight,
      behavior: instant ? "auto" : "smooth"
    });
  }

  function setTempStatus(text) {
    if (!els.statusEl) return;
    clearTimeout(statusResetTimer);
    els.statusEl.textContent = text;
    els.statusEl.style.color = "var(--accent-color)";
    statusResetTimer = setTimeout(() => {
      const chat = getActiveChat();
      if (chat) {
        els.statusEl.textContent = chat.statusText || "online";
        els.statusEl.style.color = "";
      }
    }, 1800);
  }

  // ==================== RENDERING ====================
  function renderPinnedBar(chat) {
    if (!chat.pinnedMessageId) {
      els.pinnedBar.classList.add("hidden");
      return;
    }
    const pinnedMsg = (chat.messages || []).find((m) => m.id === chat.pinnedMessageId);
    if (!pinnedMsg) {
      els.pinnedBar.classList.add("hidden");
      return;
    }
    els.pinnedBar.classList.remove("hidden");
    els.pinnedBarText.textContent =
      pinnedMsg.text || (pinnedMsg.attachment ? `📎 ${pinnedMsg.attachment.name || "Media"}` : "Pinned message");
  }

function renderAttachmentHtml(att) {
    if (!att) return "";
    const srcStr = String(att.src || "");
    const nameStr = String(att.name || "");
    const isUploading = Boolean(att._uploading);
    const isVideo =
      att.type === "video" ||
      /\.(mp4|mov|m4v|mkv|3gp|avi)(\?.*)?$/i.test(srcStr) ||
      /\.(mp4|mov|m4v|mkv|3gp|avi)$/i.test(nameStr);

    if (att.type === "photo" && att.src) {
      return `
        <div class="msg-media-wrap ${isUploading ? "is-uploading" : ""}" data-media-type="photo" data-media-src="${escapeHtml(att.src)}" data-media-name="${escapeHtml(att.name || "photo.jpg")}">
          <img src="${escapeHtml(att.src)}" alt="${escapeHtml(att.name || "Photo")}" class="msg-media-img" loading="lazy" />
          ${isUploading ? '<div class="msg-upload-overlay"><div class="msg-upload-spinner"></div></div>' : ""}
        </div>
      `;
    }
    if (isVideo && att.src) {
      return `
        <div class="msg-media-wrap msg-video-wrap ${isUploading ? "is-uploading" : ""}" data-media-type="video" data-media-src="${escapeHtml(att.src)}" data-media-name="${escapeHtml(att.name || "video.mp4")}">
          <video src="${escapeHtml(att.src)}#t=0.1" class="msg-media-video" preload="metadata" playsinline muted></video>
          ${
            isUploading
              ? '<div class="msg-upload-overlay"><div class="msg-upload-spinner"></div></div>'
              : '<div class="msg-video-play-badge" aria-label="Play video">▶</div>'
          }
        </div>
      `;
    }
    if (att.type === "voice") {
      const safeSrc = escapeHtml(att.src || "");
      return `
        <div class="msg-voice-card ${isUploading ? "is-uploading" : ""}" data-voice-src="${safeSrc}">
          <button class="voice-play-btn" type="button" data-voice-src="${safeSrc}" aria-label="Play voice">
            ${isUploading ? '<span class="msg-upload-mini-spin"></span>' : "▶"}
          </button>
          <div class="voice-wave"><div class="voice-wave-progress"></div></div>
          <span class="voice-duration" style="font-size:12px;opacity:0.85;">${escapeHtml(att.duration || "0:01")}</span>
        </div>
      `;
    }
    if (att.type === "location") {
      return `
        <div class="msg-file-card">
          <div class="msg-file-icon">📍</div>
          <div>
            <div class="msg-file-name">Shared Location</div>
            <div class="msg-file-size">${escapeHtml(att.coords || "Live Pin • Open Map")}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="msg-file-card ${isUploading ? "is-uploading" : ""}">
        <div class="msg-file-icon">${isUploading ? '<span class="msg-upload-mini-spin"></span>' : "📄"}</div>
        <div style="flex:1;min-width:0;">
          <div class="msg-file-name">${escapeHtml(att.name || "Document.pdf")}</div>
          <div class="msg-file-size">${escapeHtml(isUploading ? "Uploading..." : (att.size || "File"))}</div>
        </div>
        ${
          att.src && !isUploading
            ? `<button type="button" class="msg-file-dl-btn" data-dl-src="${escapeHtml(att.src)}" data-dl-name="${escapeHtml(att.name || "file")}" title="Download">⬇</button>`
            : ""
        }
      </div>
    `;
  }
  function renderPollHtml(msg) {
    if (!msg.poll) return "";

    const totalVotes = msg.poll.options.reduce((sum, o) => sum + o.votes, 0);
    const optionsHtml = msg.poll.options
      .map((opt, idx) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        const isVoted = msg.poll.myVote === idx;
        return `
          <button class="poll-option-btn ${isVoted ? "voted" : ""}" data-poll-msg="${msg.id}" data-poll-opt="${idx}">
            <span>${isVoted ? "✓ " : ""}${escapeHtml(opt.text)}</span>
            <span style="font-size:12px;opacity:0.8;">${pct}% (${opt.votes})</span>
          </button>
        `;
      })
      .join("");

    return `
      <div class="msg-poll-card">
        <div class="poll-question">📊 ${escapeHtml(msg.poll.question)}</div>
        ${optionsHtml}
        <div style="font-size:11.5px;opacity:0.7;margin-top:4px;">${totalVotes} vote${totalVotes === 1 ? "" : "s"}</div>
      </div>
    `;
  }

  function renderReactionsHtml(msg) {
    const entries = Object.entries(msg.reactions || {});
    if (entries.length === 0) return "";
    return `
      <div class="msg-reactions">
        ${entries
          .map(
            ([emoji, info]) => `
            <button class="reaction-chip ${info.mine ? "mine" : ""}" data-react-msg="${msg.id}" data-react-emoji="${emoji}">
              <span>${emoji}</span><span>${info.count}</span>
            </button>
          `
          )
          .join("")}
      </div>
    `;
  }

  function renderInlineKeyboardHtml(msg) {
    if (!Array.isArray(msg.inlineKeyboard) || msg.inlineKeyboard.length === 0) return "";
    return `
      <div class="inline-keyboard">
        ${msg.inlineKeyboard
          .map(
            (row) => `
            <div class="inline-kb-row">
              ${row
                .map(
                  (btn) => `
                  <button class="inline-kb-btn" data-cb-msg="${msg.id}" data-cb-data="${escapeHtml(btn.callback_data || "")}">
                    ${escapeHtml(btn.text)}
                  </button>
                `
                )
                .join("")}
            </div>
          `
          )
          .join("")}
      </div>
    `;
  }

  function renderBotCommandsList(chat, filter = "") {
    const cmds = (chat.botCommands || []).filter((c) =>
      c.command.toLowerCase().includes(filter.toLowerCase())
    );
    if (cmds.length === 0) {
      els.botCmdPopup.classList.add("hidden");
      return;
    }
    els.botCmdList.innerHTML = cmds
      .map(
        (c) => `
        <button class="bot-cmd-item" data-cmd-pick="${escapeHtml(c.command)}">
          <span class="bot-cmd-name">${escapeHtml(c.command)}</span>
          <span class="bot-cmd-desc">${escapeHtml(c.description)}</span>
        </button>
      `
      )
      .join("");
  }

  function renderReplyKeyboard(chat) {
    const kb = chat.replyKeyboard;
    const hasKb = Array.isArray(kb) && kb.length > 0;
    els.replyKbToggleBtn.classList.toggle("hidden", !hasKb);

    if (!hasKb || !replyKbVisible) {
      els.botReplyKeyboard.classList.add("hidden");
      return;
    }

    els.botReplyKeyboard.classList.remove("hidden");
    els.botReplyKeyboard.innerHTML = kb
      .map(
        (row) => `
        <div class="reply-kb-row">
          ${row.map((label) => `<button class="reply-kb-btn" data-reply-kb="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join("")}
        </div>
      `
      )
      .join("");
  }

  function renderActiveChat(keepScroll = false) {
    const chat = getActiveChat();
    if (!chat) return;

    // Header mute label & status
    els.menuMuteLabel.textContent = chat.muted ? "Unmute Notifications" : "Mute Notifications";
    els.statusEl.style.color = "";
    els.statusEl.textContent = chat.statusText || "online";

    renderPinnedBar(chat);

    // Bot START bar vs Normal Composer
    const needsStart = chat.isBot && chat.botStarted === false && (!chat.messages || chat.messages.length === 0);
    els.botStartBar.classList.toggle("hidden", !needsStart);
    els.composer.classList.toggle("hidden", needsStart);

    // Bot Menu button visibility
    const hasBotMenu = chat.isBot && Array.isArray(chat.botCommands) && chat.botCommands.length > 0;
    els.botMenuBtn.classList.toggle("hidden", !hasBotMenu);
    if (hasBotMenu) renderBotCommandsList(chat);

    renderReplyKeyboard(chat);

    // Render Messages
    const msgs = chat.messages || [];
    const searchQ = inChatSearchQuery.trim().toLowerCase();
    let matchCount = 0;

    if (msgs.length === 0) {
      if (chat.isBot) {
        els.messagesContainer.innerHTML = `
          <div class="bot-intro-card">
            <div style="font-size:34px;margin-bottom:8px;">🤖</div>
            <h3>What can ${escapeHtml(chat.name)} do?</h3>
            <p>${escapeHtml(chat.description || "Press START below to interact with this bot.")}</p>
          </div>
        `;
      } else {
        els.messagesContainer.innerHTML = `<div class="date-divider">No messages here yet. Say hello!</div>`;
      }
      els.searchCount.textContent = "";
      return;
    }

    const htmlParts = [`<div class="date-divider">Today</div>`];

    msgs.forEach((msg) => {
      const isMe = msg.sender === "me";
      const isMatch = searchQ && (msg.text || "").toLowerCase().includes(searchQ);
      if (isMatch) matchCount++;

      const replyHtml = msg.replyTo
        ? `
          <div class="msg-reply-box" data-reply-id="${escapeHtml(String(msg.replyTo.id || ""))}" data-reply-text="${escapeHtml(msg.replyTo.text || "")}" data-reply-author="${escapeHtml(msg.replyTo.author || "")}">
            <span class="msg-reply-author">${escapeHtml(msg.replyTo.author)}</span>
            <span class="msg-reply-snippet">${escapeHtml(msg.replyTo.text)}</span>
          </div>
        `
        : "";

     const fwdInfo = window.TCChatEnhancements
        ? window.TCChatEnhancements.parseForwarded(msg.text)
        : null;
      const forwardHtml = fwdInfo
        ? window.TCChatEnhancements.renderForwardHeader(fwdInfo)
        : "";
      const displayText = fwdInfo ? fwdInfo.body : (msg.text || "");
const ticks = isMe
        ? msg.status === "sending"
          ? '<span class="msg-tick-sending" title="Sending">🕒</span>'
          : msg.status === "failed"
          ? '<span class="msg-tick-failed" title="Failed">❗</span>'
          : msg.status === "read"
          ? "✓✓"
          : "✓"
        : "";

      htmlParts.push(`
        <div class="msg-row ${isMe ? "outgoing" : "incoming"} ${isMatch ? "highlight" : ""} ${msg.status === "sending" ? "is-sending" : ""} ${msg.status === "failed" ? "is-failed" : ""}" data-msg-id="${msg.id}">
          <div class="msg-bubble" data-msg-id="${msg.id}">
            ${!isMe && msg.senderName ? `<div class="msg-sender-name">${escapeHtml(msg.senderName)}</div>` : ""}
            ${forwardHtml}
            ${replyHtml}
            ${renderAttachmentHtml(msg.attachment)}
            ${renderPollHtml(msg)}
            ${displayText ? `<div class="msg-text">${formatMessageText(displayText)}</div>` : ""}
            ${renderReactionsHtml(msg)}
            <div class="msg-meta">
              ${msg.silent ? '<span title="Sent silently">🔕</span>' : ""}
              ${msg.edited ? "<span>edited</span>" : ""}
              <span>${escapeHtml(msg.time)}</span>
              ${ticks ? `<span>${ticks}</span>` : ""}
            </div>
          </div>
          ${renderInlineKeyboardHtml(msg)}
        </div>
      `);
    });

    els.messagesContainer.innerHTML = htmlParts.join("");
    els.searchCount.textContent = searchQ ? `${matchCount} found` : "";

    if (!keepScroll) {
      scrollToBottom(true);
    }
    updateActionButton();
  }

  // ==================== SENDING MESSAGES ====================
  function sendCurrentMessage({ silent = false, scheduleMs = 0, customText = null } = {}) {
    const chat = getActiveChat();
    if (!chat) return;

    const text = (customText !== null ? customText : els.msgInput.value).trim();
    if (!text) return;

    // Edit Mode
    if (editingMsgId && customText === null) {
      Store.editMessage(chat.id, editingMsgId, text);
      els.msgInput.value = "";
      autoResizeInput();
      resetComposerModes();
      if (window.App) window.App.renderAll();
      renderActiveChat(true);
      toast("Message edited");
      return;
    }

    // Scheduled Send
    if (scheduleMs > 0) {
      const targetChatId = chat.id;
      const replySnapshot = replyingToMsg;
      els.msgInput.value = "";
      autoResizeInput();
      resetComposerModes();
      toast(`Scheduled! Auto-sending in ${Math.round(scheduleMs / 1000)}s...`);

      setTimeout(() => {
        Store.addMessage(targetChatId, {
          sender: "me",
          text: `📅 ${text}`,
          replyTo: replySnapshot
        });
        if (window.App) window.App.renderAll();
        if (Store.getState().activeChatId === targetChatId) renderActiveChat();
        if (window.BotEngine) window.BotEngine.onUserMessage(targetChatId, text);
        toast("Scheduled message sent!");
      }, scheduleMs);
      return;
    }

    // Standard / Silent Send
    Store.addMessage(chat.id, {
      sender: "me",
      text,
      silent,
      replyTo: replyingToMsg
    });

    if (customText === null) {
      els.msgInput.value = "";
      autoResizeInput();
    }
    resetComposerModes();
    closeAllPopups();

    if (window.App) window.App.renderAll();
    renderActiveChat();

    if (silent) toast("Sent without sound 🔕");

    // Pass to BotEngine / Auto-reply
    if (window.BotEngine) {
      window.BotEngine.onUserMessage(chat.id, text);
    }
  }

  // ==================== REAL VOICE RECORDER ====================
  async function startVoiceRecording() {
    if (isRecording) return;
    const ok = window.TCVoice ? await window.TCVoice.start() : false;
    if (!ok) return;

    isRecording = true;
    recSeconds = 0;
    els.recTimer.textContent = "0:00";
    els.inputWrap.classList.add("hidden");
    els.recordingBar.classList.remove("hidden");
    updateActionButton();

    recInterval = setInterval(() => {
      recSeconds++;
      const mins = Math.floor(recSeconds / 60);
      const secs = String(recSeconds % 60).padStart(2, "0");
      els.recTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  async function stopVoiceRecording(send = false) {
    if (!isRecording) return;
    clearInterval(recInterval);
    const duration = els.recTimer.textContent;
    isRecording = false;
    els.recordingBar.classList.add("hidden");
    els.inputWrap.classList.remove("hidden");
    updateActionButton();

    if (!send) {
      if (window.TCVoice) await window.TCVoice.cancel();
      toast("Recording cancelled");
      return;
    }

    const chat = getActiveChat();
    if (!chat) {
      if (window.TCVoice) await window.TCVoice.cancel();
      return;
    }

    toast("Uploading voice note...");
    const finalDur = duration === "0:00" ? "0:01" : duration;
    const attachment = window.TCVoice ? await window.TCVoice.stopAndUpload(finalDur) : null;
    if (!attachment || !attachment.src) {
      toast("Could not record or upload voice note");
      return;
    }

    Store.addMessage(chat.id, {
      sender: "me",
      text: "",
      attachment
    });
    if (window.App) window.App.renderAll();
    renderActiveChat();
    toast("Voice message sent");
  }
  // ==================== MESSAGE CONTEXT MENU ====================
  function openMsgContextMenu(msgId, x, y) {
    const chat = getActiveChat();
    if (!chat) return;
    const msg = (chat.messages || []).find((m) => m.id === msgId);
    if (!msg) return;

    contextMsgId = msgId;
    // Sirf apne text messages edit ho sakte hain
    els.msgCtxEdit.classList.toggle("hidden", msg.sender !== "me" || !msg.text);

    els.msgContextMenu.classList.remove("hidden");
    const w = els.msgContextMenu.offsetWidth || 225;
    const h = els.msgContextMenu.offsetHeight || 290;
    els.msgContextMenu.style.left = `${Math.max(10, Math.min(x, window.innerWidth - w - 10))}px`;
    els.msgContextMenu.style.top = `${Math.max(10, Math.min(y, window.innerHeight - h - 10))}px`;
  }

  // ==================== EVENT BINDINGS ====================
  function initEmojiGrid() {
    els.emojiGrid.innerHTML = EMOJIS.map(
      (e) => `<button class="emoji-cell" type="button" data-emoji="${e}">${e}</button>`
    ).join("");
  }

  function bindEvents() {
    // Header Actions
    els.callBtn.addEventListener("click", () => {
      const chat = getActiveChat();
      toast(`Calling ${chat ? chat.name : "..."} (Voice Call UI — Module 3)`);
    });

    els.searchToggleBtn.addEventListener("click", () => {
      els.searchBar.classList.toggle("hidden");
      if (!els.searchBar.classList.contains("hidden")) {
        els.searchInput.focus();
      } else {
        inChatSearchQuery = "";
        els.searchInput.value = "";
        renderActiveChat(true);
      }
    });

    els.searchInput.addEventListener("input", (e) => {
      inChatSearchQuery = e.target.value;
      renderActiveChat(true);
    });

    els.searchCloseBtn.addEventListener("click", () => {
      inChatSearchQuery = "";
      els.searchInput.value = "";
      els.searchBar.classList.add("hidden");
      renderActiveChat(true);
    });

    els.moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = els.moreMenu.classList.contains("hidden");
      closeAllPopups();
      if (willOpen) els.moreMenu.classList.remove("hidden");
    });

    els.moreMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".chat-dropdown-item");
      if (!item) return;
      const chat = getActiveChat();
      if (!chat) return;
      const act = item.dataset.chatAction;
      closeAllPopups();

      if (act === "mute") {
        const muted = Store.toggleMute(chat.id);
        if (window.App) window.App.renderAll();
        renderActiveChat(true);
        toast(muted ? "Chat muted" : "Chat unmuted");
      } else if (act === "search") {
        els.searchBar.classList.remove("hidden");
        els.searchInput.focus();
      } else if (act === "auto-delete") {
        toast("Auto-Delete Timer set to 24 hours (Demo)");
      } else if (act === "clear") {
        Store.clearHistory(chat.id);
        if (window.App) window.App.renderAll();
        renderActiveChat();
        toast("Chat history cleared");
      }
    });

    // Pinned Bar Click / Unpin
    els.pinnedBar.addEventListener("click", (e) => {
      if (e.target === els.unpinBarBtn) return;
      const chat = getActiveChat();
      if (!chat || !chat.pinnedMessageId) return;
      const row = els.messagesContainer.querySelector(`.msg-row[data-msg-id="${chat.pinnedMessageId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("highlight");
        setTimeout(() => row.classList.remove("highlight"), 1400);
      }
    });

    els.unpinBarBtn.addEventListener("click", () => {
      const chat = getActiveChat();
      if (!chat) return;
      Store.pinMessage(chat.id, null);
      renderPinnedBar(chat);
      toast("Message unpinned");
    });

    // Scroll to bottom button
    els.messagesContainer.addEventListener("scroll", () => {
      const dist =
        els.messagesContainer.scrollHeight -
        els.messagesContainer.scrollTop -
        els.messagesContainer.clientHeight;
      els.scrollBottomBtn.classList.toggle("hidden", dist < 160);
    });
    els.scrollBottomBtn.addEventListener("click", () => scrollToBottom(false));

    // Messages Container Interactive Clicks
    els.messagesContainer.addEventListener("click", (e) => {
      const chat = getActiveChat();
      if (!chat) return;

      // 1. Copyable code / token
      const codeEl = e.target.closest(".copyable-code");
      if (codeEl) {
        navigator.clipboard?.writeText(codeEl.textContent).catch(() => {});
        toast("Copied to clipboard! 📋");
        return;
      }

      // 2. Spoiler toggle
      const spoilerEl = e.target.closest(".spoiler");
      if (spoilerEl) {
        spoilerEl.classList.toggle("revealed");
        return;
      }

      // 3. Clickable /command inside message
      const cmdLink = e.target.closest(".bot-cmd-link");
      if (cmdLink) {
        sendCurrentMessage({ customText: cmdLink.dataset.cmd });
        return;
      }

      // 4. Inline Keyboard Callback Button
      const kbBtn = e.target.closest(".inline-kb-btn");
      if (kbBtn) {
        if (window.BotEngine) {
          window.BotEngine.onCallbackQuery(chat.id, kbBtn.dataset.cbMsg, kbBtn.dataset.cbData);
        }
        return;
      }

      // 5. Poll Vote
      const pollBtn = e.target.closest(".poll-option-btn");
      if (pollBtn) {
        Store.votePoll(chat.id, pollBtn.dataset.pollMsg, Number(pollBtn.dataset.pollOpt));
        renderActiveChat(true);
        return;
      }

      // 6. Reaction Chip Toggle
      const reactChip = e.target.closest(".reaction-chip");
      if (reactChip) {
        Store.toggleReaction(chat.id, reactChip.dataset.reactMsg, reactChip.dataset.reactEmoji);
        renderActiveChat(true);
        return;
      }

      // 7. Voice Play Simulation
      const playBtn = e.target.closest(".voice-play-btn");
      if (playBtn) {
        const playing = playBtn.textContent === "⏸";
        playBtn.textContent = playing ? "▶" : "⏸";
        if (!playing) {
          setTimeout(() => (playBtn.textContent = "▶"), 2500);
        }
        return;
      }

      // 8. Message Bubble Click -> Open Context Menu (Mobile & Desktop friendly)
      const bubble = e.target.closest(".msg-bubble");
      if (bubble) {
        e.stopPropagation();
        openMsgContextMenu(bubble.dataset.msgId, e.clientX, e.clientY);
      }
    });

    // Double-Click Quick ❤️ Reaction
    els.messagesContainer.addEventListener("dblclick", (e) => {
      const bubble = e.target.closest(".msg-bubble");
      const chat = getActiveChat();
      if (!bubble || !chat) return;
      closeAllPopups();
      Store.toggleReaction(chat.id, bubble.dataset.msgId, "❤️");
      renderActiveChat(true);
    });

    // Right-Click on Message Bubble
    els.messagesContainer.addEventListener("contextmenu", (e) => {
      const bubble = e.target.closest(".msg-bubble");
      if (!bubble) return;
      e.preventDefault();
      openMsgContextMenu(bubble.dataset.msgId, e.clientX, e.clientY);
    });

    // Message Context Menu Actions
    els.msgContextMenu.addEventListener("click", (e) => {
      const chat = getActiveChat();
      if (!chat || !contextMsgId) return;
      const msg = (chat.messages || []).find((m) => m.id === contextMsgId);
      if (!msg) return;

      const reactBtn = e.target.closest(".quick-react-btn");
      if (reactBtn) {
        Store.toggleReaction(chat.id, contextMsgId, reactBtn.dataset.react);
        closeAllPopups();
        renderActiveChat(true);
        return;
      }

      const item = e.target.closest(".context-item");
      if (!item) return;
      const act = item.dataset.msgCtx;
      closeAllPopups();

     if (act === "reply") {
        editingMsgId = null;
        replyingToMsg = {
          id: msg.id,
          author: msg.sender === "me" ? "You" : msg.senderName || chat.name,
          text: msg.text || (msg.attachment ? `📎 ${msg.attachment.label || msg.attachment.name}` : "Message")
        };
        els.bannerTitle.textContent = `Reply to ${replyingToMsg.author}`;
        els.bannerText.textContent = replyingToMsg.text;
        els.banner.classList.remove("hidden");
        els.msgInput.focus();
      }
       else if (act === "edit") {
        replyingToMsg = null;
        editingMsgId = msg.id;
        els.bannerTitle.textContent = "Edit Message";
        els.bannerText.textContent = msg.text;
        els.banner.classList.remove("hidden");
        els.msgInput.value = msg.text;
        autoResizeInput();
        updateActionButton();
        els.msgInput.focus();
      } else if (act === "pin") {
        Store.pinMessage(chat.id, msg.id);
        renderPinnedBar(chat);
        toast("Message pinned 📌");
      } else if (act === "copy") {
        const parsed = window.TCChatEnhancements
          ? window.TCChatEnhancements.parseForwarded(msg.text)
          : null;
        const cleanCopy = parsed ? parsed.body : (msg.text || "");
        navigator.clipboard?.writeText(cleanCopy).catch(() => {});
        toast("Text copied!");
      } else if (act === "forward") {
        if (window.TCChatEnhancements) {
          window.TCChatEnhancements.openForwardModal([msg], chat);
        }
      } else if (act === "select") {
        if (window.TCChatEnhancements) {
          window.TCChatEnhancements.enterSelectMode(msg.id);
        }
      } else if (act === "delete") {
        Store.deleteMessage(chat.id, msg.id);
        if (window.App) window.App.renderAll();
        renderActiveChat(true);
        toast("Message deleted");
      }
    });

    // Banner Cancel
    els.bannerClose.addEventListener("click", () => {
      if (editingMsgId) els.msgInput.value = "";
      resetComposerModes();
      autoResizeInput();
      updateActionButton();
    });

    // Bot START Button
    els.botStartBtn.addEventListener("click", () => {
      const chat = getActiveChat();
      if (!chat) return;
      Store.markBotStarted(chat.id);
      sendCurrentMessage({ customText: "/start" });
    });

    // Bot Menu Button (/)
    els.botMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const chat = getActiveChat();
      if (!chat) return;
      const willOpen = els.botCmdPopup.classList.contains("hidden");
      closeAllPopups();
      if (willOpen) {
        renderBotCommandsList(chat, "");
        els.botCmdPopup.classList.remove("hidden");
      }
    });

    els.botCmdList.addEventListener("click", (e) => {
      const item = e.target.closest(".bot-cmd-item");
      if (!item) return;
      els.botCmdPopup.classList.add("hidden");
      sendCurrentMessage({ customText: item.dataset.cmdPick });
    });

    // Composer Input Typing & Enter Key
    els.msgInput.addEventListener("input", () => {
      autoResizeInput();
      updateActionButton();

      const chat = getActiveChat();
      const val = els.msgInput.value;
      if (chat && chat.isBot && val.startsWith("/")) {
        renderBotCommandsList(chat, val);
        if (els.botCmdList.children.length > 0) {
          els.botCmdPopup.classList.remove("hidden");
        }
      } else {
        els.botCmdPopup.classList.add("hidden");
      }
    });

    els.msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendCurrentMessage();
      }
    });

    // Emoji Popup
    els.emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = els.emojiPopup.classList.contains("hidden");
      closeAllPopups();
      if (willOpen) els.emojiPopup.classList.remove("hidden");
    });

    els.emojiGrid.addEventListener("click", (e) => {
      const cell = e.target.closest(".emoji-cell");
      if (!cell) return;
      els.msgInput.value += cell.dataset.emoji;
      updateActionButton();
      els.msgInput.focus();
    });

    // Attachment Menu & File Picker
    els.attachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = els.attachMenu.classList.contains("hidden");
      closeAllPopups();
      if (willOpen) els.attachMenu.classList.remove("hidden");
    });

    els.attachMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".attach-item");
      if (!item) return;
      const chat = getActiveChat();
      if (!chat) return;
      const type = item.dataset.attach;
      closeAllPopups();

      if (type === "photo" || type === "file") {
        fileAttachMode = type;
        els.fileInput.accept = type === "photo" ? "image/*" : "*/*";
        els.fileInput.click();
      } else if (type === "poll") {
        const question = prompt("Poll Question:", "How do you like TeleClone?");
        if (!question) return;
        const optRaw = prompt("Options (separated by commas):", "Awesome 🔥, Looks great 👍, Need more features");
        const opts = (optRaw || "Yes,No")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
          .map((text) => ({ text, votes: 0 }));
        Store.addMessage(chat.id, {
          sender: "me",
          text: "",
          poll: { question, options: opts, myVote: null }
        });
        if (window.App) window.App.renderAll();
        renderActiveChat();
      } else if (type === "location") {
        Store.addMessage(chat.id, {
          sender: "me",
          text: "",
          attachment: { type: "location", coords: "31.1497° N, 72.6832° E", label: "Location" }
        });
        if (window.App) window.App.renderAll();
        renderActiveChat();
        toast("Location shared 📍");
      }
    });

    els.fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      const chat = getActiveChat();
      if (!file || !chat) return;

      const sizeKB = file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
        : Math.max(1, Math.round(file.size / 1024)) + " KB";

      if (fileAttachMode === "photo" && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          Store.addMessage(chat.id, {
            sender: "me",
            text: els.msgInput.value.trim(),
            attachment: { type: "photo", name: file.name, size: sizeKB, src: reader.result, label: "Photo" }
          });
          els.msgInput.value = "";
          if (window.App) window.App.renderAll();
          renderActiveChat();
        };
        reader.readAsDataURL(file);
      } else {
        Store.addMessage(chat.id, {
          sender: "me",
          text: els.msgInput.value.trim(),
          attachment: { type: "file", name: file.name, size: sizeKB, label: file.name }
        });
        els.msgInput.value = "";
        if (window.App) window.App.renderAll();
        renderActiveChat();
      }
      e.target.value = "";
    });

    // Main Action Button (Send OR Record Voice) + Right-Click Send Options
    els.actionBtn.addEventListener("click", () => {
      if (isRecording) {
        stopVoiceRecording(true);
      } else if (els.msgInput.value.trim().length > 0 || editingMsgId) {
        sendCurrentMessage();
      } else {
        startVoiceRecording();
      }
    });

    els.actionBtn.addEventListener("contextmenu", (e) => {
      if (els.msgInput.value.trim().length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      closeAllPopups();
      els.sendOptionsMenu.classList.remove("hidden");
    });

    els.sendOptionsMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".attach-item");
      if (!item) return;
      const mode = item.dataset.sendMode;
      closeAllPopups();
      if (mode === "silent") sendCurrentMessage({ silent: true });
      if (mode === "schedule") sendCurrentMessage({ scheduleMs: 10000 });
    });

    els.recCancelBtn.addEventListener("click", () => stopVoiceRecording(false));

    // Bot Reply Keyboard Toggle & Button Clicks
    els.replyKbToggleBtn.addEventListener("click", () => {
      replyKbVisible = !replyKbVisible;
      const chat = getActiveChat();
      if (chat) renderReplyKeyboard(chat);
    });

    els.botReplyKeyboard.addEventListener("click", (e) => {
      const btn = e.target.closest(".reply-kb-btn");
      if (!btn) return;
      sendCurrentMessage({ customText: btn.dataset.replyKb });
    });

    // Mini App Close
    els.miniAppClose.addEventListener("click", () => {
      els.miniAppModal.classList.add("hidden");
    });

    els.miniAppModal.addEventListener("click", (e) => {
      if (e.target === els.miniAppModal) {
        els.miniAppModal.classList.add("hidden");
      }
    });

    // Global click closes popups
    document.addEventListener("click", (e) => {
      if (
        !els.moreMenu.contains(e.target) &&
        !els.botCmdPopup.contains(e.target) &&
        !els.emojiPopup.contains(e.target) &&
        !els.attachMenu.contains(e.target) &&
        !els.sendOptionsMenu.contains(e.target) &&
        !els.msgContextMenu.contains(e.target)
      ) {
        closeAllPopups();
      }
    });
  }

  // ==================== HOOK INTO MODULE 1 ====================
  window.onChatOpened = function () {
    resetComposerModes();
    closeAllPopups();
    if (isRecording) stopVoiceRecording(false);
    inChatSearchQuery = "";
    els.searchInput.value = "";
    els.searchBar.classList.add("hidden");
    replyKbVisible = true;
    renderActiveChat();
  };

  window.ChatUI = {
    renderActiveChat,
    setTempStatus
  };

  initEmojiGrid();
  bindEvents();
  if (Store.getState().activeChatId) {
    renderActiveChat();
  }
})();