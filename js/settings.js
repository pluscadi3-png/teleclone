/* =========================================================
   TELECLONE FULL SETTINGS, APPEARANCE, WALLET & LOCK (MODULE 4)
   ========================================================= */

(function () {
  const $ = (id) => document.getElementById(id);

  const ACCENT_PRESETS = [
    { name: "Telegram Purple", color: "#8774e1", hover: "#7662d6" },
    { name: "Classic Blue", color: "#3390ec", hover: "#287dd1" },
    { name: "Emerald Green", color: "#00b894", hover: "#009d7e" },
    { name: "Coral Red", color: "#ff5e57", hover: "#e04841" },
    { name: "Sunset Orange", color: "#f39c12", hover: "#d68910" },
    { name: "Neon Pink", color: "#e84393", hover: "#cc337e" }
  ];

  const WALLPAPER_PRESETS = [
    { id: "wp-default", label: "Default", bg: "#141414" },
    { id: "wp-midnight", label: "Midnight", bg: "linear-gradient(155deg, #0f172a, #1e1b4b)" },
    { id: "wp-emerald", label: "Emerald", bg: "linear-gradient(145deg, #064e3b, #0f2922)" },
    { id: "wp-sunset", label: "Sunset", bg: "linear-gradient(145deg, #4c1d95, #9d174d)" },
    { id: "wp-ocean", label: "Ocean", bg: "linear-gradient(145deg, #0c4a6e, #164e63)" },
    { id: "wp-classic", label: "Classic", bg: "linear-gradient(145deg, #8babd8, #6d94b8)" }
  ];

  const els = {
    overlay: $("settings-overlay"),
    backBtn: $("settings-back-btn"),
    title: $("settings-title"),
    lockNowBtn: $("lock-now-btn"),
    closeBtn: $("settings-close-btn"),
    body: $("settings-body"),
    workspace: $("chat-workspace"),
    // Passcode Lock Screen
    lockScreen: $("passcode-lock-screen"),
    lockSubtitle: $("passcode-subtitle"),
    lockDots: $("passcode-dots"),
    lockError: $("passcode-error"),
    lockKeypad: $("passcode-keypad")
  };

  let currentPage = "home";
  let enteredPin = "";

  function esc(str) {
    return window.App ? window.App.escapeHtml(str) : String(str || "");
  }

  function toast(msg) {
    if (window.App) window.App.showToast(msg);
  }

  // ==================== APPLY LIVE VISUAL SETTINGS ====================
  function applyVisualSettings() {
    const s = Store.getSettings();
    const root = document.documentElement;
    const preset = ACCENT_PRESETS.find((p) => p.color === s.accentColor) || ACCENT_PRESETS[0];

    root.style.setProperty("--chat-font-size", `${s.fontSize}px`);
    root.style.setProperty("--bubble-radius", `${s.bubbleRadius}px`);
    root.style.setProperty("--accent-color", preset.color);
    root.style.setProperty("--accent-hover", preset.hover);
    root.style.setProperty("--badge-bg", preset.color);
    root.style.setProperty("--bg-active-chat", preset.color);

    if (els.workspace) {
      WALLPAPER_PRESETS.forEach((wp) => els.workspace.classList.remove(wp.id));
      els.workspace.classList.add(s.wallpaper || "wp-default");
    }

    if (els.lockNowBtn) {
      els.lockNowBtn.classList.toggle("hidden", !s.passcodeEnabled);
    }
  }

  // ==================== SETTINGS NAVIGATION ====================
  function openSettings(page = "home") {
    currentPage = page;
    els.overlay.classList.remove("hidden");
    renderPage();
  }

  function closeSettings() {
    els.overlay.classList.add("hidden");
  }

  function navigateTo(page) {
    currentPage = page;
    renderPage();
  }

  function renderPage() {
    const titles = {
      home: "Settings",
      profile: "Edit Profile",
      appearance: "Chat Settings",
      privacy: "Privacy and Security",
      notifications: "Notifications & Sounds",
      storage: "Data and Storage",
      folders: "Chat Folders",
      devices: "Devices",
      power: "Power Saving",
      wallet: "TON Wallet & Stars"
    };

    els.title.textContent = titles[currentPage] || "Settings";
    els.backBtn.classList.toggle("hidden", currentPage === "home");
    els.body.scrollTop = 0;

    switch (currentPage) {
      case "profile": renderProfilePage(); break;
      case "appearance": renderAppearancePage(); break;
      case "privacy": renderPrivacyPage(); break;
      case "notifications": renderNotificationsPage(); break;
      case "storage": renderStoragePage(); break;
      case "folders": renderFoldersPage(); break;
      case "devices": renderDevicesPage(); break;
      case "power": renderPowerPage(); break;
      case "wallet": renderWalletPage(); break;
      default: renderHomePage(); break;
    }
  }

  // ==================== 1. SETTINGS HOME ====================
  function renderHomePage() {
    const acc = Store.getActiveAccount();
    const s = Store.getSettings();
    const totalCache = s.storage.photosMB + s.storage.videosMB + s.storage.filesMB;
    const isDark = Store.getState().theme === "dark";

    els.body.innerHTML = `
      <div class="settings-profile-card" data-nav="profile">
        <div class="avatar avatar-lg" style="background:${acc.color}">${esc(acc.initials)}</div>
        <div class="settings-profile-meta">
          <div class="settings-profile-name">${esc(acc.name)}</div>
          <div class="settings-profile-sub">${esc(acc.phone)} • ${esc(acc.username)}</div>
        </div>
        <span class="settings-row-arrow">✏️</span>
      </div>

      <div class="settings-group">
        <button class="settings-row" data-nav="appearance">
          <div class="settings-row-icon">🎨</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Chat Settings</div>
            <div class="settings-row-sub">Themes, Wallpapers, Font (${s.fontSize}px), Corners</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="privacy">
          <div class="settings-row-icon">🔒</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Privacy and Security</div>
            <div class="settings-row-sub">Passcode (${s.passcodeEnabled ? "On" : "Off"}), 2FA (${s.twoFactorEnabled ? "On" : "Off"})</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="notifications">
          <div class="settings-row-icon">🔔</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Notifications and Sounds</div>
            <div class="settings-row-sub">Private chats, Groups, Channels, Previews</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="storage">
          <div class="settings-row-icon">💾</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Data and Storage</div>
            <div class="settings-row-sub">Cache: ${totalCache} MB • Proxy: ${s.storage.proxyEnabled ? "On" : "Off"}</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="folders">
          <div class="settings-row-icon">📁</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Chat Folders</div>
            <div class="settings-row-sub">${Store.getState().folders.length} active tabs</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="devices">
          <div class="settings-row-icon">💻</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Devices</div>
            <div class="settings-row-sub">${s.devices.length} active sessions</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <button class="settings-row" data-nav="power">
          <div class="settings-row-icon">🔋</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Power Saving</div>
            <div class="settings-row-sub">Threshold: ${s.powerSavingThreshold}% battery</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>
      </div>

      <div class="settings-group">
        <button class="settings-row" data-nav="wallet">
          <div class="settings-row-icon">💎</div>
          <div class="settings-row-body">
            <div class="settings-row-title">TON Wallet & Stars</div>
            <div class="settings-row-sub">${s.wallet.tonBalance} TON • ${s.wallet.starsBalance} ⭐</div>
          </div>
          <span class="settings-row-arrow">›</span>
        </button>

        <div class="settings-row">
          <div class="settings-row-icon">🌙</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Night Mode</div>
            <div class="settings-row-sub">Switch between Dark and Light UI</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="settings-dark-toggle" ${isDark ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <button id="reset-demo-btn" class="danger-btn">♻️ Reset All Demo Data</button>
    `;

    $("settings-dark-toggle").addEventListener("change", (e) => {
      const next = e.target.checked ? "dark" : "light";
      Store.setTheme(next);
      if (window.App) window.App.applyTheme(next);
      toast(next === "dark" ? "Night Mode On" : "Day Mode On");
    });

    $("reset-demo-btn").addEventListener("click", () => {
      if (!confirm("Reset all chats, custom bots, and settings back to default demo state?")) return;
      Store.resetDemo();
      Store.ensureSocialData();
      Store.ensureSettingsData();
      applyVisualSettings();
      if (window.App) {
        window.App.applyTheme(Store.getState().theme);
        window.App.renderAll();
      }
      closeSettings();
      toast("Demo data reset!");
    });
  }

  // ==================== 2. EDIT PROFILE ====================
  function renderProfilePage() {
    const acc = Store.getActiveAccount();
    els.body.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0;">
        <div class="avatar info-hero-avatar" style="background:${acc.color}">${esc(acc.initials)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input id="prof-name" class="form-input" type="text" value="${esc(acc.name)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input id="prof-user" class="form-input" type="text" value="${esc(acc.username)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input id="prof-phone" class="form-input" type="text" value="${esc(acc.phone)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea id="prof-bio" class="form-textarea" rows="3">${esc(acc.bio || "")}</textarea>
      </div>
      <button id="save-profile-btn" class="primary-btn">Save Profile Changes</button>
    `;

    $("save-profile-btn").addEventListener("click", () => {
      Store.updateActiveProfile({
        name: $("prof-name").value,
        username: $("prof-user").value,
        phone: $("prof-phone").value,
        bio: $("prof-bio").value
      });
      if (window.App) window.App.renderAll();
      toast("Profile updated! ✓");
      navigateTo("home");
    });
  }

  // ==================== 3. CHAT SETTINGS (LIVE APPEARANCE) ====================
  function renderAppearancePage() {
    const s = Store.getSettings();
    els.body.innerHTML = `
      <div class="live-preview-box">
        <div class="preview-bubble in">Salam! Font size, accent color aur bubble corners live change ho rahe hain 🎨</div>
        <div class="preview-bubble out">Zabardast! Bilkul asli Telegram settings jaisa feel hai ⚡</div>
      </div>

      <div class="settings-group-title">Text & Bubbles</div>
      <div class="settings-group">
        <div class="range-block">
          <div class="range-header">
            <span>Message Text Size</span>
            <span id="font-size-val">${s.fontSize}px</span>
          </div>
          <input id="font-size-slider" class="range-input" type="range" min="12" max="20" value="${s.fontSize}" />
        </div>
        <div class="range-block">
          <div class="range-header">
            <span>Message Bubble Corners</span>
            <span id="bubble-rad-val">${s.bubbleRadius}px</span>
          </div>
          <input id="bubble-rad-slider" class="range-input" type="range" min="4" max="22" value="${s.bubbleRadius}" />
        </div>
      </div>

      <div class="settings-group-title">Accent Color</div>
      <div class="settings-group">
        <div id="accent-swatches" class="swatch-grid">
          ${ACCENT_PRESETS.map(
            (p) => `
            <button class="color-swatch ${s.accentColor === p.color ? "active" : ""}"
              style="background:${p.color}" data-accent="${p.color}" title="${p.name}"></button>
          `
          ).join("")}
        </div>
      </div>

      <div class="settings-group-title">Chat Wallpaper</div>
      <div class="settings-group">
        <div id="wallpaper-grid" class="wallpaper-grid">
          ${WALLPAPER_PRESETS.map(
            (wp) => `
            <button class="wallpaper-swatch ${s.wallpaper === wp.id ? "active" : ""}"
              style="background:${wp.bg}" data-wp="${wp.id}">${wp.label}</button>
          `
          ).join("")}
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-body">
            <div class="settings-row-title">Send by Enter</div>
            <div class="settings-row-sub">Press Enter to send message, Shift+Enter for new line</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="send-enter-toggle" ${s.sendByEnter ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    `;

    $("font-size-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      $("font-size-val").textContent = `${val}px`;
      Store.updateSettings({ fontSize: val });
      applyVisualSettings();
    });

    $("bubble-rad-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      $("bubble-rad-val").textContent = `${val}px`;
      Store.updateSettings({ bubbleRadius: val });
      applyVisualSettings();
    });

    $("accent-swatches").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-accent]");
      if (!btn) return;
      Store.updateSettings({ accentColor: btn.dataset.accent });
      applyVisualSettings();
      renderAppearancePage();
    });

    $("wallpaper-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-wp]");
      if (!btn) return;
      Store.updateSettings({ wallpaper: btn.dataset.wp });
      applyVisualSettings();
      renderAppearancePage();
      toast("Chat wallpaper updated!");
    });

    $("send-enter-toggle").addEventListener("change", (e) => {
      Store.updateSettings({ sendByEnter: e.target.checked });
      toast(e.target.checked ? "Send by Enter enabled" : "Send by Enter disabled");
    });
  }

  // ==================== 4. PRIVACY & SECURITY ====================
  function renderPrivacyPage() {
    const s = Store.getSettings();
    const p = s.privacy;
    const opts = ["Everybody", "My Contacts", "Nobody"];

    const selectHtml = (key, current) => `
      <select class="form-select" data-priv-key="${key}" style="width:auto;padding:5px 8px;font-size:12.5px;">
        ${opts.map((o) => `<option value="${o}" ${current === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>
    `;

    els.body.innerHTML = `
      <div class="settings-group-title">Security</div>
      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-icon">🔑</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Passcode Lock (4-Digit PIN)</div>
            <div class="settings-row-sub">${s.passcodeEnabled ? "Active — click 🔒 to lock app" : "Protect app with a PIN"}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="passcode-toggle" ${s.passcodeEnabled ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>

        ${
          s.passcodeEnabled
            ? `<button class="settings-row" id="trigger-lock-row">
                 <div class="settings-row-icon">🔒</div>
                 <div class="settings-row-body">
                   <div class="settings-row-title">Lock TeleClone Now</div>
                   <div class="settings-row-sub">Test your 4-digit passcode screen immediately</div>
                 </div>
                 <span class="settings-row-value">Lock</span>
               </button>`
            : ""
        }

        <div class="settings-row">
          <div class="settings-row-icon">🛡️</div>
          <div class="settings-row-body">
            <div class="settings-row-title">Two-Step Verification (2FA)</div>
            <div class="settings-row-sub">${s.twoFactorEnabled ? `Enabled • Hint: ${esc(s.twoFactorHint || "Set")}` : "Extra Cloud Password on login"}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="twofa-toggle" ${s.twoFactorEnabled ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group-title">Privacy</div>
      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Phone Number</div></div>
          ${selectHtml("phoneNumber", p.phoneNumber)}
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Last Seen & Online</div></div>
          ${selectHtml("lastSeen", p.lastSeen)}
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Profile Photos</div></div>
          ${selectHtml("profilePhoto", p.profilePhoto)}
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Forwarded Messages</div></div>
          ${selectHtml("forwardedMessages", p.forwardedMessages)}
        </div>
        <div class="settings-row">
          <div class="settings-row-body">
            <div class="settings-row-title">Calls (Peer-to-Peer)</div>
            <div class="settings-row-sub">Set to Nobody to hide your IP address</div>
          </div>
          ${selectHtml("callsP2P", p.callsP2P)}
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Groups & Channels Invites</div></div>
          ${selectHtml("groupsInvite", p.groupsInvite)}
        </div>
      </div>

      <div class="settings-group-title">Delete My Account</div>
      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-body">
            <div class="settings-row-title">If Away For</div>
            <div class="settings-row-sub">Auto self-destruct inactive account</div>
          </div>
          <select class="form-select" data-priv-key="selfDestruct" style="width:auto;padding:5px 8px;font-size:12.5px;">
            ${["1 month", "3 months", "6 months", "12 months", "24 months"]
              .map((m) => `<option value="${m}" ${p.selfDestruct === m ? "selected" : ""}>${m}</option>`)
              .join("")}
          </select>
        </div>
      </div>
    `;

    $("passcode-toggle").addEventListener("change", (e) => {
      if (e.target.checked) {
        const pin = prompt("Set a 4-digit PIN passcode (e.g. 1234):", "1234");
        if (!pin || !/^\d{4}$/.test(pin.trim())) {
          e.target.checked = false;
          toast("Passcode must be exactly 4 digits");
          return;
        }
        Store.updateSettings({ passcodeEnabled: true, passcodePin: pin.trim() });
        applyVisualSettings();
        toast("Passcode Lock enabled! 🔒");
        renderPrivacyPage();
      } else {
        Store.updateSettings({ passcodeEnabled: false, passcodePin: "", appLocked: false });
        applyVisualSettings();
        toast("Passcode Lock disabled");
        renderPrivacyPage();
      }
    });

    const lockRow = $("trigger-lock-row");
    if (lockRow) {
      lockRow.addEventListener("click", () => lockApp());
    }

    $("twofa-toggle").addEventListener("change", (e) => {
      if (e.target.checked) {
        const pass = prompt("Enter a Cloud Password for 2FA:");
        if (!pass || pass.trim().length < 4) {
          e.target.checked = false;
          toast("Password must be at least 4 characters");
          return;
        }
        const hint = prompt("Optional password hint:", "My secret phrase") || "Configured";
        Store.updateSettings({ twoFactorEnabled: true, twoFactorHint: hint.trim() });
        toast("Two-Step Verification enabled 🛡️");
        renderPrivacyPage();
      } else {
        Store.updateSettings({ twoFactorEnabled: false, twoFactorHint: "" });
        toast("Two-Step Verification disabled");
        renderPrivacyPage();
      }
    });

    els.body.querySelectorAll("[data-priv-key]").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        Store.updateNestedSetting("privacy", sel.dataset.privKey, e.target.value);
        toast("Privacy setting saved");
      });
    });
  }

  // ==================== 5. NOTIFICATIONS ====================
  function renderNotificationsPage() {
    const n = Store.getSettings().notifications;
    const rows = [
      { key: "privateChats", title: "Private Chats", sub: "Alert for direct personal messages" },
      { key: "groups", title: "Groups", sub: "Alert for group messages & mentions" },
      { key: "channels", title: "Channels", sub: "Broadcast notifications from channels" },
      { key: "inAppSounds", title: "In-App Sounds", sub: "Play sound while chatting" },
      { key: "showPreview", title: "Message Preview", sub: "Show message text inside notifications" }
    ];

    els.body.innerHTML = `
      <div class="settings-group">
        ${rows
          .map(
            (r) => `
          <div class="settings-row">
            <div class="settings-row-body">
              <div class="settings-row-title">${r.title}</div>
              <div class="settings-row-sub">${r.sub}</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-notif-key="${r.key}" ${n[r.key] ? "checked" : ""} />
              <span class="switch-slider"></span>
            </label>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    els.body.querySelectorAll("[data-notif-key]").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        Store.updateNestedSetting("notifications", chk.dataset.notifKey, e.target.checked);
        toast("Notification preference updated");
      });
    });
  }

  // ==================== 6. DATA & STORAGE ====================
  function renderStoragePage() {
    const st = Store.getSettings().storage;
    const total = st.photosMB + st.videosMB + st.filesMB;
    const pPct = total ? (st.photosMB / total) * 100 : 0;
    const vPct = total ? (st.videosMB / total) * 100 : 0;
    const fPct = total ? (st.filesMB / total) * 100 : 0;

    els.body.innerHTML = `
      <div class="settings-group" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-size:15px;font-weight:700;">Local Cache Usage</div>
          <div style="font-size:18px;font-weight:800;color:var(--accent-color);">${total} MB</div>
        </div>
        <div class="storage-bar-track">
          <div class="storage-seg-photos" style="width:${pPct}%"></div>
          <div class="storage-seg-videos" style="width:${vPct}%"></div>
          <div class="storage-seg-files" style="width:${fPct}%"></div>
        </div>
        <div class="storage-legend">
          <span>🔵 Photos: ${st.photosMB} MB</span>
          <span>🟣 Videos: ${st.videosMB} MB</span>
          <span>🟢 Files: ${st.filesMB} MB</span>
        </div>
        <button id="clear-cache-btn" class="primary-btn" style="margin-top:14px;" ${total === 0 ? "disabled" : ""}>
          ${total === 0 ? "✓ Cache is Clean" : `🧹 Clear Cache (${total} MB)`}
        </button>
      </div>

      <div class="settings-group-title">Auto-Download & Limits</div>
      <div class="settings-group">
        <div class="range-block">
          <div class="range-header">
            <span>Maximum Cache Size</span>
            <span id="max-cache-val">${st.maxCacheGB} GB</span>
          </div>
          <input id="max-cache-slider" class="range-input" type="range" min="1" max="32" value="${st.maxCacheGB}" />
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Auto-Download on Wi-Fi</div></div>
          <label class="switch">
            <input type="checkbox" id="dl-wifi-toggle" ${st.autoDownloadWifi ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-body"><div class="settings-row-title">Auto-Download on Mobile Data</div></div>
          <label class="switch">
            <input type="checkbox" id="dl-mob-toggle" ${st.autoDownloadMobile ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group-title">Connection Proxy (MTProto / SOCKS5)</div>
      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-body">
            <div class="settings-row-title">Use Proxy Server</div>
            <div class="settings-row-sub">${esc(st.proxyServer)}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="proxy-toggle" ${st.proxyEnabled ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    `;

    $("clear-cache-btn").addEventListener("click", () => {
      const freed = Store.clearCacheStorage();
      toast(`Freed ${freed} MB! Cloud messages remain safe.`);
      renderStoragePage();
    });

    $("max-cache-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      $("max-cache-val").textContent = `${val} GB`;
      Store.updateNestedSetting("storage", "maxCacheGB", val);
    });

    $("dl-wifi-toggle").addEventListener("change", (e) => {
      Store.updateNestedSetting("storage", "autoDownloadWifi", e.target.checked);
    });

    $("dl-mob-toggle").addEventListener("change", (e) => {
      Store.updateNestedSetting("storage", "autoDownloadMobile", e.target.checked);
    });

    $("proxy-toggle").addEventListener("change", (e) => {
      Store.updateNestedSetting("storage", "proxyEnabled", e.target.checked);
      toast(e.target.checked ? "MTProto Proxy connected 🔌" : "Proxy disconnected");
    });
  }

  // ==================== 7. CHAT FOLDERS ====================
  function renderFoldersPage() {
    const folders = Store.getState().folders;
    els.body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);">
        Create custom tabs for your main chat list. Changes appear immediately on the top bar.
      </div>
      <div class="settings-group">
        ${folders
          .map(
            (f) => `
          <div class="settings-row">
            <div class="settings-row-icon">📁</div>
            <div class="settings-row-body">
              <div class="settings-row-title">${esc(f.label)}</div>
              <div class="settings-row-sub">${f.custom ? "Custom Folder" : "System Folder"}</div>
            </div>
            ${
              f.custom
                ? `<button class="icon-btn" data-del-folder="${esc(f.id)}" title="Delete Folder" style="color:var(--danger-color);">🗑️</button>`
                : '<span class="settings-row-sub">Default</span>'
            }
          </div>
        `
          )
          .join("")}
      </div>

      <div style="display:flex;gap:8px;">
        <input id="new-folder-input" class="form-input" type="text" placeholder="New folder name (e.g. Work, VIP)" />
        <button id="add-folder-btn" class="primary-btn" style="width:auto;padding:0 18px;">Add</button>
      </div>
    `;

    $("add-folder-btn").addEventListener("click", () => {
      const val = $("new-folder-input").value.trim();
      if (!val) return toast("Enter a folder name");
      Store.addCustomFolder(val);
      if (window.App) window.App.renderAll();
      renderFoldersPage();
      toast(`Folder "${val}" created!`);
    });

    els.body.querySelectorAll("[data-del-folder]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Store.deleteCustomFolder(btn.dataset.delFolder);
        if (window.App) window.App.renderAll();
        renderFoldersPage();
        toast("Folder removed");
      });
    });
  }

  // ==================== 8. DEVICES ====================
  function renderDevicesPage() {
    const devices = Store.getSettings().devices;
    els.body.innerHTML = `
      <button id="link-desktop-btn" class="primary-btn">📷 Link Desktop Device (QR Login)</button>
      <div class="settings-group-title">Active Sessions (${devices.length})</div>
      <div class="settings-group">
        ${devices
          .map(
            (d) => `
          <div class="settings-row">
            <div class="settings-row-icon">${d.active ? "🟢" : "💻"}</div>
            <div class="settings-row-body">
              <div class="settings-row-title">${esc(d.name)}</div>
              <div class="settings-row-sub">${esc(d.platform)} • ${esc(d.location)} • ${esc(d.time)}</div>
            </div>
            ${
              d.active
                ? '<span class="settings-row-value">Current</span>'
                : `<button class="secondary-btn" data-term-dev="${esc(d.id)}" style="width:auto;padding:5px 10px;color:var(--danger-color);">Terminate</button>`
            }
          </div>
        `
          )
          .join("")}
      </div>
    `;

    $("link-desktop-btn").addEventListener("click", () => {
      toast("QR Scanner ready — Phase 2 backend will issue WebSocket session tokens");
    });

    els.body.querySelectorAll("[data-term-dev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Store.terminateDevice(btn.dataset.termDev);
        renderDevicesPage();
        toast("Session terminated!");
      });
    });
  }

  // ==================== 9. POWER SAVING ====================
  function renderPowerPage() {
    const s = Store.getSettings();
    els.body.innerHTML = `
      <div class="settings-group">
        <div class="range-block">
          <div class="range-header">
            <span>Auto Power Saving Below</span>
            <span id="power-val">${s.powerSavingThreshold}%</span>
          </div>
          <input id="power-slider" class="range-input" type="range" min="0" max="100" step="5" value="${s.powerSavingThreshold}" />
        </div>
        <div class="settings-row">
          <div class="settings-row-body">
            <div class="settings-row-title">Disable Smooth Animations</div>
            <div class="settings-row-sub">Reduce GPU & battery usage on older devices</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="reduce-anim-toggle" ${s.reduceAnimations ? "checked" : ""} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    `;

    $("power-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      $("power-val").textContent = `${val}%`;
      Store.updateSettings({ powerSavingThreshold: val });
    });

    $("reduce-anim-toggle").addEventListener("change", (e) => {
      Store.updateSettings({ reduceAnimations: e.target.checked });
      toast(e.target.checked ? "Animations reduced" : "Full animations enabled");
    });
  }

  // ==================== 10. TON WALLET & STARS ====================
  function renderWalletPage() {
    const w = Store.getSettings().wallet;
    els.body.innerHTML = `
      <div class="wallet-hero">
        <div class="wallet-label">Total TON Balance</div>
        <div class="wallet-balance">${w.tonBalance} TON</div>
        <div class="wallet-sub">⭐ ${w.starsBalance} TeleClone Stars</div>
        <div class="wallet-actions">
          <button id="wallet-send-btn" class="wallet-action-btn">↗ Send</button>
          <button id="wallet-recv-btn" class="wallet-action-btn">↙ Receive</button>
          <button id="wallet-topup-btn" class="wallet-action-btn">➕ +10 TON</button>
        </div>
      </div>

      <div class="settings-group-title">Recent Activity</div>
      <div class="settings-group">
        ${w.transactions
          .map(
            (tx) => `
          <div class="settings-row">
            <div class="settings-row-icon">${tx.positive ? "↙" : "↗"}</div>
            <div class="settings-row-body">
              <div class="settings-row-title">${esc(tx.title)}</div>
              <div class="settings-row-sub">${esc(tx.sub)} • ${esc(tx.time)}</div>
            </div>
            <span class="settings-row-value" style="color:${tx.positive ? "var(--online-dot)" : "var(--danger-color)"};">
              ${esc(tx.amount)}
            </span>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    $("wallet-recv-btn").addEventListener("click", () => {
      navigator.clipboard?.writeText(w.address).catch(() => {});
      toast("TON Wallet address copied! 📋");
    });

    $("wallet-topup-btn").addEventListener("click", () => {
      Store.walletTransaction({ title: "Demo Faucet Top-Up", sub: "Testnet Deposit", deltaTon: 10 });
      renderWalletPage();
      toast("+10 TON added to wallet! 💎");
    });

    $("wallet-send-btn").addEventListener("click", () => {
      const to = prompt("Recipient @username or TON address:", "@hamza_k");
      if (!to) return;
      const amtStr = prompt("Amount in TON:", "2.5");
      const amt = parseFloat(amtStr);
      if (isNaN(amt) || amt <= 0) return toast("Invalid amount");
      const ok = Store.walletTransaction({ title: "Sent TON", sub: `To ${to.trim()}`, deltaTon: -amt });
      if (!ok) return toast("Insufficient TON balance!");
      renderWalletPage();
      toast(`Sent ${amt} TON to ${to.trim()}`);
    });
  }

  // ==================== PASSCODE LOCK SCREEN ENGINE ====================
  function updatePinDots() {
    const dots = els.lockDots.querySelectorAll(".pin-dot");
    dots.forEach((d, idx) => d.classList.toggle("filled", idx < enteredPin.length));
  }

  function lockApp() {
    const s = Store.getSettings();
    if (!s.passcodeEnabled || !s.passcodePin) {
      toast("Enable Passcode Lock in Privacy settings first");
      return;
    }
    Store.updateSettings({ appLocked: true });
    enteredPin = "";
    els.lockError.textContent = "";
    updatePinDots();
    closeSettings();
    els.lockScreen.classList.remove("hidden");
  }

  function handlePinKey(key) {
    if (key === "clear") {
      enteredPin = "";
      els.lockError.textContent = "";
      updatePinDots();
      return;
    }
    if (key === "back") {
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
      return;
    }
    if (enteredPin.length >= 4) return;

    enteredPin += key;
    els.lockError.textContent = "";
    updatePinDots();

    if (enteredPin.length === 4) {
      const correctPin = Store.getSettings().passcodePin;
      if (enteredPin === correctPin) {
        Store.updateSettings({ appLocked: false });
        els.lockScreen.classList.add("hidden");
        enteredPin = "";
        updatePinDots();
        toast("Unlocked ✓");
      } else {
        els.lockError.textContent = "Incorrect PIN. Try again.";
        setTimeout(() => {
          enteredPin = "";
          updatePinDots();
        }, 350);
      }
    }
  }

  // ==================== EVENT BINDINGS ====================
  function bindEvents() {
    els.closeBtn.addEventListener("click", closeSettings);
    els.backBtn.addEventListener("click", () => navigateTo("home"));
    els.lockNowBtn.addEventListener("click", lockApp);

    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) closeSettings();
    });

    els.body.addEventListener("click", (e) => {
      const navTarget = e.target.closest("[data-nav]");
      if (navTarget) {
        navigateTo(navTarget.dataset.nav);
      }
    });

    els.lockKeypad.addEventListener("click", (e) => {
      const btn = e.target.closest(".pin-key");
      if (!btn) return;
      handlePinKey(btn.dataset.pin);
    });

    document.addEventListener("keydown", (e) => {
      if (!els.lockScreen.classList.contains("hidden")) {
        if (/^\d$/.test(e.key)) handlePinKey(e.key);
        else if (e.key === "Backspace") handlePinKey("back");
        return;
      }
      if (e.key === "Escape" && !els.overlay.classList.contains("hidden")) {
        closeSettings();
      }
    });
  }

  // ==================== PUBLIC API & INIT ====================
  window.SettingsUI = {
    openSettings,
    applyVisualSettings,
    lockApp,
    handleAction(action) {
      if (action === "settings") { openSettings("home"); return true; }
      if (action === "wallet") { openSettings("wallet"); return true; }
      return false;
    }
  };

  Store.ensureSettingsData();
  applyVisualSettings();
  bindEvents();

  // Agar app locked chhori gayi thi to refresh par bhi lock screen dikhao
  if (Store.getSettings().passcodeEnabled && Store.getSettings().appLocked) {
    els.lockScreen.classList.remove("hidden");
  }
})();