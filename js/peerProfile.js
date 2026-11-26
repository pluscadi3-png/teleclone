(() => {
  "use strict";

  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const BLOCKED_KEY = "tc_blocked_users_v1";

  const ICONS = {
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>`,
    message: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3v4l4.8-4H20a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22zm6.5-6v-5.2c0-3.3-1.8-6-4.9-6.7V3.3a1.6 1.6 0 1 0-3.2 0v.8C7.3 4.8 5.5 7.5 5.5 10.8V16L3.7 17.8a.6.6 0 0 0 .4 1h15.8a.6.6 0 0 0 .4-1L18.5 16z"/></svg>`,
    bellOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    call: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/></svg>`,
    video: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4z"/></svg>`,
    qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>`,
    file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
  };

  let activeProfileState = null;

  // ===== Helpers =====
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    if (window.App && typeof window.App.showToast === "function") {
      window.App.showToast(msg);
      return;
    }
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

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function detectJwtKey() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === ACCOUNTS_KEY || k === JWT_KEY_CACHE || k === "tc_offline_token_sig") continue;
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        localStorage.setItem(JWT_KEY_CACHE, k);
        return k;
      }
    }
    return localStorage.getItem(JWT_KEY_CACHE) || "teleclone_jwt";
  }

  function getActiveToken() {
    return localStorage.getItem(detectJwtKey()) || "";
  }

  async function apiReq(url, opts = {}) {
    const token = getActiveToken();
    const headers = { ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)
        ? JSON.stringify(opts.body)
        : opts.body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || `Error ${res.status}`);
    return data;
  }

  function isVideoUrl(url) {
    return /\.(mp4|mov|m4v|mkv|3gp|avi|webm)(\?.*)?$/i.test(String(url || ""));
  }

  function getBlockedSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(BLOCKED_KEY) || "[]");
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function toggleBlockedUser(key) {
    if (!key) return false;
    const set = getBlockedSet();
    const k = String(key);
    let nowBlocked = false;
    if (set.has(k)) set.delete(k);
    else {
      set.add(k);
      nowBlocked = true;
    }
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(Array.from(set)));
    return nowBlocked;
  }

  // ===== Content Extractors (Links, Media, Files from Chat Messages) =====
  function stripForwardHeader(rawText) {
    if (!rawText) return "";
    if (window.TCChatEnhancements && typeof window.TCChatEnhancements.parseForwarded === "function") {
      const parsed = window.TCChatEnhancements.parseForwarded(rawText);
      if (parsed) return parsed.body || "";
    }
    return String(rawText);
  }

  function extractLinks(messages) {
    const out = [];
    const seen = new Set();
    const urlRe = /(https?:\/\/[^\s<>"']+|(?:www\.|t\.me\/)[^\s<>"']+)/gi;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const text = stripForwardHeader(m.text || "");
      if (!text) continue;
      const matches = text.match(urlRe);
      if (!matches) continue;

      for (const rawUrl of matches) {
        const cleanUrl = rawUrl.replace(/[),.!?;:]+$/, "");
        const href = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
        if (seen.has(href)) continue;
        seen.add(href);

        // Title & description lines (bilkul screenshot jaisa card)
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.replace(rawUrl, "").trim())
          .filter(Boolean);

        let hostTitle = "";
        try {
          const uObj = new URL(href);
          hostTitle = uObj.hostname.replace(/^www\./, "");
          const slug = uObj.pathname.replace(/^\/+/, "").split("/")[0];
          if (hostTitle === "t.me" && slug && !slug.startsWith("+")) {
            hostTitle = slug;
          }
        } catch (_) {
          hostTitle = cleanUrl.slice(0, 24);
        }

        const title = lines[0] && lines[0].length <= 42 ? lines[0] : (hostTitle || "Link");
        const desc = lines.length > 1
          ? lines.slice(1).join(" ").slice(0, 120)
          : (lines[0] && lines[0] !== title ? lines[0].slice(0, 120) : "");
        const thumb = m.attachment && m.attachment.type === "photo" && m.attachment.src ? m.attachment.src : "";
        const initial = (title.replace(/[^a-zA-Z0-9]/g, "")[0] || hostTitle[0] || "L").toUpperCase();

        out.push({ title, desc, url: cleanUrl, href, thumb, initial });
      }
    }
    return out;
  }

  function extractMedia(messages) {
    const list = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const att = messages[i].attachment;
      if (!att || !att.src) continue;
      const isVid = att.type === "video" || isVideoUrl(att.src) || isVideoUrl(att.name);
      if (att.type === "photo" || isVid) {
        list.push({
          type: isVid ? "video" : "photo",
          src: att.src,
          name: att.name || (isVid ? "Video" : "Photo")
        });
      }
    }
    return list;
  }

  function extractFiles(messages) {
    const list = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const att = messages[i].attachment;
      if (!att || !att.src) continue;
      const isVid = att.type === "video" || isVideoUrl(att.src) || isVideoUrl(att.name);
      if (att.type !== "photo" && !isVid && att.type !== "location") {
        list.push({
          name: att.name || (att.type === "voice" ? "Voice message" : "File"),
          size: att.size || att.duration || "",
          src: att.src,
          type: att.type || "file"
        });
      }
    }
    return list;
  }

  // ===== QR Modal for Other User =====
  function openUserQrModal(profile) {
    const old = document.getElementById("tcPeerQrBackdrop");
    if (old) old.remove();

    const handle = profile.username ? `@${profile.username}` : profile.phone || profile.name;
    let seed = 17;
    for (let i = 0; i < handle.length; i++) seed = (seed * 31 + handle.charCodeAt(i)) % 9973;

    const cells = [];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        const corner = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
        const on = corner || ((seed + r * 17 + c * 29 + r * c * 7) % 3 !== 0);
        if (on) cells.push(`<rect x="${c * 14 + 12}" y="${r * 14 + 12}" width="11" height="11" rx="2.5" fill="#7bc65b"/>`);
      }
    }

    const backdrop = document.createElement("div");
    backdrop.id = "tcPeerQrBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.innerHTML = `
      <div class="tc-st-modal-card" style="text-align:center;">
        <div class="tc-st-modal-head">
          <h3>${esc(profile.name)}</h3>
          <button type="button" class="tc-st-circle-btn" id="tcPeerQrClose">${ICONS.close}</button>
        </div>
        <div class="tc-qr-frame">
          <svg viewBox="0 0 178 178" width="178" height="178">${cells.join("")}</svg>
        </div>
        <div style="font-size:15px;color:#7bc65b;font-weight:600;margin:10px 0 14px;">${esc(handle)}</div>
        <button type="button" class="tc-st-primary-btn" id="tcPeerQrCopy">Copy Username</button>
      </div>
    `;
    backdrop.querySelector("#tcPeerQrClose").onclick = () => backdrop.remove();
    backdrop.querySelector("#tcPeerQrCopy").onclick = () => {
      navigator.clipboard?.writeText(handle).catch(() => {});
      toast("Username copied");
    };
    document.body.appendChild(backdrop);
  }

  // ===== Actions: Message / Mute / Call / Video / Add Contact =====
  async function handleOpenMessage(state) {
    const st = getStoreObj();
    if (state.chatId && window.App && typeof window.App.openChat === "function") {
      closePeerProfile();
      window.App.openChat(String(state.chatId));
      return;
    }
    if (!state.userId) {
      closePeerProfile();
      return;
    }
    try {
      const res = await apiReq("/api/chats/direct", {
        method: "POST",
        body: { targetUserId: Number(state.userId) }
      });
      const newChat = res.chat || res;
      const cid = newChat && newChat.id ? String(newChat.id) : null;
      if (cid && st && typeof st.getState === "function") {
        const list = st.getState().chats || [];
        if (!list.some((c) => String(c.id) === cid)) {
          list.unshift({
            ...newChat,
            id: cid,
            name: newChat.name || state.name,
            username: newChat.username || state.username,
            avatarUrl: newChat.avatarUrl || state.avatarUrl,
            type: newChat.type || "personal",
            messages: newChat.messages || []
          });
        }
      }
      closePeerProfile();
      if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      if (cid && window.App && typeof window.App.openChat === "function") {
        window.App.openChat(cid);
      }
    } catch (err) {
      toast(err.message || "Chat open nahi ho saki");
    }
  }

  async function handleToggleMute(state) {
    const st = getStoreObj();
    state.muted = !state.muted;

    if (state.chatId) {
      if (st && typeof st.toggleMute === "function") {
        try {
          st.toggleMute(state.chatId);
        } catch (_) {}
      } else {
        apiReq(`/api/chats/${state.chatId}/state`, {
          method: "PUT",
          body: { muted: state.muted }
        }).catch(() => {});
      }
    }
    toast(state.muted ? "Notifications muted" : "Notifications unmuted");
    renderPeerProfile();
  }

  async function handleStartCall(state, callType) {
    // Log call in backend calls history
    apiReq("/api/calls/log", {
      method: "POST",
      body: {
        targetUserId: state.userId ? Number(state.userId) : null,
        chatId: state.chatId ? Number(state.chatId) : null,
        callType: callType,
        status: "outgoing",
        duration: "0:00"
      }
    }).catch(() => {});

    // Agar app mein existing call button maujood ho to trigger karein
    const existingBtn =
      callType === "video"
        ? document.querySelector("#video-call-btn, [data-action='video-call']")
        : document.querySelector("#voice-call-btn, #call-btn, [data-action='voice-call']");

    if (existingBtn) {
      closePeerProfile();
      existingBtn.click();
      return;
    }

    toast(`${callType === "video" ? "Video" : "Voice"} calling ${state.name}...`);
  }

  async function handleAddContact(state) {
    const query = state.username ? `@${state.username}` : state.phone;
    if (!query) {
      toast("Contact add karne ke liye username ya number zaroori hai");
      return;
    }
    try {
      await apiReq("/api/contacts", {
        method: "POST",
        body: { query, customName: state.name }
      });
      toast(`${state.name} added to Contacts`);
    } catch (err) {
      toast(err.message || "Contact add nahi ho saka");
    }
  }

  // ===== Render Fullscreen OLED Other-User Profile =====
  function closePeerProfile() {
    const el = document.getElementById("tcPeerProfileOverlay");
    if (el) el.remove();
    activeProfileState = null;
  }

  function renderPeerProfile() {
    const state = activeProfileState;
    if (!state) return;

    let overlay = document.getElementById("tcPeerProfileOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tcPeerProfileOverlay";
      overlay.className = "tc-up-overlay";
      document.body.appendChild(overlay);
    }

    // Remove any legacy duplicate sheet if it tried to open
    document.querySelectorAll("#tcFwdProfileBackdrop, #tcProfileBackdrop, #user-profile-sheet").forEach((n) => n.remove());

    const avatarInner = state.avatarUrl
      ? `<img src="${esc(state.avatarUrl)}" alt="${esc(state.name)}" class="tc-up-av-img" />`
      : `<div class="tc-up-av-fb" style="background:${esc(state.color)}">${esc((state.name || "U").trim()[0].toUpperCase())}</div>`;

    const statusText = state.isGroupOrChannel
      ? (state.membersText || (state.chatType === "channel" ? "channel" : "group"))
      : (state.online ? "online" : (state.lastSeen || "last seen recently"));

    const blockKey = state.userId || state.username || state.chatId;
    const isBlocked = getBlockedSet().has(String(blockKey));

    // Available tabs
    const tabs = [];
    tabs.push({ id: "links", label: "Links", count: state.links.length });
    if (state.media.length > 0 || state.activeTab === "media") {
      tabs.push({ id: "media", label: "Media", count: state.media.length });
    }
    if (!state.isGroupOrChannel && (state.posts.length > 0 || state.activeTab === "posts")) {
      tabs.push({ id: "posts", label: "Posts", count: state.posts.length });
    }
    if (state.files.length > 0 || state.activeTab === "files") {
      tabs.push({ id: "files", label: "Files", count: state.files.length });
    }
    if (state.isGroupOrChannel && state.members.length > 0) {
      tabs.unshift({ id: "members", label: "Members", count: state.members.length });
    }

    // Ensure activeTab exists in tabs
    if (!tabs.some((t) => t.id === state.activeTab)) {
      state.activeTab = tabs[0].id;
    }

    let tabBodyHtml = "";
    if (state.activeTab === "links") {
      if (!state.links.length) {
        tabBodyHtml = `<div class="tc-up-empty">No shared links yet</div>`;
      } else {
        tabBodyHtml = `
          <div class="tc-up-list-card">
            ${state.links
              .map(
                (lk) => `
                <a class="tc-up-link-row" href="${esc(lk.href)}" target="_blank" rel="noopener noreferrer">
                  <div class="tc-up-link-thumb">
                    ${lk.thumb ? `<img src="${esc(lk.thumb)}" alt="" />` : `<span>${esc(lk.initial)}</span>`}
                  </div>
                  <div class="tc-up-link-body">
                    <div class="tc-up-link-title">${esc(lk.title)}</div>
                    ${lk.desc ? `<div class="tc-up-link-desc">${esc(lk.desc)}</div>` : ""}
                    <div class="tc-up-link-url">${esc(lk.url)}</div>
                  </div>
                </a>
              `
              )
              .join("")}
          </div>
        `;
      }
    } else if (state.activeTab === "media") {
      if (!state.media.length) {
        tabBodyHtml = `<div class="tc-up-empty">No shared media yet</div>`;
      } else {
        tabBodyHtml = `
          <div class="tc-pf-grid">
            ${state.media
              .map(
                (m, idx) => `
                <button type="button" class="tc-pf-tile" data-up-media-idx="${idx}">
                  ${
                    m.type === "video"
                      ? `<video src="${esc(m.src)}#t=0.1" preload="metadata" muted playsinline></video><span class="tc-pf-vid-badge">${ICONS.play}</span>`
                      : `<img src="${esc(m.src)}" alt="" loading="lazy" />`
                  }
                </button>
              `
              )
              .join("")}
          </div>
        `;
      }
    } else if (state.activeTab === "posts") {
      if (!state.posts.length) {
        tabBodyHtml = `<div class="tc-up-empty">No posts yet</div>`;
      } else {
        tabBodyHtml = `
          <div class="tc-pf-grid">
            ${state.posts
              .map((p, idx) => {
                if (p.mediaUrl) {
                  return isVideoUrl(p.mediaUrl)
                    ? `<button type="button" class="tc-pf-tile" data-up-post-idx="${idx}"><video src="${esc(p.mediaUrl)}#t=0.1" preload="metadata" muted playsinline></video><span class="tc-pf-vid-badge">${ICONS.play}</span></button>`
                    : `<button type="button" class="tc-pf-tile" data-up-post-idx="${idx}"><img src="${esc(p.mediaUrl)}" alt="" loading="lazy" /></button>`;
                }
                return `<button type="button" class="tc-pf-tile tc-pf-tile-txt" data-up-post-idx="${idx}" style="background:${esc(p.bg)};"><span>${esc((p.caption || "").slice(0, 60))}</span></button>`;
              })
              .join("")}
          </div>
        `;
      }
    } else if (state.activeTab === "files") {
      if (!state.files.length) {
        tabBodyHtml = `<div class="tc-up-empty">No shared files yet</div>`;
      } else {
        tabBodyHtml = `
          <div class="tc-up-list-card">
            ${state.files
              .map(
                (f, idx) => `
                <div class="tc-up-file-row" data-up-file-idx="${idx}">
                  <div class="tc-up-link-thumb">${ICONS.file}</div>
                  <div class="tc-up-link-body">
                    <div class="tc-up-link-title">${esc(f.name)}</div>
                    <div class="tc-up-link-url">${esc(f.size || "Tap to download")}</div>
                  </div>
                </div>
              `
              )
              .join("")}
          </div>
        `;
      }
    } else if (state.activeTab === "members") {
      tabBodyHtml = `
        <div class="tc-up-list-card">
          ${state.members
            .map((m) => {
              const av = m.avatarUrl
                ? `<img src="${esc(m.avatarUrl)}" alt="" />`
                : `<span>${esc((m.name || "U")[0].toUpperCase())}</span>`;
              return `
                <div class="tc-up-member-row" data-member-uid="${esc(m.id || "")}" data-member-name="${esc(m.name || "")}" data-member-user="${esc(m.username || "")}">
                  <div class="tc-up-member-av">${av}</div>
                  <div class="tc-up-link-body">
                    <div class="tc-up-link-title">${esc(m.name || "Member")}</div>
                    <div class="tc-up-link-desc">${esc(m.username ? `@${String(m.username).replace(/^@/, "")}` : (m.role || ""))}</div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    const hasInfoRows = Boolean(state.phone || state.username || state.bio);

    overlay.innerHTML = `
      <div class="tc-up-container">
        <div class="tc-up-topbar">
          <button type="button" class="tc-st-float-btn" id="tcUpBackBtn" title="Back">${ICONS.back}</button>
          <button type="button" class="tc-st-float-btn" id="tcUpMoreBtn" title="More">${ICONS.dots}</button>
          <div class="tc-st-more-menu hidden" id="tcUpMoreMenu">
            ${!state.isGroupOrChannel ? `<button type="button" data-up-more="contact">➕ Add to Contacts</button>` : ""}
            ${state.username ? `<button type="button" data-up-more="copyuser">📋 Copy @${esc(state.username)}</button>` : ""}
            <button type="button" data-up-more="mute">${state.muted ? "🔔 Unmute Notifications" : "🔕 Mute Notifications"}</button>
            ${!state.isGroupOrChannel ? `<button type="button" class="danger" data-up-more="block">${isBlocked ? "✅ Unblock User" : "🚫 Block User"}</button>` : ""}
          </div>
        </div>

        <div class="tc-up-hero">
          <div class="tc-up-avatar" id="tcUpAvatarBtn">${avatarInner}</div>
          <div class="tc-up-name">${esc(state.name)}</div>
          <div class="tc-up-status ${state.online ? "online" : ""}">${esc(statusText)}</div>
        </div>

        <div class="tc-up-actions">
          <button type="button" class="tc-up-act-card" id="tcUpActMsg">
            <span class="tc-up-act-ico">${ICONS.message}</span>
            <span>Message</span>
          </button>
          <button type="button" class="tc-up-act-card" id="tcUpActMute">
            <span class="tc-up-act-ico">${state.muted ? ICONS.bellOff : ICONS.bell}</span>
            <span>${state.muted ? "Unmute" : "Mute"}</span>
          </button>
          <button type="button" class="tc-up-act-card" id="tcUpActCall">
            <span class="tc-up-act-ico">${ICONS.call}</span>
            <span>Call</span>
          </button>
          <button type="button" class="tc-up-act-card" id="tcUpActVideo">
            <span class="tc-up-act-ico">${ICONS.video}</span>
            <span>Video</span>
          </button>
        </div>

        ${
          hasInfoRows
            ? `
              <div class="tc-up-info-card">
                ${
                  state.phone
                    ? `
                      <div class="tc-up-info-row" data-up-copy="${esc(state.phone)}" data-up-lbl="Mobile number">
                        <div class="tc-up-info-left">
                          <div class="tc-up-info-val">${esc(state.phone)}</div>
                          <div class="tc-up-info-lbl">Mobile</div>
                        </div>
                      </div>
                    `
                    : ""
                }
                ${
                  state.username
                    ? `
                      <div class="tc-up-info-row tc-up-info-row-flex">
                        <div class="tc-up-info-left" data-up-copy="@${esc(state.username)}" data-up-lbl="Username">
                          <div class="tc-up-info-val">@${esc(state.username)}</div>
                          <div class="tc-up-info-lbl">Username</div>
                        </div>
                        <button type="button" class="tc-up-qr-btn" id="tcUpQrInline" title="Show QR Code">${ICONS.qr}</button>
                      </div>
                    `
                    : ""
                }
                ${
                  state.bio
                    ? `
                      <div class="tc-up-info-row" data-up-copy="${esc(state.bio)}" data-up-lbl="Bio">
                        <div class="tc-up-info-left">
                          <div class="tc-up-info-val tc-up-bio-val">${esc(state.bio)}</div>
                          <div class="tc-up-info-lbl">${state.isGroupOrChannel ? "Description" : "Bio"}</div>
                        </div>
                      </div>
                    `
                    : ""
                }
              </div>
            `
            : ""
        }

        <div class="tc-up-tabs-wrap">
          <div class="tc-up-tabs">
            ${tabs
              .map(
                (t) => `
                <button type="button" class="tc-up-tab ${state.activeTab === t.id ? "active" : ""}" data-up-tab="${t.id}">
                  ${esc(t.label)}
                </button>
              `
              )
              .join("")}
          </div>
        </div>

        <div class="tc-up-tab-body">
          ${tabBodyHtml}
        </div>
      </div>
    `;

    // Bindings
    overlay.querySelector("#tcUpBackBtn").onclick = closePeerProfile;

    const moreMenu = overlay.querySelector("#tcUpMoreMenu");
    overlay.querySelector("#tcUpMoreBtn").onclick = (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle("hidden");
    };
    moreMenu.onclick = (e) => {
      const b = e.target.closest("[data-up-more]");
      if (!b) return;
      moreMenu.classList.add("hidden");
      const act = b.dataset.upMore;
      if (act === "contact") handleAddContact(state);
      else if (act === "copyuser") {
        navigator.clipboard?.writeText(`@${state.username}`).catch(() => {});
        toast(`@${state.username} copied`);
      } else if (act === "mute") handleToggleMute(state);
      else if (act === "block") {
        const blockedNow = toggleBlockedUser(blockKey);
        toast(blockedNow ? `${state.name} blocked` : `${state.name} unblocked`);
        renderPeerProfile();
      }
    };
    overlay.onclick = () => moreMenu.classList.add("hidden");

    overlay.querySelector("#tcUpAvatarBtn").onclick = () => {
      if (state.avatarUrl && window.TCChatEnhancements) {
        window.TCChatEnhancements.openMediaViewer("photo", state.avatarUrl, state.name);
      }
    };

    overlay.querySelector("#tcUpActMsg").onclick = () => handleOpenMessage(state);
    overlay.querySelector("#tcUpActMute").onclick = () => handleToggleMute(state);
    overlay.querySelector("#tcUpActCall").onclick = () => handleStartCall(state, "voice");
    overlay.querySelector("#tcUpActVideo").onclick = () => handleStartCall(state, "video");

    const qrBtn = overlay.querySelector("#tcUpQrInline");
    if (qrBtn) {
      qrBtn.onclick = (e) => {
        e.stopPropagation();
        openUserQrModal(state);
      };
    }

    overlay.querySelectorAll("[data-up-copy]").forEach((el) => {
      el.onclick = () => {
        navigator.clipboard?.writeText(el.dataset.upCopy).catch(() => {});
        toast(`${el.dataset.upLbl} copied`);
      };
    });

    overlay.querySelectorAll("[data-up-tab]").forEach((btn) => {
      btn.onclick = () => {
        state.activeTab = btn.dataset.upTab;
        renderPeerProfile();
      };
    });

    overlay.querySelectorAll("[data-up-media-idx]").forEach((tile) => {
      tile.onclick = () => {
        const m = state.media[Number(tile.dataset.upMediaIdx)];
        if (m && window.TCChatEnhancements) {
          window.TCChatEnhancements.openMediaViewer(m.type, m.src, m.name);
        }
      };
    });

    overlay.querySelectorAll("[data-up-post-idx]").forEach((tile) => {
      tile.onclick = () => {
        const p = state.posts[Number(tile.dataset.upPostIdx)];
        if (!p) return;
        if (p.mediaUrl && window.TCChatEnhancements) {
          window.TCChatEnhancements.openMediaViewer(
            isVideoUrl(p.mediaUrl) ? "video" : "photo",
            p.mediaUrl,
            p.caption || state.name
          );
        } else {
          toast(p.caption || "Post");
        }
      };
    });

    overlay.querySelectorAll("[data-up-file-idx]").forEach((row) => {
      row.onclick = () => {
        const f = state.files[Number(row.dataset.upFileIdx)];
        if (f && window.TCChatEnhancements) {
          window.TCChatEnhancements.downloadMediaFile(f.src, f.name);
        }
      };
    });

    overlay.querySelectorAll("[data-member-uid]").forEach((row) => {
      row.onclick = () => {
        openPeerProfileByMeta({
          userId: row.dataset.memberUid,
          name: row.dataset.memberName,
          username: row.dataset.memberUser
        });
      };
    });
  }

  // ===== Data Loaders =====
  async function enrichProfileFromServer(state) {
    // 1. /api/chats/{chatId}/info
    if (state.chatId) {
      try {
        const info = await apiReq(`/api/chats/${state.chatId}/info`);
        const u = info.user || info.peer || info.chat || info;
        if (u.name) state.name = u.name;
        if (u.username !== undefined) state.username = String(u.username || "").replace(/^@/, "");
        if (u.phone !== undefined) state.phone = u.phone || "";
        if (u.bio !== undefined || u.about !== undefined || u.description !== undefined) {
          state.bio = u.bio || u.about || u.description || "";
        }
        if (u.avatarUrl || u.avatar_url || u.avatar) {
          state.avatarUrl = u.avatarUrl || u.avatar_url || u.avatar;
        }
        if (u.online !== undefined) state.online = Boolean(u.online);
        if (u.lastSeen || u.statusText || u.status) {
          state.lastSeen = u.lastSeen || u.statusText || u.status;
        }
        if (!state.userId) {
          state.userId = u.userId || u.user_id || u.peerUserId || u.otherUserId || null;
        }
        if (Array.isArray(info.members)) {
          state.members = info.members;
          state.membersText = `${info.members.length} members`;
        }
        renderPeerProfile();
      } catch (_) {}

      // 2. Agar chat messages kam hon to server se recent messages fetch kar ke links/media nikal lein
      try {
        const mRes = await apiReq(`/api/chats/${state.chatId}/messages?limit=120`);
        if (mRes && Array.isArray(mRes.messages) && mRes.messages.length >= state.messages.length) {
          state.messages = mRes.messages;
          state.links = extractLinks(state.messages);
          state.media = extractMedia(state.messages);
          state.files = extractFiles(state.messages);
          renderPeerProfile();
        }
      } catch (_) {}
    }

    // 3. Global search se missing userId/avatar/bio/phone resolve karein (respects phonePrivacy!)
    if (!state.isGroupOrChannel && (!state.userId || !state.avatarUrl)) {
      const q = state.username || state.name;
      if (q) {
        try {
          const data = await apiReq(`/api/search?q=${encodeURIComponent(q)}`);
          const list = [
            ...(Array.isArray(data.users) ? data.users : []),
            ...(Array.isArray(data.results) ? data.results : []),
            ...(Array.isArray(data) ? data : [])
          ];
          const hit =
            list.find((x) => state.userId && String(x.id || x.userId) === String(state.userId)) ||
            list.find((x) => state.username && String(x.username || "").replace(/^@/, "").toLowerCase() === state.username.toLowerCase()) ||
            list.find((x) => String(x.name || "").trim().toLowerCase() === state.name.trim().toLowerCase()) ||
            list[0];
          if (hit) {
            state.userId = state.userId || hit.id || hit.userId || hit.user_id || null;
            if (!state.name && hit.name) state.name = hit.name;
            if (!state.username && hit.username) state.username = String(hit.username).replace(/^@/, "");
            if (state.phone === "" && hit.phone) state.phone = hit.phone;
            if (!state.bio && (hit.bio || hit.about)) state.bio = hit.bio || hit.about;
            if (!state.avatarUrl && (hit.avatarUrl || hit.avatar_url)) {
              state.avatarUrl = hit.avatarUrl || hit.avatar_url;
            }
            if (hit.online !== undefined) state.online = Boolean(hit.online);
            renderPeerProfile();
          }
        } catch (_) {}
      }
    }

    // 4. Other user's public profile posts load karein
    if (!state.isGroupOrChannel && state.userId) {
      try {
        const pRes = await apiReq(`/api/users/${state.userId}/posts`);
        if (pRes && Array.isArray(pRes.posts)) {
          state.posts = pRes.posts;
          renderPeerProfile();
        }
      } catch (_) {}
    }
  }

  function openPeerProfileFromChat(chat) {
    if (!chat) return;
    if (chat.type === "saved") {
      // Saved Messages par click -> apna Profile tab open karein
      const profTab = document.querySelector('.bottom-nav-item[data-btab="profile"]');
      if (profTab) profTab.click();
      return;
    }

    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    const links = extractLinks(msgs);
    const media = extractMedia(msgs);
    const files = extractFiles(msgs);
    const isGroup = chat.type === "group" || chat.type === "channel";

    activeProfileState = {
      chatId: String(chat.id),
      chatType: chat.type || "personal",
      isGroupOrChannel: isGroup,
      userId: chat.peerUserId || chat.otherUserId || chat.targetUserId || null,
      name: chat.name || "User",
      username: String(chat.username || "").replace(/^@/, ""),
      phone: chat.phone || "",
      bio: chat.bio || chat.description || "",
      avatarUrl: chat.avatarUrl || "",
      color: chat.color || "linear-gradient(135deg,#334155,#1e293b)",
      online: Boolean(chat.online),
      lastSeen: chat.statusText || chat.lastSeen || "last seen recently",
      muted: Boolean(chat.muted),
      messages: msgs,
      links,
      media,
      files,
      posts: [],
      members: Array.isArray(chat.members) ? chat.members : [],
      membersText: chat.membersCount ? `${chat.membersCount} members` : "",
      activeTab: isGroup ? "members" : "links"
    };

    renderPeerProfile();
    enrichProfileFromServer(activeProfileState);
  }

  function openPeerProfileByMeta({ name, username, userId }) {
    const cleanUname = String(username || "").replace(/^@/, "").trim();
    const cleanName = String(name || "").trim();
    const st = getStoreObj();
    const chats = (st && typeof st.getState === "function" && st.getState().chats) || [];

    const existing = chats.find((c) => {
      if (c.type !== "personal") return false;
      if (userId && String(c.peerUserId || c.otherUserId || "") === String(userId)) return true;
      if (cleanUname && c.username && String(c.username).replace(/^@/, "").toLowerCase() === cleanUname.toLowerCase()) return true;
      if (cleanName && c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase()) return true;
      return false;
    });

    if (existing) {
      openPeerProfileFromChat(existing);
      return;
    }

    activeProfileState = {
      chatId: null,
      chatType: "personal",
      isGroupOrChannel: false,
      userId: userId || null,
      name: cleanName || cleanUname || "User",
      username: cleanUname,
      phone: "",
      bio: "",
      avatarUrl: "",
      color: "linear-gradient(135deg,#334155,#1e293b)",
      online: false,
      lastSeen: "last seen recently",
      muted: false,
      messages: [],
      links: [],
      media: [],
      files: [],
      posts: [],
      members: [],
      activeTab: "links"
    };

    renderPeerProfile();
    enrichProfileFromServer(activeProfileState);
  }

  // ===== Capture-Phase Triggers (Chat Header + Forwarded Sender Name) =====
  document.addEventListener(
    "click",
    (e) => {
      // 1. Forwarded from Name click -> Fullscreen OLED Peer Profile
      const fwd = e.target.closest(".msg-forward-header");
      if (fwd && !document.body.classList.contains("tc-select-mode")) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openPeerProfileByMeta({
          name: fwd.getAttribute("data-fwd-name") || "",
          username: fwd.getAttribute("data-fwd-username") || "",
          userId: fwd.getAttribute("data-fwd-uid") || ""
        });
        return;
      }

      // 2. Active Chat Header click (avatar, name, status) -> Fullscreen OLED Peer Profile
      const header = e.target.closest("#chat-header, .chat-header");
      if (header) {
        if (
          e.target.closest(
            "button, a, input, .chat-header-actions, .icon-btn, #back-to-chats-btn, #mobile-back-btn, .back-btn"
          )
        ) {
          return;
        }
        const st = getStoreObj();
        const chat =
          st && typeof st.getActiveChat === "function"
            ? st.getActiveChat()
            : st && typeof st.getState === "function"
            ? (st.getState().chats || []).find((c) => String(c.id) === String(st.getState().activeChatId))
            : null;

        if (chat) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          openPeerProfileFromChat(chat);
        }
      }
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeProfileState) {
      closePeerProfile();
    }
  });

  window.TCPeerProfile = {
    openFromChat: openPeerProfileFromChat,
    openByMeta: openPeerProfileByMeta,
    close: closePeerProfile
  };
})();