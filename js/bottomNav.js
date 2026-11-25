/* =========================================================
   TELEGRAM-STYLE 4-TAB BOTTOM NAVIGATION (LIVE BACKEND)
   Contacts • Profile • Chats (Red Unread Badge) • Settings
   ========================================================= */

(function () {
  const JWT_KEY = "teleclone_live_jwt";
  const $ = (id) => document.getElementById(id);

  const POST_BGS = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #11998e, #38ef7d)",
    "linear-gradient(135deg, #fc466b, #3f5efb)",
    "linear-gradient(135deg, #f7971e, #ffd200)",
    "linear-gradient(135deg, #0f2027, #203a43, #2c5364)"
  ];

  let activeTab = "chats";
  let profileSubTab = "posts"; // 'posts' | 'archived'
  let cachedContacts = [];
  let cachedProfile = null;
  let cachedPosts = [];

  function esc(str) {
    return window.App ? window.App.escapeHtml(str) : String(str || "");
  }

  function toast(msg) {
    if (window.App) window.App.showToast(msg);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(JWT_KEY) || "";
    const headers = { ...(options.headers || {}) };
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
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  }

  function getPhotoPicker() {
    let input = $("profile-photo-file-input");
    if (!input) {
      input = document.createElement("input");
      input.id = "profile-photo-file-input";
      input.type = "file";
      input.accept = "image/*";
      input.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
      document.body.appendChild(input);
    }
    return input;
  }

  // ==================== 1. BUILD BOTTOM BAR (CONTACTS | PROFILE | CHATS | SETTINGS) ====================
  function mountBottomNav() {
    const sidebar = $("sidebar") || document.querySelector(".sidebar");
    if (!sidebar || $("bottom-nav")) return;

    const panel = document.createElement("div");
    panel.id = "sidebar-tab-panel";
    panel.className = "sidebar-tab-panel hidden";
    sidebar.appendChild(panel);

    const nav = document.createElement("nav");
    nav.id = "bottom-nav";
    nav.className = "bottom-nav";
    nav.innerHTML = `
      <button type="button" class="bottom-nav-item" data-btab="contacts">
        <span class="bottom-nav-icon-wrap">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.22 4.22 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </span>
        <span>Contacts</span>
      </button>

      <button type="button" class="bottom-nav-item" data-btab="profile">
        <span class="bottom-nav-icon-wrap">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3.5a3.2 3.2 0 1 1-3.2 3.2A3.2 3.2 0 0 1 12 5.5zm0 14a7.3 7.3 0 0 1-5.6-2.6c.05-1.85 3.74-2.85 5.6-2.85s5.55 1 5.6 2.85A7.3 7.3 0 0 1 12 19.5z"/>
          </svg>
        </span>
        <span>Profile</span>
      </button>

      <button type="button" class="bottom-nav-item active" data-btab="chats">
        <span class="bottom-nav-icon-wrap">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
          </svg>
          <span id="bottom-chats-badge" class="bottom-nav-badge hidden">0</span>
        </span>
        <span>Chats</span>
      </button>

      <button type="button" class="bottom-nav-item" data-btab="settings">
        <span class="bottom-nav-icon-wrap">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94a7.9 7.9 0 0 0 .06-.94 7.9 7.9 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.28 7.28 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.9 7.9 0 0 0-.06.94 7.9 7.9 0 0 0 .06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96a7.28 7.28 0 0 0 1.62.94l.36 2.54a.48.48 0 0 0 .48.41h3.84a.48.48 0 0 0 .48-.41l.36-2.54a7.28 7.28 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z"/>
          </svg>
        </span>
        <span>Settings</span>
      </button>
    `;
    sidebar.appendChild(nav);

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-btab]");
      if (!btn) return;
      switchTab(btn.dataset.btab);
    });
  }

  // ==================== 2. LIVE RED UNREAD BADGE ====================
  function updateUnreadBadge() {
    const badge = $("bottom-chats-badge");
    if (!badge || !window.Store) return;
    const chats = Store.getState().chats || [];
    const total = chats.reduce((sum, c) => sum + (c.archived ? 0 : Number(c.unreadCount || 0)), 0);
    if (total > 0) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // ==================== 3. TAB SWITCHER ====================
  function switchTab(tab) {
    activeTab = tab;
    const nav = $("bottom-nav");
    const panel = $("sidebar-tab-panel");
    const storiesBar = $("stories-bar");
    const folderTabs = $("folder-tabs");
    const chatList = $("chat-list");
    const fabBtn = $("fab-btn") || document.querySelector(".fab-btn");
    const fabMenu = $("fab-menu") || document.querySelector(".fab-menu");

    if (nav) {
      nav.querySelectorAll(".bottom-nav-item").forEach((b) => {
        b.classList.toggle("active", b.dataset.btab === tab);
      });
    }

    const isChats = tab === "chats";
    if (storiesBar) storiesBar.classList.toggle("hidden", !isChats);
    if (folderTabs) folderTabs.classList.toggle("hidden", !isChats);
    if (chatList) chatList.classList.toggle("hidden", !isChats);
    if (fabBtn) fabBtn.classList.toggle("hidden", !isChats);
    if (fabMenu) fabMenu.classList.add("hidden");
    if (panel) panel.classList.toggle("hidden", isChats);

    if (tab === "contacts") loadAndRenderContacts();
    else if (tab === "profile") loadAndRenderProfile();
    else if (tab === "settings") renderInlineSettings();
  }

  // ==================== 4. PROFILE TAB (SET PHOTO, EDIT INFO, SETTINGS, POSTS & ARCHIVED POSTS) ====================
  async function loadAndRenderProfile() {
    const panel = $("sidebar-tab-panel");
    if (!panel) return;
    panel.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">Loading profile...</div>`;

    try {
      const [meRes, postsRes] = await Promise.all([api("/api/auth/me"), api("/api/profile/posts")]);
      cachedProfile = meRes.user;
      cachedPosts = postsRes.posts || [];
      syncAccountInStore(cachedProfile);
    } catch {
      const acc = Store.getActiveAccount();
      cachedProfile = {
        name: acc.name,
        username: acc.username,
        phone: acc.phone,
        bio: acc.bio || "",
        initials: acc.initials,
        avatarColor: acc.color,
        avatarUrl: acc.avatarUrl || ""
      };
      cachedPosts = [];
    }
    renderProfileView();
  }

  function syncAccountInStore(user) {
    if (!user || !window.Store) return;
    const acc = Store.getActiveAccount();
    if (!acc) return;
    acc.name = user.name;
    acc.username = user.username;
    acc.phone = user.phone;
    acc.bio = user.bio || "";
    acc.initials = user.initials;
    acc.color = user.avatarColor || acc.color;
    acc.avatarUrl = user.avatarUrl || "";
    if (window.App) window.App.renderAll();
  }

  function renderProfileView() {
    const panel = $("sidebar-tab-panel");
    if (!panel || activeTab !== "profile" || !cachedProfile) return;

    const u = cachedProfile;
    const activePosts = cachedPosts.filter((p) => !p.archived);
    const archivedPosts = cachedPosts.filter((p) => p.archived);
    const visiblePosts = profileSubTab === "posts" ? activePosts : archivedPosts;

    panel.innerHTML = `
      <div class="profile-hero-box">
        <div id="prof-avatar-trigger" class="profile-avatar-xl" style="background:${u.avatarColor || "var(--accent-color)"}" title="Click to change photo">
          ${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="Profile Photo" />` : esc(u.initials || "U")}
        </div>
        <div class="profile-hero-name">${esc(u.name)}</div>
        <div class="profile-hero-status">online</div>
      </div>

      <div class="profile-actions-row">
        <button type="button" id="prof-set-photo-btn" class="profile-action-card">
          <span>📷</span>
          <span>Set Photo</span>
        </button>
        <button type="button" id="prof-edit-info-btn" class="profile-action-card">
          <span>✏️</span>
          <span>Edit Info</span>
        </button>
        <button type="button" id="prof-settings-btn" class="profile-action-card">
          <span>⚙️</span>
          <span>Settings</span>
        </button>
      </div>

      <div class="profile-info-card">
        <div class="profile-info-row">
          <div class="profile-info-val">${esc(u.phone || "Not set")}</div>
          <div class="profile-info-lbl">Phone Number</div>
        </div>
        <div class="profile-info-row">
          <div class="profile-info-val" style="color:var(--accent-color);">${esc(u.username || "@user")}</div>
          <div class="profile-info-lbl">Username</div>
        </div>
        <div class="profile-info-row">
          <div class="profile-info-val">${esc(u.bio || "Add a few words about yourself")}</div>
          <div class="profile-info-lbl">Bio</div>
        </div>
      </div>

      <div class="profile-posts-header">
        <div class="profile-posts-tabs">
          <button type="button" class="profile-post-tab ${profileSubTab === "posts" ? "active" : ""}" data-ptab="posts">
            Posts (${activePosts.length})
          </button>
          <button type="button" class="profile-post-tab ${profileSubTab === "archived" ? "active" : ""}" data-ptab="archived">
            Archived (${archivedPosts.length})
          </button>
        </div>
        <button type="button" id="prof-add-post-btn" class="profile-add-post-btn">➕ Add Post</button>
      </div>

      ${
        visiblePosts.length === 0
          ? `<div class="profile-post-empty">
               <div>${profileSubTab === "posts" ? "Abhi koi post nahi hai." : "Abhi koi archived post nahi hai."}</div>
               ${
                 profileSubTab === "posts"
                   ? `<button type="button" id="prof-empty-add-post" class="primary-btn" style="width:auto;padding:8px 18px;">➕ Add First Post</button>`
                   : ""
               }
             </div>`
          : `<div id="prof-posts-grid" class="profile-posts-grid">
               ${visiblePosts
                 .map(
                   (p) => `
                 <div class="profile-post-tile" data-open-post="${p.id}" style="background:${p.bg}">
                   ${
                     p.mediaUrl
                       ? `<img src="${esc(p.mediaUrl)}" alt="Post" />`
                       : `<span>${esc(p.caption.slice(0, 48))}</span>`
                   }
                 </div>
               `
                 )
                 .join("")}
             </div>`
      }
    `;

    // Set Photo button & Avatar click
    const triggerPhotoUpload = () => {
      const picker = getPhotoPicker();
      picker.onchange = async (e) => {
        const file = e.target.files?.[0];
        picker.value = "";
        if (!file) return;
        toast("Uploading profile photo...");
        try {
          const fd = new FormData();
          fd.append("file", file, file.name);
          const up = await api("/api/upload", { method: "POST", body: fd });
          const res = await api("/api/profile/photo", {
            method: "PUT",
            body: { avatarUrl: up.attachment?.src || "" }
          });
          if (res.user) {
            cachedProfile = res.user;
            syncAccountInStore(res.user);
            renderProfileView();
            toast("Profile photo updated! 📷");
          }
        } catch (err) {
          toast("Upload failed: " + err.message);
        }
      };
      picker.click();
    };

    $("prof-set-photo-btn").onclick = triggerPhotoUpload;
    $("prof-avatar-trigger").onclick = triggerPhotoUpload;

    // Edit Info button
    $("prof-edit-info-btn").onclick = openEditInfoModal;

    // Settings button
    $("prof-settings-btn").onclick = () => {
      if (window.SettingsUI) window.SettingsUI.openSettings("home");
      else switchTab("settings");
    };

    // Add Post button
    $("prof-add-post-btn").onclick = openAddPostModal;
    const emptyAdd = $("prof-empty-add-post");
    if (emptyAdd) emptyAdd.onclick = openAddPostModal;

    // Posts / Archived Posts sub-tabs
    panel.querySelectorAll("[data-ptab]").forEach((btn) => {
      btn.onclick = () => {
        profileSubTab = btn.dataset.ptab;
        renderProfileView();
      };
    });

    // Click any post tile -> View / Archive / Delete
    const grid = $("prof-posts-grid");
    if (grid) {
      grid.addEventListener("click", (e) => {
        const tile = e.target.closest("[data-open-post]");
        if (!tile) return;
        const post = cachedPosts.find((x) => Number(x.id) === Number(tile.dataset.openPost));
        if (post) openPostViewerModal(post);
      });
    }
  }

  function openEditInfoModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body || !cachedProfile) return;

    title.textContent = "Edit Profile Info";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input id="edit-info-name" class="form-input" type="text" value="${esc(cachedProfile.name)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input id="edit-info-user" class="form-input" type="text" value="${esc(cachedProfile.username)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea id="edit-info-bio" class="form-textarea" rows="3" placeholder="Write something about yourself...">${esc(cachedProfile.bio || "")}</textarea>
      </div>
      <button id="edit-info-save" class="primary-btn">Save Changes</button>
    `;
    modal.classList.remove("hidden");

    $("edit-info-save").onclick = async () => {
      const btn = $("edit-info-save");
      btn.disabled = true;
      try {
        const res = await api("/api/auth/profile", {
          method: "PUT",
          body: {
            name: $("edit-info-name").value.trim(),
            username: $("edit-info-user").value.trim(),
            bio: $("edit-info-bio").value.trim()
          }
        });
        if (res.user) {
          cachedProfile = res.user;
          syncAccountInStore(res.user);
        }
        modal.classList.add("hidden");
        renderProfileView();
        toast("Profile info updated! ✓");
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    };
  }

  function openAddPostModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    let selectedBg = POST_BGS[0];
    title.textContent = "Add Profile Post";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Select Photo (Optional)</label>
        <input id="new-post-file" class="form-input" type="file" accept="image/*" />
      </div>
      <div class="form-group">
        <label class="form-label">Caption / Text</label>
        <textarea id="new-post-caption" class="form-textarea" rows="3" placeholder="Write a caption for your post..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Card Background (for text posts)</label>
        <div id="new-post-bgs" style="display:flex;gap:10px;">
          ${POST_BGS.map(
            (g, i) => `<button type="button" data-pbg="${i}" style="width:34px;height:34px;border-radius:50%;background:${g};border:${i === 0 ? "3px solid var(--accent-color)" : "2px solid transparent"};"></button>`
          ).join("")}
        </div>
      </div>
      <button id="new-post-submit" class="primary-btn">Publish Post</button>
    `;
    modal.classList.remove("hidden");

    $("new-post-bgs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pbg]");
      if (!b) return;
      selectedBg = POST_BGS[Number(b.dataset.pbg)];
      $("new-post-bgs").querySelectorAll("button").forEach((x) => (x.style.border = "2px solid transparent"));
      b.style.border = "3px solid var(--accent-color)";
    });

    $("new-post-submit").onclick = async () => {
      const btn = $("new-post-submit");
      const caption = ($("new-post-caption").value || "").trim();
      const file = $("new-post-file").files?.[0] || null;
      if (!caption && !file) return toast("Photo select karein ya kuch text likhein");

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
        await api("/api/profile/posts", {
          method: "POST",
          body: { caption, mediaUrl, bg: selectedBg }
        });
        modal.classList.add("hidden");
        profileSubTab = "posts";
        await loadAndRenderProfile();
        toast("Post published! ✓");
      } catch (err) {
        toast("Failed: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Publish Post";
      }
    };
  }

  function openPostViewerModal(post) {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    title.textContent = post.archived ? "Archived Post" : "Profile Post";
    body.innerHTML = `
      ${
        post.mediaUrl
          ? `<img src="${esc(post.mediaUrl)}" alt="Post" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;background:#000;" />`
          : `<div style="padding:32px 18px;border-radius:14px;background:${post.bg};color:#fff;font-size:18px;font-weight:700;text-align:center;">${esc(post.caption)}</div>`
      }
      ${post.mediaUrl && post.caption ? `<div style="font-size:14px;color:var(--text-primary);">${esc(post.caption)}</div>` : ""}
      <div style="font-size:12px;color:var(--text-secondary);">Posted: ${esc(post.time)}</div>
      <div style="display:flex;gap:8px;">
        <button id="post-toggle-arch" class="secondary-btn">${post.archived ? "📤 Unarchive Post" : "📦 Archive Post"}</button>
        <button id="post-delete-btn" class="danger-btn">🗑️ Delete</button>
      </div>
    `;
    modal.classList.remove("hidden");

    $("post-toggle-arch").onclick = async () => {
      try {
        await api(`/api/profile/posts/${post.id}/archive`, {
          method: "PUT",
          body: { archived: !post.archived }
        });
        modal.classList.add("hidden");
        await loadAndRenderProfile();
        toast(post.archived ? "Post restored to Posts" : "Post moved to Archived Posts 📦");
      } catch (err) {
        toast(err.message);
      }
    };

    $("post-delete-btn").onclick = async () => {
      if (!confirm("Delete this post permanently?")) return;
      try {
        await api(`/api/profile/posts/${post.id}`, { method: "DELETE" });
        modal.classList.add("hidden");
        await loadAndRenderProfile();
        toast("Post deleted");
      } catch (err) {
        toast(err.message);
      }
    };
  }

  // ==================== 5. CONTACTS TAB (LIVE DB) ====================
  async function loadAndRenderContacts() {
    const panel = $("sidebar-tab-panel");
    if (!panel) return;
    panel.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary);">Loading contacts...</div>`;
    try {
      const res = await api("/api/contacts");
      cachedContacts = res.contacts || [];
    } catch {
      cachedContacts = [];
    }
    renderContactsView("");
  }

  function renderContactsView(filterText) {
    const panel = $("sidebar-tab-panel");
    if (!panel || activeTab !== "contacts") return;
    const q = (filterText || "").toLowerCase();
    const list = cachedContacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    );

    panel.innerHTML = `
      <div class="tab-panel-top">
        <span class="tab-panel-title">Contacts</span>
        <button id="btab-add-contact-btn" class="tab-pill-btn">➕ Add Contact</button>
      </div>
      <input id="btab-contact-filter" class="form-input" type="text" placeholder="Filter contacts..." value="${esc(filterText)}" />
      <div id="btab-contacts-list" style="display:flex;flex-direction:column;gap:2px;">
        ${
          list.length === 0
            ? `<div style="text-align:center;color:var(--text-secondary);padding:28px 12px;font-size:13.5px;">
                 Koi contact nahi mila.<br/>Upar <b>➕ Add Contact</b> dabaa kar kisi bhi user ka <b>@username</b> ya phone add karein.
               </div>`
            : list
                .map(
                  (c) => `
              <div class="tab-row-item" data-open-dm="${c.id}">
               <div class="avatar avatar-md" style="background:${c.color};overflow:hidden;">
                  ${c.avatarUrl ? `<img src="${esc(c.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" />` : esc(c.initials)}
                </div>
                <div class="tab-row-meta">
                  <div class="tab-row-name">${esc(c.name)}</div>
                  <div class="tab-row-sub ${c.online ? "online" : ""}">${esc(c.statusText)} • ${esc(c.username)}</div>
                </div>
                <span style="color:var(--accent-color);font-size:13px;font-weight:600;">Chat</span>
              </div>
            `
                )
                .join("")
        }
      </div>
    `;

    $("btab-add-contact-btn").onclick = openAddContactModal;
    $("btab-contact-filter").addEventListener("input", (e) => renderContactsView(e.target.value));
    $("btab-contacts-list").addEventListener("click", async (e) => {
      const row = e.target.closest("[data-open-dm]");
      if (!row) return;
      await openDirectChatByUserId(Number(row.dataset.openDm));
    });
  }

  function openAddContactModal() {
    const modal = $("app-modal");
    const title = $("app-modal-title");
    const body = $("app-modal-body");
    if (!modal || !body) return;

    title.textContent = "Add New Contact";
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">User's @username or Phone Number</label>
        <input id="add-ct-query" class="form-input" type="text" placeholder="e.g. @ali_raza or +923001234567" />
      </div>
      <div class="form-group">
        <label class="form-label">Display Name (Optional)</label>
        <input id="add-ct-custom" class="form-input" type="text" placeholder="e.g. Ali Friend" />
      </div>
      <button id="add-ct-submit" class="primary-btn">Save Contact</button>
    `;
    modal.classList.remove("hidden");
    $("add-ct-query").focus();

    $("add-ct-submit").onclick = async () => {
      const query = $("add-ct-query").value.trim();
      const customName = $("add-ct-custom").value.trim();
      if (!query) return toast("@username ya phone number likhein");
      try {
        await api("/api/contacts", { method: "POST", body: { query, customName } });
        modal.classList.add("hidden");
        toast("Contact saved! ✓");
        loadAndRenderContacts();
      } catch (err) {
        toast(err.message);
      }
    };
  }

  async function openDirectChatByUserId(userId) {
    try {
      const res = await api("/api/chats/direct", {
        method: "POST",
        body: { targetUserId: userId }
      });
      if (res.chat) {
        const state = Store.getState();
        const cid = String(res.chat.id);
        if (!state.chats.some((c) => String(c.id) === cid)) {
          state.chats.unshift({
            ...res.chat,
            id: cid,
            peerUserId: res.chat.peerUserId ? String(res.chat.peerUserId) : null,
            messages: []
          });
        }
        switchTab("chats");
        if (window.App) {
          window.App.renderAll();
          window.App.openChat(cid);
        }
      }
    } catch (err) {
      toast(err.message);
    }
  }

  // ==================== 6. SETTINGS TAB ====================
  function renderInlineSettings() {
    const panel = $("sidebar-tab-panel");
    if (!panel || activeTab !== "settings") return;

    const acc = Store.getActiveAccount();
    const isDark = (document.documentElement.getAttribute("data-theme") || Store.getState().theme) === "dark";

    panel.innerHTML = `
      <div class="tab-panel-top">
        <span class="tab-panel-title">Settings</span>
      </div>

      <div class="settings-profile-card" data-go-profile="1">
        <div class="avatar avatar-lg" style="background:${acc.color};overflow:hidden;">
          ${acc.avatarUrl ? `<img src="${esc(acc.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" />` : esc(acc.initials)}
        </div>
        <div class="settings-profile-meta">
          <div class="settings-profile-name">${esc(acc.name)}</div>
          <div class="settings-profile-sub">${esc(acc.phone || "")} • ${esc(acc.username || "")}</div>
        </div>
        <span class="settings-row-arrow">›</span>
      </div>

      <div class="settings-group">
        <button class="settings-row" data-open-set="appearance">
          <div class="settings-row-icon">🎨</div>
          <div class="settings-row-body"><div class="settings-row-title">Chat Settings</div><div class="settings-row-sub">Themes, Wallpapers, Font Size</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="privacy">
          <div class="settings-row-icon">🔒</div>
          <div class="settings-row-body"><div class="settings-row-title">Privacy and Security</div><div class="settings-row-sub">Passcode Lock, 2FA, Last Seen</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="notifications">
          <div class="settings-row-icon">🔔</div>
          <div class="settings-row-body"><div class="settings-row-title">Notifications and Sounds</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="storage">
          <div class="settings-row-icon">💾</div>
          <div class="settings-row-body"><div class="settings-row-title">Data and Storage</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="folders">
          <div class="settings-row-icon">📁</div>
          <div class="settings-row-body"><div class="settings-row-title">Chat Folders</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="devices">
          <div class="settings-row-icon">💻</div>
          <div class="settings-row-body"><div class="settings-row-title">Devices</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <button class="settings-row" data-open-set="wallet">
          <div class="settings-row-icon">💎</div>
          <div class="settings-row-body"><div class="settings-row-title">TON Wallet & Stars</div></div>
          <span class="settings-row-arrow">›</span>
        </button>
        <div class="settings-row">
          <div class="settings-row-icon">🌙</div>
          <div class="settings-row-body"><div class="settings-row-title">Night Mode</div></div>
          <label class="switch">
            <input type="checkbox" id="btab-dark-toggle" ${isDark ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <button id="btab-logout-btn" class="danger-btn">🚪 Log Out</button>
    `;

    panel.querySelector("[data-go-profile]")?.addEventListener("click", () => switchTab("profile"));
    panel.querySelectorAll("[data-open-set]").forEach((el) => {
      el.onclick = () => {
        if (window.SettingsUI) window.SettingsUI.openSettings(el.dataset.openSet);
      };
    });

    $("btab-logout-btn").onclick = () => {
      if (!confirm("Log out of TeleClone?")) return;
      localStorage.removeItem(JWT_KEY);
      window.location.reload();
    };
  }

  // ==================== 7. HOOK UNREAD BADGE ====================
  function patchHooks() {
    if (window.App && typeof window.App.renderAll === "function") {
      const origRenderAll = window.App.renderAll;
      window.App.renderAll = function () {
        origRenderAll.apply(this, arguments);
        updateUnreadBadge();
      };
    }
  }

  mountBottomNav();
  patchHooks();
  updateUnreadBadge();
})();