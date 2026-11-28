(() => {
  "use strict";

  const PREFS_KEY = "tc_translate_prefs_v1";
  const IN_CACHE_KEY = "tc_translate_in_cache_v1";
  const SENT_ORIG_KEY = "tc_translate_sent_orig_v1";

  const LANGUAGES = [
    { code: "ur-Latn", label: "Roman Urdu", short: "Roman Urdu" },
    { code: "ur", label: "Urdu (\u0627\u0631\u062F\u0648)", short: "Urdu" },
    { code: "en", label: "English", short: "English" },
    { code: "hi", label: "Hindi", short: "Hindi" },
    { code: "pa", label: "Punjabi", short: "Punjabi" },
    { code: "ar", label: "Arabic", short: "Arabic" },
    { code: "tr", label: "Turkish", short: "Turkish" },
    { code: "es", label: "Spanish", short: "Spanish" },
    { code: "fr", label: "French", short: "French" },
    { code: "de", label: "German", short: "German" },
    { code: "zh-CN", label: "Chinese", short: "Chinese" },
    { code: "ru", label: "Russian", short: "Russian" },
    { code: "ps", label: "Pashto", short: "Pashto" },
    { code: "fa", label: "Persian", short: "Persian" },
    { code: "id", label: "Indonesian", short: "Indonesian" },
    { code: "pt", label: "Portuguese", short: "Portuguese" }
  ];

  const GLOBE_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="2" y1="12" x2="22" y2="12"></line>' +
    '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>' +
    "</svg>";

  const CALL_MSG_RE = /^(?:\uD83D\uDCDE|\uD83D\uDCF9)\s+(?:Missed\s+)?(?:Voice|Video)\s+Call/;
  const URL_ONLY_RE = /^https?:\/\/\S+$/i;
  const HAS_LETTER_RE = /[A-Za-z\u0600-\u06FF\u0900-\u097F\u0400-\u04FF\u4E00-\u9FFF]/;

  let prefsMap = loadJson(PREFS_KEY, {});
  let inCache = loadJson(IN_CACHE_KEY, {});
  let sentOrigMap = loadJson(SENT_ORIG_KEY, {});
  const showOriginalSet = new Set();
  const inFlightKeys = new Set();
  const trQueue = [];
  let activeReqs = 0;
  let lastEngine = "";
  let lastSyncedChatId = "";

  function loadJson(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v && typeof v === "object" ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJsonTrimmed(key, obj, maxKeys) {
    try {
      const keys = Object.keys(obj);
      if (keys.length > maxKeys) {
        const drop = keys.length - maxKeys;
        for (let i = 0; i < drop; i++) delete obj[keys[i]];
      }
      localStorage.setItem(key, JSON.stringify(obj));
    } catch (_) {}
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getLangLabel(code) {
    const f = LANGUAGES.find((l) => l.code === code);
    return f ? f.short : code || "Auto";
  }

  function getStoreObj() {
    try {
      if (window.Store && typeof window.Store.getState === "function") return window.Store;
    } catch (_) {}
    return null;
  }

  function getActiveChatId() {
    const st = getStoreObj();
    if (!st) return "";
    const id = st.getState().activeChatId;
    return id !== null && id !== undefined ? String(id) : "";
  }

  function getActiveChat() {
    const st = getStoreObj();
    const cid = getActiveChatId();
    if (!st || !cid) return null;
    if (typeof st.getChatById === "function") return st.getChatById(cid);
    const chats = st.getState().chats || [];
    return chats.find((c) => String(c.id) === cid) || null;
  }

  function getToken() {
    const keys = [
      "teleclone_live_jwt",
      "teleclone_jwt",
      "teleclone_token",
      "tc_token",
      "token",
      "auth_token",
      "jwt"
    ];
    for (let i = 0; i < keys.length; i++) {
      const v = localStorage.getItem(keys[i]);
      if (v && v.trim()) return v.trim();
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.trim())) {
          return v.trim();
        }
      }
    } catch (_) {}
    return "";
  }

  function getPref(chatId) {
    const cid = String(chatId || "");
    const p = prefsMap[cid];
    if (!p || !p.enabled) return null;
    return {
      enabled: true,
      myLang: p.myLang || "ur-Latn",
      theirLang: p.theirLang || "en",
      translateIncoming: p.translateIncoming !== false
    };
  }

  function setPref(chatId, pref) {
    const cid = String(chatId || "");
    if (!cid) return;
    if (!pref || !pref.enabled) {
      delete prefsMap[cid];
    } else {
      prefsMap[cid] = {
        enabled: true,
        myLang: pref.myLang || "ur-Latn",
        theirLang: pref.theirLang || "en",
        translateIncoming: pref.translateIncoming !== false
      };
    }
    saveJsonTrimmed(PREFS_KEY, prefsMap, 200);
    syncComposerUI();
    scheduleProcessMessages();
  }

  function shouldSkipText(text) {
    const t = String(text || "").trim();
    if (!t || t.length < 2) return true;
    if (t.startsWith("/")) return true;
    if (CALL_MSG_RE.test(t)) return true;
    if (URL_ONLY_RE.test(t)) return true;
    if (!HAS_LETTER_RE.test(t)) return true;
    return false;
  }

  async function requestTranslation(text, sourceLang, targetLang) {
    const token = getToken();
    if (!token) return text;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          text: String(text || ""),
          sourceLang: sourceLang || "auto",
          targetLang: targetLang || "en"
        })
      });
      if (!res.ok) return text;
      const data = await res.json().catch(() => ({}));
      if (data.engine) lastEngine = data.engine;
      return data.translatedText || text;
    } catch (_) {
      return text;
    }
  }

  // ===== 1. OUTGOING AUTO-TRANSLATE (Called by liveBridge.js Store.addMessage) =====
  async function translateOutgoing(chatId, rawText, tempId) {
    const cid = String(chatId || "");
    const pref = getPref(cid);
    if (!pref) return rawText;
    if (shouldSkipText(rawText)) return rawText;
    if (pref.myLang === pref.theirLang) return rawText;

    const translated = await requestTranslation(rawText, pref.myLang, pref.theirLang);
    if (!translated || translated.trim() === rawText.trim()) return rawText;

    const sigKey = cid + "::" + translated.trim();
    sentOrigMap[sigKey] = rawText.trim();
    saveJsonTrimmed(SENT_ORIG_KEY, sentOrigMap, 250);

    // Update pending optimistic bubble immediately so no mismatch occurs
    try {
      const st = getStoreObj();
      const chat = st && typeof st.getChatById === "function" ? st.getChatById(cid) : null;
      if (chat && Array.isArray(chat.messages) && tempId) {
        const m = chat.messages.find((x) => x._tempId === tempId || String(x.id) === String(tempId));
        if (m) {
          m.text = translated;
          chat.lastMessage = translated.replace(/\n/g, " ").slice(0, 70);
          if (window.ChatUI && getActiveChatId() === cid) {
            window.ChatUI.renderActiveChat(false);
          }
        }
      }
    } catch (_) {}

    return translated;
  }

  // ===== 2. INCOMING AUTO-TRANSLATE + OUTGOING "YOU WROTE" NOTE =====
  function enqueueTranslation(task) {
    if (inFlightKeys.has(task.cacheKey)) return;
    inFlightKeys.add(task.cacheKey);
    trQueue.push(task);
    drainQueue();
  }

  function drainQueue() {
    while (activeReqs < 3 && trQueue.length > 0) {
      const task = trQueue.shift();
      activeReqs++;
      requestTranslation(task.text, task.sourceLang, task.targetLang)
        .then((translated) => {
          inCache[task.cacheKey] = translated;
          saveJsonTrimmed(IN_CACHE_KEY, inCache, 350);
          scheduleProcessMessages();
        })
        .catch(() => {})
        .finally(() => {
          inFlightKeys.delete(task.cacheKey);
          activeReqs--;
          drainQueue();
        });
    }
  }

  function formatMultilineHtml(txt) {
    return esc(txt).replace(/\n/g, "<br>");
  }

  function processVisibleMessages() {
    const cid = getActiveChatId();
    if (cid !== lastSyncedChatId) {
      lastSyncedChatId = cid;
      syncComposerUI();
    }

    const container =
      document.getElementById("messages-container") ||
      document.getElementById("chat-messages");
    if (!container || !cid) return;

    const chat = getActiveChat();
    if (!chat || !Array.isArray(chat.messages)) return;

    const pref = getPref(cid);
    const msgById = new Map();
    for (let i = 0; i < chat.messages.length; i++) {
      const m = chat.messages[i];
      if (m && m.id !== undefined) msgById.set(String(m.id), m);
    }

    const rows = Array.from(container.querySelectorAll(".msg-row[data-msg-id]"));
    // Process latest 25 rows first for instant feel
    const startIdx = Math.max(0, rows.length - 25);

    for (let i = rows.length - 1; i >= startIdx; i--) {
      const row = rows[i];
      const mid = row.getAttribute("data-msg-id");
      const msg = msgById.get(String(mid));
      if (!msg || !msg.text) continue;
      if (shouldSkipText(msg.text)) continue;

      const textEl = row.querySelector(".msg-text");
      if (!textEl) continue;
      if (textEl.querySelector(".tc-chat-call-card")) continue;

      // Case A: Outgoing message -> if we translated it, show tiny "You wrote: ..." note
      if (msg.sender === "me") {
        const origKey = cid + "::" + msg.text.trim();
        const origTyped = sentOrigMap[origKey];
        if (origTyped && origTyped !== msg.text.trim()) {
          if (!textEl.querySelector(".tc-tr-sent-orig")) {
            const note = document.createElement("div");
            note.className = "tc-tr-sent-orig";
            note.textContent = "Original: " + origTyped;
            textEl.appendChild(note);
          }
        }
        continue;
      }

      // Case B: Incoming message -> restore raw if translation is OFF for this chat
      if (!pref || !pref.translateIncoming) {
        if (textEl.dataset.tcTrState) {
          delete textEl.dataset.tcTrState;
          textEl.innerHTML = formatMultilineHtml(msg.text);
        }
        continue;
      }

      const targetLang = pref.myLang;
      const cacheKey = cid + ":" + mid + ":" + targetLang + ":" + msg.text.slice(0, 40);
      const cached = inCache[cacheKey];
      const showingOrig = showOriginalSet.has(cacheKey);
      const desiredState = cached ? (showingOrig ? "orig:" + cacheKey : "tr:" + cacheKey) : "wait:" + cacheKey;

      if (textEl.dataset.tcTrState === desiredState) continue;

      if (cached) {
        if (cached.trim().toLowerCase() === msg.text.trim().toLowerCase()) {
          textEl.dataset.tcTrState = desiredState;
          continue;
        }
        textEl.dataset.tcTrState = desiredState;
        const shownText = showingOrig ? msg.text : cached;
        const tagLabel = showingOrig ? "Original" : "Translated (" + getLangLabel(targetLang) + ")";
        const btnLabel = showingOrig ? "Show translation" : "Show original";

        textEl.innerHTML =
          '<div class="tc-tr-body">' + formatMultilineHtml(shownText) + "</div>" +
          '<div class="tc-tr-meta">' +
            '<span class="tc-tr-tag">' + esc(tagLabel) + "</span>" +
            '<span class="tc-tr-dot">&#183;</span>' +
            '<button type="button" class="tc-tr-toggle">' + esc(btnLabel) + "</button>" +
          "</div>";

        const tBtn = textEl.querySelector(".tc-tr-toggle");
        if (tBtn) {
          tBtn.onclick = (ev) => {
            ev.stopPropagation();
            if (showOriginalSet.has(cacheKey)) showOriginalSet.delete(cacheKey);
            else showOriginalSet.add(cacheKey);
            delete textEl.dataset.tcTrState;
            processVisibleMessages();
          };
        }
      } else {
        textEl.dataset.tcTrState = desiredState;
        if (!textEl.querySelector(".tc-tr-loading")) {
          const ld = document.createElement("div");
          ld.className = "tc-tr-meta tc-tr-loading";
          ld.textContent = "Translating...";
          textEl.appendChild(ld);
        }
        enqueueTranslation({
          cacheKey,
          text: msg.text,
          sourceLang: pref.theirLang || "auto",
          targetLang
        });
      }
    }
  }

  let procRaf = 0;
  function scheduleProcessMessages() {
    if (procRaf || window._tcIsScrolling) return;
    procRaf = requestAnimationFrame(() => {
      procRaf = 0;
      processVisibleMessages();
    });
  }

  // ===== 3. COMPOSER GLOBE BUTTON + ACTIVE PILL BAR + SETTINGS MODAL =====
  function ensureComposerControls() {
    const wrap = document.getElementById("composer-input-wrap");
    if (!wrap) return;

    if (!document.getElementById("tc-translate-btn")) {
      const btn = document.createElement("button");
      btn.id = "tc-translate-btn";
      btn.type = "button";
      btn.className = "icon-btn tc-tr-btn";
      btn.title = "Chat Translator";
      btn.setAttribute("aria-label", "Chat Translator");
      btn.innerHTML = GLOBE_SVG;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTranslateModal();
      });

      const emojiBtn = document.getElementById("emoji-btn");
      if (emojiBtn && emojiBtn.parentNode === wrap) {
        wrap.insertBefore(btn, emojiBtn.nextSibling);
      } else {
        wrap.insertBefore(btn, wrap.firstChild);
      }
    }

    if (!document.getElementById("tc-translate-pill")) {
      const composer =
        wrap.closest(".composer-bar, .chat-composer, .composer, footer") ||
        wrap.parentElement;
      if (composer && composer.parentNode) {
        const pill = document.createElement("div");
        pill.id = "tc-translate-pill";
        pill.className = "tc-tr-pill hidden";
        pill.innerHTML =
          '<div class="tc-tr-pill-left" id="tcTrPillText"></div>' +
          '<div class="tc-tr-pill-actions">' +
            '<button type="button" class="tc-tr-pill-btn" id="tcTrPillChange">Change</button>' +
            '<button type="button" class="tc-tr-pill-btn off" id="tcTrPillOff">Off</button>' +
          "</div>";
        composer.parentNode.insertBefore(pill, composer);

        pill.querySelector("#tcTrPillChange").onclick = (e) => {
          e.stopPropagation();
          openTranslateModal();
        };
        pill.querySelector("#tcTrPillOff").onclick = (e) => {
          e.stopPropagation();
          const cid = getActiveChatId();
          if (cid) setPref(cid, null);
        };
      }
    }
  }

  function syncComposerUI() {
    ensureComposerControls();
    const cid = getActiveChatId();
    const pref = getPref(cid);
    const btn = document.getElementById("tc-translate-btn");
    const pill = document.getElementById("tc-translate-pill");
    const pillText = document.getElementById("tcTrPillText");

    if (btn) btn.classList.toggle("active", Boolean(pref));
    if (pill && pillText) {
      if (pref) {
        const dirArrow = pref.translateIncoming ? " \u21C4 " : " \u2192 ";
        pillText.textContent =
          "Translate ON: " + getLangLabel(pref.myLang) + dirArrow + getLangLabel(pref.theirLang);
        pill.classList.remove("hidden");
      } else {
        pill.classList.add("hidden");
      }
    }
  }

  function closeTranslateModal() {
    const ov = document.getElementById("tcTranslateModal");
    if (ov) ov.remove();
  }

  async function fetchEngineBadge(el) {
    if (!el) return;
    const token = getToken();
    if (!token) {
      el.textContent = "Not logged in (token missing)";
      el.className = "tc-trm-engine basic";
      return;
    }
    try {
      const res = await fetch("/api/translate/status", {
        headers: { Authorization: "Bearer " + token }
      });
      if (!res.ok) {
        el.textContent = "Translator auth/server error (HTTP " + res.status + ")";
        el.className = "tc-trm-engine basic";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.engine === "groq") {
        el.textContent = "AI Engine: Groq (Roman Urdu + Natural Chat)";
        el.className = "tc-trm-engine ai";
      } else if (data.engine === "gemini") {
        el.textContent = "AI Engine: Gemini (Roman Urdu + Natural Chat)";
        el.className = "tc-trm-engine ai";
      } else {
        el.textContent = "Standard Mode (Add GROQ_API_KEY in Railway for AI Roman Urdu)";
        el.className = "tc-trm-engine basic";
      }
    } catch (_) {
      el.textContent = "Network error checking translator";
      el.className = "tc-trm-engine basic";
    }
  }

  function openTranslateModal() {
    const cid = getActiveChatId();
    if (!cid) return;
    closeTranslateModal();

    const cur = getPref(cid);
    const chat = getActiveChat();
    const chatName = chat ? chat.name : "this chat";

    const myVal = cur ? cur.myLang : "ur-Latn";
    const theirVal = cur ? cur.theirLang : "en";
    const incomingVal = cur ? cur.translateIncoming : true;

    const optionsHtml = (selected) =>
      LANGUAGES.map(
        (l) =>
          '<option value="' + esc(l.code) + '"' + (l.code === selected ? " selected" : "") + ">" +
          esc(l.label) +
          "</option>"
      ).join("");

    const ov = document.createElement("div");
    ov.id = "tcTranslateModal";
    ov.className = "tc-trm-overlay";
    ov.innerHTML =
      '<div class="tc-trm-sheet">' +
        '<div class="tc-trm-head">' +
          '<div class="tc-trm-title">Chat Translator</div>' +
          '<button type="button" class="tc-trm-close" id="tcTrmClose" aria-label="Close">&times;</button>' +
        "</div>" +
        '<div class="tc-trm-sub">For ' + esc(chatName) + " only. Other chats stay normal.</div>" +
        '<div id="tcTrmEngine" class="tc-trm-engine">Checking translator engine...</div>' +
        '<div class="tc-trm-field">' +
          "<label>My Language (what I type &amp; read)</label>" +
          '<select id="tcTrmMyLang">' + optionsHtml(myVal) + "</select>" +
        "</div>" +
        '<div class="tc-trm-swap-wrap">' +
          '<button type="button" id="tcTrmSwap" class="tc-trm-swap">Swap Languages</button>' +
        "</div>" +
        '<div class="tc-trm-field">' +
          "<label>Their Language (what they receive)</label>" +
          '<select id="tcTrmTheirLang">' + optionsHtml(theirVal) + "</select>" +
        "</div>" +
        '<label class="tc-trm-check">' +
          '<input type="checkbox" id="tcTrmIncoming"' + (incomingVal ? " checked" : "") + " />" +
          "<span>Also auto-translate incoming messages into my language</span>" +
        "</label>" +
        '<div class="tc-trm-actions">' +
          (cur ? '<button type="button" class="tc-trm-btn danger" id="tcTrmDisable">Turn Off</button>' : "") +
          '<button type="button" class="tc-trm-btn primary" id="tcTrmSave">' +
            (cur ? "Save Changes" : "Enable Translation") +
          "</button>" +
        "</div>" +
      "</div>";

    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeTranslateModal();
    });
    ov.querySelector("#tcTrmClose").onclick = closeTranslateModal;

    const mySel = ov.querySelector("#tcTrmMyLang");
    const theirSel = ov.querySelector("#tcTrmTheirLang");
    ov.querySelector("#tcTrmSwap").onclick = () => {
      const tmp = mySel.value;
      mySel.value = theirSel.value;
      theirSel.value = tmp;
    };

    const disableBtn = ov.querySelector("#tcTrmDisable");
    if (disableBtn) {
      disableBtn.onclick = () => {
        setPref(cid, null);
        closeTranslateModal();
        if (window.App && window.App.showToast) window.App.showToast("Translation turned off for this chat");
      };
    }

    ov.querySelector("#tcTrmSave").onclick = () => {
      const mLang = mySel.value;
      const tLang = theirSel.value;
      const inc = ov.querySelector("#tcTrmIncoming").checked;
      if (mLang === tLang) {
        if (window.App && window.App.showToast) window.App.showToast("Please pick two different languages");
        return;
      }
      setPref(cid, {
        enabled: true,
        myLang: mLang,
        theirLang: tLang,
        translateIncoming: inc
      });
      closeTranslateModal();
      if (window.App && window.App.showToast) {
        window.App.showToast("Translator ON: " + getLangLabel(mLang) + " -> " + getLangLabel(tLang));
      }
    };

    document.body.appendChild(ov);
    fetchEngineBadge(ov.querySelector("#tcTrmEngine"));
  }

  function boot() {
    ensureComposerControls();
    syncComposerUI();
    scheduleProcessMessages();

    const mc =
      document.getElementById("messages-container") ||
      document.getElementById("chat-messages");
    if (mc && !mc._tcTrObs) {
      const obs = new MutationObserver(scheduleProcessMessages);
      obs.observe(mc, { childList: true, subtree: true });
      mc._tcTrObs = obs;
    }

    // Hook ChatUI.renderActiveChat to sync composer bar whenever user switches chats
    const wrapRender = () => {
      if (window.ChatUI && typeof window.ChatUI.renderActiveChat === "function" && !window.ChatUI._tcTrWrapped) {
        const orig = window.ChatUI.renderActiveChat.bind(window.ChatUI);
        window.ChatUI.renderActiveChat = function (keepScroll) {
          const r = orig(keepScroll);
          syncComposerUI();
          scheduleProcessMessages();
          return r;
        };
        window.ChatUI._tcTrWrapped = true;
      }
    };
    wrapRender();
    setTimeout(() => {
      ensureComposerControls();
      wrapRender();
      syncComposerUI();
      scheduleProcessMessages();
    }, 600);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.TCTranslator = {
    translateOutgoing,
    openModal: openTranslateModal,
    getPref,
    setPref
  };
})();
