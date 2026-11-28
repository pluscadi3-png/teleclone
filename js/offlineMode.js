(() => {
  "use strict";

  const SHELL_CACHE = "teleclone-shell-v23";
  const MEDIA_CACHE = "teleclone-media-v1";
  const TOKEN_TRACK_KEY = "tc_offline_token_sig";
  const cachedMediaSet = new Set();

  let bannerEl = null;
  let hideTimer = null;
  let isCurrentlyOffline = !navigator.onLine;

  // ===== 1. Register Service Worker & Warm App Shell Cache =====
  function registerOfflineSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => {
        if (navigator.onLine) warmShellAssets();
      })
      .catch((err) => console.warn("[OfflineSW]", err));
  }

  async function warmShellAssets() {
    // Service Worker caches versioned JS/CSS automatically on first load (no boot flood)
    if ("caches" in window) caches.delete("teleclone-shell-v1").catch(() => {});
  }

  // Account switch ya logout par purane account ki API cache clear karein
  function syncAccountCachePrivacy() {
    let token = "";
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i)) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        token = v;
        break;
      }
    }
    const sig = token ? token.slice(-16) : "";
    const prev = localStorage.getItem(TOKEN_TRACK_KEY) || "";
    if (prev && prev !== sig) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
      }
      if ("caches" in window) caches.delete("teleclone-api-v2").catch(() => {});
    }
    localStorage.setItem(TOKEN_TRACK_KEY, sig);
  }

  // ===== 2. Auto-Cache Downloaded / Played Media (Photos, Videos, Voice) =====
  async function saveMediaToOfflineCache(rawUrl) {
    if (!rawUrl || !navigator.onLine || !("caches" in window)) return;
    let url;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch (_) {
      return;
    }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/uploads/")) return;
    if (cachedMediaSet.has(url.pathname)) return;
    cachedMediaSet.add(url.pathname);

    try {
      const cache = await caches.open(MEDIA_CACHE);
      const exists = await cache.match(url.pathname);
      if (exists) return;
      const res = await fetch(url.href);
      if (res && res.status === 200) {
        await cache.put(url.pathname, res.clone());
      }
    } catch (_) {
      cachedMediaSet.delete(url.pathname);
    }
  }

  function scanVisibleMedia() {
    if (!navigator.onLine) return;
    document.querySelectorAll('img[src*="/uploads/"]').forEach((img) => {
      saveMediaToOfflineCache(img.getAttribute("src"));
    });
    document.querySelectorAll('[data-voice-src*="/uploads/"]').forEach((el) => {
      saveMediaToOfflineCache(el.getAttribute("data-voice-src"));
    });
  }

  // Video play karne par ya koi photo/video/file download click par full file cache kar lein
  document.addEventListener(
    "play",
    (e) => {
      const target = e.target;
      if (!target || (target.tagName !== "VIDEO" && target.tagName !== "AUDIO")) return;
      const src = target.currentSrc || target.getAttribute("src");
      if (src) saveMediaToOfflineCache(src);
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const link = e.target.closest('a[href*="/uploads/"]');
      if (link) saveMediaToOfflineCache(link.getAttribute("href"));
    },
    true
  );

  // ===== 3. Telegram-Style Top "Connect to internet" Banner =====
  function ensureBanner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement("div");
    bannerEl.id = "tcOfflineBanner";
    bannerEl.className = "tc-offline-banner";
    bannerEl.innerHTML = `
      <span class="tc-ob-spinner"></span>
      <span class="tc-ob-text">Connect to internet</span>
    `;
    document.body.appendChild(bannerEl);
    return bannerEl;
  }

  function showOfflineBanner() {
    isCurrentlyOffline = true;
    clearTimeout(hideTimer);
    const el = ensureBanner();
    el.classList.remove("is-online");
    el.classList.add("is-visible");
    el.querySelector(".tc-ob-text").textContent = "Connect to internet";
    document.body.classList.add("tc-offline-active");
  }

  function showBackOnlineBanner() {
    const wasOffline = isCurrentlyOffline;
    isCurrentlyOffline = false;
    clearTimeout(hideTimer);

    if (!wasOffline) {
      if (bannerEl) bannerEl.classList.remove("is-visible");
      document.body.classList.remove("tc-offline-active");
      return;
    }

    const el = ensureBanner();
    el.classList.add("is-visible", "is-online");
    el.querySelector(".tc-ob-text").textContent = "Connected";

    hideTimer = setTimeout(() => {
      el.classList.remove("is-visible", "is-online");
      document.body.classList.remove("tc-offline-active");
    }, 1800);

    // Net wapas aane par fresh chats sync karein (bina page reload kiye)
    try {
      if (window.App && typeof window.App.renderAll === "function") {
        window.App.renderAll();
      }
    } catch (_) {}
  }

  // Real connectivity verify karein (sirf navigator.onLine par bharosa nahi)
  async function checkConnectivity() {
    if (!navigator.onLine) {
      showOfflineBanner();
      return;
    }
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res && res.ok) showBackOnlineBanner();
      else showOfflineBanner();
    } catch (_) {
      showOfflineBanner();
    }
  }

  window.addEventListener("offline", showOfflineBanner);
  window.addEventListener("online", () => {
    checkConnectivity();
    warmShellAssets();
  });

  window.addEventListener("DOMContentLoaded", () => {
    registerOfflineSW();
    syncAccountCachePrivacy();

    if (!navigator.onLine) showOfflineBanner();
    else checkConnectivity();

    scanVisibleMedia();
    const obs = new MutationObserver(() => {
      if (navigator.onLine) scanVisibleMedia();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Har 12 second mein check karein agar offline ho to net wapas aaya ya nahi
    setInterval(() => {
      if (isCurrentlyOffline && navigator.onLine) checkConnectivity();
      syncAccountCachePrivacy();
    }, 12000);
  });
})();