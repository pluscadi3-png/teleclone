/* =========================================================
   TELECLONE SOCIAL, STORIES, INFO PANEL & CALLS (MODULE 3)
   ========================================================= */

(function () {
  const $ = (id) => document.getElementById(id);

  const STORY_GRADIENTS = [
    "linear-gradient(155deg, #667eea, #764ba2)",
    "linear-gradient(155deg, #11998e, #38ef7d)",
    "linear-gradient(155deg, #fc466b, #3f5efb)",
    "linear-gradient(155deg, #f7971e, #ffd200)",
    "linear-gradient(155deg, #0f2027, #203a43, #2c5364)"
  ];

  const DEFAULT_STORY_CONTENT = {
    st_2: { text: "🤖 Create unlimited bots & API tokens right inside TeleClone with /newbot!", time: "25m ago", bg: STORY_GRADIENTS[0] },
    st_3: { text: "🔥 TeleClone UI Module 3 live chal raha hai! Next stop: Full Settings & Backend.", time: "1h ago", bg: STORY_GRADIENTS[2] },
    st_4: { text: "💻 Tip: You can now add your custom @bots directly into any Group and assign Admin rights!", time: "2h ago", bg: STORY_GRADIENTS[1] },
    st_5: { text: "📢 Tech News: WebSockets + Webhook engine coming in Phase 2!", time: "4h ago", bg: STORY_GRADIENTS[4] },
    st_6: { text: "☕ Late night coding session...", time: "6h ago", bg: STORY_GRADIENTS[3] }
  };

  const els = {
    // Chat Info Panel
    infoPanel: $("info-panel"),
    infoCloseBtn: $("info-panel-close"),
    infoHeading: $("info-panel-heading"),
    infoBody: $("info-panel-body"),
    // Story Viewer
    storyViewer: $("story-viewer"),
    storyProgressFill: $("story-progress-fill"),
    storyAvatar: $("story-viewer-avatar"),
    storyName: $("story-viewer-name"),
    storyTime: $("story-viewer-time"),
    storyCloseBtn: $("story-viewer-close"),
    storyCanvas: $("story-viewer-canvas"),
    storyText: $("story-viewer-text"),
    storyReplyInput: $("story-reply-input"),
    storyLikeBtn: $("story-like-btn"),
    storySendReplyBtn: $("story-send-reply-btn"),
    // Generic Modal
    modal: $("app-modal"),
    modalTitle: $("app-modal-title"),
    modalCloseBtn: $("app-modal-close"),
    modalBody: $("app-modal-body"),
    // Call Overlay
    callOverlay: $("call-overlay"),
    callAvatar: $("call-avatar"),
    callName: $("call-name"),
    callStatus: $("call-status"),
    callMuteBtn: $("call-mute-btn"),
    callSpeakerBtn: $("call-speaker-btn"),
    callVideoBtn: $("call-video-btn"),
    callEndBtn: $("call-end-btn")
  };

  let activeInfoTab = "members";
  let storyTimer = null;
  let currentStoryId = null;
  let callState = null;
  let callTimer = null;
  let callSeconds = 0;

  function esc(str) {
    return window.App ? window.App.escapeHtml(str) : String(str || "");
  }

  function toast(msg) {
    if (window.App) window.App.showToast(msg);
  }

  function openModal(title, html) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.modal.classList.remove("hidden");
  }

  function closeModal() {
    els.modal.classList.add("hidden");
  }

  // ==================== 1. STORIES VIEWER & CREATOR ====================
  function openAddStoryModal() {
    let selectedBg = STORY_GRADIENTS[0];
    openModal(
      "Create Your Story",
      `
      <div class="form-group">
        <label class="form-label">Story Caption / Status</label>
        <textarea id="new-story-text" class="form-textarea" rows="3" placeholder="What's on your mind?"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Background Gradient</label>
        <div id="story-bg-picker" style="display:flex;gap:10px;">
          ${STORY_GRADIENTS.map(
            (g, i) => `
            <button type="button" data-bg-idx="${i}" style="width:38px;height:38px;border-radius:50%;background:${g};border:${i === 0 ? "3px solid var(--accent-color)" : "2px solid transparent"};"></button>
          `
          ).join("")}
        </div>
      </div>
      <button id="publish-story-btn" class="primary-btn">Publish Story</button>
    `
    );

    const picker = $("story-bg-picker");
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-bg-idx]");
      if (!btn) return;
      selectedBg = STORY_GRADIENTS[Number(btn.dataset.bgIdx)];
      picker.querySelectorAll("button").forEach((b) => (b.style.border = "2px solid transparent"));
      btn.style.border = "3px solid var(--accent-color)";
    });

    $("publish-story-btn").addEventListener("click", () => {
      const text = $("new-story-text").value.trim();
      if (!text) return toast("Please write something for your story");
      const st = Store.updateMyStory(text, selectedBg);
      closeModal();
      if (window.App) window.App.renderAll();
      toast("Story published! ✨");
      if (st) viewStoryCard(st);
    });
  }

  function closeStoryViewer() {
    clearInterval(storyTimer);
    storyTimer = null;
    currentStoryId = null;
    els.storyViewer.classList.add("hidden");
    els.storyReplyInput.value = "";
  }

  function viewStoryCard(story) {
    currentStoryId = story.id;
    const fallback = DEFAULT_STORY_CONTENT[story.id] || {
      text: `✨ ${story.name}'s Story`,
      time: "Recently",
      bg: STORY_GRADIENTS[0]
    };

    const text = story.text || fallback.text;
    const bg = story.bg || fallback.bg;
    const time = story.time || fallback.time;

    els.storyAvatar.textContent = story.initials;
    els.storyAvatar.style.background = story.color;
    els.storyName.textContent = story.name;
    els.storyTime.textContent = time;
    els.storyCanvas.style.background = bg;
    els.storyText.textContent = text;
    els.storyLikeBtn.textContent = story.liked ? "❤️" : "🤍";
    els.storyProgressFill.style.width = "0%";
    els.storyViewer.classList.remove("hidden");

    if (!story.isMine) {
      Store.markStorySeen(story.id);
      if (window.App) window.App.renderAll();
    }

    clearInterval(storyTimer);
    let pct = 0;
    storyTimer = setInterval(() => {
      if (document.activeElement === els.storyReplyInput) return; // Pause while typing reply
      pct += 1.6;
      els.storyProgressFill.style.width = Math.min(pct, 100) + "%";
      if (pct >= 100) {
        closeStoryViewer();
      }
    }, 100);
  }

  function openStory(storyId) {
    const story = Store.getState().stories.find((s) => s.id === storyId);
    if (!story) return;
    if (story.isMine && !story.text) {
      openAddStoryModal();
    } else if (story.isMine) {
      viewStoryCard(story);
    } else {
      viewStoryCard(story);
    }
  }

  // ==================== 2. CHAT / GROUP / BOT INFO PANEL ====================
  function renderInfoPanel() {
    const chat = Store.getChatById(Store.getState().activeChatId);
    if (!chat) {
      els.infoPanel.classList.add("hidden");
      return;
    }

    Store.ensureSocialData();

    els.infoHeading.textContent =
      chat.type === "group"
        ? "Group Info"
        : chat.type === "channel"
        ? "Channel Info"
        : chat.isBot
        ? "Bot Info"
        : "User Info";

    // Build available tabs
    const tabs = [];
    if (chat.type === "group") tabs.push({ id: "members", label: "Members" });
    if (chat.isBot) tabs.push({ id: "commands", label: "Commands" });
    tabs.push({ id: "media", label: "Media" }, { id: "files", label: "Files" }, { id: "links", label: "Links" });

    if (!tabs.some((t) => t.id === activeInfoTab)) {
      activeInfoTab = tabs[0].id;
    }

    const secretBlock = chat.isSecret
      ? `
        <div class="secret-banner">
          <strong>🔒 End-to-End Encrypted Secret Chat</strong><br/>
          Self-Destruct Timer: <strong>${esc(chat.selfDestruct || "1 minute")}</strong><br/>
          Messages stay only on this device.
        </div>
      `
      : "";

    const tokenBlock =
      chat.isBot && chat.botToken
        ? `
          <div class="info-row">
            <div class="info-row-val" style="font-family:monospace;font-size:12.5px;color:var(--accent-color);cursor:pointer;" id="info-copy-token" title="Tap to copy">
              ${esc(chat.botToken)}
            </div>
            <div class="info-row-label">Bot API Token (Tap to copy)</div>
          </div>
        `
        : "";

    els.infoBody.innerHTML = `
      <div class="info-hero">
        <div class="avatar info-hero-avatar" style="background:${chat.avatarColor}">${esc(chat.initials)}</div>
        <div class="info-hero-name">
          <span>${esc(chat.name)}</span>
          ${chat.isBot ? '<span class="bot-badge">BOT</span>' : ""}
          ${chat.verified ? '<span class="verified-badge">✔</span>' : ""}
        </div>
        <div class="info-hero-sub">${esc(chat.statusText || "last seen recently")}</div>

        <div class="info-quick-actions">
          ${!chat.isBot && chat.type !== "saved" ? '<button class="info-action-pill" data-info-act="call"><span>📞</span><span>Call</span></button>' : ""}
          <button class="info-action-pill" data-info-act="mute"><span>${chat.muted ? "🔔" : "🔇"}</span><span>${chat.muted ? "Unmute" : "Mute"}</span></button>
          ${chat.type === "group" ? '<button class="info-action-pill" data-info-act="add-member"><span>➕</span><span>Add Bot/User</span></button>' : ""}
          ${chat.type === "personal" && !chat.isSecret ? '<button class="info-action-pill" data-info-act="secret"><span>🔒</span><span>Secret</span></button>' : ""}
        </div>
      </div>

      ${secretBlock}

      <div class="info-section">
        <div class="info-row">
          <div class="info-row-val">${esc(chat.username || "@user")}</div>
          <div class="info-row-label">Username</div>
        </div>
        ${
          chat.description
            ? `<div class="info-row">
                 <div class="info-row-val">${esc(chat.description)}</div>
                 <div class="info-row-label">About</div>
               </div>`
            : ""
        }
        ${tokenBlock}
      </div>

      <div class="info-tabs">
        ${tabs
          .map(
            (t) => `<button class="info-tab ${activeInfoTab === t.id ? "active" : ""}" data-info-tab="${t.id}">${t.label}</button>`
          )
          .join("")}
      </div>

      <div id="info-tab-content" class="info-tab-content">
        ${renderInfoTabBody(chat, activeInfoTab)}
      </div>
    `;
  }

  function renderInfoTabBody(chat, tabId) {
    const msgs = chat.messages || [];

    if (tabId === "members") {
      const members = chat.members || [];
      return `
        <button class="secondary-btn" data-info-act="add-member" style="margin-bottom:10px;">➕ Add Member or @Bot to Group</button>
        ${
          members.length === 0
            ? '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:16px;">No members loaded.</div>'
            : members
                .map(
                  (m) => `
              <div class="member-row">
                <div class="avatar avatar-sm" style="background:${m.color}">${esc(m.initials)}</div>
                <div class="member-meta">
                  <div class="member-name">
                    <span>${esc(m.name)}</span>
                    ${m.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                  </div>
                  <div class="member-role">${esc(m.username)}</div>
                </div>
                <button class="role-pill" data-toggle-admin="${esc(m.id)}" title="${m.role === "Owner" ? "Group Owner" : "Click to toggle Admin rights"}">
                  ${esc(m.role)}
                </button>
              </div>
            `
                )
                .join("")
        }
      `;
    }

    if (tabId === "commands") {
      const cmds = chat.botCommands || [];
      return cmds.length === 0
        ? '<div style="color:var(--text-secondary);font-size:13px;">No commands registered.</div>'
        : cmds
            .map(
              (c) => `
          <div class="info-row" style="border-bottom:1px solid var(--border-color);padding:8px 0;">
            <div class="info-row-val" style="color:var(--accent-color);font-weight:600;">${esc(c.command)}</div>
            <div class="info-row-label">${esc(c.description)}</div>
          </div>
        `
            )
            .join("");
    }

    if (tabId === "media") {
      const photos = msgs.filter((m) => m.attachment && m.attachment.type === "photo" && m.attachment.src);
      if (photos.length === 0) {
        return '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px;">No shared photos yet. Attach an image in chat to see it here.</div>';
      }
      return `<div class="media-grid">${photos.map((p) => `<img class="media-thumb" src="${p.attachment.src}" alt="Media" />`).join("")}</div>`;
    }

    if (tabId === "files") {
      const files = msgs.filter((m) => m.attachment && m.attachment.type === "file");
      if (files.length === 0) {
        return '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px;">No shared files yet.</div>';
      }
      return files
        .map(
          (f) => `
        <div class="list-card-row">
          <div class="msg-file-icon">📄</div>
          <div>
            <div style="font-weight:600;font-size:13.5px;">${esc(f.attachment.name)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${esc(f.attachment.size)} • ${esc(f.time)}</div>
          </div>
        </div>
      `
        )
        .join("");
    }

    if (tabId === "links") {
      const links = msgs.filter((m) => /(https?:\/\/|@\w+)/i.test(m.text || ""));
      if (links.length === 0) {
        return '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px;">No shared links or @mentions yet.</div>';
      }
      return links
        .map(
          (l) => `
        <div class="info-row" style="border-bottom:1px solid var(--border-color);padding:8px 0;">
          <div class="info-row-val" style="font-size:13px;">${esc(l.text.slice(0, 90))}</div>
          <div class="info-row-label">${esc(l.time)}</div>
        </div>
      `
        )
        .join("");
    }

    return "";
  }

  function openAddMemberToGroupModal(chatId) {
    const chat = Store.getChatById(chatId);
    if (!chat) return;
    const existingIds = new Set((chat.members || []).map((m) => m.id));
    const contacts = Store.getContacts().filter((c) => !existingIds.has(c.id));
    const bots = Store.getUserBots().filter((b) => !existingIds.has(b.id));

    const candidates = [
      ...bots.map((b) => ({ id: b.id, name: b.name, username: b.username, initials: b.initials, color: b.avatarColor, isBot: true })),
      ...contacts.map((c) => ({ id: c.id, name: c.name, username: c.username, initials: c.initials, color: c.color, isBot: false }))
    ];

    if (candidates.length === 0) {
      toast("All contacts & bots are already in this group!");
      return;
    }

    openModal(
      `Add to ${chat.name}`,
      `
      <div style="font-size:13px;color:var(--text-secondary);">Tap any Contact or custom @Bot to add them to this group (Bots get Admin rights automatically):</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${candidates
          .map(
            (c, i) => `
          <div class="list-card-row" data-pick-cand="${i}">
            <div class="avatar avatar-sm" style="background:${c.color}">${esc(c.initials)}</div>
            <div style="flex:1;">
              <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                <span>${esc(c.name)}</span>
                ${c.isBot ? '<span class="bot-badge">BOT</span>' : ""}
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(c.username)}</div>
            </div>
            <span style="color:var(--accent-color);font-weight:700;">+ Add</span>
          </div>
        `
          )
          .join("")}
      </div>
    `
    );

    els.modalBody.addEventListener("click", function onPick(e) {
      const row = e.target.closest("[data-pick-cand]");
      if (!row) return;
      const picked = candidates[Number(row.dataset.pickCand)];
      if (picked && Store.addMemberToGroup(chatId, picked)) {
        closeModal();
        if (window.App) window.App.renderAll();
        if (window.ChatUI) window.ChatUI.renderActiveChat();
        renderInfoPanel();
        toast(`${picked.name} added to group!`);
      }
      els.modalBody.removeEventListener("click", onPick);
    });
  }

  // ==================== 3. CREATOR MODALS (GROUP / CHANNEL / SECRET / CONTACTS / CALLS) ====================
  function openNewGroupModal() {
    const contacts = Store.getContacts();
    const bots = Store.getUserBots();
    const allOptions = [
      ...bots.map((b) => ({ id: b.id, name: b.name, username: b.username, initials: b.initials, color: b.avatarColor, role: "Admin", isBot: true })),
      ...contacts.map((c) => ({ id: c.id, name: c.name, username: c.username, initials: c.initials, color: c.color, role: "Member", isBot: false }))
    ];

    openModal(
      "New Group",
      `
      <div class="form-group">
        <label class="form-label">Group Name</label>
        <input id="grp-name-input" class="form-input" type="text" placeholder="e.g. Bug Bounty Team" />
      </div>
      <div class="form-group">
        <label class="form-label">Description (Optional)</label>
        <input id="grp-desc-input" class="form-input" type="text" placeholder="What is this group about?" />
      </div>
      <div class="form-group">
        <label class="form-label">Add Members & Bots</label>
        <div class="checklist-box">
          ${allOptions
            .map(
              (o, i) => `
            <label class="check-row">
              <input type="checkbox" value="${i}" ${i < 2 ? "checked" : ""} />
              <div class="avatar avatar-sm" style="background:${o.color};width:32px;height:32px;font-size:12px;">${esc(o.initials)}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:5px;">
                  <span>${esc(o.name)}</span>
                  ${o.isBot ? '<span class="bot-badge">BOT</span>' : ""}
                </div>
                <div style="font-size:11.5px;color:var(--text-secondary);">${esc(o.username)}</div>
              </div>
            </label>
          `
            )
            .join("")}
        </div>
      </div>
      <button id="create-grp-submit" class="primary-btn">Create Group</button>
    `
    );

    $("create-grp-submit").addEventListener("click", () => {
      const name = $("grp-name-input").value.trim();
      if (!name) return toast("Please enter a group name");
      const desc = $("grp-desc-input").value.trim();
      const selected = Array.from(els.modalBody.querySelectorAll('input[type="checkbox"]:checked')).map(
        (cb) => allOptions[Number(cb.value)]
      );
      const grp = Store.createGroupChat({ name, description: desc, members: selected });
      closeModal();
      if (window.App) window.App.openChat(grp.id);
      toast(`Group "${grp.name}" created!`);
    });
  }

  function openNewChannelModal() {
    openModal(
      "New Channel",
      `
      <div class="form-group">
        <label class="form-label">Channel Name</label>
        <input id="ch-name-input" class="form-input" type="text" placeholder="e.g. Security Alerts" />
      </div>
      <div class="form-group">
        <label class="form-label">Public @username</label>
        <input id="ch-user-input" class="form-input" type="text" placeholder="@security_alerts" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="ch-desc-input" class="form-textarea" rows="2" placeholder="Broadcast updates to unlimited subscribers..."></textarea>
      </div>
      <button id="create-ch-submit" class="primary-btn">Create Channel</button>
    `
    );

    $("create-ch-submit").addEventListener("click", () => {
      const name = $("ch-name-input").value.trim();
      if (!name) return toast("Please enter a channel name");
      const ch = Store.createChannelChat({
        name,
        username: $("ch-user-input").value.trim(),
        description: $("ch-desc-input").value.trim()
      });
      closeModal();
      if (window.App) window.App.openChat(ch.id);
      toast(`Channel "${ch.name}" created!`);
    });
  }

  function openNewSecretChatModal() {
    const contacts = Store.getContacts();
    openModal(
      "🔒 New Secret Chat",
      `
      <div style="font-size:13px;color:var(--text-secondary);">Choose a contact to start an End-to-End Encrypted Secret Chat with self-destructing messages:</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${contacts
          .map(
            (c, i) => `
          <div class="list-card-row" data-sec-idx="${i}">
            <div class="avatar avatar-sm" style="background:${c.color}">${esc(c.initials)}</div>
            <div style="flex:1;">
              <div style="font-weight:600;">${esc(c.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(c.username)}</div>
            </div>
            <span style="color:var(--online-dot);font-size:16px;">🔒</span>
          </div>
        `
          )
          .join("")}
      </div>
    `
    );

    els.modalBody.querySelectorAll("[data-sec-idx]").forEach((row) => {
      row.addEventListener("click", () => {
        const contact = contacts[Number(row.dataset.secIdx)];
        const chat = Store.createSecretChat(contact);
        closeModal();
        if (window.App) window.App.openChat(chat.id);
        toast("Encrypted Secret Chat started 🔒");
      });
    });
  }

  function openContactsModal() {
    const renderList = (query = "") => {
      const list = Store.getContacts().filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.username.toLowerCase().includes(query.toLowerCase())
      );
      const container = $("contacts-list-wrap");
      if (!container) return;
      container.innerHTML =
        list.length === 0
          ? '<div style="text-align:center;color:var(--text-secondary);padding:16px;">No contacts found.</div>'
          : list
              .map(
                (c) => `
            <div class="list-card-row" data-open-contact="${esc(c.id)}">
              <div class="avatar avatar-sm" style="background:${c.color}">${esc(c.initials)}</div>
              <div style="flex:1;">
                <div style="font-weight:600;">${esc(c.name)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${esc(c.username)} • ${esc(c.phone)}</div>
              </div>
              <span style="color:var(--accent-color);font-size:13px;font-weight:600;">Chat</span>
            </div>
          `
              )
              .join("");
    };

    openModal(
      "Contacts",
      `
      <input id="contact-search-input" class="form-input" type="text" placeholder="Search contacts..." />
      <div id="contacts-list-wrap" style="max-height:240px;overflow-y:auto;"></div>
      <div style="border-top:1px solid var(--border-color);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
        <div class="form-label">➕ Add New Contact</div>
        <div style="display:flex;gap:8px;">
          <input id="new-ct-name" class="form-input" type="text" placeholder="Name" />
          <input id="new-ct-user" class="form-input" type="text" placeholder="@username" />
        </div>
        <button id="add-ct-btn" class="secondary-btn">Save Contact</button>
      </div>
    `
    );

    renderList();

    $("contact-search-input").addEventListener("input", (e) => renderList(e.target.value));

    $("contacts-list-wrap").addEventListener("click", (e) => {
      const row = e.target.closest("[data-open-contact]");
      if (!row) return;
      const contact = Store.getContacts().find((c) => c.id === row.dataset.openContact);
      if (!contact) return;
      const chat = Store.openOrCreateDirectChat(contact);
      closeModal();
      if (window.App) window.App.openChat(chat.id);
    });

    $("add-ct-btn").addEventListener("click", () => {
      const name = $("new-ct-name").value.trim();
      if (!name) return toast("Enter contact name");
      Store.addContact({ name, username: $("new-ct-user").value.trim() });
      $("new-ct-name").value = "";
      $("new-ct-user").value = "";
      renderList();
      toast("Contact saved!");
    });
  }

  function openCallsModal() {
    const calls = Store.getCalls();
    openModal(
      "Recent Calls",
      `
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${
          calls.length === 0
            ? '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No recent calls.</div>'
            : calls
                .map(
                  (c, i) => `
              <div class="list-card-row" data-redial-idx="${i}">
                <div class="avatar avatar-sm" style="background:${c.color}">${esc(c.initials)}</div>
                <div style="flex:1;">
                  <div style="font-weight:600;">${esc(c.name)}</div>
                  <div style="font-size:12px;color:var(--text-secondary);">
                    ${c.direction === "outgoing" ? "↗ Outgoing" : "↙ Incoming"} • ${esc(c.duration)} • ${esc(c.time)}
                  </div>
                </div>
                <button class="icon-btn" title="Call again">📞</button>
              </div>
            `
                )
                .join("")
        }
      </div>
    `
    );

    els.modalBody.querySelectorAll("[data-redial-idx]").forEach((row) => {
      row.addEventListener("click", () => {
        const entry = calls[Number(row.dataset.redialIdx)];
        closeModal();
        startCall({
          chatId: entry.chatId,
          name: entry.name,
          initials: entry.initials,
          color: entry.color
        });
      });
    });
  }

  function openMyProfileModal() {
    const acc = Store.getActiveAccount();
    openModal(
      "My Profile",
      `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:10px 0;">
        <div class="avatar info-hero-avatar" style="background:${acc.color}">${esc(acc.initials)}</div>
        <div style="font-size:18px;font-weight:700;">${esc(acc.name)}</div>
        <div style="font-size:13.5px;color:var(--accent-color);">${esc(acc.username)}</div>
        <div style="font-size:13px;color:var(--text-secondary);">${esc(acc.phone)}</div>
        <div style="font-size:13.5px;margin-top:6px;padding:10px 14px;border-radius:10px;background:var(--bg-secondary);width:100%;">
          ${esc(acc.bio || "No bio set")}
        </div>
        <button id="profile-add-story-btn" class="primary-btn" style="margin-top:8px;">✨ Post a Story</button>
      </div>
    `
    );
    $("profile-add-story-btn").addEventListener("click", () => {
      closeModal();
      openAddStoryModal();
    });
  }

  // ==================== 4. LIVE CALL OVERLAY ====================
  function startCall(target) {
    if (!target) return;
    callState = target;
    callSeconds = 0;

    els.callAvatar.textContent = target.initials || "CL";
    els.callAvatar.style.background = target.color || target.avatarColor || "var(--accent-color)";
    els.callName.textContent = target.name || "Unknown";
    els.callStatus.textContent = "Ringing...";

    els.callMuteBtn.classList.remove("active");
    els.callSpeakerBtn.classList.remove("active");
    els.callVideoBtn.classList.remove("active");
    els.callOverlay.classList.remove("hidden");

    clearInterval(callTimer);
    setTimeout(() => {
      if (!callState) return;
      els.callStatus.textContent = "Connected • 0:00";
      callTimer = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60);
        const s = String(callSeconds % 60).padStart(2, "0");
        els.callStatus.textContent = `Connected • ${m}:${s}`;
      }, 1000);
    }, 1500);
  }

  function endCall() {
    clearInterval(callTimer);
    callTimer = null;
    if (callState) {
      const m = Math.floor(callSeconds / 60);
      const s = String(callSeconds % 60).padStart(2, "0");
      Store.logCall({
        chatId: callState.chatId || callState.id,
        name: callState.name,
        initials: callState.initials,
        color: callState.color || callState.avatarColor,
        direction: "outgoing",
        duration: callSeconds > 0 ? `${m}:${s}` : "Cancelled"
      });
      toast(`Call ended (${callSeconds > 0 ? `${m}:${s}` : "Cancelled"})`);
    }
    callState = null;
    els.callOverlay.classList.add("hidden");
  }

  // ==================== EVENT BINDINGS ====================
  function bindEvents() {
    // Chat Header Click -> Toggle Info Panel
    const headerLeft = document.querySelector(".chat-header-left");
    if (headerLeft) {
      headerLeft.style.cursor = "pointer";
      headerLeft.addEventListener("click", (e) => {
        if (e.target.closest("#mobile-back-btn")) return;
        const willOpen = els.infoPanel.classList.contains("hidden");
        els.infoPanel.classList.toggle("hidden", !willOpen);
        if (willOpen) renderInfoPanel();
      });
    }

    els.infoCloseBtn.addEventListener("click", () => els.infoPanel.classList.add("hidden"));

    // Intercept Chat Header Call Button cleanly (override Module 2 placeholder toast)
    const headerActions = document.querySelector(".chat-header-actions");
    if (headerActions) {
      headerActions.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest("#chat-call-btn");
          if (!btn) return;
          e.stopPropagation();
          const chat = Store.getChatById(Store.getState().activeChatId);
          if (!chat) return;
          if (chat.isBot || chat.type === "saved") {
            toast("Voice calls are not available for Bots or Saved Messages");
            return;
          }
          startCall(chat);
        },
        true
      );
    }

    // Info Panel Internal Clicks
    els.infoBody.addEventListener("click", (e) => {
      const chat = Store.getChatById(Store.getState().activeChatId);
      if (!chat) return;

      if (e.target.id === "info-copy-token") {
        navigator.clipboard?.writeText(chat.botToken || "").catch(() => {});
        toast("Bot API Token copied! 📋");
        return;
      }

      const tabBtn = e.target.closest("[data-info-tab]");
      if (tabBtn) {
        activeInfoTab = tabBtn.dataset.infoTab;
        renderInfoPanel();
        return;
      }

      const adminBtn = e.target.closest("[data-toggle-admin]");
      if (adminBtn) {
        const newRole = Store.toggleMemberAdmin(chat.id, adminBtn.dataset.toggleAdmin);
        if (newRole) {
          renderInfoPanel();
          toast(`Member role updated to ${newRole}`);
        }
        return;
      }

      const actBtn = e.target.closest("[data-info-act]");
      if (actBtn) {
        const act = actBtn.dataset.infoAct;
        if (act === "call") startCall(chat);
        else if (act === "mute") {
          const muted = Store.toggleMute(chat.id);
          if (window.App) window.App.renderAll();
          renderInfoPanel();
          toast(muted ? "Muted" : "Unmuted");
        } else if (act === "add-member") {
          openAddMemberToGroupModal(chat.id);
        } else if (act === "secret") {
          const sec = Store.createSecretChat({
            name: chat.name,
            username: chat.username,
            initials: chat.initials,
            color: chat.avatarColor
          });
          if (window.App) window.App.openChat(sec.id);
          els.infoPanel.classList.add("hidden");
          toast("Secret Chat created 🔒");
        }
      }
    });

    // Story Viewer Controls
    els.storyCloseBtn.addEventListener("click", closeStoryViewer);
    els.storyViewer.addEventListener("click", (e) => {
      if (e.target === els.storyViewer) closeStoryViewer();
    });

    els.storyLikeBtn.addEventListener("click", () => {
      if (!currentStoryId) return;
      const liked = Store.toggleStoryLike(currentStoryId);
      els.storyLikeBtn.textContent = liked ? "❤️" : "🤍";
      if (liked) toast("Liked story ❤️");
    });

    const sendStoryReply = () => {
      const text = els.storyReplyInput.value.trim();
      if (!text || !currentStoryId) return;
      const st = Store.getState().stories.find((s) => s.id === currentStoryId);
      const targetChat =
        Store.getState().chats.find((c) => c.name.toLowerCase().includes((st?.name || "").toLowerCase())) ||
        Store.getChatById("chat_saved");
      if (targetChat) {
        Store.addMessage(targetChat.id, {
          sender: "me",
          text: `💬 Replied to ${st ? st.name : "story"}'s story:\n${text}`
        });
        if (window.App) window.App.renderAll();
        if (window.ChatUI && Store.getState().activeChatId === targetChat.id) {
          window.ChatUI.renderActiveChat();
        }
      }
      toast("Story reply sent!");
      closeStoryViewer();
    };

    els.storySendReplyBtn.addEventListener("click", sendStoryReply);
    els.storyReplyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendStoryReply();
    });

    // Generic Modal Close
    els.modalCloseBtn.addEventListener("click", closeModal);
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) closeModal();
    });

    // Call Controls
    els.callMuteBtn.addEventListener("click", () => {
      els.callMuteBtn.classList.toggle("active");
      toast(els.callMuteBtn.classList.contains("active") ? "Microphone muted" : "Microphone on");
    });
    els.callSpeakerBtn.addEventListener("click", () => {
      els.callSpeakerBtn.classList.toggle("active");
      toast(els.callSpeakerBtn.classList.contains("active") ? "Speaker on" : "Speaker off");
    });
    els.callVideoBtn.addEventListener("click", () => {
      els.callVideoBtn.classList.toggle("active");
      toast(els.callVideoBtn.classList.contains("active") ? "Camera enabled 📹" : "Camera off");
    });
    els.callEndBtn.addEventListener("click", endCall);

    // Wrap Module 2's onChatOpened so Info Panel stays in sync when switching chats
    const prevOnChatOpened = window.onChatOpened;
    window.onChatOpened = function (chatId) {
      if (typeof prevOnChatOpened === "function") prevOnChatOpened(chatId);
      if (!els.infoPanel.classList.contains("hidden")) {
        renderInfoPanel();
      }
    };
  }

  // ==================== PUBLIC API ====================
  window.SocialUI = {
    openStory,
    renderInfoPanel,
    startCall,
    handleAction(action) {
      if (action === "new-group") { openNewGroupModal(); return true; }
      if (action === "new-channel") { openNewChannelModal(); return true; }
      if (action === "new-secret") { openNewSecretChatModal(); return true; }
      if (action === "contacts") { openContactsModal(); return true; }
      if (action === "calls") { openCallsModal(); return true; }
      if (action === "my-profile") { openMyProfileModal(); return true; }
      return false;
    }
  };

  Store.ensureSocialData();
  bindEvents();
})();