(() => {
  "use strict";

  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";

  const POST_GRADIENTS = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #11998e, #38ef7d)",
    "linear-gradient(135deg, #fc466b, #3f5efb)",
    "linear-gradient(135deg, #f7971e, #ffd200)",
    "linear-gradient(135deg, #0f2027, #2c5364)",
    "linear-gradient(135deg, #c31432, #240b36)"
  ];

  const ICONS = {
    qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>`,
    camPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/><path d="M18.5 16v4M16.5 18h4"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.6"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.9 7.9 0 0 0 .06-.94 7.9 7.9 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.28 7.28 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.9 7.9 0 0 0-.06.94 7.9 7.9 0 0 0 .06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96a7.28 7.28 0 0 0 1.62.94l.36 2.54a.48.48 0 0 0 .48.41h3.84a.48.48 0 0 0 .48-.41l.36-2.54a7.28 7.28 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`
  };

  let profileUser = null;
  let profilePosts = [];
  let postsSubTab = "active"; // "active" | "archived"
  let isRenderingProfile = false;
  let isLoadingData = false;

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
    const isFD = opts.body instanceof FormData;
    if (opts.body && !isFD && typeof opts.body === "object") {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body && !isFD && typeof opts.body === "object" ? JSON.stringify(opts.body) : opts.body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || `Error ${res.status}`);
    return data;
  }

  function isVideoUrl(url) {
    return /\.(mp4|mov|m4v|mkv|3gp|avi|webm)(\?.*)?$/i.test(String(url || ""));
  }

  function syncSavedAccountCache(user) {
    if (!user) return;
    const token = getActiveToken();
    if (!token) return;
    try {
      const arr = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex((a) => a.token === token || String(a.id) === String(user.id));
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          name: user.name || arr[idx].name,
          username: String(user.username || "").replace(/^@/, ""),
          bio: user.bio !== undefined ? user.bio : arr[idx].bio,
          avatarUrl: user.avatarUrl !== undefined ? user.avatarUrl : arr[idx].avatarUrl
        };
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(arr));
      }
    } catch (_) {}
  }

  // Bottom Nav ke Profile icon par user ki asli DP lagayein (screenshot jaisa)
  function updateBottomNavAvatar(user) {
    const btn = document.querySelector('.bottom-nav-item[data-btab="profile"] .bottom-nav-icon-wrap');
    if (!btn || !user) return;
    if (user.avatarUrl) {
      btn.innerHTML = `<img src="${esc(user.avatarUrl)}" alt="Profile" class="tc-bnav-avatar" />`;
    }
  }

  async function fetchProfileAndPosts(silent = false) {
    const token = getActiveToken();
    if (!token) return;

    // Instant saved fallback (offline friendly)
    if (!profileUser) {
      try {
        const arr = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
        const found = Array.isArray(arr) ? arr.find((a) => a.token === token) : null;
        if (found) profileUser = { ...found };
      } catch (_) {}
    }

    if (!silent) {
      isLoadingData = true;
      renderProfileView();
    }

    try {
      const [meRes, postsRes] = await Promise.all([
        apiReq("/api/auth/me").catch(() => null),
        apiReq("/api/profile/posts").catch(() => null)
      ]);

      if (meRes && (meRes.user || meRes.id)) {
        const u = meRes.user || meRes;
        profileUser = {
          id: String(u.id || u.user_id || ""),
          name: u.name || u.username || "User",
          username: String(u.username || "").replace(/^@/, ""),
          phone: u.phone || "",
          bio: u.bio || "",
          avatarUrl: u.avatarUrl || u.avatar_url || "",
          color: u.avatarColor || u.avatar_color || "linear-gradient(135deg,#6366f1,#3b82f6)"
        };
        syncSavedAccountCache(profileUser);
        updateBottomNavAvatar(profileUser);
      }

      if (postsRes && Array.isArray(postsRes.posts)) {
        profilePosts = postsRes.posts;
      }
    } finally {
      isLoadingData = false;
      renderProfileView();
    }
  }

  // ===== 1. Set / Remove Profile Photo =====
  function pickProfilePhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      toast("Photo upload ho rahi hai...");
      try {
        const fd = new FormData();
        fd.append("file", file, file.name || "avatar.jpg");
        const up = await apiReq("/api/upload", { method: "POST", body: fd });
        const photoUrl = (up.attachment && up.attachment.src) || up.src || up.url || "";
        if (!photoUrl) throw new Error("Upload URL nahi mili");

        const res = await apiReq("/api/profile/photo", {
          method: "PUT",
          body: { avatarUrl: photoUrl }
        });

        const updatedUrl =
          (res.user && (res.user.avatarUrl || res.user.avatar_url)) || photoUrl;
        if (profileUser) {
          profileUser.avatarUrl = updatedUrl;
          syncSavedAccountCache(profileUser);
          updateBottomNavAvatar(profileUser);
        }
        toast("Profile photo updated!");
        renderProfileView();
        if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      } catch (err) {
        toast(err.message || "Photo upload fail ho gayi");
      }
    };
    input.click();
  }

  async function removeProfilePhoto() {
    try {
      await apiReq("/api/profile/photo", {
        method: "PUT",
        body: { avatarUrl: "" }
      });
      if (profileUser) {
        profileUser.avatarUrl = "";
        syncSavedAccountCache(profileUser);
      }
      toast("Profile photo removed");
      renderProfileView();
      if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
    } catch (err) {
      toast(err.message || "Photo remove nahi ho saki");
    }
  }

  // ===== 2. Edit Info Modal =====
  function openEditInfoModal() {
    const old = document.getElementById("tcPfEditBackdrop");
    if (old) old.remove();

    const u = profileUser || { name: "", username: "", bio: "" };
    const backdrop = document.createElement("div");
    backdrop.id = "tcPfEditBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.innerHTML = `
      <div class="tc-st-modal-card">
        <div class="tc-st-modal-head">
          <h3>Edit Info</h3>
          <button type="button" class="tc-st-circle-btn" id="tcPfEditClose">${ICONS.close}</button>
        </div>
        <label class="tc-st-lbl">Name</label>
        <input id="tcPfEditName" class="tc-st-input" type="text" maxlength="64" value="${esc(u.name)}" />

        <label class="tc-st-lbl">Username</label>
        <input id="tcPfEditUser" class="tc-st-input" type="text" maxlength="32" placeholder="username" value="${esc(u.username)}" />

        <label class="tc-st-lbl">Bio</label>
        <textarea id="tcPfEditBio" class="tc-st-input tc-st-textarea" maxlength="160" placeholder="Write something about yourself...">${esc(u.bio)}</textarea>

        <div class="tc-st-modal-err" id="tcPfEditErr"></div>
        <button type="button" class="tc-st-primary-btn" id="tcPfEditSave">Save Changes</button>
      </div>
    `;

    backdrop.querySelector("#tcPfEditClose").onclick = () => backdrop.remove();
    backdrop.querySelector("#tcPfEditSave").onclick = async () => {
      const btn = backdrop.querySelector("#tcPfEditSave");
      const errEl = backdrop.querySelector("#tcPfEditErr");
      const name = backdrop.querySelector("#tcPfEditName").value.trim();
      const username = backdrop.querySelector("#tcPfEditUser").value.trim().replace(/^@/, "");
      const bio = backdrop.querySelector("#tcPfEditBio").value.trim();

      if (!name) {
        errEl.textContent = "Name zaroori hai";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Saving...";
      errEl.textContent = "";

      try {
        const res = await apiReq("/api/auth/profile", {
          method: "PUT",
          body: { name, username, bio }
        });
        if (res.user) {
          profileUser = {
            ...profileUser,
            name: res.user.name || name,
            username: String(res.user.username || username).replace(/^@/, ""),
            bio: res.user.bio !== undefined ? res.user.bio : bio
          };
          syncSavedAccountCache(profileUser);
        }
        backdrop.remove();
        toast("Profile updated!");
        renderProfileView();
        if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      } catch (err) {
        errEl.textContent = err.message || "Update failed";
        btn.disabled = false;
        btn.textContent = "Save Changes";
      }
    };

    document.body.appendChild(backdrop);
  }

  // ===== 3. QR Code Modal =====
  function openProfileQrModal() {
    const old = document.getElementById("tcPfQrBackdrop");
    if (old) old.remove();

    const u = profileUser || { name: "User", username: "", phone: "" };
    const handle = u.username ? `@${u.username}` : u.phone || u.name;
    let seed = 11;
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
    backdrop.id = "tcPfQrBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.innerHTML = `
      <div class="tc-st-modal-card" style="text-align:center;">
        <div class="tc-st-modal-head">
          <h3>My QR Code</h3>
          <button type="button" class="tc-st-circle-btn" id="tcPfQrClose">${ICONS.close}</button>
        </div>
        <div class="tc-qr-frame">
          <svg viewBox="0 0 178 178" width="178" height="178">${cells.join("")}</svg>
        </div>
        <div style="font-size:17px;font-weight:700;margin-top:10px;">${esc(u.name)}</div>
        <div style="font-size:13.5px;color:#7bc65b;margin:4px 0 14px;">${esc(handle)}</div>
        <button type="button" class="tc-st-primary-btn" id="tcPfQrCopy">Copy Username</button>
      </div>
    `;
    backdrop.querySelector("#tcPfQrClose").onclick = () => backdrop.remove();
    backdrop.querySelector("#tcPfQrCopy").onclick = () => {
      navigator.clipboard?.writeText(handle).catch(() => {});
      toast("Copied!");
    };
    document.body.appendChild(backdrop);
  }

  // ===== 4. Add a Post Modal (Photo / Video / Text Card) =====
  function openAddPostModal() {
    const old = document.getElementById("tcAddPostBackdrop");
    if (old) old.remove();

    let selectedFile = null;
    let previewUrl = "";
    let selectedBg = POST_GRADIENTS[0];

    const backdrop = document.createElement("div");
    backdrop.id = "tcAddPostBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        backdrop.remove();
      }
    });

    backdrop.innerHTML = `
      <div class="tc-st-modal-card">
        <div class="tc-st-modal-head">
          <h3>New Profile Post</h3>
          <button type="button" class="tc-st-circle-btn" id="tcPostClose">${ICONS.close}</button>
        </div>

        <div class="tc-pf-post-preview" id="tcPostPreview" style="background:${selectedBg};">
          <div class="tc-pf-post-ph">Select a Photo/Video or write a text post</div>
        </div>

        <input type="file" id="tcPostFileInp" accept="image/*,video/*" style="display:none;" />

        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button type="button" class="tc-st-secondary-btn" id="tcPostPickBtn" style="flex:1;">🖼️ Choose Photo / Video</button>
          <button type="button" class="tc-st-danger-sm hidden" id="tcPostClearMedia">Remove</button>
        </div>

        <div class="tc-pf-bg-row" id="tcPostBgRow">
          ${POST_GRADIENTS.map(
            (g, i) => `<button type="button" class="tc-pf-bg-dot ${i === 0 ? "active" : ""}" data-bg="${esc(g)}" style="background:${g};"></button>`
          ).join("")}
        </div>

        <textarea id="tcPostCaption" class="tc-st-input tc-st-textarea" maxlength="500" placeholder="Add a caption or status text..."></textarea>
        <div class="tc-st-modal-err" id="tcPostErr"></div>
        <button type="button" class="tc-st-primary-btn" id="tcPostSubmit">Publish Post</button>
      </div>
    `;

    const previewBox = backdrop.querySelector("#tcPostPreview");
    const fileInp = backdrop.querySelector("#tcPostFileInp");
    const clearBtn = backdrop.querySelector("#tcPostClearMedia");
    const bgRow = backdrop.querySelector("#tcPostBgRow");
    const capEl = backdrop.querySelector("#tcPostCaption");
    const errEl = backdrop.querySelector("#tcPostErr");

    function updatePreview() {
      if (selectedFile && previewUrl) {
        bgRow.classList.add("hidden");
        clearBtn.classList.remove("hidden");
        if (selectedFile.type.startsWith("video/")) {
          previewBox.style.background = "#000";
          previewBox.innerHTML = `<video src="${previewUrl}" controls playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>`;
        } else {
          previewBox.style.background = "#000";
          previewBox.innerHTML = `<img src="${previewUrl}" alt="Preview" style="width:100%;height:100%;object-fit:cover;" />`;
        }
      } else {
        bgRow.classList.remove("hidden");
        clearBtn.classList.add("hidden");
        previewBox.style.background = selectedBg;
        const txt = capEl.value.trim();
        previewBox.innerHTML = txt
          ? `<div class="tc-pf-post-txt-prev">${esc(txt)}</div>`
          : `<div class="tc-pf-post-ph">Select a Photo/Video or write a text post</div>`;
      }
    }

    backdrop.querySelector("#tcPostClose").onclick = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      backdrop.remove();
    };
    backdrop.querySelector("#tcPostPickBtn").onclick = () => fileInp.click();

    fileInp.onchange = () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      selectedFile = f;
      previewUrl = URL.createObjectURL(f);
      updatePreview();
    };

    clearBtn.onclick = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      selectedFile = null;
      previewUrl = "";
      fileInp.value = "";
      updatePreview();
    };

    bgRow.addEventListener("click", (e) => {
      const dot = e.target.closest(".tc-pf-bg-dot");
      if (!dot) return;
      selectedBg = dot.dataset.bg;
      bgRow.querySelectorAll(".tc-pf-bg-dot").forEach((d) => d.classList.toggle("active", d === dot));
      updatePreview();
    });

    capEl.oninput = () => {
      if (!selectedFile) updatePreview();
    };

    backdrop.querySelector("#tcPostSubmit").onclick = async () => {
      const btn = backdrop.querySelector("#tcPostSubmit");
      const caption = capEl.value.trim();
      if (!selectedFile && !caption) {
        errEl.textContent = "Photo/video select karein ya koi text likhein";
        return;
      }

      btn.disabled = true;
      btn.textContent = selectedFile ? "Uploading media..." : "Publishing...";
      errEl.textContent = "";

      try {
        let mediaUrl = "";
        if (selectedFile) {
          const fd = new FormData();
          fd.append("file", selectedFile, selectedFile.name || "post_media");
          const up = await apiReq("/api/upload", { method: "POST", body: fd });
          mediaUrl = (up.attachment && up.attachment.src) || up.src || up.url || "";
          if (!mediaUrl) throw new Error("Media upload fail ho gaya");
        }

        await apiReq("/api/profile/posts", {
          method: "POST",
          body: { caption, mediaUrl, bg: selectedBg }
        });

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        backdrop.remove();
        postsSubTab = "active";
        toast("Post published!");
        await fetchProfileAndPosts(true);
      } catch (err) {
        errEl.textContent = err.message || "Post publish nahi ho saki";
        btn.disabled = false;
        btn.textContent = "Publish Post";
      }
    };

    document.body.appendChild(backdrop);
  }

  // ===== 5. Fullscreen Post Viewer (Archive / Unarchive / Delete) =====
  function openPostViewer(post) {
    const old = document.getElementById("tcPostViewBackdrop");
    if (old) old.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "tcPostViewBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    const mediaBlock = post.mediaUrl
      ? isVideoUrl(post.mediaUrl)
        ? `<video src="${esc(post.mediaUrl)}" controls autoplay playsinline class="tc-pf-pv-media"></video>`
        : `<img src="${esc(post.mediaUrl)}" alt="Post" class="tc-pf-pv-media" />`
      : `<div class="tc-pf-pv-textcard" style="background:${esc(post.bg)};">${esc(post.caption)}</div>`;

    backdrop.innerHTML = `
      <div class="tc-st-modal-card tc-pf-pv-card">
        <div class="tc-st-modal-head">
          <h3>${post.archived ? "Archived Post" : "Profile Post"}</h3>
          <button type="button" class="tc-st-circle-btn" id="tcPvClose">${ICONS.close}</button>
        </div>
        <div class="tc-pf-pv-stage">${mediaBlock}</div>
        ${post.mediaUrl && post.caption ? `<div class="tc-pf-pv-cap">${esc(post.caption)}</div>` : ""}
        <div class="tc-pf-pv-time">${esc(post.time || "")}</div>
        <div class="tc-pf-pv-actions">
          <button type="button" class="tc-st-secondary-btn" id="tcPvArchiveBtn" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
            ${ICONS.archive}<span>${post.archived ? "Unarchive" : "Archive"}</span>
          </button>
          <button type="button" class="tc-st-danger-sm" id="tcPvDeleteBtn" style="padding:11px 14px;display:inline-flex;align-items:center;gap:6px;">
            ${ICONS.trash}<span>Delete</span>
          </button>
        </div>
      </div>
    `;

    backdrop.querySelector("#tcPvClose").onclick = () => backdrop.remove();

    backdrop.querySelector("#tcPvArchiveBtn").onclick = async () => {
      try {
        await apiReq(`/api/profile/posts/${post.id}/archive`, {
          method: "PUT",
          body: { archived: !post.archived }
        });
        backdrop.remove();
        toast(post.archived ? "Moved to Posts" : "Moved to Archived Posts");
        await fetchProfileAndPosts(true);
      } catch (err) {
        toast(err.message || "Action failed");
      }
    };

    backdrop.querySelector("#tcPvDeleteBtn").onclick = async () => {
      try {
        await apiReq(`/api/profile/posts/${post.id}`, { method: "DELETE" });
        backdrop.remove();
        toast("Post deleted");
        await fetchProfileAndPosts(true);
      } catch (err) {
        toast(err.message || "Delete failed");
      }
    };

    document.body.appendChild(backdrop);
  }

  // ===== 6. Main Profile UI Renderer (Exact Screenshot Design) =====
  function isProfileTabActive() {
    const btn = document.querySelector('.bottom-nav-item[data-btab="profile"]');
    return Boolean(btn && btn.classList.contains("active"));
  }

  function renderProfileView() {
    const panel = document.getElementById("sidebar-tab-panel");
    if (!panel || !isProfileTabActive()) {
      document.body.classList.remove("tc-pro-profile-open");
      return;
    }

    isRenderingProfile = true;
    document.body.classList.remove("tc-pro-settings-open");
    document.body.classList.add("tc-pro-profile-open");
    panel.classList.remove("hidden", "tc-pro-settings-panel");
    panel.classList.add("tc-pro-profile-panel");

    const u = profileUser || {
      name: "Loading...",
      username: "",
      phone: "",
      bio: "",
      avatarUrl: "",
      color: "linear-gradient(135deg,#6366f1,#3b82f6)"
    };

    const avatarInner = u.avatarUrl
      ? `<img src="${esc(u.avatarUrl)}" alt="${esc(u.name)}" class="tc-pf-av-img" />`
      : `<div class="tc-pf-av-fallback" style="background:${esc(u.color)}">${esc((u.name || "U").trim()[0].toUpperCase())}</div>`;

    const visiblePosts = profilePosts.filter((p) => (postsSubTab === "archived" ? p.archived : !p.archived));

    const postsContentHtml = isLoadingData && !profilePosts.length
      ? `<div class="tc-pf-empty-sub" style="padding:26px 0;">Loading posts...</div>`
      : visiblePosts.length === 0
      ? `
        <div class="tc-pf-empty">
          <div class="tc-pf-empty-title">${postsSubTab === "archived" ? "No archived posts..." : "No posts yet..."}</div>
          <div class="tc-pf-empty-sub">${
            postsSubTab === "archived"
              ? "Archived photos and videos will appear here"
              : "Publish photos and videos to display on your profile page"
          }</div>
        </div>
      `
      : `
        <div class="tc-pf-grid">
          ${visiblePosts
            .map((post) => {
              if (post.mediaUrl) {
                if (isVideoUrl(post.mediaUrl)) {
                  return `
                    <button type="button" class="tc-pf-tile" data-post-id="${post.id}">
                      <video src="${esc(post.mediaUrl)}#t=0.1" preload="metadata" muted playsinline></video>
                      <span class="tc-pf-vid-badge">${ICONS.play}</span>
                    </button>
                  `;
                }
                return `
                  <button type="button" class="tc-pf-tile" data-post-id="${post.id}">
                    <img src="${esc(post.mediaUrl)}" alt="Post" loading="lazy" />
                  </button>
                `;
              }
              return `
                <button type="button" class="tc-pf-tile tc-pf-tile-txt" data-post-id="${post.id}" style="background:${esc(post.bg)};">
                  <span>${esc(post.caption.slice(0, 60))}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      `;

    panel.innerHTML = `
      <div class="tc-pf-root">
        <div class="tc-pf-topbar">
          <button type="button" class="tc-st-float-btn" id="tcPfQrBtn" title="QR Code">${ICONS.qr}</button>
          <button type="button" class="tc-st-float-btn" id="tcPfMoreBtn" title="More">${ICONS.dots}</button>
          <div class="tc-st-more-menu hidden" id="tcPfMoreMenu">
            <button type="button" data-pf-more="photo">📷 Set Profile Photo</button>
            ${u.avatarUrl ? `<button type="button" data-pf-more="rmphoto">🗑️ Remove Photo</button>` : ""}
            <button type="button" data-pf-more="edit">✏️ Edit Info</button>
            <button type="button" data-pf-more="post">➕ Add a Post</button>
            <button type="button" data-pf-more="settings">⚙️ Settings</button>
          </div>
        </div>

        <div class="tc-pf-hero">
          <div class="tc-pf-avatar" id="tcPfAvatarTap">${avatarInner}</div>
          <div class="tc-pf-name">${esc(u.name)}</div>
          <div class="tc-pf-status">${navigator.onLine ? "online" : "offline"}</div>
        </div>

        <div class="tc-pf-actions">
          <button type="button" class="tc-pf-act-card" id="tcPfSetPhotoBtn">
            <span class="tc-pf-act-ico">${ICONS.camPlus}</span>
            <span>Set Photo</span>
          </button>
          <button type="button" class="tc-pf-act-card" id="tcPfEditInfoBtn">
            <span class="tc-pf-act-ico">${ICONS.edit}</span>
            <span>Edit Info</span>
          </button>
          <button type="button" class="tc-pf-act-card" id="tcPfSettingsBtn">
            <span class="tc-pf-act-ico">${ICONS.gear}</span>
            <span>Settings</span>
          </button>
        </div>

        <div class="tc-pf-info-card">
          ${
            u.phone
              ? `
                <div class="tc-pf-info-row" data-copy-val="${esc(u.phone)}" data-copy-lbl="Phone number">
                  <div class="tc-pf-info-val">${esc(u.phone)}</div>
                  <div class="tc-pf-info-lbl">Mobile</div>
                </div>
              `
              : ""
          }
          ${
            u.username
              ? `
                <div class="tc-pf-info-row" data-copy-val="@${esc(u.username)}" data-copy-lbl="Username">
                  <div class="tc-pf-info-val">@${esc(u.username)}</div>
                  <div class="tc-pf-info-lbl">Username</div>
                </div>
              `
              : ""
          }
          ${
            u.bio
              ? `
                <div class="tc-pf-info-row" data-copy-val="${esc(u.bio)}" data-copy-lbl="Bio">
                  <div class="tc-pf-info-val">${esc(u.bio)}</div>
                  <div class="tc-pf-info-lbl">Bio</div>
                </div>
              `
              : ""
          }
        </div>

        <div class="tc-pf-tabs-wrap">
          <div class="tc-pf-tabs">
            <button type="button" class="tc-pf-tab ${postsSubTab === "active" ? "active" : ""}" data-pf-tab="active">Posts</button>
            <button type="button" class="tc-pf-tab ${postsSubTab === "archived" ? "active" : ""}" data-pf-tab="archived">Archived Posts</button>
          </div>
        </div>

        ${postsContentHtml}

        <div class="tc-pf-add-wrap">
          <button type="button" class="tc-pf-add-btn" id="tcPfAddPostBtn">
            ${ICONS.camera}<span>Add a post</span>
          </button>
        </div>
      </div>
    `;

    // Bindings
    panel.querySelector("#tcPfQrBtn").onclick = openProfileQrModal;

    const moreMenu = panel.querySelector("#tcPfMoreMenu");
    panel.querySelector("#tcPfMoreBtn").onclick = (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle("hidden");
    };
    moreMenu.onclick = (e) => {
      const btn = e.target.closest("[data-pf-more]");
      if (!btn) return;
      moreMenu.classList.add("hidden");
      const act = btn.dataset.pfMore;
      if (act === "photo") pickProfilePhoto();
      else if (act === "rmphoto") removeProfilePhoto();
      else if (act === "edit") openEditInfoModal();
      else if (act === "post") openAddPostModal();
      else if (act === "settings") {
        if (window.TCProSettings) window.TCProSettings.openSettings();
      }
    };

    panel.querySelector("#tcPfAvatarTap").onclick = () => {
      if (u.avatarUrl && window.TCChatEnhancements) {
        window.TCChatEnhancements.openMediaViewer("photo", u.avatarUrl, u.name);
      } else {
        pickProfilePhoto();
      }
    };

    panel.querySelector("#tcPfSetPhotoBtn").onclick = pickProfilePhoto;
    panel.querySelector("#tcPfEditInfoBtn").onclick = openEditInfoModal;
    panel.querySelector("#tcPfSettingsBtn").onclick = () => {
      if (window.TCProSettings) window.TCProSettings.openSettings();
      else document.querySelector('.bottom-nav-item[data-btab="settings"]')?.click();
    };

    panel.querySelectorAll(".tc-pf-info-row[data-copy-val]").forEach((row) => {
      row.onclick = () => {
        navigator.clipboard?.writeText(row.dataset.copyVal).catch(() => {});
        toast(`${row.dataset.copyLbl} copied`);
      };
    });

    panel.querySelectorAll("[data-pf-tab]").forEach((tbtn) => {
      tbtn.onclick = () => {
        postsSubTab = tbtn.dataset.pfTab;
        renderProfileView();
      };
    });

    panel.querySelectorAll(".tc-pf-tile[data-post-id]").forEach((tile) => {
      tile.onclick = () => {
        const post = profilePosts.find((p) => String(p.id) === String(tile.dataset.postId));
        if (post) openPostViewer(post);
      };
    });

    panel.querySelector("#tcPfAddPostBtn").onclick = openAddPostModal;

    isRenderingProfile = false;
  }

  function scheduleProfileMount() {
    setTimeout(() => {
      if (!isProfileTabActive()) {
        document.body.classList.remove("tc-pro-profile-open");
        const panel = document.getElementById("sidebar-tab-panel");
        if (panel) panel.classList.remove("tc-pro-profile-panel");
        return;
      }
      renderProfileView();
      fetchProfileAndPosts(true);
    }, 15);
  }

  document.addEventListener(
    "click",
    (e) => {
      const btab = e.target.closest(".bottom-nav-item[data-btab]");
      if (!btab) return;
      if (btab.dataset.btab === "profile") {
        scheduleProfileMount();
      } else {
        document.body.classList.remove("tc-pro-profile-open");
        const panel = document.getElementById("sidebar-tab-panel");
        if (panel) panel.classList.remove("tc-pro-profile-panel");
      }
    },
    true
  );

  // Outside click par 3-dots menu band karein
  document.addEventListener("click", () => {
    const m = document.getElementById("tcPfMoreMenu");
    if (m) m.classList.add("hidden");
  });

  async function initProProfile() {
    await fetchProfileAndPosts(true);

    // Agar bottomNav.js ka async load panel overwrite kare to Pro Profile foran wapas lagayein
    const panel = document.getElementById("sidebar-tab-panel");
    if (panel) {
      const obs = new MutationObserver(() => {
        if (isRenderingProfile) return;
        if (isProfileTabActive() && !panel.querySelector(".tc-pf-root")) {
          renderProfileView();
        }
      });
      obs.observe(panel, { childList: true });
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initProProfile);
  } else {
    initProProfile();
  }

  window.TCProProfile = {
    refresh: () => fetchProfileAndPosts(true),
    openAddPost: openAddPostModal
  };
})();