(() => {
  "use strict";

  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const FCM_TOKEN_KEY = "tc_fcm_device_token";

  let initialized = false;
  let lastSyncedKey = "";

  function getActiveToken() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        !k ||
        k === ACCOUNTS_KEY ||
        k === JWT_KEY_CACHE ||
        k === FCM_TOKEN_KEY ||
        k === "tc_offline_token_sig"
      ) {
        continue;
      }
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        localStorage.setItem(JWT_KEY_CACHE, k);
        return v;
      }
    }
    return localStorage.getItem(localStorage.getItem(JWT_KEY_CACHE) || "teleclone_jwt") || "";
  }

  async function syncTokenToServer(fcmToken) {
    const tok = (fcmToken || localStorage.getItem(FCM_TOKEN_KEY) || "").trim();
    const jwt = getActiveToken();
    if (!tok || !jwt) return;

    const pairKey = `${jwt.slice(-16)}:${tok.slice(-16)}`;
    if (pairKey === lastSyncedKey) return;

    try {
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify({ token: tok, platform: "android" })
      });
      if (res.ok) {
        lastSyncedKey = pairKey;
      }
    } catch (_) {}
  }

  function openChatFromPush(chatId) {
    if (!chatId) return;
    const cid = String(chatId);
    let tries = 0;
    const attempt = () => {
      tries++;
      if (window.App && typeof window.App.openChat === "function") {
        window.App.openChat(cid);
        return;
      }
      if (tries < 20) setTimeout(attempt, 250);
    };
    attempt();
  }

  async function initNativePush() {
    if (initialized) return;
    const cap = window.Capacitor;
    const Push = cap && cap.Plugins && cap.Plugins.PushNotifications;
    if (!Push) return;

    initialized = true;

    // Create high-importance Android channels for Messages & Calls
    try {
      if (typeof Push.createChannel === "function") {
        await Push.createChannel({
          id: "teleclone_messages",
          name: "Messages",
          description: "New chat messages",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true
        });
        await Push.createChannel({
          id: "teleclone_calls",
          name: "Incoming Calls",
          description: "Voice and video call alerts",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true
        });
      }
    } catch (_) {}

    Push.addListener("registration", (tokenObj) => {
      const tok = tokenObj && tokenObj.value ? String(tokenObj.value).trim() : "";
      if (!tok) return;
      localStorage.setItem(FCM_TOKEN_KEY, tok);
      syncTokenToServer(tok);
    });

    Push.addListener("registrationError", (err) => {
      console.warn("[TCPush] Registration error:", err);
    });

    // When user taps a notification from Android status bar, open that chat
    Push.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action && action.notification && action.notification.data) || {};
      if (data.chatId) {
        openChatFromPush(data.chatId);
      }
    });

    try {
      let perm = await Push.checkPermissions();
      if (perm && perm.receive !== "granted") {
        perm = await Push.requestPermissions();
      }
      if (perm && perm.receive === "granted") {
        await Push.register();
      }
    } catch (err) {
      console.warn("[TCPush] Permission/register failed:", err);
    }

    // Re-sync cached token if account switched or app resumed
    syncTokenToServer();
    setTimeout(() => syncTokenToServer(), 2500);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncTokenToServer();
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initNativePush);
  } else {
    initNativePush();
  }

  window.TCPush = {
    syncNow: () => syncTokenToServer()
  };
})();