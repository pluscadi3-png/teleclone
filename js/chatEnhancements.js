(() => {
  "use strict";

  const ICONS = {
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  };

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
    t._tid = setTimeout(() => t.classList.remove("show"), 2400);
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

  // ===== 1. Reply Click -> Scroll & Highlight Target Message (Text, Photo, Video, Voice, File) =====
  function jumpToRepliedMessage(replyBox) {
    const container = replyBox.closest("#messages-container, .messages-container, .messages, .chat-messages") || document;
    const replyId = (replyBox.getAttribute("data-reply-id") || "").trim();
    const replyText = (replyBox.getAttribute("data-reply-text") || "").trim();
    const currentRow = replyBox.closest(".msg-row");

    let targetRow = null;

    // 1. Exact ID match
    if (replyId) {
      const allRows = container.querySelectorAll(".msg-row[data-msg-id]");
      for (const row of allRows) {
        if (String(row.getAttribute("data-msg-id")) === replyId) {
          targetRow = row;
          break;
        }
      }
    }

    // 2. Fallback for purane replies jismein ID save nahi thi (text/media match)
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
      showToast("Original message is chat mein nahi mila");
      return;
    }

    targetRow.scrollIntoView({ behavior: "smooth", block: "center" });

    // Clean highlight flash animation trigger karein
    targetRow.classList.remove("tc-reply-flash");
    void targetRow.offsetWidth;
    targetRow.classList.add("tc-reply-flash");
    clearTimeout(targetRow._flashTid);
    targetRow._flashTid = setTimeout(() => {
      targetRow.classList.remove("tc-reply-flash");
    }, 2000);
  }

  // ===== 2. Safe Media Download (Works on Android WebView + Desktop + Offline Cache) =====
  async function downloadMediaFile(src, fallbackName) {
    if (!src) return;
    const absUrl = new URL(src, window.location.origin);
    const baseName = fallbackName || decodeURIComponent(absUrl.pathname.split("/").pop() || "media");

    // Offline cache mein bhi save kar lein taake net band hone par dikhe
    if ("caches" in window && absUrl.pathname.startsWith("/uploads/")) {
      caches
        .open("teleclone-media-v1")
        .then((c) => fetch(absUrl.href).then((r) => (r.ok ? c.put(absUrl.pathname, r) : null)))
        .catch(() => {});
    }

    // Server download endpoint (Content-Disposition: attachment) Android WebView par 100% save karta hai
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

  // ===== 3. Fullscreen Photo & Video Lightbox =====
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
      <div class="tc-mv-stage" id="tcMvStage">
        ${bodyHtml}
      </div>
    `;

    viewer.querySelector("#tcMvCloseBtn").addEventListener("click", closeMediaViewer);
    viewer.querySelector("#tcMvDownloadBtn").addEventListener("click", () => {
      downloadMediaFile(src, name);
    });
    viewer.querySelector("#tcMvStage").addEventListener("click", (e) => {
      if (e.target.id === "tcMvStage") closeMediaViewer();
    });

    // Photo par tap zoom toggle
    const imgEl = viewer.querySelector("#tcMvImg");
    if (imgEl) {
      imgEl.addEventListener("click", (e) => {
        e.stopPropagation();
        imgEl.classList.toggle("zoomed");
      });
    }

    document.body.appendChild(viewer);
  }

  // ===== 4. Real "Forward" Sheet (Forward Text, Photo, Video, Voice, File to ANY Chat/User) =====
  function closeForwardModal() {
    const el = document.getElementById("tcForwardBackdrop");
    if (el) el.remove();
  }

  function openForwardModal(msg, sourceChat) {
    closeForwardModal();
    const st = getStoreObj();
    if (!st || typeof st.getState !== "function") {
      showToast("Chats load nahi huin");
      return;
    }

    const allChats = (st.getState().chats || []).slice();
    if (!allChats.length) {
      showToast("Forward karne ke liye koi chat nahi mili");
      return;
    }

    // Saved Messages top par aur baqi chats neeche
    allChats.sort((a, b) => {
      if (a.type === "saved" && b.type !== "saved") return -1;
      if (b.type === "saved" && a.type !== "saved") return 1;
      return 0;
    });

    const selectedIds = new Set();

    const backdrop = document.createElement("div");
    backdrop.id = "tcForwardBackdrop";
    backdrop.className = "tc-fwd-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeForwardModal();
    });

    const previewLabel =
      (msg.text && msg.text.trim()) ||
      (msg.attachment ? `📎 ${msg.attachment.label || msg.attachment.name || "Media"}` : "Message");

    backdrop.innerHTML = `
      <div class="tc-fwd-sheet">
        <div class="tc-fwd-header">
          <div>
            <div class="tc-fwd-title">Forward to...</div>
            <div class="tc-fwd-preview">${escapeHtml(previewLabel.slice(0, 60))}</div>
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
      const count = selectedIds.size;
      sendBtn.disabled = count === 0;
      sendBtn.innerHTML =
        count > 0
          ? `${ICONS.send}<span>Forward (${count})</span>`
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
        listEl.innerHTML = `<div class="tc-fwd-empty">Koi chat nahi mili</div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map((c) => {
          const idStr = String(c.id);
          const isSel = selectedIds.has(idStr);
          const avatarHtml = c.avatarUrl
            ? `<img src="${escapeHtml(c.avatarUrl)}" alt="" class="tc-fwd-av-img" />`
            : `<div class="tc-fwd-av-fallback">${escapeHtml((c.name || "C").trim()[0].toUpperCase())}</div>`;
          const sub =
            c.type === "saved"
              ? "Saved Messages"
              : c.username
              ? (c.username.startsWith("@") ? c.username : `@${c.username}`)
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
      if (selectedIds.has(cid)) selectedIds.delete(cid);
      else selectedIds.add(cid);
      renderChatList(searchEl.value);
      updateSendBtn();
    });

    searchEl.addEventListener("input", () => renderChatList(searchEl.value));
    backdrop.querySelector("#tcFwdClose").addEventListener("click", closeForwardModal);

    sendBtn.addEventListener("click", () => {
      if (!selectedIds.size) return;
      const fromName =
        msg.sender === "me"
          ? "You"
          : msg.senderName || (sourceChat && sourceChat.name) || "User";

      const rawText = (msg.text || "").trim();
      const fwdText = rawText
        ? `↪️ Forwarded from ${fromName}\n${rawText}`
        : `↪️ Forwarded from ${fromName}`;

      const clonedAttachment = msg.attachment ? { ...msg.attachment } : null;

      let sentCount = 0;
      for (const targetId of selectedIds) {
        const targetChat = allChats.find((c) => String(c.id) === targetId);
        if (!targetChat) continue;
        st.addMessage(targetChat.id, {
          sender: "me",
          text: fwdText,
          attachment: clonedAttachment
        });
        sentCount++;
      }

      if (window.App && typeof window.App.renderAll === "function") {
        window.App.renderAll();
      }
      closeForwardModal();
      showToast(sentCount === 1 ? "Message forwarded" : `Forwarded to ${sentCount} chats`);
    });

    renderChatList("");
    updateSendBtn();
    document.body.appendChild(backdrop);
  }

  // ===== Global Click Listeners (Capture Phase so Context Menu Doesn't Hijack Media/Reply Clicks) =====
  document.addEventListener(
    "click",
    (e) => {
      // 1. Reply Quote Click -> Jump & Highlight
      const replyBox = e.target.closest(".msg-reply-box");
      if (replyBox) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        jumpToRepliedMessage(replyBox);
        return;
      }

      // 2. Chat Photo / Video Click -> Fullscreen Viewer + Download
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

      // 3. Document / File Download Button
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

  // Escape key se modals band karein
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMediaViewer();
      closeForwardModal();
    }
  });

  window.TCChatEnhancements = {
    openForwardModal,
    openMediaViewer,
    downloadMediaFile
  };
})();