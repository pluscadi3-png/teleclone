(() => {
  "use strict";

  const DEFAULT_JWT_KEY = "teleclone_live_jwt";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const MAX_ACCOUNTS = 3;

  const COUNTRIES = [
    { code: "+92", label: "🇵🇰 +92 (Pakistan)" },
    { code: "+91", label: "🇮🇳 +91 (India)" },
    { code: "+971", label: "🇦🇪 +971 (UAE)" },
    { code: "+966", label: "🇸🇦 +966 (Saudi Arabia)" },
    { code: "+44", label: "🇬🇧 +44 (UK)" },
    { code: "+1", label: "🇺🇸 +1 (USA / Canada)" },
    { code: "+90", label: "🇹🇷 +90 (Turkey)" },
    { code: "+60", label: "🇲🇾 +60 (Malaysia)" }
  ];

  const GOOGLE_SVG = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#EA4335" d="M12 5.04c1.94 0 3.51.68 4.75 1.81l3.48-3.48C18.08 1.37 15.3 0 12 0 7.31 0 3.25 2.69 1.28 6.6l4.06 3.15C6.31 6.96 8.92 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.9c2.18-2.01 3.69-4.97 3.69-8.72z"/><path fill="#FBBC05" d="M5.34 14.25A7.19 7.19 0 0 1 4.96 12c0-.78.14-1.54.38-2.25L1.28 6.6A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.06-3.15z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.73-2.9c-1.08.72-2.45 1.16-4.2 1.16-3.08 0-5.69-1.92-6.66-4.6L1.28 17.4C3.25 21.31 7.31 24 12 24z"/></svg>`;

  let activePollTimer = null;
  let activePollSid = "";
  let activePollAction = "login";
  let pendingSetup = null;

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
    t._tid = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function isNativeApk() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function") {
        if (window.Capacitor.isNativePlatform()) return true;
      }
    } catch (_) {}
    return /; wv\)/i.test(navigator.userAgent || "");
  }

  function resolveJwtKey() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === ACCOUNTS_KEY || k === JWT_KEY_CACHE || k === "tc_offline_token_sig") continue;
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        localStorage.setItem(JWT_KEY_CACHE, k);
        return k;
      }
    }
    return localStorage.getItem(JWT_KEY_CACHE) || DEFAULT_JWT_KEY;
  }

  function saveAccountAndLogin(userObj, token) {
    const jwtKey = resolveJwtKey();
    localStorage.setItem(jwtKey, token);
    localStorage.setItem(JWT_KEY_CACHE, jwtKey);

    try {
      const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
      const arr = Array.isArray(list) ? list : [];
      const uid = String(userObj.id || "");
      const entry = {
        id: uid,
        name: userObj.name || userObj.username || "User",
        username: String(userObj.username || "").replace(/^@/, ""),
        phone: userObj.phone || "",
        bio: userObj.bio || "",
        avatarUrl: userObj.avatarUrl || "",
        color: userObj.avatarColor || "linear-gradient(135deg,#6366f1,#3b82f6)",
        token
      };
      const idx = arr.findIndex((a) => (uid && String(a.id) === uid) || a.token === token);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...entry };
      else if (arr.length < MAX_ACCOUNTS) arr.push(entry);
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(arr.slice(0, MAX_ACCOUNTS)));
    } catch (_) {}

    if ("caches" in window) {
      caches.delete("teleclone-api-v1").catch(() => {});
    }
    toast(`Welcome, ${userObj.name || "User"}!`);
    setTimeout(() => window.location.reload(), 180);
  }

  function makeSid() {
    return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function stopPolling() {
    if (activePollTimer) {
      clearInterval(activePollTimer);
      activePollTimer = null;
    }
    activePollSid = "";
  }

  async function checkPollOnce(sid) {
    if (!sid) return;
    try {
      const res = await fetch(`/api/auth/google/poll?sid=${encodeURIComponent(sid)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      if (data.status === "login" && data.token && data.user) {
        stopPolling();
        closeAddModal();
        saveAccountAndLogin(data.user, data.token);
      } else if (data.status === "needs_profile" && data.setupToken) {
        stopPolling();
        pendingSetup = {
          setupToken: data.setupToken,
          email: data.email || "",
          name: data.name || "",
          picture: data.picture || "",
          action: data.action || activePollAction
        };
        if (pendingSetup.action === "add") {
          openAddGoogleModal("setup");
        } else {
          renderOledAuthScreen("setup");
        }
      } else if (data.status === "error") {
        stopPolling();
        const msg = data.detail || "Google sign-in failed";
        showAuthError(msg);
        toast(msg);
      }
    } catch (_) {}
  }

  function startGoogleOAuth(action = "login") {
    stopPolling();
    const sid = makeSid();
    activePollSid = sid;
    activePollAction = action;
    const native = isNativeApk();
    const mode = native ? "app" : "web";
    const startUrl = `${window.location.origin}/api/auth/google/start?sid=${encodeURIComponent(sid)}&mode=${mode}&action=${encodeURIComponent(action)}`;

    if (!native) {
      window.location.href = startUrl;
      return;
    }

    // APK mode: Chrome/system browser kholein aur background mein poll karein
    if (action === "add") openAddGoogleModal("waiting");
    else renderOledAuthScreen("waiting");

    window.location.href = startUrl;

    let attempts = 0;
    activePollTimer = setInterval(() => {
      attempts++;
      if (attempts > 150) {
        stopPolling();
        showAuthError("Login timed out — please try again");
        return;
      }
      checkPollOnce(sid);
    }, 2000);
  }

  function showAuthError(msg) {
    const el = document.getElementById("tcGAuthErr") || document.getElementById("tcAddGErr");
    if (el) el.textContent = msg || "";
  }

  function suggestUsername(name, email) {
    const base = (email ? email.split("@")[0] : name || "user")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 16);
    return base.length >= 4 ? base : `${base || "user"}_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function buildProfileFormHtml(prefix) {
    const s = pendingSetup || { name: "", email: "", picture: "" };
    const suggested = suggestUsername(s.name, s.email);
    return `
      <div class="tc-ga-setup-head">
        <div class="tc-ga-avatar">
          ${
            s.picture
              ? `<img src="${esc(s.picture)}" alt="" />`
              : `<span>${esc((s.name || "U")[0].toUpperCase())}</span>`
          }
        </div>
        <div class="tc-ga-email-pill">${esc(s.email || "Google Verified")}</div>
      </div>

      <label class="tc-ga-lbl">Full Name</label>
      <input id="${prefix}Name" class="tc-ga-input" type="text" maxlength="64" placeholder="Your full name" value="${esc(s.name)}" />

      <label class="tc-ga-lbl">Phone Number (No OTP required)</label>
      <div class="tc-ga-phone-row">
        <select id="${prefix}Country" class="tc-ga-country">
          ${COUNTRIES.map((c) => `<option value="${c.code}">${c.label}</option>`).join("")}
        </select>
        <input id="${prefix}Phone" class="tc-ga-input tc-ga-phone-inp" type="tel" inputmode="numeric" placeholder="300 1234567" autocomplete="tel-national" />
      </div>

      <label class="tc-ga-lbl">Username</label>
      <div class="tc-ga-user-wrap">
        <span>@</span>
        <input id="${prefix}User" class="tc-ga-input" type="text" maxlength="32" placeholder="username" value="${esc(suggested)}" />
      </div>

      <div id="${prefix}Err" class="tc-ga-err"></div>
      <button type="button" id="${prefix}Submit" class="tc-ga-primary">Create Account</button>
    `;
  }

  function bindProfileForm(root, prefix, onBack) {
    const submitBtn = root.querySelector(`#${prefix}Submit`);
    const errEl = root.querySelector(`#${prefix}Err`);

    submitBtn.onclick = async () => {
      const name = (root.querySelector(`#${prefix}Name`).value || "").trim();
      const cc = root.querySelector(`#${prefix}Country`).value || "+92";
      let rawPhone = (root.querySelector(`#${prefix}Phone`).value || "").replace(/[^\d+]/g, "");
      if (rawPhone.startsWith("0")) rawPhone = rawPhone.slice(1);
      const fullPhone = rawPhone.startsWith("+") ? rawPhone : `${cc}${rawPhone}`;
      const username = (root.querySelector(`#${prefix}User`).value || "").trim().replace(/^@/, "");

      errEl.textContent = "";
      if (!name) return (errEl.textContent = "Please enter your name");
      if (rawPhone.length < 7) return (errEl.textContent = "Please enter a valid phone number");
      if (!pendingSetup || !pendingSetup.setupToken) {
        errEl.textContent = "Session expired — please continue with Google again";
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account...";
      try {
        const res = await fetch("/api/auth/google/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            setupToken: pendingSetup.setupToken,
            name,
            phone: fullPhone,
            username
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Could not create account");

        pendingSetup = null;
        closeAddModal();
        saveAccountAndLogin(data.user, data.token);
      } catch (err) {
        errEl.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
      }
    };

    const backBtn = root.querySelector(`#${prefix}Back`);
    if (backBtn && onBack) backBtn.onclick = onBack;
  }

  // ===== 1. Main Fullscreen OLED Auth Screen =====
  function renderOledAuthScreen(view = "welcome") {
    const screen = document.getElementById("auth-screen");
    if (!screen) return;

    screen.classList.remove("hidden");
    screen.classList.add("tc-ga-screen");

    if (view === "setup") {
      screen.innerHTML = `
        <div class="tc-ga-card">
          <h2 class="tc-ga-title">Complete Your Profile</h2>
          <p class="tc-ga-sub">Set your phone number and username — you can always sign back in with Google.</p>
          ${buildProfileFormHtml("tcGAuth")}
          <button type="button" id="tcGAuthBack" class="tc-ga-ghost">Use another Google account</button>
        </div>
      `;
      bindProfileForm(screen, "tcGAuth", () => {
        pendingSetup = null;
        renderOledAuthScreen("welcome");
      });
      return;
    }

    if (view === "waiting") {
      screen.innerHTML = `
        <div class="tc-ga-card" style="text-align:center;">
          <div class="tc-ga-spinner"></div>
          <h2 class="tc-ga-title">Completing Google Sign-In...</h2>
          <p class="tc-ga-sub">Select your Google account in the browser — the app will reopen automatically once verified.</p>
          <div id="tcGAuthErr" class="tc-ga-err"></div>
          <button type="button" id="tcGAuthCancel" class="tc-ga-ghost">Cancel</button>
        </div>
      `;
      screen.querySelector("#tcGAuthCancel").onclick = () => {
        stopPolling();
        renderOledAuthScreen("welcome");
      };
      return;
    }

    screen.innerHTML = `
      <div class="tc-ga-card" style="text-align:center;">
        <div class="tc-ga-logo">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="#fff"><path d="M21.9 3.6a1.1 1.1 0 0 0-1.15-.17L2.6 10.6a1.1 1.1 0 0 0 .06 2.07l4.65 1.55 1.8 5.47a1.1 1.1 0 0 0 1.82.43l2.63-2.55 4.68 3.43a1.1 1.1 0 0 0 1.72-.66l2.6-15.6a1.1 1.1 0 0 0-.66-1.14zM9.7 13.7l8.2-5.4-6.4 6.7-.3 2.7-1.1-3.4-3.3-1.1 2.9.5z"/></svg>
        </div>
        <h2 class="tc-ga-title">Sign in to TeleClone</h2>
        <p class="tc-ga-sub">Sign in with your Google account to keep your chats, profile, and contacts synced and secure.</p>

        <button type="button" id="tcGoogleLoginBtn" class="tc-ga-google-btn">
          ${GOOGLE_SVG}
          <span>Continue with Google</span>
        </button>

        <div id="tcGAuthErr" class="tc-ga-err"></div>
        <div class="tc-ga-note">Fast • Secure • Instant Re-login on any phone</div>
      </div>
    `;

    screen.querySelector("#tcGoogleLoginBtn").onclick = () => startGoogleOAuth("login");
  }

  // ===== 2. Add Account Modal for 3-Account Switcher (Settings) =====
  function closeAddModal() {
    const old = document.getElementById("tcAddGoogleBackdrop");
    if (old) old.remove();
  }

  function openAddGoogleModal(view = "start") {
    closeAddModal();
    let count = 0;
    try {
      const arr = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
      count = Array.isArray(arr) ? arr.length : 0;
    } catch (_) {}

    if (view === "start" && count >= MAX_ACCOUNTS) {
      toast(`You can sign in to a maximum of ${MAX_ACCOUNTS} accounts`);
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.id = "tcAddGoogleBackdrop";
    backdrop.className = "tc-st-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        stopPolling();
        closeAddModal();
      }
    });

    if (view === "setup") {
      backdrop.innerHTML = `
        <div class="tc-st-modal-card">
          <div class="tc-st-modal-head">
            <h3>Complete New Account</h3>
            <button type="button" class="tc-st-circle-btn" id="tcAddGClose">✕</button>
          </div>
          ${buildProfileFormHtml("tcAddG")}
        </div>
      `;
      backdrop.querySelector("#tcAddGClose").onclick = closeAddModal;
      bindProfileForm(backdrop, "tcAddG");
    } else if (view === "waiting") {
      backdrop.innerHTML = `
        <div class="tc-st-modal-card" style="text-align:center;">
          <div class="tc-ga-spinner"></div>
          <h3 style="margin:0 0 8px;">Select Google Account</h3>
          <p class="tc-st-modal-desc">Select another Google account in your browser.</p>
          <div id="tcAddGErr" class="tc-ga-err"></div>
          <button type="button" class="tc-ga-ghost" id="tcAddGCancel">Cancel</button>
        </div>
      `;
      backdrop.querySelector("#tcAddGCancel").onclick = () => {
        stopPolling();
        closeAddModal();
      };
    } else {
      backdrop.innerHTML = `
        <div class="tc-st-modal-card" style="text-align:center;">
          <div class="tc-st-modal-head">
            <h3>Add Account (${count}/${MAX_ACCOUNTS})</h3>
            <button type="button" class="tc-st-circle-btn" id="tcAddGClose">✕</button>
          </div>
          <p class="tc-st-modal-desc">Add another Google account — your existing accounts will stay signed in.</p>
          <button type="button" id="tcAddGBtn" class="tc-ga-google-btn" style="margin-top:6px;">
            ${GOOGLE_SVG}
            <span>Continue with Google</span>
          </button>
          <div id="tcAddGErr" class="tc-ga-err"></div>
        </div>
      `;
      backdrop.querySelector("#tcAddGClose").onclick = closeAddModal;
      backdrop.querySelector("#tcAddGBtn").onclick = () => startGoogleOAuth("add");
    }

    document.body.appendChild(backdrop);
  }

  // Settings ke "Add Account" button ko Google modal par route karein
  document.addEventListener(
    "click",
    (e) => {
      const addBtn = e.target.closest("#tcStAddAccountBtn, [data-more='add']");
      if (!addBtn) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const moreMenu = document.getElementById("tcStMoreMenu");
      if (moreMenu) moreMenu.classList.add("hidden");
      openAddGoogleModal("start");
    },
    true
  );

  // App resume hone par foran poll check karein (Android Chrome -> TeleClone return)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activePollSid) {
      checkPollOnce(activePollSid);
    }
  });

  // Deep link callback hook (MainActivity.java -> window.dispatchEvent)
  window.addEventListener("tc-google-callback", (e) => {
    const det = (e && e.detail) || {};
    if (det.sid) {
      activePollAction = det.action || activePollAction || "login";
      checkPollOnce(det.sid);
    }
  });

  // ===== Init =====
  function initGoogleAuth() {
    // 1. Check URL query params (Web OAuth callback return)
    const params = new URLSearchParams(window.location.search);
    const returnedSid = params.get("google_sid");
    const returnedAction = params.get("google_action") || "login";
    if (returnedSid) {
      params.delete("google_sid");
      params.delete("google_action");
      const cleanQs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${cleanQs ? "?" + cleanQs : ""}`);
      activePollAction = returnedAction;
      checkPollOnce(returnedSid);
    }

    // 2. Replace legacy OTP screen whenever #auth-screen becomes visible
    const screen = document.getElementById("auth-screen");
    if (!screen) return;

    const upgradeIfVisible = () => {
      if (!screen.classList.contains("hidden") && !screen.querySelector(".tc-ga-card")) {
        renderOledAuthScreen(pendingSetup ? "setup" : "welcome");
      }
    };

    upgradeIfVisible();
    const obs = new MutationObserver(() => upgradeIfVisible());
    obs.observe(screen, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initGoogleAuth);
  } else {
    initGoogleAuth();
  }

  window.TCGoogleAuth = {
    openAddAccount: () => openAddGoogleModal("start"),
    handleDeepLinkSid: (sid, action) => {
      activePollAction = action || "login";
      checkPollOnce(sid);
    }
  };
})();