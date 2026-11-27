/* =========================================================
   TELECLONE MAIN UI CONTROLLER (MODULE 1)
   ========================================================= */

(function () {
  const $ = (id) => document.getElementById(id);

  // DOM References
  const els = {
    app: $("app"),
    // Drawer
    menuBtn: $("menu-btn"),
    drawer: $("nav-drawer"),
    drawerOverlay: $("drawer-overlay"),
    drawerAvatar: $("drawer-avatar"),
    drawerUserName: $("drawer-user-name"),
    drawerUserPhone: $("drawer-user-phone"),
    themeToggleBtn: $("theme-toggle-btn"),
    themeIcon: $("theme-icon"),
    accountTrigger: $("account-switcher-trigger"),
    accountList: $("account-list"),
    // Search
    searchInput: $("global-search"),
    searchClearBtn: $("search-clear-btn"),
    searchTabs: $("search-tabs"),
    // Main Screen Sections
    storiesBar: $("stories-bar"),
    foldersBar: $("folders-bar"),
    archiveHeader: $("archive-view-header"),
    exitArchiveBtn: $("exit-archive-btn"),
    archivedBanner: $("archived-banner"),
    archivedPreview: $("archived-preview"),
    archivedCountBadge: $("archived-count-badge"),
    chatList: $("chat-list"),
    // FAB & Context Menu
    fabBtn: $("fab-btn"),
    fabMenu: $("fab-menu"),
    contextMenu: $("chat-context-menu"),
    ctxPinLabel: $("ctx-pin-label"),
    ctxMuteLabel: $("ctx-mute-label"),
    ctxReadLabel: $("ctx-read-label"),
    ctxArchiveLabel: $("ctx-archive-label"),
    // Right Workspace Preview
    emptyState: $("chat-empty-state"),
    activeChatShell: $("active-chat-shell"),
    mobileBackBtn: $("mobile-back-btn"),
    previewAvatar: $("preview-chat-avatar"),
    previewTitle: $("preview-chat-title"),
    previewStatus: $("preview-chat-status"),
    previewDesc: $("preview-chat-desc"),
    // Toast
    toastContainer: $("toast-container")
  };

  let contextTargetChatId = null;
  let longPressTimer = null;

  // ==================== UTILITIES ====================
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.2s ease";
      setTimeout(() => toast.remove(), 220);
    }, 2400);
  }

  // ==================== THEME ENGINE ====================
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      // Sun icon (switch to Light)
      els.themeIcon.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      `;
    } else {
      // Moon icon (switch to Dark)
      els.themeIcon.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
    }
  }

  // ==================== DRAWER & ACCOUNTS ====================
  function openDrawer() {
    els.drawerOverlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      els.drawerOverlay.classList.add("show");
      els.drawer.classList.add("open");
    });
  }

  function closeDrawer() {
    els.drawer.classList.remove("open");
    els.drawerOverlay.classList.remove("show");
    setTimeout(() => {
      if (!els.drawer.classList.contains("open")) {
        els.drawerOverlay.classList.add("hidden");
      }
    }, 250);
  }

  function renderDrawerProfile() {
    const state = Store.getState();
    const activeAcc = Store.getActiveAccount();

    els.drawerAvatar.textContent = activeAcc.initials;
    els.drawerUserName.textContent = activeAcc.name;
    els.drawerUserPhone.textContent = activeAcc.phone;

    els.accountList.innerHTML = state.accounts
      .map(
        (acc) => `
      <button class="account-item" data-account-id="${escapeHtml(acc.id)}">
        <div class="avatar avatar-sm" style="background:${acc.color}">${escapeHtml(acc.initials)}</div>
        <div class="account-item-meta">
          <div class="account-item-name">${escapeHtml(acc.name)}</div>
          <div class="account-item-sub">${escapeHtml(acc.username)}</div>
        </div>
        ${acc.id === activeAcc.id ? '<span class="account-active-check">✓</span>' : ""}
      </button>
    `
      )
      .join("");
  }

  // ==================== STORIES BAR ====================
  function renderStories() {
    const state = Store.getState();
    const hideStories = state.viewingArchive || state.searchQuery.trim().length > 0;
    els.storiesBar.classList.toggle("hidden", hideStories);
    if (hideStories) return;

    els.storiesBar.innerHTML = state.stories
      .map((st) => {
        const ringClass = st.isMine ? "my-story" : st.seen ? "seen" : "";
        return `
        <div class="story-item" data-story-id="${escapeHtml(st.id)}">
          <div class="story-ring ${ringClass}">
            <div class="story-avatar" style="background:${st.color}">
              ${escapeHtml(st.initials)}
            </div>
            ${st.isMine ? '<span class="story-add-badge">+</span>' : ""}
          </div>
          <span class="story-name">${escapeHtml(st.name)}</span>
        </div>
      `;
      })
      .join("");
  }

  // ==================== FOLDERS BAR ====================
  function matchesFolder(chat, folderId) {
    if (chat.archived) return false;
    switch (folderId) {
      case "personal":
        return chat.type === "personal" || chat.type === "saved";
      case "bots":
        return chat.isBot || chat.type === "bot";
      case "groups":
        return chat.type === "group";
      case "channels":
        return chat.type === "channel";
      case "unread":
        return chat.unreadCount > 0;
      default:
        return true;
    }
  }

  function renderFolders() {
    const state = Store.getState();
    const hideFolders = state.viewingArchive || state.searchQuery.trim().length > 0;
    els.foldersBar.classList.toggle("hidden", hideFolders);
    if (hideFolders) return;

    els.foldersBar.innerHTML = state.folders
      .map((folder) => {
        const unreadInFolder = state.chats.filter(
          (c) => matchesFolder(c, folder.id) && c.unreadCount > 0
        ).length;
        const isActive = state.activeFolder === folder.id;
        return `
        <button class="folder-tab ${isActive ? "active" : ""}" data-folder-id="${escapeHtml(folder.id)}">
          <span>${escapeHtml(folder.label)}</span>
          ${unreadInFolder > 0 ? `<span class="folder-badge">${unreadInFolder}</span>` : ""}
        </button>
      `;
      })
      .join("");
  }

  // ==================== ARCHIVE & CHAT LIST ====================
  function renderArchivedBanner() {
    const state = Store.getState();
    const archivedChats = state.chats.filter((c) => c.archived);

    els.archiveHeader.classList.toggle("hidden", !state.viewingArchive);

    const showBanner =
      !state.viewingArchive &&
      state.activeFolder === "all" &&
      state.searchQuery.trim().length === 0 &&
      archivedChats.length > 0;

    els.archivedBanner.classList.toggle("hidden", !showBanner);

    if (showBanner) {
      els.archivedCountBadge.textContent = archivedChats.length;
      els.archivedPreview.textContent = archivedChats.map((c) => c.name).join(", ");
    }
  }

  function getFilteredChats() {
    const state = Store.getState();
    const query = state.searchQuery.trim().toLowerCase();

    let list = state.chats.filter((chat) => {
      if (query) {
        const inText =
          chat.name.toLowerCase().includes(query) ||
          (chat.username || "").toLowerCase().includes(query) ||
          (chat.lastMessage || "").toLowerCase().includes(query);

        if (!inText) return false;
        if (state.searchFilter === "bot") return chat.isBot || chat.type === "bot";
        if (state.searchFilter === "channel") return chat.type === "channel";
        if (state.searchFilter === "group") return chat.type === "group";
        return true;
      }

      if (state.viewingArchive) {
        return chat.archived;
      }

      return matchesFolder(chat, state.activeFolder);
    });

    // Sort: Pinned chats on top, then newest timestamp
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
    });

    return list;
  }

  function renderChatList() {
    const state = Store.getState();
    const chats = getFilteredChats();

    if (chats.length === 0) {
      els.chatList.innerHTML = `
        <div class="chat-list-empty">
          ${state.searchQuery ? "No matching chats or @bots found." : "No chats in this folder."}
        </div>
      `;
      return;
    }

    els.chatList.innerHTML = chats
      .map((chat) => {
        const isActive = state.activeChatId === chat.id;
        const senderPrefix = chat.lastSender
          ? `<span class="msg-sender">${escapeHtml(chat.lastSender)}: </span>`
          : "";

        return `
        <div class="chat-item ${isActive ? "active" : ""}" data-chat-id="${escapeHtml(chat.id)}">
          <div class="chat-avatar-wrap">
            <div class="avatar avatar-md" style="background:${chat.avatarColor}">
              ${escapeHtml(chat.initials)}
            </div>
            ${chat.online ? '<span class="online-indicator"></span>' : ""}
          </div>

          <div class="chat-content">
            <div class="chat-top-row">
              <div class="chat-name-wrap">
                <span class="chat-name">${escapeHtml(chat.name)}</span>
                ${chat.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                ${chat.verified ? '<span class="verified-badge" title="Verified">✔</span>' : ""}
                ${chat.muted ? '<span class="mute-icon" title="Muted">🔇</span>' : ""}
              </div>
              <span class="chat-time">${escapeHtml(chat.lastTime)}</span>
            </div>

            <div class="chat-bottom-row">
              <div class="chat-last-msg">${senderPrefix}${escapeHtml(chat.lastMessage)}</div>
              <div class="chat-meta-right">
                ${chat.pinned && !state.viewingArchive ? '<span class="pin-icon" title="Pinned">📌</span>' : ""}
                ${
                  chat.unreadCount > 0
                    ? `<span class="badge ${chat.muted ? "badge-muted" : ""}">${chat.unreadCount}</span>`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // ==================== RIGHT WORKSPACE PREVIEW (MODULE 2 HOOK) ====================
  function renderActiveChatPreview() {
    const state = Store.getState();
    const chat = Store.getChatById(state.activeChatId);

    if (!chat) {
      els.emptyState.classList.remove("hidden");
      els.activeChatShell.classList.add("hidden");
      els.app.classList.remove("mobile-chat-open");
      return;
    }

    els.emptyState.classList.add("hidden");
    els.activeChatShell.classList.remove("hidden");

    els.previewAvatar.textContent = chat.initials;
    els.previewAvatar.style.background = chat.avatarColor;
    els.previewTitle.innerHTML = `
      ${escapeHtml(chat.name)}
      ${chat.isBot ? '<span class="bot-badge">BOT</span>' : ""}
      ${chat.verified ? '<span class="verified-badge">✔</span>' : ""}
    `;
    els.previewStatus.textContent = chat.statusText || "last seen recently";

    if (chat.isBot) {
      const cmds = (chat.botCommands || []).map((c) => c.command).join(", ");
      els.previewDesc.textContent =
        `${chat.name} (${chat.username}) selected! Registered Bot Commands: ${cmds || "None"}. ` +
        `Interactive chat, /Menu commands, and live @BotFather features appear here.`;
    } else {
      els.previewDesc.textContent =
        `${chat.name} (${chat.username}) selected!`;
    }
  }

  function openChat(chatId) {
    Store.selectChat(chatId);
    renderAll();
    els.app.classList.add("mobile-chat-open");

    // Hook for Module 2
    if (typeof window.onChatOpened === "function") {
      window.onChatOpened(chatId);
    }
  }

  // ==================== CONTEXT MENU (RIGHT-CLICK / LONG-PRESS) ====================
  function showContextMenu(chatId, x, y) {
    const chat = Store.getChatById(chatId);
    if (!chat) return;

    contextTargetChatId = chatId;
    els.ctxPinLabel.textContent = chat.pinned ? "Unpin Chat" : "Pin Chat";
    els.ctxMuteLabel.textContent = chat.muted ? "Unmute" : "Mute";
    els.ctxReadLabel.textContent = chat.unreadCount > 0 ? "Mark as Read" : "Mark as Unread";
    els.ctxArchiveLabel.textContent = chat.archived ? "Unarchive" : "Archive";

    els.contextMenu.classList.remove("hidden");

    // Viewport clamping taake menu screen se bahar na jaye
    const menuW = els.contextMenu.offsetWidth || 195;
    const menuH = els.contextMenu.offsetHeight || 210;
    const posX = Math.min(x, window.innerWidth - menuW - 10);
    const posY = Math.min(y, window.innerHeight - menuH - 10);

    els.contextMenu.style.left = `${Math.max(10, posX)}px`;
    els.contextMenu.style.top = `${Math.max(10, posY)}px`;
  }

  function hideContextMenu() {
    els.contextMenu.classList.add("hidden");
    contextTargetChatId = null;
  }

  // ==================== QUICK ACTIONS (DRAWER & FAB) ====================
  function handleAction(action) {
    closeDrawer();
    els.fabMenu.classList.add("hidden");
    if (window.SocialUI && window.SocialUI.handleAction(action)) return;
    if (window.SettingsUI && window.SettingsUI.handleAction(action)) return;

    switch (action) {
      case "saved-messages":
        openChat("chat_saved");
        break;
      case "open-botfather":
        openChat("chat_botfather");
        showToast("Opened @BotFather");
        break;
      case "my-profile":
        showToast("Opening My Profile...");
        break;
      case "wallet":
        showToast("Wallet feature coming soon");
        break;
      case "new-group":
        showToast("Opening New Group...");
        break;
      case "new-channel":
        showToast("Opening New Channel...");
        break;
      case "new-secret":
        showToast("Secret Chat coming soon");
        break;
      case "contacts":
        showToast("Opening Contacts...");
        break;
      case "calls":
        showToast("Opening Calls...");
        break;
      case "settings":
        showToast("Opening Settings...");
        break;
      default:
        break;
    }
  }

  // ==================== EVENT LISTENERS ====================
  function bindEvents() {
    // Drawer Open / Close
    els.menuBtn.addEventListener("click", openDrawer);
    els.drawerOverlay.addEventListener("click", closeDrawer);

    // Theme Toggle
    els.themeToggleBtn.addEventListener("click", () => {
      const nextTheme = Store.getState().theme === "dark" ? "light" : "dark";
      Store.setTheme(nextTheme);
      applyTheme(nextTheme);
      showToast(nextTheme === "dark" ? "Dark Mode enabled" : "Light Mode enabled");
    });

    // Multi-Account Switcher
    els.accountTrigger.addEventListener("click", () => {
      els.accountTrigger.classList.toggle("expanded");
      els.accountList.classList.toggle("hidden");
    });

    els.accountList.addEventListener("click", (e) => {
      const item = e.target.closest(".account-item");
      if (!item) return;
      Store.switchAccount(item.dataset.accountId);
      renderDrawerProfile();
      showToast(`Switched to ${Store.getActiveAccount().name}`);
    });

    // Drawer Menu Actions
    document.querySelectorAll(".drawer-item[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
    });

    // Global Search
    els.searchInput.addEventListener("input", (e) => {
      const state = Store.getState();
      state.searchQuery = e.target.value;
      const hasQuery = state.searchQuery.trim().length > 0;
      els.searchClearBtn.classList.toggle("hidden", !hasQuery);
      els.searchTabs.classList.toggle("hidden", !hasQuery);
      renderAll();
    });

    els.searchClearBtn.addEventListener("click", () => {
      const state = Store.getState();
      state.searchQuery = "";
      state.searchFilter = "all";
      els.searchInput.value = "";
      els.searchClearBtn.classList.add("hidden");
      els.searchTabs.classList.add("hidden");
      els.searchTabs.querySelectorAll(".search-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.searchType === "all");
      });
      renderAll();
    });

    els.searchTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".search-tab");
      if (!tab) return;
      Store.getState().searchFilter = tab.dataset.searchType;
      els.searchTabs.querySelectorAll(".search-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderChatList();
    });

    // Stories Click
    els.storiesBar.addEventListener("click", (e) => {
      const item = e.target.closest(".story-item");
      if (!item) return;
      if (window.SocialUI) {
        window.SocialUI.openStory(id);
        return;
      }
      const id = item.dataset.storyId;
      const story = Store.getState().stories.find((s) => s.id === id);
      if (!story) return;

      if (story.isMine) {
        showToast("Opening Story Viewer...");
      } else {
        Store.markStorySeen(id);
        renderStories();
        showToast(`Viewed ${story.name}'s story`);
      }
    });

    // Folders Click
    els.foldersBar.addEventListener("click", (e) => {
      const tab = e.target.closest(".folder-tab");
      if (!tab) return;
      Store.setFolder(tab.dataset.folderId);
      renderAll();
    });

    // Archive Banner & Exit
    els.archivedBanner.addEventListener("click", () => {
      Store.getState().viewingArchive = true;
      renderAll();
    });

    els.exitArchiveBtn.addEventListener("click", () => {
      Store.getState().viewingArchive = false;
      renderAll();
    });

    // Chat List Click, Right-Click & Mobile Long-Press
    els.chatList.addEventListener("click", (e) => {
      const item = e.target.closest(".chat-item");
      if (!item) return;
      openChat(item.dataset.chatId);
    });

    els.chatList.addEventListener("contextmenu", (e) => {
      const item = e.target.closest(".chat-item");
      if (!item) return;
      e.preventDefault();
      showContextMenu(item.dataset.chatId, e.clientX, e.clientY);
    });

    els.chatList.addEventListener("touchstart", (e) => {
      const item = e.target.closest(".chat-item");
      if (!item) return;
      const touch = e.touches[0];
      longPressTimer = setTimeout(() => {
        showContextMenu(item.dataset.chatId, touch.clientX, touch.clientY);
      }, 500);
    }, { passive: true });

    els.chatList.addEventListener("touchend", () => clearTimeout(longPressTimer));
    els.chatList.addEventListener("touchmove", () => clearTimeout(longPressTimer));

    // Context Menu Actions
    els.contextMenu.addEventListener("click", (e) => {
      const btn = e.target.closest(".context-item");
      if (!btn || !contextTargetChatId) return;
      const action = btn.dataset.ctx;

      if (action === "pin") {
        const pinned = Store.togglePin(contextTargetChatId);
        showToast(pinned ? "Chat pinned" : "Chat unpinned");
      } else if (action === "mute") {
        const muted = Store.toggleMute(contextTargetChatId);
        showToast(muted ? "Notifications muted" : "Notifications unmuted");
      } else if (action === "read") {
        const count = Store.toggleRead(contextTargetChatId);
        showToast(count > 0 ? "Marked as unread" : "Marked as read");
      } else if (action === "archive") {
        const archived = Store.toggleArchive(contextTargetChatId);
        showToast(archived ? "Moved to Archived Chats" : "Removed from Archive");
      } else if (action === "delete") {
        Store.deleteChat(contextTargetChatId);
        showToast("Chat deleted");
      }

      hideContextMenu();
      renderAll();
    });

    // FAB Toggle & Items
    els.fabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.fabMenu.classList.toggle("hidden");
    });

    els.fabMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".fab-menu-item");
      if (!item) return;
      handleAction(item.dataset.action);
    });

    // Mobile Back Button
    els.mobileBackBtn.addEventListener("click", () => {
      els.app.classList.remove("mobile-chat-open");
      Store.getState().activeChatId = null;
      renderChatList();
    });

    // Global Click / Escape Close Menus
    document.addEventListener("click", (e) => {
      if (!els.contextMenu.contains(e.target)) hideContextMenu();
      if (!els.fabMenu.contains(e.target) && e.target !== els.fabBtn) {
        els.fabMenu.classList.add("hidden");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDrawer();
        hideContextMenu();
        els.fabMenu.classList.add("hidden");
      }
    });
  }

  // ==================== RENDER ALL & INIT ====================
  function renderAll() {
    renderDrawerProfile();
    renderStories();
    renderFolders();
    renderArchivedBanner();
    renderChatList();
    renderActiveChatPreview();
  }

  function init() {
    applyTheme(Store.getState().theme);
    bindEvents();
    renderAll();
  }

  // Export public API for Modules 2, 3, 4
  window.App = {
    renderAll,
    openChat,
    showToast,
    applyTheme,
    escapeHtml
  };

  init();
})();