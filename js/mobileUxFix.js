(() => {
  "use strict";

  let lastRootBackAt = 0;

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
    t._tid = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.right > 0 && r.left < window.innerWidth;
  }

  // ==================== 1. ENABLE ANDROID KEYBOARD SUGGESTIONS ====================
  const SKIP_INPUT_TYPES = new Set([
    "password",
    "email",
    "tel",
    "number",
    "url",
    "hidden",
    "file",
    "checkbox",
    "radio",
    "range",
    "date",
    "time",
    "color"
  ]);
  const SKIP_FIELD_RE = /(otp|code|phone|username|handle|password|passwd|token|pin)/i;

  function enableSuggestionsOnEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.dataset.tcSugDone === "1") return;
    const tag = el.tagName;
    if (tag !== "TEXTAREA" && tag !== "INPUT") return;

    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (tag === "INPUT" && SKIP_INPUT_TYPES.has(type)) return;

    const ident = (el.id || "") + " " + (el.name || "") + " " + (el.className || "");
    if (el.id !== "msg-input" && SKIP_FIELD_RE.test(ident)) return;

    // Remove autocomplete="off" and enable native correction/capitalization cleanly
    if (el.getAttribute("autocomplete") === "off") {
      el.removeAttribute("autocomplete");
    }
    el.setAttribute("autocorrect", "on");
    el.setAttribute("autocapitalize", "sentences");
    el.setAttribute("spellcheck", "true");
    el.spellcheck = true;
    el.dataset.tcSugDone = "1";
    if (tag === "TEXTAREA" && el.getAttribute("inputmode") === "text") {
      el.removeAttribute("inputmode");
    }

    const parentForm = el.closest("form");
    if (parentForm && parentForm.getAttribute("autocomplete") === "off") {
      parentForm.setAttribute("autocomplete", "on");
    }
  }

  function scanAllInputsForSuggestions() {
    document.querySelectorAll("textarea, input").forEach(enableSuggestionsOnEl);
  }

  document.addEventListener(
    "focusin",
    (e) => {
      enableSuggestionsOnEl(e.target);
    },
    true
  );

  // ==================== 2. SMART TELEGRAM-STYLE BACK BUTTON ====================
  function tryCloseBySelectors(containerSelectors, closeBtnSelectors) {
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (!isVisible(el)) continue;

      for (const btnSel of closeBtnSelectors) {
        const btn = el.querySelector(btnSel);
        if (btn && isVisible(btn)) {
          btn.click();
          return true;
        }
      }
      // Fallback: hide or remove overlay cleanly
      if (el.id === "app-modal" || el.id === "info-panel" || el.id === "story-viewer") {
        el.classList.add("hidden");
      } else {
        el.remove();
      }
      return true;
    }
    return false;
  }

  function closeOpenOverlays() {
    // A. Active fullscreen voice/video call -> minimize instead of dropping call
    const callOv = document.getElementById("tcVoiceCallOverlay");
    if (isVisible(callOv)) {
      const minBtn = document.getElementById("tcVcMinBtn");
      if (minBtn) {
        minBtn.click();
        return true;
      }
    }

    // B. Recent Calls Log modal
    if (tryCloseBySelectors(["#tcCallsLogOverlay"], ["#tcCallsCloseBtn"])) return true;

    // C. Camera capture / Media lightbox / Story viewer
    if (
      tryCloseBySelectors(
        [
          "#tcCameraOverlay",
          "#tcCamOverlay",
          ".tc-cam-overlay",
          "#media-viewer:not(.hidden)",
          "#image-lightbox:not(.hidden)",
          "#tcMediaViewer",
          "#tcMediaLightbox",
          ".tc-lightbox",
          ".media-lightbox:not(.hidden)",
          "#live-story-viewer",
          "#story-viewer:not(.hidden)",
          ".story-viewer:not(.hidden)"
        ],
        [
          "#tcCamCloseBtn",
          "#media-viewer-close",
          "#story-close-btn",
          ".tc-lightbox-close",
          ".close-btn",
          "[data-close]",
          "[aria-label='Close']",
          "[aria-label='Back']"
        ]
      )
    ) {
      return true;
    }

    // D. Peer Profile / Pro Profile / Pro Settings / Add Post overlays
    if (
      tryCloseBySelectors(
        [
          "#tcAddPostBackdrop",
          "#tcPeerProfileOverlay",
          "#tcPeerProfileBackdrop",
          ".tc-peer-overlay",
          ".tc-pp-overlay",
          "#tcProProfileOverlay",
          "#tcProSettingsOverlay",
          ".tc-ps-overlay",
          ".tc-pro-overlay",
          ".tc-sheet-backdrop.show",
          ".tc-modal-overlay.show"
        ],
        [
          "#tcPeerBackBtn",
          "#tcPeerCloseBtn",
          ".tc-pp-back",
          ".tc-ps-back",
          ".tc-back-btn",
          ".tc-close-btn",
          "[data-close]",
          "[aria-label='Back']",
          "[aria-label='Close']"
        ]
      )
    ) {
      return true;
    }

    // E. Any dynamic high z-index full-screen .tc-* overlay currently open
    const dynamicOverlays = Array.from(document.body.children).filter((el) => {
      if (!el || el.nodeType !== 1) return false;
      const id = el.id || "";
      const cls = typeof el.className === "string" ? el.className : "";
      if (id === "tcVoiceCallMiniBar" || id === "tcQuickToast" || id === "tcBottomNav") return false;
      if (!/(overlay|backdrop|modal|viewer|lightbox|sheet)/i.test(id + " " + cls)) return false;
      if (id === "drawer-overlay" || id === "app-modal") return false;
      const st = window.getComputedStyle(el);
      return st.position === "fixed" && Number(st.zIndex || 0) >= 900 && isVisible(el);
    });
    if (dynamicOverlays.length) {
      const topOv = dynamicOverlays[dynamicOverlays.length - 1];
      const backBtn = topOv.querySelector(
        "[aria-label='Back'], [aria-label='Close'], [data-close], .back-btn, .close-btn, button[id*='Close'], button[id*='Back']"
      );
      if (backBtn) {
        backBtn.click();
      } else if (topOv.classList.contains("open") || topOv.classList.contains("show")) {
        topOv.classList.remove("open", "show");
      } else {
        topOv.remove();
      }
      return true;
    }

    // F. Generic App Modal (#app-modal)
    const appModal = document.getElementById("app-modal");
    if (appModal && !appModal.classList.contains("hidden") && isVisible(appModal)) {
      const closeBtn = appModal.querySelector("#app-modal-close, .modal-close, [data-close]");
      if (closeBtn) closeBtn.click();
      else appModal.classList.add("hidden");
      return true;
    }

    // G. Chat Info Panel
    const infoPanel = document.getElementById("info-panel");
    if (infoPanel && !infoPanel.classList.contains("hidden") && isVisible(infoPanel)) {
      const closeBtn = infoPanel.querySelector("#info-close-btn, #close-info-btn, .close-btn");
      if (closeBtn) closeBtn.click();
      else infoPanel.classList.add("hidden");
      return true;
    }

    // H. Navigation Drawer
    const drawerOv = document.getElementById("drawer-overlay") || document.querySelector(".drawer-overlay");
    const openDrawer = document.querySelector("#drawer.open, #side-drawer.open, .drawer.open, .side-drawer.open");
    if (openDrawer || (drawerOv && !drawerOv.classList.contains("hidden") && isVisible(drawerOv))) {
      if (drawerOv) {
        try { drawerOv.click(); } catch (_) {}
        drawerOv.classList.add("hidden");
      }
      if (openDrawer) openDrawer.classList.remove("open", "active");
      return true;
    }

    // I. In-chat popups (More menu, Emoji picker, Attach menu, Search bar, Context menu)
    const popups = [
      "#chat-more-menu:not(.hidden)",
      "#emoji-picker:not(.hidden)",
      "#attach-menu:not(.hidden)",
      "#chat-search-bar:not(.hidden)",
      ".context-menu:not(.hidden)",
      ".tc-ctx-menu"
    ];
    for (const pSel of popups) {
      const pEl = document.querySelector(pSel);
      if (!isVisible(pEl)) continue;
      if (pEl.id === "chat-search-bar") {
        const toggle = document.getElementById("chat-search-toggle");
        if (toggle) toggle.click();
        else pEl.classList.add("hidden");
      } else {
        pEl.classList.add("hidden");
      }
      return true;
    }

    return false;
  }

  function closeActiveChatIfOpen() {
    // 1. Primary mobile back button inside chat header
    const backBtn = document.getElementById("mobile-back-btn") || document.querySelector(".chat-header .back-btn");
    if (isVisible(backBtn)) {
      backBtn.click();
      return true;
    }

    // 2. Fallback: active mobile chat panel class
    const openShell = document.querySelector(".app-container.chat-open, .app-shell.chat-open, body.chat-open");
    if (openShell) {
      openShell.classList.remove("chat-open");
      return true;
    }

    return false;
  }

  function returnToChatsTabIfNeeded() {
    const activeTab = document.querySelector(
      "#tcBottomNav .active, .tc-bottom-nav .active, .tc-bnav-item.active"
    );
    if (!activeTab) return false;
    const tabName = (
      activeTab.getAttribute("data-tab") ||
      activeTab.getAttribute("data-bnav") ||
      activeTab.textContent ||
      ""
    )
      .trim()
      .toLowerCase();
    if (tabName && !tabName.includes("chat")) {
      const chatsBtn = document.querySelector(
        '[data-tab="chats"], [data-bnav="chats"], #tcBottomNav button:nth-child(3)'
      );
      if (chatsBtn) {
        chatsBtn.click();
        return true;
      }
    }
    return false;
  }

  function handleBackAction() {
    if (closeOpenOverlays()) return true;
    if (closeActiveChatIfOpen()) return true;
    if (returnToChatsTabIfNeeded()) return true;
    return false;
  }

  // Native Android Capacitor Back Button Hook (requires @capacitor/app in APK)
  function initCapacitorBackButton() {
    const cap = window.Capacitor;
    const CapApp = cap && cap.Plugins && cap.Plugins.App;
    if (!CapApp || typeof CapApp.addListener !== "function") return false;
    if (window._tcCapBackBound) return true;
    window._tcCapBackBound = true;

    CapApp.addListener("backButton", () => {
      if (handleBackAction()) return;

      const now = Date.now();
      if (now - lastRootBackAt < 2000) {
        lastRootBackAt = 0;
        if (typeof CapApp.minimizeApp === "function") {
          CapApp.minimizeApp();
        } else if (typeof CapApp.exitApp === "function") {
          CapApp.exitApp();
        }
      } else {
        lastRootBackAt = now;
        toast("Press back again to exit");
      }
    });
    return true;
  }

  // Mobile Browser / PWA Back Button Hook (History API fallback)
  function initWebHistoryBackGuard() {
    if (window._tcWebBackBound) return;
    window._tcWebBackBound = true;

    let guardArmed = false;
    const armGuard = () => {
      if (window._tcCapBackBound || guardArmed) return;
      guardArmed = true;
      try {
        window.history.pushState({ tcGuard: 1 }, "", window.location.href);
      } catch (_) {}
    };

    document.addEventListener("pointerdown", armGuard, { passive: true });

    window.addEventListener("popstate", () => {
      if (window._tcCapBackBound) return;
      if (handleBackAction()) {
        try {
          window.history.pushState({ tcGuard: 1 }, "", window.location.href);
        } catch (_) {}
        return;
      }

      const now = Date.now();
      if (now - lastRootBackAt < 2000) {
        lastRootBackAt = 0;
        guardArmed = false;
        return;
      }
      lastRootBackAt = now;
      toast("Press back again to exit");
      try {
        window.history.pushState({ tcGuard: 1 }, "", window.location.href);
      } catch (_) {}
    });
  }

  function boot() {
    scanAllInputsForSuggestions();
    initCapacitorBackButton();
    initWebHistoryBackGuard();

    const obs = new MutationObserver(() => {
      scanAllInputsForSuggestions();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    setTimeout(initCapacitorBackButton, 600);
    setTimeout(initCapacitorBackButton, 1800);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.TCBackHandler = handleBackAction;
})();
