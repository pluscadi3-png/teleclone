/* =========================================================
   TELECLONE FIXES: LIGHT/DARK THEME + PIN / UNPIN / ARCHIVE
   ========================================================= */

(function () {
  const JWT_KEY = "teleclone_live_jwt";
  const THEME_KEY = "teleclone_theme";
  const $ = (id) => document.getElementById(id);

  let viewingArchived = false;
  let longPressTimer = null;

  function esc(str) {
    return window.App ? window.App.escapeHtml(str) : String(str || "");
  }

  function toast(msg) {
    if (window.App) window.App.showToast(msg);
  }

  async function apiState(chatId, payload) {
    const token = localStorage.getItem(JWT_KEY) || "";
    const res = await fetch(`/api/chats/${chatId}/state`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "State update failed");
    }
  }

  async function apiDeleteChat(chatId) {
    const token = localStorage.getItem(JWT_KEY) || "";
    const res = await fetch(`/api/chats/${chatId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error("Delete failed");
  }

  // ==================== 1. LIGHT / DARK MODE ENGINE ====================
  function syncThemeToggles(mode) {
    const isDark = mode === "dark";
    [
      "settings-dark-toggle",
      "btab-dark-toggle",
      "night-mode-toggle",
      "theme-toggle",
      "drawer-night-toggle"
    ].forEach((id) => {
      const el = $(id);
      if (el && el.type === "checkbox") el.checked = isDark;
    });

    // Drawer ya kahin aur maujood checkbox jinka text "Night Mode" ho
    document.querySelectorAll(".drawer-item input[type='checkbox']").forEach((chk) => {
      const parentText = (chk.closest(".drawer-item")?.textContent || "").toLowerCase();
      if (parentText.includes("night") || parentText.includes("dark")) {
        chk.checked = isDark;
      }
    });
  }

  function applyRealTheme(theme) {
    const mode = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", mode);
    document.body.setAttribute("data-theme", mode);
    document.documentElement.classList.toggle("light-theme", mode === "light");
    document.documentElement.classList.toggle("dark-theme", mode === "dark");
    localStorage.setItem(THEME_KEY, mode);

    if (window.Store) {
      Store.getState().theme = mode;
    }
    syncThemeToggles(mode);
  }

  function patchThemeSystem() {
    if (window.Store) {
      Store.setTheme = function (theme) {
        applyRealTheme(theme);
      };
    }
    if (window.App) {
      window.App.applyTheme = function (theme) {
        applyRealTheme(theme);
      };
    }

    // Drawer mein "Night Mode" row ya toggle click pakrein
    document.addEventListener(
      "click",
      (e) => {
        const drawerItem = e.target.closest(".drawer-item, [data-action='toggle-theme'], [data-action='night-mode']");
        if (!drawerItem) return;
        const txt = (drawerItem.textContent || "").toLowerCase();
        const act = drawerItem.dataset?.action || "";
        if (act === "toggle-theme" || act === "night-mode" || txt.includes("night mode") || txt.includes("dark mode")) {
          if (e.target.tagName === "INPUT") return; // change event handle karega
          e.stopImmediatePropagation();
          e.preventDefault();
          const cur = document.documentElement.getAttribute("data-theme") || "dark";
          const next = cur === "dark" ? "light" : "dark";
          applyRealTheme(next);
          toast(next === "dark" ? "Night Mode On 🌙" : "Light Mode On ☀️");
        }
      },
      true
    );

    // Kisi bhi Night Mode checkbox ke change par live apply karein
    document.addEventListener("change", (e) => {
      const target = e.target;
      if (!target || target.type !== "checkbox") return;
      const id = target.id || "";
      const txt = (target.closest(".drawer-item, .settings-row")?.textContent || "").toLowerCase();
      if (
        id.includes("dark") ||
        id.includes("night") ||
        id.includes("theme") ||
        txt.includes("night mode")
      ) {
        const next = target.checked ? "dark" : "light";
        applyRealTheme(next);
        toast(next === "dark" ? "Night Mode On 🌙" : "Light Mode On ☀️");
      }
    });

    // Saved theme load karein
    const saved = localStorage.getItem(THEME_KEY) || Store?.getState()?.theme || "dark";
    applyRealTheme(saved);
  }

  // ==================== 2. PIN / UNPIN & ARCHIVE / UNARCHIVE ====================
  function sortChatsList() {
    const state = Store.getState();
    if (!Array.isArray(state.chats)) return;
    state.chats.sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
    });
  }

  async function togglePinLive(chatId) {
    const chat = Store.getChatById(chatId);
    if (!chat) return false;
    const nextPinned = !chat.pinned;
    chat.pinned = nextPinned;
    sortChatsList();
    if (window.App) window.App.renderAll();

    try {
      await apiState(chat.id, { pinned: nextPinned });
      toast(nextPinned ? "Chat pinned 📌" : "Chat unpinned");
    } catch (err) {
      chat.pinned = !nextPinned;
      sortChatsList();
      if (window.App) window.App.renderAll();
      toast(err.message);
    }
    return chat.pinned;
  }

  async function toggleMuteLive(chatId) {
    const chat = Store.getChatById(chatId);
    if (!chat) return false;
    const nextMuted = !chat.muted;
    chat.muted = nextMuted;
    if (window.App) window.App.renderAll();

    try {
      await apiState(chat.id, { muted: nextMuted });
      toast(nextMuted ? "Notifications muted 🔇" : "Notifications unmuted 🔔");
    } catch (err) {
      chat.muted = !nextMuted;
      if (window.App) window.App.renderAll();
      toast(err.message);
    }
    return chat.muted;
  }

  async function toggleArchiveLive(chatId) {
    const chat = Store.getChatById(chatId);
    if (!chat) return false;
    const nextArchived = !chat.archived;
    chat.archived = nextArchived;

    if (nextArchived && Store.getState().activeChatId === chat.id) {
      Store.getState().activeChatId = null;
    }

    // Agar aakhri archived chat bhi unarchive ho jaye to normal list par wapas aayein
    const remainingArchived = Store.getState().chats.filter((c) => c.archived).length;
    if (viewingArchived && remainingArchived === 0) {
      viewingArchived = false;
    }

    sortChatsList();
    if (window.App) window.App.renderAll();

    try {
      await apiState(chat.id, { archived: nextArchived });
      toast(nextArchived ? "Chat archived 📦" : "Chat unarchived 📤");
    } catch (err) {
      chat.archived = !nextArchived;
      if (window.App) window.App.renderAll();
      toast(err.message);
    }
    return chat.archived;
  }

  async function deleteChatLive(chatId) {
    const chat = Store.getChatById(chatId);
    if (!chat) return;
    if (!confirm(`Delete "${chat.name}" from your chats?`)) return;

    try {
      await apiDeleteChat(chat.id);
      const state = Store.getState();
      state.chats = state.chats.filter((c) => String(c.id) !== String(chat.id));
      if (state.activeChatId === chat.id) state.activeChatId = null;
      if (window.App) window.App.renderAll();
      toast("Chat deleted");
    } catch (err) {
      toast(err.message);
    }
  }

  // ==================== 3. FLOATING ACTION MENU (RIGHT-CLICK, LONG-PRESS & ⋮ HEADER) ====================
  function getCtxMenu() {
    let menu = $("live-chat-ctx-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "live-chat-ctx-menu";
      menu.className = "live-chat-ctx-menu hidden";
      document.body.appendChild(menu);
    }
    return menu;
  }

  function closeCtxMenu() {
    const menu = $("live-chat-ctx-menu");
    if (menu) menu.classList.add("hidden");
  }

  function openChatActionMenu(chatId, x, y) {
    const chat = Store.getChatById(chatId);
    if (!chat) return;

    // Purane duplicate context menus chhupa dein
    document.querySelectorAll(".context-menu, #chat-context-menu").forEach((el) => el.classList.add("hidden"));

    const menu = getCtxMenu();
    menu.innerHTML = `
      <button type="button" class="live-ctx-item" data-lctx="pin">
        <span>📌</span><span>${chat.pinned ? "Unpin Chat" : "Pin Chat"}</span>
      </button>
      <button type="button" class="live-ctx-item" data-lctx="mute">
        <span>${chat.muted ? "🔔" : "🔇"}</span><span>${chat.muted ? "Unmute" : "Mute"}</span>
      </button>
      <button type="button" class="live-ctx-item" data-lctx="archive">
        <span>${chat.archived ? "📤" : "📦"}</span><span>${chat.archived ? "Unarchive Chat" : "Archive Chat"}</span>
      </button>
      ${
        chat.type !== "saved"
          ? `<button type="button" class="live-ctx-item danger" data-lctx="delete">
               <span>🗑️</span><span>Delete Chat</span>
             </button>`
          : ""
      }
    `;

    const left = Math.max(8, Math.min(x, window.innerWidth - 210));
    const top = Math.max(8, Math.min(y, window.innerHeight - 210));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.remove("hidden");

    menu.onclick = (e) => {
      const btn = e.target.closest("[data-lctx]");
      if (!btn) return;
      e.stopPropagation();
      closeCtxMenu();
      const act = btn.dataset.lctx;
      if (act === "pin") togglePinLive(chat.id);
      else if (act === "mute") toggleMuteLive(chat.id);
      else if (act === "archive") toggleArchiveLive(chat.id);
      else if (act === "delete") deleteChatLive(chat.id);
    };
  }

  // ==================== 4. ARCHIVED CHATS BANNER & VIEW INSIDE #chat-list ====================
  function decorateChatList() {
    const chatList = $("chat-list");
    if (!chatList || !window.Store) return;

    const allChats = Store.getState().chats || [];
    const archivedChats = allChats.filter((c) => c.archived);

    if (viewingArchived) {
      chatList.innerHTML = `
        <div class="archived-view-header">
          <button type="button" id="archived-back-btn" class="icon-btn" title="Back">←</button>
          <span>Archived Chats (${archivedChats.length})</span>
        </div>
        ${
          archivedChats.length === 0
            ? `<div style="text-align:center;color:var(--text-secondary);padding:24px;font-size:13.5px;">No archived chats.</div>`
            : archivedChats
                .map(
                  (c) => `
              <div class="chat-item ${Store.getState().activeChatId === c.id ? "active" : ""}" data-chat-id="${esc(c.id)}">
                <div class="avatar avatar-md" style="background:${c.avatarColor}">${esc(c.initials)}</div>
                <div class="chat-content">
                  <div class="chat-top-row">
                    <div class="chat-name-wrap">
                      <span class="chat-name">${esc(c.name)}</span>
                      ${c.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                    </div>
                    <span class="chat-time">${esc(c.lastTime || "")}</span>
                  </div>
                  <div class="chat-bottom-row">
                    <span class="chat-last-msg">${esc(c.lastMessage || "")}</span>
                    <button type="button" class="unarchive-inline-btn" data-quick-unarchive="${esc(c.id)}">Unarchive</button>
                  </div>
                </div>
              </div>
            `
                )
                .join("")
        }
      `;

      const backBtn = $("archived-back-btn");
      if (backBtn) {
        backBtn.onclick = () => {
          viewingArchived = false;
          if (window.App) window.App.renderAll();
        };
      }
      return;
    }

    // Normal mode: ensure archived chats stay hidden from main list
    chatList.querySelectorAll(".chat-item[data-chat-id]").forEach((row) => {
      const chat = Store.getChatById(row.dataset.chatId);
      if (chat && chat.archived) row.remove();
    });

    // Agar koi archived chat maujood hai to upar "Archived Chats" bar dikhayein
    const existingBanner = $("archived-banner-row");
    if (existingBanner) existingBanner.remove();

    if (archivedChats.length > 0) {
      const banner = document.createElement("div");
      banner.id = "archived-banner-row";
      banner.className = "archived-banner-row";
      banner.innerHTML = `
        <div class="archived-banner-icon">📦</div>
        <div class="archived-banner-meta">
          <div class="archived-banner-title">Archived Chats</div>
          <div class="archived-banner-sub">${esc(archivedChats.map((c) => c.name).join(", "))}</div>
        </div>
        <span class="archived-count-pill">${archivedChats.length}</span>
      `;
      banner.onclick = () => {
        viewingArchived = true;
        if (window.App) window.App.renderAll();
      };
      chatList.prepend(banner);
    }
  }

  // ==================== 5. HOOKS & EVENT LISTENERS ====================
  function bindChatControls() {
    // Store methods ko override karein taake kisi bhi jagah se call hone par live DB sync ho
    if (window.Store) {
      Store.togglePin = (id) => togglePinLive(id);
      Store.toggleMute = (id) => toggleMuteLive(id);
      Store.toggleArchive = (id) => toggleArchiveLive(id);
      Store.deleteChat = (id) => deleteChatLive(id);
    }

    // RenderAll ke foran baad pinned sort + archived view apply karein
    if (window.App && typeof window.App.renderAll === "function") {
      const origRenderAll = window.App.renderAll;
      window.App.renderAll = function () {
        sortChatsList();
        origRenderAll.apply(this, arguments);
        decorateChatList();
      };
    }

    const chatList = $("chat-list");
    if (chatList) {
      // Desktop Right-Click on any chat item
      chatList.addEventListener(
        "contextmenu",
        (e) => {
          const item = e.target.closest(".chat-item[data-chat-id]");
          if (!item) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          openChatActionMenu(item.dataset.chatId, e.clientX, e.clientY);
        },
        true
      );

      // Mobile / APK Long-Press (550ms) on any chat item
      chatList.addEventListener("touchstart", (e) => {
        const item = e.target.closest(".chat-item[data-chat-id]");
        if (!item) return;
        const touch = e.touches[0];
        longPressTimer = setTimeout(() => {
          openChatActionMenu(item.dataset.chatId, touch.clientX, touch.clientY);
        }, 550);
      });
      chatList.addEventListener("touchend", () => clearTimeout(longPressTimer));
      chatList.addEventListener("touchmove", () => clearTimeout(longPressTimer));

      // Quick Unarchive button inside Archived Chats view
      chatList.addEventListener(
        "click",
        (e) => {
          const unBtn = e.target.closest("[data-quick-unarchive]");
          if (!unBtn) return;
          e.stopImmediatePropagation();
          e.stopPropagation();
          toggleArchiveLive(unBtn.dataset.quickUnarchive);
        },
        true
      );
    }

    // Chat Header 3-Dots (⋮) Button -> Pin / Mute / Archive / Delete menu
    const headerActions = document.querySelector(".chat-header-actions");
    if (headerActions) {
      headerActions.addEventListener(
        "click",
        (e) => {
          const moreBtn = e.target.closest("#chat-more-btn, [aria-label*='More'], button:last-child");
          if (!moreBtn) return;
          // Search ya Call buttons ko ignore karein
          if (moreBtn.id === "chat-search-btn" || moreBtn.id === "chat-call-btn") return;
          const activeId = Store.getState().activeChatId;
          if (!activeId) return;

          e.stopImmediatePropagation();
          e.stopPropagation();
          const rect = moreBtn.getBoundingClientRect();
          openChatActionMenu(activeId, rect.right - 195, rect.bottom + 6);
        },
        true
      );
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#live-chat-ctx-menu")) closeCtxMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCtxMenu();
    });
  }
  // ==================== 6. SHOW PROFILE PICS EVERYWHERE (BULLETPROOF) ====================
  let avatarMap = { byId: {}, byUsername: {} };
  let isHydratingAvatars = false;
  let avatarRafId = null;

  async function refreshAvatarMap() {
    const token = localStorage.getItem(JWT_KEY) || "";
    if (!token) return;
    try {
      const res = await fetch("/api/users/avatars", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok) {
        avatarMap = {
          byId: data.byId || {},
          byUsername: data.byUsername || {}
        };
        hydrateAllAvatars();
      }
    } catch {}
  }

  function lookupAvatar(obj) {
    if (!obj || obj.type === "saved") return "";
    if (obj.avatarUrl) return obj.avatarUrl;
    const uid = obj.peerUserId || obj.userId || obj.id;
    if (uid !== undefined && uid !== null && avatarMap.byId[String(uid)]) {
      return avatarMap.byId[String(uid)];
    }
    const uname = String(obj.username || "").trim().toLowerCase();
    if (uname && avatarMap.byUsername[uname]) {
      return avatarMap.byUsername[uname];
    }
    return "";
  }

  function applyAvatarImg(el, url) {
    if (!el) return;
    let img = el.querySelector(":scope > img.avatar-img-fill");
    if (url) {
      if (!img) {
        img = document.createElement("img");
        img.className = "avatar-img-fill";
        img.alt = "";
        img.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:2;pointer-events:none;display:block;";
        el.prepend(img);
      }
      if (img.getAttribute("src") !== url) img.setAttribute("src", url);
      el.style.position = "relative";
      el.style.overflow = "hidden";
      el.classList.add("has-avatar-img");
    } else if (img) {
      img.remove();
      el.classList.remove("has-avatar-img");
    }
  }

  function hydrateAllAvatars() {
    if (isHydratingAvatars || !window.Store) return;
    isHydratingAvatars = true;
    try {
      const state = Store.getState();
      const me = Store.getActiveAccount();
      const myUrl = lookupAvatar(me);

      // 1. Apni DP (Drawer & Settings Card)
      document.querySelectorAll(".drawer-header .avatar, #drawer-avatar, .settings-profile-card .avatar").forEach((av) => {
        if (me) applyAvatarImg(av, myUrl);
      });

      // 2. Chat List (gta, Abut, sab users ki DPs)
      document.querySelectorAll("#chat-list .chat-item[data-chat-id]").forEach((row) => {
        const chat = Store.getChatById(row.dataset.chatId);
        const av = row.querySelector(".avatar");
        if (av && chat) applyAvatarImg(av, lookupAvatar(chat));
      });

      // 3. Stories Bar
      document.querySelectorAll("#stories-bar .story-item[data-story-id]").forEach((item) => {
        const st = (state.stories || []).find((s) => String(s.id) === String(item.dataset.storyId));
        const av = item.querySelector(".avatar");
        if (av && st) {
          applyAvatarImg(av, st.isMine ? (myUrl || lookupAvatar(st)) : lookupAvatar(st));
        }
      });

      // 4. Active Chat Header (#preview-chat-avatar)
      const activeChat = state.activeChatId ? Store.getChatById(state.activeChatId) : null;
      const headerAv = $("preview-chat-avatar") || document.querySelector(".chat-header .avatar");
      if (headerAv) applyAvatarImg(headerAv, lookupAvatar(activeChat));

      // 5. Right Info Panel (User Profile & Group Members)
      const infoPanel = $("info-panel");
      if (infoPanel && !infoPanel.classList.contains("hidden") && activeChat) {
        applyAvatarImg(infoPanel.querySelector(".info-hero-avatar"), lookupAvatar(activeChat));
        const memberRows = infoPanel.querySelectorAll(".member-row");
        (activeChat.members || []).forEach((m, idx) => {
          if (memberRows[idx]) {
            applyAvatarImg(memberRows[idx].querySelector(".avatar"), lookupAvatar(m));
          }
        });
      }

      // 6. Contacts Tab & Global Search
      document.querySelectorAll("#btab-contacts-list [data-open-dm], #global-directory-block [data-start-dm]").forEach((row) => {
        const uid = row.dataset.openDm || row.dataset.startDm;
        const av = row.querySelector(".avatar");
        if (av && uid && avatarMap.byId[String(uid)]) {
          applyAvatarImg(av, avatarMap.byId[String(uid)]);
        }
      });
    } finally {
      isHydratingAvatars = false;
    }
  }

  function scheduleHydrate() {
    if (avatarRafId) return;
    avatarRafId = requestAnimationFrame(() => {
      avatarRafId = null;
      hydrateAllAvatars();
    });
  }

  function bindAvatarHooks() {
    if (window.App && typeof window.App.renderAll === "function") {
      const prev = window.App.renderAll;
      window.App.renderAll = function () {
        prev.apply(this, arguments);
        scheduleHydrate();
      };
    }

    const observer = new MutationObserver(() => {
      if (!isHydratingAvatars) scheduleHydrate();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("focus", refreshAvatarMap);
    refreshAvatarMap();
    // Har 5 second par fresh avatars sync kar lein (agar koi aur user DP badle)
    setInterval(refreshAvatarMap, 5000);
  }
  // ==================== 8. FULL-SIZE PROFILE PHOTO VIEWER + DOWNLOAD ====================
  async function downloadProfileImage(url, label) {
    const safeName = (label || "profile_photo").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const extMatch = url.split("?")[0].match(/\.(png|jpe?g|webp|gif)$/i);
    const ext = extMatch ? extMatch[0] : ".jpg";
    const filename = `${safeName}${ext}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
      toast("Photo downloaded! ⬇️");
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  function openAvatarLightbox(url, label) {
    if (!url) return;
    let overlay = $("avatar-lightbox");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "avatar-lightbox";
      overlay.className = "avatar-lightbox hidden";
      overlay.innerHTML = `
        <div class="avatar-lightbox-topbar">
          <div id="avatar-lb-title" class="avatar-lightbox-title"></div>
          <div class="avatar-lightbox-actions">
            <button type="button" id="avatar-lb-download" class="avatar-lb-btn">⬇️ Download</button>
            <button type="button" id="avatar-lb-close" class="avatar-lb-btn avatar-lb-close" title="Close">✕</button>
          </div>
        </div>
        <img id="avatar-lb-img" class="avatar-lightbox-img" src="" alt="Profile Photo" />
      `;
      document.body.appendChild(overlay);

      const closeLb = () => {
        overlay.classList.add("hidden");
        $("avatar-lb-img")?.classList.remove("zoomed");
      };

      $("avatar-lb-close").onclick = closeLb;
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeLb();
      });
      $("avatar-lb-img").addEventListener("click", (e) => {
        e.stopPropagation();
        e.currentTarget.classList.toggle("zoomed");
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeLb();
      });
    }

    const imgEl = $("avatar-lb-img");
    const titleEl = $("avatar-lb-title");
    const dlBtn = $("avatar-lb-download");

    imgEl.src = url;
    imgEl.classList.remove("zoomed");
    titleEl.textContent = label || "Profile Photo";
    dlBtn.onclick = (e) => {
      e.stopPropagation();
      downloadProfileImage(url, label);
    };

    overlay.classList.remove("hidden");
  }

  function resolveAvatarLabel(av) {
    const chatItem = av.closest(".chat-item[data-chat-id]");
    if (chatItem && window.Store) {
      const chat = Store.getChatById(chatItem.dataset.chatId);
      if (chat?.name) return chat.name;
    }

    if (av.closest(".chat-header") || av.closest("#info-panel")) {
      const activeId = window.Store?.getState()?.activeChatId;
      const memberRow = av.closest(".member-row");
      if (memberRow) {
        const mName = memberRow.querySelector(".member-name, .tab-row-name, strong")?.textContent?.trim();
        if (mName) return mName;
      }
      if (activeId) {
        const chat = Store.getChatById(activeId);
        if (chat?.name) return chat.name;
      }
    }

    const row = av.closest(".tab-row-item, .global-result-item, .settings-profile-card");
    if (row) {
      const rName = row.querySelector(".tab-row-name, .chat-name, .settings-profile-name")?.textContent?.trim();
      if (rName) return rName;
    }

    return "Profile Photo";
  }

  function setupAvatarLightbox() {
    document.addEventListener(
      "click",
      (e) => {
        const av = e.target.closest(".avatar.has-avatar-img");
        if (!av) return;
        // Stories bar par click karne se story hi khulegi
        if (av.closest("#stories-bar")) return;

        const img = av.querySelector(":scope > img.avatar-img-fill");
        const url = img?.getAttribute("src");
        if (!url) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        openAvatarLightbox(url, resolveAvatarLabel(av));
      },
      true
    );
  }
  // ==================== 9. WORKING '+' FILE UPLOAD + SELF-DESTRUCT TIMER ====================
  const TIMER_OPTIONS = [
    { sec: 0, label: "Off (Never)", short: "Off" },
    { sec: 5, label: "5 seconds", short: "5s" },
    { sec: 10, label: "10 seconds", short: "10s" },
    { sec: 30, label: "30 seconds", short: "30s" },
    { sec: 60, label: "1 minute", short: "1m" },
    { sec: 300, label: "5 minutes", short: "5m" },
    { sec: 3600, label: "1 hour", short: "1h" },
    { sec: 86400, label: "24 hours", short: "24h" }
  ];

  let stagedFile = null;
  let stagedPreviewUrl = "";
  let selectedTtlSec = 0;
  let isSendingStagedFile = false;
  let plusHooksBound = false;

  function getDedicatedFileInput() {
    let inp = $("plus-dedicated-file-input");
    if (!inp) {
      inp = document.createElement("input");
      inp.id = "plus-dedicated-file-input";
      inp.type = "file";
      inp.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
      document.body.appendChild(inp);

      inp.addEventListener("change", (e) => {
        const file = e.target.files?.[0] || null;
        inp.value = "";
        if (!file) return;
        stageSelectedFile(file);
      });
    }
    return inp;
  }

  function findSendButton() {
    return (
      $("send-btn") ||
      $("voice-btn") ||
      $("send-message-btn") ||
      document.querySelector(".composer-bar .send-btn, .chat-composer .send-btn, .composer .send-btn, #chat-composer button:last-of-type")
    );
  }

  function clearStagedFile() {
    stagedFile = null;
    selectedTtlSec = 0;
    if (stagedPreviewUrl) {
      URL.revokeObjectURL(stagedPreviewUrl);
      stagedPreviewUrl = "";
    }
    $("staged-file-bar")?.classList.add("hidden");
    $("file-timer-wrap")?.classList.add("hidden");
    $("file-timer-menu")?.classList.add("hidden");
    updateTimerButtonUI();
  }

  function updateTimerButtonUI() {
    const btn = $("file-timer-btn");
    const menu = $("file-timer-menu");
    const opt = TIMER_OPTIONS.find((o) => o.sec === selectedTtlSec) || TIMER_OPTIONS[0];
    if (btn) {
      btn.textContent = selectedTtlSec > 0 ? `⏱️ ${opt.short}` : "⏱️ Timer";
      btn.classList.toggle("active", selectedTtlSec > 0);
    }
    if (menu) {
      menu.querySelectorAll("[data-ttl-sec]").forEach((el) => {
        el.classList.toggle("selected", Number(el.dataset.ttlSec) === selectedTtlSec);
      });
    }
    const metaEl = $("staged-file-meta");
    if (metaEl && stagedFile) {
      const sizeStr =
        stagedFile.size >= 1024 * 1024
          ? `${(stagedFile.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(stagedFile.size / 1024))} KB`;
      metaEl.textContent =
        selectedTtlSec > 0
          ? `${sizeStr} • Auto-delete in ${opt.label}`
          : `${sizeStr} • Permanent (No timer)`;
    }
  }

  function stageSelectedFile(file) {
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    stagedFile = file;
    selectedTtlSec = 0;

    const bar = ensureStagedPreviewBar();
    const thumb = $("staged-file-thumb");
    const nameEl = $("staged-file-name");
    if (bar && thumb && nameEl) {
      nameEl.textContent = file.name;
      if ((file.type || "").startsWith("image/")) {
        stagedPreviewUrl = URL.createObjectURL(file);
        thumb.innerHTML = `<img src="${stagedPreviewUrl}" alt="Preview" />`;
      } else {
        stagedPreviewUrl = "";
        thumb.textContent = (file.type || "").startsWith("video/") ? "🎬" : "📄";
      }
      bar.classList.remove("hidden");
    }

    ensureTimerControl();
    $("file-timer-wrap")?.classList.remove("hidden");
    updateTimerButtonUI();
    $("msg-input")?.focus();
  }

  function ensureStagedPreviewBar() {
    let bar = $("staged-file-bar");
    if (bar) return bar;
    const msgInput = $("msg-input");
    const composer =
      msgInput?.closest(".composer-bar, .chat-composer, .composer, footer") || msgInput?.parentElement;
    if (!composer || !composer.parentNode) return null;

    bar = document.createElement("div");
    bar.id = "staged-file-bar";
    bar.className = "staged-file-bar hidden";
    bar.innerHTML = `
      <div id="staged-file-thumb" class="staged-file-thumb">📄</div>
      <div class="staged-file-info">
        <div id="staged-file-name" class="staged-file-name"></div>
        <div id="staged-file-meta" class="staged-file-meta"></div>
      </div>
      <button type="button" id="staged-file-send-now" class="tab-pill-btn">Send ➤</button>
      <button type="button" id="staged-file-cancel" class="staged-file-cancel" title="Remove file">✕</button>
    `;
    composer.parentNode.insertBefore(bar, composer);

    $("staged-file-cancel").onclick = clearStagedFile;
    $("staged-file-send-now").onclick = () => sendStagedFileNow();
    return bar;
  }

  function ensureTimerControl() {
    if ($("file-timer-wrap")) return;
    const sendBtn = findSendButton();
    if (!sendBtn || !sendBtn.parentNode) return;

    const wrap = document.createElement("div");
    wrap.id = "file-timer-wrap";
    wrap.className = "file-timer-wrap hidden";
    wrap.innerHTML = `
      <div id="file-timer-menu" class="file-timer-menu hidden">
        ${TIMER_OPTIONS.map(
          (o) =>
            `<button type="button" class="file-timer-opt ${o.sec === 0 ? "selected" : ""}" data-ttl-sec="${o.sec}">
               <span>${o.label}</span>
               <span>${o.sec === 0 ? "∞" : "⏱️"}</span>
             </button>`
        ).join("")}
      </div>
      <button type="button" id="file-timer-btn" class="file-timer-btn" title="Auto-delete timer">⏱️ Timer</button>
    `;

    sendBtn.parentNode.insertBefore(wrap, sendBtn);

    $("file-timer-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("file-timer-menu")?.classList.toggle("hidden");
    });

    $("file-timer-menu").addEventListener("click", (e) => {
      const optBtn = e.target.closest("[data-ttl-sec]");
      if (!optBtn) return;
      e.stopPropagation();
      selectedTtlSec = Number(optBtn.dataset.ttlSec) || 0;
      $("file-timer-menu").classList.add("hidden");
      updateTimerButtonUI();
    });
  }

 // ✅ YAHAN NAYA sendStagedFileNow() PASTE HOGA
  async function sendStagedFileNow() {
    if (!stagedFile || isSendingStagedFile) return;
    const activeChatId = window.Store?.getState()?.activeChatId;
    if (!activeChatId) return toast("Pehle koi chat open karein");

    const token = localStorage.getItem(JWT_KEY) || "";
    const fileToUpload = stagedFile;
    const ttl = selectedTtlSec > 0 ? selectedTtlSec : null;
    const msgInput = $("msg-input");
    const caption = (msgInput?.value || "").trim();

    isSendingStagedFile = true;
    toast(`Uploading ${fileToUpload.name}...`);
    try {
      const fileBytes = await fileToUpload.arrayBuffer();

      const upRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(fileToUpload.name || "upload.bin"),
          "X-File-Type": fileToUpload.type || "application/octet-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: fileBytes
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upData.detail || "Upload failed");

      const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          text: caption,
          attachment: upData.attachment,
          ttlSeconds: ttl
        })
      });
      const msgData = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok) throw new Error(msgData.detail || "Send failed");

      if (msgInput) {
        msgInput.value = "";
        msgInput.style.height = "auto";
      }
      clearStagedFile();
      toast(
        ttl
          ? `Sent! Disappears in ${TIMER_OPTIONS.find((o) => o.sec === ttl)?.short || ttl + "s"} ⏱️`
          : "File sent! ✓"
      );
    } catch (err) {
      toast("Upload error: " + err.message);
    } finally {
      isSendingStagedFile = false;
    }
  }


  function formatCountdown(msLeft) {
    const sec = Math.max(0, Math.ceil(msLeft / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  }

  function updateMessageCountdowns() {
    if (!window.Store) return;
    const activeId = Store.getState().activeChatId;
    if (!activeId) return;
    const chat = Store.getChatById(activeId);
    if (!chat || !Array.isArray(chat.messages)) return;

    const now = Date.now();
    chat.messages.forEach((m) => {
      if (!m.expiresAt) return;
      const el = document.querySelector(`[data-msg-id="${m.id}"]`);
      if (!el) return;
      const meta = el.querySelector(".msg-meta, .message-meta, .msg-footer") || el;
      let badge = meta.querySelector(".msg-ttl-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "msg-ttl-badge";
        meta.appendChild(badge);
      }
      const left = m.expiresAt - now;
      badge.textContent = left > 0 ? `⏱️ ${formatCountdown(left)}` : "⏱️ 0s";
    });
  }

  function ensurePlusUploadButton() {
    ensureTimerControl();

    if (!plusHooksBound) {
      plusHooksBound = true;

      // Send button par click ya Enter dabane par staged file bhej dein
      document.addEventListener(
        "click",
        (e) => {
          if (!e.target.closest(".plus-attach-wrap")) {
            $("plus-attach-menu")?.classList.add("hidden");
            $("plus-attach-btn")?.classList.remove("open");
          }
          if (!e.target.closest(".file-timer-wrap")) {
            $("file-timer-menu")?.classList.add("hidden");
          }

          if (!stagedFile) return;
          const sendBtn = findSendButton();
          if (sendBtn && (e.target === sendBtn || sendBtn.contains(e.target))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            sendStagedFileNow();
          }
        },
        true
      );

      document.addEventListener(
        "keydown",
        (e) => {
          if (!stagedFile) return;
          if (e.target?.id === "msg-input" && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendStagedFileNow();
          }
        },
        true
      );

      setInterval(updateMessageCountdowns, 1000);
    }

    if ($("plus-attach-btn")) return;
    const attachBtn = $("attach-btn");
    const msgInput = $("msg-input");
    const anchor = attachBtn || msgInput;
    if (!anchor || !anchor.parentNode) return;

    const wrap = document.createElement("div");
    wrap.className = "plus-attach-wrap";
    wrap.innerHTML = `
      <div id="plus-attach-menu" class="plus-attach-menu hidden">
        <button type="button" class="plus-menu-item" data-plus-pick="photo">
          <span>🖼️</span><span>Photo / Video</span>
        </button>
        <button type="button" class="plus-menu-item" data-plus-pick="file">
          <span>📄</span><span>File / Document</span>
        </button>
      </div>
      <button type="button" id="plus-attach-btn" class="plus-attach-btn" title="Attach">+</button>
    `;

    if (attachBtn) attachBtn.parentNode.insertBefore(wrap, attachBtn);
    else msgInput.parentNode.insertBefore(wrap, msgInput.nextSibling);

    const plusBtn = $("plus-attach-btn");
    const plusMenu = $("plus-attach-menu");

    plusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = plusMenu.classList.contains("hidden");
      plusMenu.classList.toggle("hidden", !willOpen);
      plusBtn.classList.toggle("open", willOpen);
    });

    plusMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-plus-pick]");
      if (!item) return;
      e.stopPropagation();
      const mode = item.dataset.plusPick;
      plusMenu.classList.add("hidden");
      plusBtn.classList.remove("open");

      const picker = getDedicatedFileInput();
      picker.accept = mode === "photo" ? "image/*,video/*" : "*/*";
      picker.click();
    });
  }

  async function copyUsernameText(username) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(username);
      } else {
        throw new Error("Fallback copy");
      }
    } catch {
      const ta = document.createElement("textarea");
      ta.value = username;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(`Copied ${username} 📋`);
  }

  function markCopyableUsernames() {
    const containers = document.querySelectorAll("#info-panel, .profile-info-card");
    containers.forEach((box) => {
      box.querySelectorAll("div, span, p, a").forEach((el) => {
        if (el.children.length > 0) return;
        const txt = (el.textContent || "").trim();
        if (/^@[a-zA-Z0-9_]{2,32}$/.test(txt)) {
          el.classList.add("copyable-username");
          el.dataset.copyUsername = txt;
          el.title = "Click to copy username";
        }
      });
    });
  }

  function setupUsernameClickToCopy() {
    document.addEventListener(
      "click",
      (e) => {
        const direct = e.target.closest("[data-copy-username]");
        if (direct) {
          e.preventDefault();
          e.stopPropagation();
          copyUsernameText(direct.dataset.copyUsername);
          return;
        }

        // Agar user poore username row par click kare (info panel ya profile card mein)
        const row = e.target.closest("#info-panel .info-row, #info-panel .profile-info-row, .profile-info-card .profile-info-row");
        if (row) {
          const match = (row.textContent || "").match(/@[a-zA-Z0-9_]{2,32}/);
          if (match) {
            e.preventDefault();
            e.stopPropagation();
            copyUsernameText(match[0]);
          }
        }
      },
      true
    );

    const obs = new MutationObserver(() => {
      ensurePlusUploadButton();
      markCopyableUsernames();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    ensurePlusUploadButton();
    markCopyableUsernames();
  }

  patchThemeSystem();
  bindChatControls();
  bindAvatarHooks();
  ensurePlusUploadButton();
  setupAvatarLightbox();
  setupUsernameClickToCopy();
  if (window.App) window.App.renderAll();
  hydrateAllAvatars();
})();