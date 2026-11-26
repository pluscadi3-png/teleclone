(() => {
  "use strict";

  const MAX_ACCOUNTS = 3;
  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const PREFS_KEY = "tc_user_prefs_v1";
  const PASSCODE_KEY = "tc_passcode_hash_v1";
  const WALLPAPER_IMG_KEY = "tc_custom_wallpaper_img";

  const DEFAULT_PREFS = {
    theme: "oled",
    wallpaper: "default",
    fontSize: 15,
    animations: true,
    enterToSend: true,
    phonePrivacy: "everybody",
    lastSeen: "everybody",
    profilePhotoPrivacy: "everybody",
    forwardLinkPrivacy: "everybody",
    notifSound: true,
    notifVibrate: true,
    notifTone: "chime",
    notifPreview: true,
    notifBadges: true,
    autoDownloadPhotos: true,
    autoDownloadVideos: false,
    autoDownloadVoice: true,
    powerSaving: false,
    hiddenFolders: []
  };

  const WALLPAPERS = [
    { id: "default", label: "Default", css: "none" },
    { id: "midnight", label: "Midnight", css: "radial-gradient(circle at 20% 20%, #1e1b4b 0%, #0b0c12 65%, #05060a 100%)" },
    { id: "ocean", label: "Deep Ocean", css: "linear-gradient(160deg, #0b192c 0%, #0d2b45 50%, #09131f 100%)" },
    { id: "forest", label: "Forest", css: "linear-gradient(160deg, #0b1f17 0%, #133827 52%, #07120d 100%)" },
    { id: "nebula", label: "Purple Glow", css: "linear-gradient(155deg, #24103a 0%, #14122b 52%, #090912 100%)" },
    { id: "sunset", label: "Warm Dusk", css: "linear-gradient(160deg, #2c1522 0%, #1d1527 52%, #0e0c14 100%)" }
  ];

  const ICONS = {
    qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7.5"/><line x1="20" y1="20" x2="16.4" y2="16.4"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.6"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12zm0 2c-3.8 0-7.5 1.9-7.5 4.7V20h15v-1.3c0-2.8-3.7-4.7-7.5-4.7z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3v3l4.2-3H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM7 10h10v1.8H7V10zm0 3.5h7v1.8H7v-1.8z"/></svg>`,
    key: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10A6 6 0 1 0 7 18a5.96 5.96 0 0 0 5.65-4H16v3h2v-3h2v-4h-7.35zM7 14a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
    pie: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 2v9h9a9 9 0 1 1-9-9zm2 0a9 9 0 0 1 9 9h-9V2z"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
  };

  let currentUser = null;
  let activeSubPage = null; // null | "account" | "chat" | "privacy" | "notifications" | "storage" | "folders" | "power"
  let searchMode = false;
  let searchQuery = "";
  let isRenderingSettings = false;
  let audioCtx = null;

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
    const key = detectJwtKey();
    return localStorage.getItem(key) || "";
  }

  function setActiveToken(token) {
    const key = detectJwtKey();
    if (token) localStorage.setItem(key, token);
    else localStorage.removeItem(key);
  }

  async function apiReq(url, opts = {}) {
    const token = opts.token !== undefined ? opts.token : getActiveToken();
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
    if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status})`);
    return data;
  }

  function getPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { ...DEFAULT_PREFS, ...raw };
    } catch (_) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(patch) {
    const next = { ...getPrefs(), ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    applyPreferences(next);
    return next;
  }

  // ===== 1. Multi-Account Storage (Max 3 Accounts) =====
  function getSavedAccounts() {
    try {
      const arr = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
      return Array.isArray(arr) ? arr.slice(0, MAX_ACCOUNTS) : [];
    } catch (_) {
      return [];
    }
  }

  function setSavedAccounts(list) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  }

  function upsertSavedAccount(userObj, token) {
    if (!userObj || !token) return getSavedAccounts();
    const list = getSavedAccounts();
    const uid = String(userObj.id || userObj.user_id || "");
    const phone = String(userObj.phone || "");
    const entry = {
      id: uid,
      name: userObj.name || userObj.fullName || userObj.username || "User",
      username: String(userObj.username || "").replace(/^@/, ""),
      phone,
      bio: userObj.bio || "",
      avatarUrl: userObj.avatarUrl || userObj.avatar_url || "",
      color: userObj.avatarColor || userObj.avatar_color || userObj.color || "linear-gradient(135deg,#f59e0b,#ea580c)",
      token
    };

    const idx = list.findIndex(
      (a) => (uid && String(a.id) === uid) || (phone && a.phone === phone) || a.token === token
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry };
    } else if (list.length < MAX_ACCOUNTS) {
      list.push(entry);
    } else {
      throw new Error(`Maximum ${MAX_ACCOUNTS} accounts login kiye ja sakte hain`);
    }
    setSavedAccounts(list);
    return list;
  }

  async function clearApiOfflineCache() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
      }
      if ("caches" in window) {
        await caches.delete("teleclone-api-v1");
      }
    } catch (_) {}
  }

  async function switchToAccount(account) {
    if (!account || !account.token) return;
    toast(`Switching to ${account.name}...`);
    await clearApiOfflineCache();
    setActiveToken(account.token);
    setTimeout(() => window.location.reload(), 160);
  }

  async function removeOrLogoutAccount(targetId, isActive) {
    const list = getSavedAccounts();
    const remaining = list.filter((a) => String(a.id) !== String(targetId));
    setSavedAccounts(remaining);

    if (!isActive) {
      toast("Account removed");
      renderSettingsView();
      return;
    }

    await clearApiOfflineCache();
    if (remaining.length > 0) {
      setActiveToken(remaining[0].token);
      toast(`Switched to ${remaining[0].name}`);
      setTimeout(() => window.location.reload(), 160);
    } else {
      setActiveToken("");
      toast("Logged out");
      setTimeout(() => window.location.reload(), 160);
    }
  }

  async function syncCurrentAccountProfile() {
    const token = getActiveToken();
    if (!token) return null;

    // Pehle saved list se instant fallback uthayein (offline support)
    const saved = getSavedAccounts().find((a) => a.token === token);
    if (saved && !currentUser) currentUser = saved;

    if (navigator.onLine) {
      try {
        const res = await apiReq("/api/auth/me", { token });
        const u = res.user || res;
        if (u && (u.id || u.username || u.name)) {
          currentUser = {
            id: String(u.id || u.user_id || ""),
            name: u.name || u.username || "User",
            username: String(u.username || "").replace(/^@/, ""),
            phone: u.phone || "",
            bio: u.bio || "",
            avatarUrl: u.avatarUrl || u.avatar_url || "",
            color: u.avatarColor || u.avatar_color || "linear-gradient(135deg,#6366f1,#3b82f6)",
            token
          };
          upsertSavedAccount(currentUser, token);
          try {
  const priv = await apiReq("/api/auth/privacy", { token });
  if (priv && priv.phonePrivacy) {
    savePrefs({ phonePrivacy: priv.phonePrivacy });
  }
} catch (_) {}
        }
      } catch (_) {}
    }
    return currentUser;
  }

  // ===== 2. Apply Live Preferences (Themes, Wallpapers, Font Size, Folders, Power Save) =====
  function applyPreferences(prefsInput) {
    const p = prefsInput || getPrefs();
    const root = document.documentElement;
    const body = document.body;

    // Theme
    body.classList.remove("tc-theme-oled", "tc-theme-dark", "tc-theme-blue", "tc-theme-light");
    body.classList.add(`tc-theme-${p.theme || "oled"}`);
    root.setAttribute("data-theme", p.theme === "light" ? "light" : "dark");
    root.style.setProperty("--tc-msg-font-size", `${Number(p.fontSize) || 15}px`);

    // Wallpaper
    const customImg = localStorage.getItem(WALLPAPER_IMG_KEY) || "";
    if (p.wallpaper === "custom" && customImg) {
      root.style.setProperty("--tc-chat-wallpaper", `url("${customImg}") center/cover no-repeat`);
      body.classList.add("tc-has-wallpaper");
    } else {
      const wp = WALLPAPERS.find((w) => w.id === p.wallpaper);
      if (wp && wp.css !== "none") {
        root.style.setProperty("--tc-chat-wallpaper", wp.css);
        body.classList.add("tc-has-wallpaper");
      } else {
        root.style.setProperty("--tc-chat-wallpaper", "none");
        body.classList.remove("tc-has-wallpaper");
      }
    }

    // Power Saving & Animations
    body.classList.toggle("tc-power-save", Boolean(p.powerSaving || !p.animations));
    body.classList.toggle("tc-hide-badges", !p.notifBadges);

    // Chat Folders visibility
    const hidden = new Set(Array.isArray(p.hiddenFolders) ? p.hiddenFolders : []);
    document.querySelectorAll("#folders-bar [data-folder], .folder-tab[data-folder], #folder-tabs button").forEach((btn) => {
      const fid = (btn.dataset.folder || btn.textContent || "").trim().toLowerCase();
      if (fid === "all") return;
      btn.style.display = hidden.has(fid) ? "none" : "";
    });
  }

  // ===== 3. Sound Notification Synth (Zero external audio files needed) =====
  function playNotifSound(toneName) {
    const p = getPrefs();
    const tone = toneName || p.notifTone || "chime";
    if (tone === "muted") return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (tone === "pop") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (tone === "crystal") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1046, now);
        osc.frequency.setValueAtTime(1318, now + 0.09);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.29);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (_) {}
  }

  // ===== 4. Real 4-Digit Passcode Lock Screen =====
  function hashPin(pin) {
    let h = 2166136261;
    const s = `tc_salt_${pin}_91`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return String(h >>> 0);
  }

  function hasPasscode() {
    return Boolean(localStorage.getItem(PASSCODE_KEY));
  }

  function showPasscodeLockScreen() {
    if (!hasPasscode() || document.getElementById("tcLockOverlay")) return;
    let entered = "";

    const ov = document.createElement("div");
    ov.id = "tcLockOverlay";
    ov.className = "tc-lock-overlay";
    ov.innerHTML = `
      <div class="tc-lock-box">
        <div class="tc-lock-ico">${ICONS.lock}</div>
        <div class="tc-lock-title">Enter Passcode</div>
        <div class="tc-lock-sub" id="tcLockSub">TeleClone is locked</div>
        <div class="tc-lock-dots" id="tcLockDots">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="tc-lock-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"]
            .map((k) =>
              k === ""
                ? `<div></div>`
                : `<button type="button" class="tc-lock-key" data-key="${k}">${k}</button>`
            )
            .join("")}
        </div>
      </div>
    `;

    const dots = ov.querySelectorAll("#tcLockDots span");
    const sub = ov.querySelector("#tcLockSub");

    function updateDots() {
      dots.forEach((d, idx) => d.classList.toggle("filled", idx < entered.length));
    }

    ov.addEventListener("click", (e) => {
      const btn = e.target.closest(".tc-lock-key");
      if (!btn) return;
      const k = btn.dataset.key;
      if (k === "⌫") {
        entered = entered.slice(0, -1);
        updateDots();
        return;
      }
      if (entered.length >= 4) return;
      entered += k;
      updateDots();

      if (entered.length === 4) {
        if (hashPin(entered) === localStorage.getItem(PASSCODE_KEY)) {
          ov.remove();
        } else {
          sub.textContent = "Wrong passcode, try again";
          sub.style.color = "#f87171";
          if (navigator.vibrate) navigator.vibrate([70, 50, 70]);
          ov.querySelector("#tcLockDots").classList.add("shake");
          setTimeout(() => {
            entered = "";
            updateDots();
            ov.querySelector("#tcLockDots")?.classList.remove("shake");
          }, 420);
        }
      }
    });

    document.body.appendChild(ov);
  }

  // ===== 5. Profile Photo Upload Helper =====
  function pickAndUploadProfilePhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      toast("Photo upload ho rahi hai...");
      try {
        // 1. Pehle /api/upload par bhejein
        const fd = new FormData();
        fd.append("file", file, file.name || "avatar.jpg");
        const up = await apiReq("/api/upload", { method: "POST", body: fd });
        const photoUrl = (up.attachment && up.attachment.src) || up.src || up.url || "";

        // 2. /api/profile/photo update karein (JSON, fallback FormData)
        let savedUrl = photoUrl;
        try {
          const r = await apiReq("/api/profile/photo", {
            method: "PUT",
            body: { avatarUrl: photoUrl, avatar_url: photoUrl, url: photoUrl }
          });
          if (r.user && (r.user.avatarUrl || r.user.avatar_url)) {
            savedUrl = r.user.avatarUrl || r.user.avatar_url;
          }
        } catch (_) {
          const fd2 = new FormData();
          fd2.append("file", file, file.name || "avatar.jpg");
          const r2 = await apiReq("/api/profile/photo", { method: "PUT", body: fd2 });
          if (r2.user && (r2.user.avatarUrl || r2.user.avatar_url)) {
            savedUrl = r2.user.avatarUrl || r2.user.avatar_url;
          }
        }

        if (currentUser && savedUrl) {
          currentUser.avatarUrl = savedUrl;
          upsertSavedAccount(currentUser, getActiveToken());
        }
        toast("Profile photo updated!");
        renderSettingsView();
        if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
      } catch (err) {
        toast(err.message || "Photo update fail ho gayi");
      }
    };
    input.click();
  }

  // ===== 6. Add Account OTP Modal (Up to 3 Accounts) =====
  function openAddAccountModal() {
    const saved = getSavedAccounts();
    if (saved.length >= MAX_ACCOUNTS) {
      toast(`Maximum ${MAX_ACCOUNTS} accounts allowed. Pehle koi 1 account log out karein.`);
      return;
    }

    const old = document.getElementById("tcAddAccBackdrop");
    if (old) old.remove();

    let step = "phone"; // phone | otp | register
    let pendingPhone = "";
    let demoOtpCode = "";

    const backdrop = document.createElement("div");
    backdrop.id = "tcAddAccBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    function renderStep() {
      backdrop.innerHTML = `
        <div class="tc-st-modal-card">
          <div class="tc-st-modal-head">
            <h3>Add Account (${saved.length}/${MAX_ACCOUNTS})</h3>
            <button type="button" class="tc-st-circle-btn" id="tcAddAccClose">${ICONS.close}</button>
          </div>
          ${
            step === "phone"
              ? `
                <p class="tc-st-modal-desc">Apna doosra mobile number darj karein — aapke purane accounts login rahenge.</p>
                <input id="tcAddAccPhone" class="tc-st-input" type="tel" placeholder="+92 300 1234567" value="${esc(pendingPhone)}" autocomplete="tel" />
                <div class="tc-st-modal-err" id="tcAddAccErr"></div>
                <button type="button" class="tc-st-primary-btn" id="tcAddAccSendOtp">Continue</button>
              `
              : `
                <p class="tc-st-modal-desc">OTP code verify karein (${esc(pendingPhone)})</p>
                ${demoOtpCode ? `<div class="tc-st-otp-hint">Verification Code: <strong>${esc(demoOtpCode)}</strong></div>` : ""}
                <input id="tcAddAccOtp" class="tc-st-input" type="text" inputmode="numeric" maxlength="6" placeholder="5-digit OTP code" value="${esc(demoOtpCode)}" />
                ${
                  step === "register"
                    ? `
                      <input id="tcAddAccName" class="tc-st-input" type="text" placeholder="Your Full Name" />
                      <input id="tcAddAccUser" class="tc-st-input" type="text" placeholder="Username (optional)" />
                    `
                    : ""
                }
                <div class="tc-st-modal-err" id="tcAddAccErr"></div>
                <button type="button" class="tc-st-primary-btn" id="tcAddAccVerify">${step === "register" ? "Create & Switch Account" : "Login & Switch"}</button>
              `
          }
        </div>
      `;

      backdrop.querySelector("#tcAddAccClose").onclick = () => backdrop.remove();
      const errEl = backdrop.querySelector("#tcAddAccErr");

      if (step === "phone") {
        const btn = backdrop.querySelector("#tcAddAccSendOtp");
        btn.onclick = async () => {
          const ph = (backdrop.querySelector("#tcAddAccPhone").value || "").trim();
          if (ph.length < 7) {
            errEl.textContent = "Sahi mobile number darj karein";
            return;
          }
          btn.disabled = true;
          btn.textContent = "Sending OTP...";
          errEl.textContent = "";
          try {
            const res = await apiReq("/api/auth/request-otp", {
              method: "POST",
              token: "",
              body: { phone: ph }
            });
            pendingPhone = res.phone || ph;
            demoOtpCode = res.demoOtp || "";
            step = res.isNewUser ? "register" : "otp";
            renderStep();
          } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = "Continue";
          }
        };
      } else {
        const btn = backdrop.querySelector("#tcAddAccVerify");
        btn.onclick = async () => {
          const code = (backdrop.querySelector("#tcAddAccOtp").value || "").trim();
          const nameInput = backdrop.querySelector("#tcAddAccName");
          const userInput = backdrop.querySelector("#tcAddAccUser");
          const name = nameInput ? nameInput.value.trim() : null;
          const username = userInput ? userInput.value.trim() : null;

          if (!code) {
            errEl.textContent = "OTP code darj karein";
            return;
          }
          btn.disabled = true;
          btn.textContent = "Verifying...";
          errEl.textContent = "";

          try {
            const res = await apiReq("/api/auth/verify-otp", {
              method: "POST",
              token: "",
              body: { phone: pendingPhone, code, name: name || null, username: username || null }
            });

            if (res.needsRegistration) {
              step = "register";
              renderStep();
              return;
            }

            if (!res.token || !res.user) throw new Error("Login failed");
            upsertSavedAccount(res.user, res.token);
            backdrop.remove();
            await clearApiOfflineCache();
            setActiveToken(res.token);
            toast(`Logged in as ${res.user.name || "Account"}`);
            setTimeout(() => window.location.reload(), 180);
          } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = step === "register" ? "Create & Switch Account" : "Login & Switch";
          }
        };
      }
    }

    renderStep();
    document.body.appendChild(backdrop);
  }

  // ===== 7. QR Code Profile Share Modal =====
  function openQrModal() {
    const old = document.getElementById("tcQrBackdrop");
    if (old) old.remove();

    const u = currentUser || { name: "User", username: "", phone: "" };
    const handle = u.username ? `@${u.username}` : u.phone || u.name;
    const shareLink = `${window.location.origin}/?u=${encodeURIComponent(u.username || u.name)}`;

    // Deterministic clean visual QR pattern seeded from username
    let seed = 7;
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
    backdrop.id = "tcQrBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.innerHTML = `
      <div class="tc-st-modal-card" style="text-align:center;">
        <div class="tc-st-modal-head">
          <h3>My QR Code</h3>
          <button type="button" class="tc-st-circle-btn" id="tcQrClose">${ICONS.close}</button>
        </div>
        <div class="tc-qr-frame">
          <svg viewBox="0 0 178 178" width="178" height="178">${cells.join("")}</svg>
        </div>
        <div style="font-size:17px;font-weight:700;margin-top:10px;">${esc(u.name)}</div>
        <div style="font-size:13.5px;color:#7bc65b;margin:4px 0 14px;">${esc(handle)}</div>
        <button type="button" class="tc-st-primary-btn" id="tcQrCopyBtn">Copy Profile Link</button>
      </div>
    `;
    backdrop.querySelector("#tcQrClose").onclick = () => backdrop.remove();
    backdrop.querySelector("#tcQrCopyBtn").onclick = () => {
      navigator.clipboard?.writeText(u.username ? `@${u.username}` : shareLink).catch(() => {});
      toast("Username copied!");
    };
    document.body.appendChild(backdrop);
  }

  // ===== 8. Main Settings Home UI (Exact Screenshot Design) =====
  function renderSettingsHome(panel) {
    const u = currentUser || { name: "User", username: "", phone: "", avatarUrl: "", color: "linear-gradient(135deg,#6366f1,#3b82f6)" };
    const activeToken = getActiveToken();
    const accounts = getSavedAccounts();
    const otherAccounts = accounts.filter((a) => a.token !== activeToken);

    const avatarInner = u.avatarUrl
      ? `<img src="${esc(u.avatarUrl)}" alt="${esc(u.name)}" class="tc-st-av-img" />`
      : `<div class="tc-st-av-fallback" style="background:${esc(u.color)}">${esc((u.name || "U").trim()[0].toUpperCase())}</div>`;

    const subLineParts = [];
    if (u.phone) subLineParts.push(u.phone);
    if (u.username) subLineParts.push(`@${u.username}`);
    const subLine = subLineParts.join(" • ") || "Tap Account to edit profile";

    const menuItems = [
      { id: "account", icon: ICONS.user, bg: "#2e96f5", title: "Account", sub: "Number, Username, Bio" },
      { id: "chat", icon: ICONS.chat, bg: "#f59e0b", title: "Chat Settings", sub: "Wallpaper, Night Mode, Animations" },
      { id: "privacy", icon: ICONS.key, bg: "#49c65c", title: "Privacy & Security", sub: "Phone Number, Passcode Lock, Last Seen" },
      { id: "notifications", icon: ICONS.bell, bg: "#ef4444", title: "Notifications", sub: "Sounds, Calls, Badges" },
      { id: "storage", icon: ICONS.pie, bg: "#3b82f6", title: "Data and Storage", sub: "Media download settings" },
      { id: "folders", icon: ICONS.folder, bg: "#0ea5e9", title: "Chat Folders", sub: "Manage tabs & filters" },
      { id: "power", icon: ICONS.bolt, bg: "#f97316", title: "Power Saving", sub: "Animations & battery optimization" }
    ];

    const q = searchQuery.trim().toLowerCase();
    const visibleItems = q
      ? menuItems.filter((it) => it.title.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
      : menuItems;

    panel.innerHTML = `
      <div class="tc-st-root">
        <div class="tc-st-topbar">
          <button type="button" class="tc-st-float-btn" id="tcStQrBtn" title="QR Code">${ICONS.qr}</button>
          <div class="tc-st-float-pill">
            <button type="button" class="tc-st-pill-ico" id="tcStSearchBtn" title="Search Settings">${ICONS.search}</button>
            <button type="button" class="tc-st-pill-ico" id="tcStMoreBtn" title="More">${ICONS.dots}</button>
          </div>
          <div class="tc-st-more-menu hidden" id="tcStMoreMenu">
            ${accounts.length < MAX_ACCOUNTS ? `<button type="button" data-more="add">➕ Add Account (${accounts.length}/${MAX_ACCOUNTS})</button>` : ""}
            <button type="button" data-more="edit">✏️ Edit Info</button>
            <button type="button" data-more="photo">📷 Set Profile Photo</button>
            ${hasPasscode() ? `<button type="button" data-more="lock">🔒 Lock App Now</button>` : ""}
            <button type="button" class="danger" data-more="logout">🚪 Log Out</button>
          </div>
        </div>

        ${
          searchMode
            ? `
              <div class="tc-st-searchbar">
                <span>${ICONS.search}</span>
                <input id="tcStSearchInput" type="text" placeholder="Search settings..." value="${esc(searchQuery)}" autocomplete="off" />
                <button type="button" id="tcStSearchClose">${ICONS.close}</button>
              </div>
            `
            : `
              <div class="tc-st-hero">
                <div class="tc-st-avatar-wrap">
                  <div class="tc-st-avatar" id="tcStAvatarClick">${avatarInner}</div>
                  <button type="button" class="tc-st-cam-badge" id="tcStCamBadge" title="Change Photo">${ICONS.camera}</button>
                </div>
                <div class="tc-st-name">${esc(u.name)}</div>
                <div class="tc-st-handle">${esc(subLine)}</div>
              </div>

              <div class="tc-st-card tc-st-accounts-card">
                <div class="tc-st-card-label">
                  <span>Accounts</span>
                  <span class="tc-st-acc-quota">${accounts.length}/${MAX_ACCOUNTS}</span>
                </div>
                ${
                  otherAccounts
                    .map((acc) => {
                      const av = acc.avatarUrl
                        ? `<img src="${esc(acc.avatarUrl)}" alt="" />`
                        : `<div class="tc-st-mini-fb" style="background:${esc(acc.color)}">${esc((acc.name || "A")[0].toUpperCase())}</div>`;
                      return `
                        <div class="tc-st-acc-row" data-switch-token="${esc(acc.token)}">
                          <div class="tc-st-mini-av">${av}</div>
                          <div class="tc-st-acc-info">
                            <div class="tc-st-acc-name">${esc(acc.name)}</div>
                            <div class="tc-st-acc-sub">${esc(acc.username ? `@${acc.username}` : acc.phone)}</div>
                          </div>
                          <span class="tc-st-acc-badge">Switch</span>
                          <span class="tc-st-chev">${ICONS.chev}</span>
                        </div>
                      `;
                    })
                    .join("")
                }
                ${
                  accounts.length < MAX_ACCOUNTS
                    ? `
                      <button type="button" class="tc-st-add-acc-row" id="tcStAddAccountBtn">
                        <span class="tc-st-add-ico">${ICONS.plus}</span>
                        <span>Add Account</span>
                      </button>
                    `
                    : `<div class="tc-st-acc-limit">All 3 account slots active</div>`
                }
              </div>
            `
        }

        <div class="tc-st-card tc-st-menu-card">
          ${
            visibleItems.length
              ? visibleItems
                  .map(
                    (it) => `
                <button type="button" class="tc-st-row" data-st-page="${it.id}">
                  <span class="tc-st-row-ico" style="background:${it.bg}">${it.icon}</span>
                  <span class="tc-st-row-text">
                    <span class="tc-st-row-title">${esc(it.title)}</span>
                    <span class="tc-st-row-sub">${esc(it.sub)}</span>
                  </span>
                </button>
              `
                  )
                  .join("")
              : `<div class="tc-st-empty">No matching settings found</div>`
          }
        </div>
      </div>
    `;

    // Bind events
    panel.querySelector("#tcStQrBtn").onclick = openQrModal;

    panel.querySelector("#tcStSearchBtn").onclick = () => {
      searchMode = !searchMode;
      if (!searchMode) searchQuery = "";
      renderSettingsView();
      const inp = panel.querySelector("#tcStSearchInput");
      if (inp) inp.focus();
    };

    const sInput = panel.querySelector("#tcStSearchInput");
    if (sInput) {
      sInput.oninput = () => {
        searchQuery = sInput.value;
        renderSettingsView();
        const fresh = panel.querySelector("#tcStSearchInput");
        if (fresh) {
          fresh.focus();
          fresh.setSelectionRange(fresh.value.length, fresh.value.length);
        }
      };
    }
    const sClose = panel.querySelector("#tcStSearchClose");
    if (sClose) {
      sClose.onclick = () => {
        searchMode = false;
        searchQuery = "";
        renderSettingsView();
      };
    }

    const moreMenu = panel.querySelector("#tcStMoreMenu");
    panel.querySelector("#tcStMoreBtn").onclick = (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle("hidden");
    };
    moreMenu.onclick = (e) => {
      const btn = e.target.closest("[data-more]");
      if (!btn) return;
      moreMenu.classList.add("hidden");
      const act = btn.dataset.more;
      if (act === "add") openAddAccountModal();
      else if (act === "edit") {
        activeSubPage = "account";
        renderSettingsView();
      } else if (act === "photo") pickAndUploadProfilePhoto();
      else if (act === "lock") showPasscodeLockScreen();
      else if (act === "logout") removeOrLogoutAccount(u.id, true);
    };

    const camBtn = panel.querySelector("#tcStCamBadge");
    if (camBtn) camBtn.onclick = pickAndUploadProfilePhoto;

    const avClick = panel.querySelector("#tcStAvatarClick");
    if (avClick) {
      avClick.onclick = () => {
        if (u.avatarUrl && window.TCChatEnhancements) {
          window.TCChatEnhancements.openMediaViewer("photo", u.avatarUrl, u.name);
        } else {
          pickAndUploadProfilePhoto();
        }
      };
    }

    const addBtn = panel.querySelector("#tcStAddAccountBtn");
    if (addBtn) addBtn.onclick = openAddAccountModal;

    panel.querySelectorAll("[data-switch-token]").forEach((row) => {
      row.onclick = () => {
        const acc = accounts.find((a) => a.token === row.dataset.switchToken);
        if (acc) switchToAccount(acc);
      };
    });

    panel.querySelectorAll("[data-st-page]").forEach((btn) => {
      btn.onclick = () => {
        activeSubPage = btn.dataset.stPage;
        renderSettingsView();
      };
    });
  }

  // ===== 9. Working Sub-Pages =====
  async function computeCacheStats() {
    let mediaBytes = 0;
    let mediaCount = 0;
    let apiBytes = 0;
    if ("caches" in window) {
      try {
        const mc = await caches.open("teleclone-media-v1");
        const keys = await mc.keys();
        mediaCount = keys.length;
        for (const req of keys) {
          const res = await mc.match(req);
          if (res) {
            const cl = Number(res.headers.get("Content-Length") || 0);
            if (cl > 0) mediaBytes += cl;
            else {
              const blob = await res.clone().blob();
              mediaBytes += blob.size;
            }
          }
        }
      } catch (_) {}
      try {
        const ac = await caches.open("teleclone-api-v1");
        const keys = await ac.keys();
        for (const req of keys) {
          const res = await ac.match(req);
          if (res) {
            const blob = await res.clone().blob();
            apiBytes += blob.size;
          }
        }
      } catch (_) {}
    }
    return { mediaBytes, mediaCount, apiBytes };
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function renderSubHeader(title) {
    return `
      <div class="tc-st-subhead">
        <button type="button" class="tc-st-float-btn" id="tcStBackBtn">${ICONS.back}</button>
        <h2>${esc(title)}</h2>
      </div>
    `;
  }

  function renderSubPage(panel) {
    const p = getPrefs();
    const u = currentUser || { name: "", username: "", phone: "", bio: "" };

    if (activeSubPage === "account") {
      const saved = getSavedAccounts();
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Account")}
          <div class="tc-st-card tc-st-form-card">
            <label class="tc-st-lbl">Display Name</label>
            <input id="tcAccName" class="tc-st-input" type="text" maxlength="64" value="${esc(u.name)}" />

            <label class="tc-st-lbl">Username</label>
            <input id="tcAccUsername" class="tc-st-input" type="text" maxlength="32" placeholder="username" value="${esc(u.username)}" />

            <label class="tc-st-lbl">Bio</label>
            <textarea id="tcAccBio" class="tc-st-input tc-st-textarea" maxlength="160" placeholder="Add a few words about yourself...">${esc(u.bio)}</textarea>

            <label class="tc-st-lbl">Phone Number</label>
            <div class="tc-st-readonly" id="tcAccPhoneCopy">${esc(u.phone || "Not linked")} <span>Tap to copy</span></div>

            <button type="button" class="tc-st-primary-btn" id="tcAccSaveBtn">Save Changes</button>
          </div>

          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Logged-in Accounts (${saved.length}/${MAX_ACCOUNTS})</span></div>
            ${saved
              .map((a) => {
                const isMe = a.token === getActiveToken();
                return `
                  <div class="tc-st-manage-acc">
                    <div>
                      <div style="font-weight:600;font-size:14.5px;">${esc(a.name)} ${isMe ? `<span class="tc-st-active-pill">Active</span>` : ""}</div>
                      <div style="font-size:12px;color:#8e94a5;">${esc(a.phone || "@" + a.username)}</div>
                    </div>
                    <button type="button" class="tc-st-danger-sm" data-rm-acc="${esc(a.id)}" data-rm-active="${isMe ? "1" : "0"}">${isMe ? "Log Out" : "Remove"}</button>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      panel.querySelector("#tcAccPhoneCopy").onclick = () => {
        if (!u.phone) return;
        navigator.clipboard?.writeText(u.phone).catch(() => {});
        toast("Phone number copied");
      };

      panel.querySelector("#tcAccSaveBtn").onclick = async () => {
        const btn = panel.querySelector("#tcAccSaveBtn");
        const name = panel.querySelector("#tcAccName").value.trim();
        const username = panel.querySelector("#tcAccUsername").value.trim().replace(/^@/, "");
        const bio = panel.querySelector("#tcAccBio").value.trim();
        if (!name) {
          toast("Name khali nahi ho sakta");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Saving...";
        try {
          const res = await apiReq("/api/auth/profile", {
            method: "PUT",
            body: { name, username, bio }
          });
          if (res.user) {
            currentUser = {
              ...currentUser,
              name: res.user.name || name,
              username: String(res.user.username || username).replace(/^@/, ""),
              bio: res.user.bio !== undefined ? res.user.bio : bio
            };
            upsertSavedAccount(currentUser, getActiveToken());
          }
          toast("Profile updated!");
          if (window.App && typeof window.App.renderAll === "function") window.App.renderAll();
          activeSubPage = null;
          renderSettingsView();
        } catch (err) {
          toast(err.message || "Update fail ho gaya");
          btn.disabled = false;
          btn.textContent = "Save Changes";
        }
      };

      panel.querySelectorAll("[data-rm-acc]").forEach((btn) => {
        btn.onclick = () => removeOrLogoutAccount(btn.dataset.rmAcc, btn.dataset.rmActive === "1");
      });
    } else if (activeSubPage === "chat") {
      const hasCustomWp = Boolean(localStorage.getItem(WALLPAPER_IMG_KEY));
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Chat Settings")}
          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Theme</span></div>
            <div class="tc-st-theme-grid">
              ${[
                { id: "oled", name: "OLED Black", bg: "#000000", accent: "#7bc65b" },
                { id: "dark", name: "Midnight", bg: "#16171f", accent: "#7c6af7" },
                { id: "blue", name: "Telegram Blue", bg: "#17212b", accent: "#3ea6ff" },
                { id: "light", name: "Day Light", bg: "#f1f5f9", accent: "#2563eb" }
              ]
                .map(
                  (t) => `
                  <button type="button" class="tc-st-theme-btn ${p.theme === t.id ? "active" : ""}" data-set-theme="${t.id}">
                    <span class="tc-st-theme-swatch" style="background:${t.bg};border-color:${t.accent};">
                      <i style="background:${t.accent};"></i>
                    </span>
                    <span>${t.name}</span>
                  </button>
                `
                )
                .join("")}
            </div>
          </div>

          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Chat Wallpaper</span></div>
            <div class="tc-st-wp-grid">
              ${WALLPAPERS.map(
                (w) => `
                  <button type="button" class="tc-st-wp-tile ${p.wallpaper === w.id ? "active" : ""}" data-set-wp="${w.id}" style="background:${w.css === "none" ? "#101218" : w.css};">
                    <span>${w.label}</span>
                  </button>
                `
              ).join("")}
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button type="button" class="tc-st-secondary-btn" id="tcWpUploadBtn" style="flex:1;">🖼️ Choose from Gallery</button>
              ${hasCustomWp ? `<button type="button" class="tc-st-danger-sm" id="tcWpClearBtn">Reset</button>` : ""}
            </div>
          </div>

          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label">
              <span>Message Text Size</span>
              <strong id="tcFontVal">${p.fontSize}px</strong>
            </div>
            <input type="range" id="tcFontSlider" class="tc-st-slider" min="12" max="20" step="1" value="${p.fontSize}" />
            <div class="tc-st-preview-bubble" id="tcFontPreview" style="font-size:${p.fontSize}px;">
              Assalam-o-Alaikum! Yeh live message preview hai.
            </div>

            <label class="tc-st-toggle-row">
              <span>Smooth Animations</span>
              <input type="checkbox" id="tcPrefAnim" ${p.animations ? "checked" : ""} />
            </label>
          </div>
        </div>
      `;

      panel.querySelectorAll("[data-set-theme]").forEach((b) => {
        b.onclick = () => {
          savePrefs({ theme: b.dataset.setTheme });
          renderSettingsView();
        };
      });

      panel.querySelectorAll("[data-set-wp]").forEach((b) => {
        b.onclick = () => {
          savePrefs({ wallpaper: b.dataset.setWp });
          toast("Wallpaper updated");
          renderSettingsView();
        };
      });

      panel.querySelector("#tcWpUploadBtn").onclick = () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          const img = new Image();
          const url = URL.createObjectURL(f);
          img.onload = () => {
            URL.revokeObjectURL(url);
            const maxW = 900;
            const scale = Math.min(1, maxW / Math.max(img.width, img.height));
            const cv = document.createElement("canvas");
            cv.width = Math.round(img.width * scale);
            cv.height = Math.round(img.height * scale);
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            try {
              localStorage.setItem(WALLPAPER_IMG_KEY, cv.toDataURL("image/jpeg", 0.72));
              savePrefs({ wallpaper: "custom" });
              toast("Custom wallpaper set!");
              renderSettingsView();
            } catch (_) {
              toast("Photo zyada badi hai, choti photo select karein");
            }
          };
          img.src = url;
        };
        inp.click();
      };

      const clearWp = panel.querySelector("#tcWpClearBtn");
      if (clearWp) {
        clearWp.onclick = () => {
          localStorage.removeItem(WALLPAPER_IMG_KEY);
          savePrefs({ wallpaper: "default" });
          toast("Wallpaper reset");
          renderSettingsView();
        };
      }

      const slider = panel.querySelector("#tcFontSlider");
      slider.oninput = () => {
        const v = Number(slider.value);
        panel.querySelector("#tcFontVal").textContent = `${v}px`;
        panel.querySelector("#tcFontPreview").style.fontSize = `${v}px`;
        savePrefs({ fontSize: v });
      };

      panel.querySelector("#tcPrefAnim").onchange = (e) => savePrefs({ animations: e.target.checked });
    } else if (activeSubPage === "privacy") {
      const locked = hasPasscode();
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Privacy & Security")}
          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label">
              <span>Passcode Lock</span>
              <span class="tc-st-active-pill" style="background:${locked ? "rgba(73,198,92,0.2)" : "rgba(255,255,255,0.08)"};color:${locked ? "#7bc65b" : "#94a3b8"};">${locked ? "ON" : "OFF"}</span>
            </div>
            <p class="tc-st-modal-desc">App open karne par 4-digit PIN passcode maanga jayega.</p>
            <input id="tcPinInput" class="tc-st-input" type="password" inputmode="numeric" maxlength="4" placeholder="${locked ? "Naya 4-digit PIN likhein" : "4-digit PIN set karein (e.g. 1234)"}" />
            <div style="display:flex;gap:8px;">
              <button type="button" class="tc-st-primary-btn" id="tcPinSaveBtn" style="flex:1;">${locked ? "Change Passcode" : "Enable Passcode"}</button>
              ${locked ? `<button type="button" class="tc-st-danger-sm" id="tcPinDisableBtn">Disable</button>` : ""}
            </div>
            ${locked ? `<button type="button" class="tc-st-secondary-btn" id="tcPinLockNowBtn" style="width:100%;margin-top:8px;">🔒 Lock App Now</button>` : ""}
          </div>

          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Privacy Controls</span></div>
            <div class="tc-st-select-row">
              <span>Last Seen & Online</span>
              <div class="tc-st-select-row">
           <span>Phone Number</span>
           <select id="tcPrivPhone" class="tc-st-select">
             <option value="everybody" ${p.phonePrivacy === "everybody" ? "selected" : ""}>Everybody</option>
             <option value="contacts" ${p.phonePrivacy === "contacts" ? "selected" : ""}>My Contacts</option>
             <option value="nobody" ${p.phonePrivacy === "nobody" ? "selected" : ""}>Nobody</option>
           </select>
         </div>
         <div id="tcPrivPhoneHint" style="font-size:12px;color:#8e94a5;padding:0 0 10px;border-bottom:1px solid rgba(255,255,255,0.06);">
           ${
             p.phonePrivacy === "nobody"
               ? "Koi bhi user aapka phone number nahi dekh sakega."
               : p.phonePrivacy === "contacts"
               ? "Sirf aapke saved contacts aapka phone number dekh sakte hain."
               : "Har koi aapka phone number dekh sakta hai."
           }
         </div>
              <select id="tcPrivLastSeen" class="tc-st-select">
                <option value="everybody" ${p.lastSeen === "everybody" ? "selected" : ""}>Everybody</option>
                <option value="contacts" ${p.lastSeen === "contacts" ? "selected" : ""}>My Contacts</option>
                <option value="nobody" ${p.lastSeen === "nobody" ? "selected" : ""}>Nobody</option>
              </select>
            </div>
            <div class="tc-st-select-row">
              <span>Profile Photos</span>
              <select id="tcPrivPhoto" class="tc-st-select">
                <option value="everybody" ${p.profilePhotoPrivacy === "everybody" ? "selected" : ""}>Everybody</option>
                <option value="contacts" ${p.profilePhotoPrivacy === "contacts" ? "selected" : ""}>My Contacts</option>
                <option value="nobody" ${p.profilePhotoPrivacy === "nobody" ? "selected" : ""}>Nobody</option>
              </select>
            </div>
            <div class="tc-st-select-row">
              <span>Forwarded Messages Link</span>
              <select id="tcPrivFwd" class="tc-st-select">
                <option value="everybody" ${p.forwardLinkPrivacy === "everybody" ? "selected" : ""}>Everybody</option>
                <option value="contacts" ${p.forwardLinkPrivacy === "contacts" ? "selected" : ""}>My Contacts</option>
                <option value="nobody" ${p.forwardLinkPrivacy === "nobody" ? "selected" : ""}>Nobody</option>
              </select>
            </div>
          </div>
        </div>
      `;

      panel.querySelector("#tcPinSaveBtn").onclick = () => {
        const pin = (panel.querySelector("#tcPinInput").value || "").trim();
        if (!/^\d{4}$/.test(pin)) {
          toast("Exact 4 numbers ka passcode likhein");
          return;
        }
        localStorage.setItem(PASSCODE_KEY, hashPin(pin));
        toast("Passcode Lock enabled!");
        renderSettingsView();
      };
      const disBtn = panel.querySelector("#tcPinDisableBtn");
      if (disBtn) {
        disBtn.onclick = () => {
          localStorage.removeItem(PASSCODE_KEY);
          toast("Passcode Lock disabled");
          renderSettingsView();
        };
      }
      const lockBtn = panel.querySelector("#tcPinLockNowBtn");
      if (lockBtn) lockBtn.onclick = showPasscodeLockScreen;
      panel.querySelector("#tcPrivPhone").onchange = async (e) => {
     const val = e.target.value;
     savePrefs({ phonePrivacy: val });
     const hint = panel.querySelector("#tcPrivPhoneHint");
     if (hint) {
       hint.textContent =
         val === "nobody"
           ? "Koi bhi user aapka phone number nahi dekh sakega."
           : val === "contacts"
           ? "Sirf aapke saved contacts aapka phone number dekh sakte hain."
           : "Har koi aapka phone number dekh sakta hai.";
     }
     try {
       await apiReq("/api/auth/privacy", {
         method: "PUT",
         body: { phonePrivacy: val }
       });
       toast(val === "nobody" ? "Phone number hidden from everyone" : "Phone number privacy updated");
     } catch (err) {
       toast(err.message || "Server par save nahi ho saka");
     }
   };

      panel.querySelector("#tcPrivLastSeen").onchange = (e) => {
        savePrefs({ lastSeen: e.target.value });
        toast("Last Seen privacy saved");
      };
      panel.querySelector("#tcPrivPhoto").onchange = (e) => {
        savePrefs({ profilePhotoPrivacy: e.target.value });
        toast("Profile photo privacy saved");
      };
      panel.querySelector("#tcPrivFwd").onchange = (e) => {
        savePrefs({ forwardLinkPrivacy: e.target.value });
        toast("Forward privacy saved");
      };
    } else if (activeSubPage === "notifications") {
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Notifications")}
          <div class="tc-st-card tc-st-form-card">
            <label class="tc-st-toggle-row">
              <span>In-App Sounds</span>
              <input type="checkbox" id="tcNotifSound" ${p.notifSound ? "checked" : ""} />
            </label>
            <label class="tc-st-toggle-row">
              <span>Vibrate</span>
              <input type="checkbox" id="tcNotifVib" ${p.notifVibrate ? "checked" : ""} />
            </label>
            <label class="tc-st-toggle-row">
              <span>Message Preview</span>
              <input type="checkbox" id="tcNotifPrev" ${p.notifPreview ? "checked" : ""} />
            </label>
            <label class="tc-st-toggle-row">
              <span>Unread Count Badges</span>
              <input type="checkbox" id="tcNotifBadge" ${p.notifBadges ? "checked" : ""} />
            </label>

            <div class="tc-st-select-row" style="margin-top:8px;">
              <span>Alert Tone</span>
              <select id="tcNotifTone" class="tc-st-select">
                <option value="chime" ${p.notifTone === "chime" ? "selected" : ""}>Default Chime</option>
                <option value="pop" ${p.notifTone === "pop" ? "selected" : ""}>Soft Pop</option>
                <option value="crystal" ${p.notifTone === "crystal" ? "selected" : ""}>Crystal</option>
                <option value="muted" ${p.notifTone === "muted" ? "selected" : ""}>Muted</option>
              </select>
            </div>
            <button type="button" class="tc-st-secondary-btn" id="tcTestToneBtn" style="width:100%;margin-top:10px;">🔔 Test Sound & Vibration</button>
          </div>
        </div>
      `;

      panel.querySelector("#tcNotifSound").onchange = (e) => savePrefs({ notifSound: e.target.checked });
      panel.querySelector("#tcNotifVib").onchange = (e) => savePrefs({ notifVibrate: e.target.checked });
      panel.querySelector("#tcNotifPrev").onchange = (e) => savePrefs({ notifPreview: e.target.checked });
      panel.querySelector("#tcNotifBadge").onchange = (e) => savePrefs({ notifBadges: e.target.checked });
      panel.querySelector("#tcNotifTone").onchange = (e) => {
        savePrefs({ notifTone: e.target.value });
        playNotifSound(e.target.value);
      };
      panel.querySelector("#tcTestToneBtn").onclick = () => {
        const latest = getPrefs();
        if (latest.notifSound) playNotifSound(latest.notifTone);
        if (latest.notifVibrate && navigator.vibrate) navigator.vibrate(120);
      };
    } else if (activeSubPage === "storage") {
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Data and Storage")}
          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Offline Cache Usage</span></div>
            <div class="tc-st-stat-grid">
              <div class="tc-st-stat-box">
                <div class="tc-st-stat-num" id="tcMediaCacheSz">...</div>
                <div class="tc-st-stat-lbl" id="tcMediaCacheCnt">Cached Media</div>
              </div>
              <div class="tc-st-stat-box">
                <div class="tc-st-stat-num" id="tcApiCacheSz">...</div>
                <div class="tc-st-stat-lbl">Offline Chats</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button type="button" class="tc-st-primary-btn" id="tcClearMediaCacheBtn" style="flex:1;">Clear Media Cache</button>
              <button type="button" class="tc-st-secondary-btn" id="tcClearApiCacheBtn">Clear Chat Cache</button>
            </div>
          </div>

          <div class="tc-st-card tc-st-form-card">
            <div class="tc-st-card-label"><span>Automatic Media Download</span></div>
            <label class="tc-st-toggle-row">
              <span>Photos</span>
              <input type="checkbox" id="tcAutoPhoto" ${p.autoDownloadPhotos ? "checked" : ""} />
            </label>
            <label class="tc-st-toggle-row">
              <span>Videos</span>
              <input type="checkbox" id="tcAutoVideo" ${p.autoDownloadVideos ? "checked" : ""} />
            </label>
            <label class="tc-st-toggle-row">
              <span>Voice Messages</span>
              <input type="checkbox" id="tcAutoVoice" ${p.autoDownloadVoice ? "checked" : ""} />
            </label>
          </div>
        </div>
      `;

      computeCacheStats().then(({ mediaBytes, mediaCount, apiBytes }) => {
        const mEl = panel.querySelector("#tcMediaCacheSz");
        const cEl = panel.querySelector("#tcMediaCacheCnt");
        const aEl = panel.querySelector("#tcApiCacheSz");
        if (mEl) mEl.textContent = formatBytes(mediaBytes);
        if (cEl) cEl.textContent = `Cached Media (${mediaCount})`;
        if (aEl) aEl.textContent = formatBytes(apiBytes);
      });

      panel.querySelector("#tcClearMediaCacheBtn").onclick = async () => {
        if ("caches" in window) await caches.delete("teleclone-media-v1").catch(() => {});
        toast("Media cache cleared!");
        renderSettingsView();
      };
      panel.querySelector("#tcClearApiCacheBtn").onclick = async () => {
        await clearApiOfflineCache();
        toast("Offline chat cache cleared!");
        renderSettingsView();
      };
      panel.querySelector("#tcAutoPhoto").onchange = (e) => savePrefs({ autoDownloadPhotos: e.target.checked });
      panel.querySelector("#tcAutoVideo").onchange = (e) => savePrefs({ autoDownloadVideos: e.target.checked });
      panel.querySelector("#tcAutoVoice").onchange = (e) => savePrefs({ autoDownloadVoice: e.target.checked });
    } else if (activeSubPage === "folders") {
      const hidden = new Set(p.hiddenFolders || []);
      const folders = [
        { id: "personal", label: "Personal Chats" },
        { id: "bots", label: "Bots" },
        { id: "groups", label: "Groups" },
        { id: "channels", label: "Channels" }
      ];
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Chat Folders")}
          <div class="tc-st-card tc-st-form-card">
            <p class="tc-st-modal-desc">Apni Chats screen par jo folder tabs dikhani hain unhein ON rakhein:</p>
            ${folders
              .map(
                (f) => `
              <label class="tc-st-toggle-row">
                <span>${f.label}</span>
                <input type="checkbox" data-folder-toggle="${f.id}" ${!hidden.has(f.id) ? "checked" : ""} />
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
      panel.querySelectorAll("[data-folder-toggle]").forEach((cb) => {
        cb.onchange = () => {
          const nextHidden = new Set(getPrefs().hiddenFolders || []);
          if (cb.checked) nextHidden.delete(cb.dataset.folderToggle);
          else nextHidden.add(cb.dataset.folderToggle);
          savePrefs({ hiddenFolders: Array.from(nextHidden) });
          toast("Chat folders updated");
        };
      });
    } else if (activeSubPage === "power") {
      panel.innerHTML = `
        <div class="tc-st-root">
          ${renderSubHeader("Power Saving")}
          <div class="tc-st-card tc-st-form-card">
            <p class="tc-st-modal-desc">Power Saving Mode heavy transitions, blur effects aur background animations band kar ke battery bachata hai.</p>
            <label class="tc-st-toggle-row">
              <span>Enable Power Saving Mode</span>
              <input type="checkbox" id="tcPowerToggle" ${p.powerSaving ? "checked" : ""} />
            </label>
          </div>
        </div>
      `;
      panel.querySelector("#tcPowerToggle").onchange = (e) => {
        savePrefs({ powerSaving: e.target.checked });
        toast(e.target.checked ? "Power Saving ON" : "Power Saving OFF");
      };
    }

    const backBtn = panel.querySelector("#tcStBackBtn");
    if (backBtn) {
      backBtn.onclick = () => {
        activeSubPage = null;
        renderSettingsView();
      };
    }
  }

  // ===== 10. Mount & Sync With Bottom Nav =====
  function isSettingsTabActive() {
    const btn = document.querySelector('.bottom-nav-item[data-btab="settings"]');
    return Boolean(btn && btn.classList.contains("active"));
  }

  function renderSettingsView() {
    const panel = document.getElementById("sidebar-tab-panel");
    if (!panel || !isSettingsTabActive()) {
      document.body.classList.remove("tc-pro-settings-open");
      return;
    }

    isRenderingSettings = true;
    document.body.classList.add("tc-pro-settings-open");
    panel.classList.remove("hidden");
    panel.classList.add("tc-pro-settings-panel");

    if (activeSubPage) renderSubPage(panel);
    else renderSettingsHome(panel);

    isRenderingSettings = false;
  }

  function scheduleSettingsMount() {
    setTimeout(async () => {
      if (!isSettingsTabActive()) {
        document.body.classList.remove("tc-pro-settings-open");
        activeSubPage = null;
        searchMode = false;
        searchQuery = "";
        return;
      }
      if (!currentUser) await syncCurrentAccountProfile();
      renderSettingsView();
    }, 15);
  }

  // Bottom Nav aur Profile->Settings button par hook
  document.addEventListener(
    "click",
    (e) => {
      const btab = e.target.closest(".bottom-nav-item[data-btab]");
      if (btab) {
        if (btab.dataset.btab === "settings") {
          activeSubPage = null;
          scheduleSettingsMount();
        } else {
          document.body.classList.remove("tc-pro-settings-open");
          const panel = document.getElementById("sidebar-tab-panel");
          if (panel) panel.classList.remove("tc-pro-settings-panel");
        }
        return;
      }

      // Profile tab ke andar wale "Settings" card par click -> seedha Pro Settings kholein
      const profSetBtn = e.target.closest("#prof-settings-btn");
      if (profSetBtn) {
        const navSettingsBtn = document.querySelector('.bottom-nav-item[data-btab="settings"]');
        if (navSettingsBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          navSettingsBtn.click();
        }
      }
    },
    true
  );

  // Incoming message notification sound + vibration
  function watchIncomingMessagesForSound() {
    const mc = document.getElementById("messages-container");
    if (!mc) return;
    let lastCount = mc.querySelectorAll(".msg-row.incoming").length;
    const obs = new MutationObserver(() => {
      const cur = mc.querySelectorAll(".msg-row.incoming").length;
      if (cur > lastCount) {
        const p = getPrefs();
        if (p.notifSound) playNotifSound(p.notifTone);
        if (p.notifVibrate && navigator.vibrate) navigator.vibrate(90);
      }
      lastCount = cur;
    });
    obs.observe(mc, { childList: true });
  }

  // ===== Init =====
  async function initProSettings() {
    applyPreferences();
    showPasscodeLockScreen();
    await syncCurrentAccountProfile();
    watchIncomingMessagesForSound();

    // Agar panel re-render ho jaye jab Settings active ho to dubara render karein
    const panel = document.getElementById("sidebar-tab-panel");
    if (panel) {
      const obs = new MutationObserver(() => {
        if (isRenderingSettings) return;
        if (isSettingsTabActive() && !panel.querySelector(".tc-st-root")) {
          renderSettingsView();
        }
      });
      obs.observe(panel, { childList: true });
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initProSettings);
  } else {
    initProSettings();
  }

  window.TCProSettings = {
    openSettings: () => {
      const btn = document.querySelector('.bottom-nav-item[data-btab="settings"]');
      if (btn) btn.click();
    },
    openAddAccount: openAddAccountModal,
    lockNow: showPasscodeLockScreen,
    getPrefs,
    applyPreferences
  };
})();