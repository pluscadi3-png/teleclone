(() => {
  "use strict";

  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const SNAP_PREFIX = "tc_instant_chats_v1_";

  let firstServerSyncDone = false;
  let lastSnapshotSavedAt = 0;

  // ===== Helpers =====
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function getActiveToken() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === ACCOUNTS_KEY || k === JWT_KEY_CACHE || k.startsWith(SNAP_PREFIX) || k === "tc_offline_token_sig") {
        continue;
      }
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        localStorage.setItem(JWT_KEY_CACHE, k);
        return k ? v : "";
      }
    }
    const cachedKey = localStorage.getItem(JWT_KEY_CACHE) || "teleclone_jwt";
    return localStorage.getItem(cachedKey) || "";
  }

  function getSnapshotKey() {
    const tok = getActiveToken();
    return tok ? `${SNAP_PREFIX}${hashStr(tok)}` : "";
  }

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function getActiveChatSafe() {
    const st = getStoreObj();
    if (!st) return null;
    if (typeof st.getActiveChat === "function") return st.getActiveChat();
    if (typeof st.getState === "function") {
      const s = st.getState();
      return (s.chats || []).find((c) => String(c.id) === String(s.activeChatId)) || null;
    }
    return null;
  }

  // ===== 1. Instant Chat Snapshot (Eliminates Startup "No chats" Flash) =====
  function compactChatForCache(chat) {
    const msgs = Array.isArray(chat.messages) ? chat.messages.slice(-25) : [];
    const cleanMsgs = msgs.map((m) => {
      let att = m.attachment || null;
      if (att && typeof att.src === "string" && att.src.startsWith("data:") && att.src.length > 2000) {
        att = { ...att, src: "" };
      }
      return {
        id: m.id,
        sender: m.sender,
        senderName: m.senderName || "",
        text: m.text || "",
        time: m.time || "",
        status: m.status || "",
        edited: Boolean(m.edited),
        silent: Boolean(m.silent),
        replyTo: m.replyTo || null,
        reactions: m.reactions || null,
        attachment: att
      };
    });

    return {
      id: chat.id,
      type: chat.type || "personal",
      name: chat.name || "",
      username: chat.username || "",
      avatarUrl: chat.avatarUrl || "",
      color: chat.color || "",
      initials: chat.initials || "",
      online: Boolean(chat.online),
      statusText: chat.statusText || "",
      unread: Number(chat.unreadCount ?? chat.unread) || 0,
      unreadCount: Number(chat.unreadCount ?? chat.unread) || 0,
      pinned: Boolean(chat.pinned),
      muted: Boolean(chat.muted),
      archived: Boolean(chat.archived),
      lastMessage: chat.lastMessage || "",
      lastTime: chat.lastTime || "",
      lastTimestamp: Number(chat.lastTimestamp) || 0,
      peerUserId: chat.peerUserId || chat.otherUserId || null,
      messages: cleanMsgs
    };
  }

  function saveChatsSnapshot(force = false) {
    const key = getSnapshotKey();
    if (!key) return;
    const now = Date.now();
    if (!force && now - lastSnapshotSavedAt < 1200) return;

    const st = getStoreObj();
    if (!st || typeof st.getState !== "function") return;
    const chats = st.getState().chats;
    if (!Array.isArray(chats) || chats.length === 0) return;

    try {
      const payload = chats.slice(0, 45).map(compactChatForCache);
      localStorage.setItem(key, JSON.stringify({ ts: now, chats: payload }));
      lastSnapshotSavedAt = now;
    } catch (_) {
      // Storage full ho to chota snapshot save karein
      try {
        const tiny = chats.slice(0, 20).map((c) => ({ ...compactChatForCache(c), messages: [] }));
        localStorage.setItem(key, JSON.stringify({ ts: now, chats: tiny }));
      } catch (__) {}
    }
  }

  function loadChatsSnapshot() {
    const key = getSnapshotKey();
    if (!key) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      if (parsed && Array.isArray(parsed.chats) && parsed.chats.length > 0) {
        return parsed.chats;
      }
    } catch (_) {}
    return null;
  }

  function hydrateChatsInstantly() {
    const st = getStoreObj();
    if (!st || typeof st.getState !== "function") return false;
    const state = st.getState();
    if (Array.isArray(state.chats) && state.chats.length > 0) return true;

    const snap = loadChatsSnapshot();
    if (!snap) return false;

    state.chats = snap;
    if (window.App && typeof window.App.renderAll === "function") {
      window.App.renderAll();
    }
    return true;
  }

  // First-time users ke liye "No chats" ke bajaye smooth loading skeleton
  function buildSkeletonHtml() {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      rows.push(`
        <div class="tc-skel-row">
          <div class="tc-skel-av"></div>
          <div class="tc-skel-lines">
            <div class="tc-skel-line w-60"></div>
            <div class="tc-skel-line w-85"></div>
          </div>
        </div>
      `);
    }
    return `<div class="tc-skel-wrap" id="tcChatsSkeleton">${rows.join("")}</div>`;
  }

  function guardEmptyChatList() {
    const list = document.getElementById("chat-list");
    if (!list) return;

    const applyGuard = () => {
      if (firstServerSyncDone) return;
      if (!getActiveToken()) return;

      const searchInp = document.getElementById("search-input") || document.getElementById("global-search");
      if (searchInp && searchInp.value.trim()) return;

      const hasRealItems = Boolean(list.querySelector(".chat-item, [data-chat-id]"));
      if (hasRealItems) return;

      // Agar local snapshot maujood hai to foran dikhayein
      if (hydrateChatsInstantly()) return;

      // Warna "No chats" ki jagah smooth shimmer skeleton dikhayein
      if (!list.querySelector("#tcChatsSkeleton")) {
        list.innerHTML = buildSkeletonHtml();
      }
    };

    applyGuard();
    const obs = new MutationObserver(() => applyGuard());
    obs.observe(list, { childList: true });

    // Safety fallback: 5.5 second baad agar waqai 0 chats hon to normal empty state allow karein
    setTimeout(() => {
      if (!firstServerSyncDone) {
        firstServerSyncDone = true;
        if (list.querySelector("#tcChatsSkeleton") && window.App && typeof window.App.renderAll === "function") {
          window.App.renderAll();
        }
      }
    }, 5500);
  }

  // Track /api/chats sync completion & auto-save fresh snapshot
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = ((init && init.method) || "GET").toUpperCase();
    const promise = origFetch(input, init);

    if (method === "GET" && /\/api\/chats(\?|$)/.test(url)) {
      promise
        .then((res) => {
          if (res && res.ok) {
            firstServerSyncDone = true;
            setTimeout(() => saveChatsSnapshot(true), 200);
          }
        })
        .catch(() => {});
    } else if (method === "GET" && /\/api\/chats\/[^/]+\/messages/.test(url)) {
      promise
        .then((res) => {
          if (res && res.ok) {
            setTimeout(() => saveChatsSnapshot(false), 250);
          }
        })
        .catch(() => {});
    }
    return promise;
  };

  // ===== 2. Smart DOM Diffing on #messages-container (Stops Chat Screen Fluctuation) =====
  function patchRowInPlace(existingRow, newRow) {
    const oldBubble = existingRow.querySelector(":scope > .msg-bubble");
    const newBubble = newRow.querySelector(":scope > .msg-bubble");
    if (!oldBubble || !newBubble) {
      existingRow.innerHTML = newRow.innerHTML;
      return;
    }

    // Check karein ke photo/video/voice src wahi hai to media element ko bilkul touch na karein (zero blink!)
    const oldMedia = oldBubble.querySelector(".msg-media-wrap");
    const newMedia = newBubble.querySelector(".msg-media-wrap");
    const oldVoice = oldBubble.querySelector(".msg-voice-card");
    const newVoice = newBubble.querySelector(".msg-voice-card");

    const sameMedia =
      oldMedia &&
      newMedia &&
      oldMedia.getAttribute("data-media-src") === newMedia.getAttribute("data-media-src");
    const sameVoice =
      oldVoice &&
      newVoice &&
      oldVoice.getAttribute("data-voice-src") === newVoice.getAttribute("data-voice-src");

    if (sameMedia || sameVoice) {
      const syncPart = (selector) => {
        const oEl = oldBubble.querySelector(selector);
        const nEl = newBubble.querySelector(selector);
        if (oEl && nEl) {
          if (oEl.innerHTML !== nEl.innerHTML) oEl.innerHTML = nEl.innerHTML;
        } else if (!oEl && nEl) {
          const meta = oldBubble.querySelector(".msg-meta");
          oldBubble.insertBefore(nEl.cloneNode(true), meta || null);
        } else if (oEl && !nEl) {
          oEl.remove();
        }
      };
      syncPart(".msg-text");
      syncPart(".msg-reactions");
      syncPart(".msg-meta");
      return;
    }

    // Pure text bubble update (checkbox sibling safe rehta hai)
    oldBubble.innerHTML = newBubble.innerHTML;
  }

  function installAntiFlickerPatcher() {
    const container = document.getElementById("messages-container");
    if (!container || container._tcPatched) return;

    const protoDesc =
      Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML") ||
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerHTML");
    if (!protoDesc || !protoDesc.set || !protoDesc.get) return;

    const nativeGet = protoDesc.get;
    const nativeSet = protoDesc.set;

    Object.defineProperty(container, "innerHTML", {
      configurable: true,
      get() {
        return nativeGet.call(this);
      },
      set(html) {
        const activeChat = getActiveChatSafe();
        const curChatId = activeChat ? String(activeChat.id) : "";
        const prevChatId = this.dataset.tcChatId || "";
        const htmlStr = String(html || "");

        // Nayi chat open hui ya empty/bot-intro screen hai -> normal full render
        const hasMsgRow = htmlStr.includes("data-msg-id=");
        const hasExistingRows = Boolean(this.querySelector(".msg-row[data-msg-id]"));

        if (!curChatId || curChatId !== prevChatId || !hasMsgRow || !hasExistingRows) {
          nativeSet.call(this, htmlStr);
          this.dataset.tcChatId = curChatId;
          this.querySelectorAll(":scope > .msg-row[data-msg-id]").forEach((r) => {
            r.dataset.tcRawHtml = r.innerHTML;
          });
          return;
        }

        const _ld = document.getElementById("tcMsgLoadNotice");
        if (_ld && _ld.parentNode === this) _ld.remove();

        // Same chat re-render -> Smart DOM diffing (0 blink, 0 scroll jump)
        const distFromBottom = this.scrollHeight - this.scrollTop - this.clientHeight;
        const wasNearBottom = distFromBottom < 110;
        const savedScrollTop = this.scrollTop;

        const tmp = document.createElement("div");
        nativeSet.call(tmp, htmlStr);
        const newChildren = Array.from(tmp.children);

        const existingMap = new Map();
        let existingDivider = null;
        for (const ch of Array.from(this.children)) {
          const mid = ch.getAttribute("data-msg-id");
          if (mid) existingMap.set(mid, ch);
          else if (!existingDivider && ch.classList.contains("date-divider")) existingDivider = ch;
        }

        const newIds = new Set();
        for (const n of newChildren) {
          const mid = n.getAttribute("data-msg-id");
          if (mid) newIds.add(mid);
        }

        // Deleted ya replace hue old rows hatayein
        for (const [mid, oldNode] of existingMap.entries()) {
          if (!newIds.has(mid)) oldNode.remove();
        }

        let appendedNewMsg = false;

        // Har node ko bina untouched nodes hilaye exact position par rakhein
        for (let i = 0; i < newChildren.length; i++) {
          const newNode = newChildren[i];
          const mid = newNode.getAttribute("data-msg-id");
          let nodeToKeep = null;

          if (mid && existingMap.has(mid)) {
            nodeToKeep = existingMap.get(mid);
            const rawNew = newNode.innerHTML;
            if (nodeToKeep.dataset.tcRawHtml !== rawNew) {
              patchRowInPlace(nodeToKeep, newNode);
              nodeToKeep.dataset.tcRawHtml = rawNew;
            }
            // Search highlight sync karein
            nodeToKeep.classList.toggle("highlight", newNode.classList.contains("highlight"));
          } else if (
            !mid &&
            newNode.classList.contains("date-divider") &&
            existingDivider &&
            existingDivider.textContent === newNode.textContent
          ) {
            nodeToKeep = existingDivider;
          } else {
            nodeToKeep = newNode;
            if (mid) {
              nodeToKeep.dataset.tcRawHtml = newNode.innerHTML;
              appendedNewMsg = true;
            }
          }

          if (this.children[i] !== nodeToKeep) {
            this.insertBefore(nodeToKeep, this.children[i] || null);
          }
        }

        // Extra leftover nodes clean karein
        while (this.children.length > newChildren.length) {
          this.lastElementChild.remove();
        }

        // Scroll ko stable rakhein (outgoing new message par hamesha bottom par layein)
        const lastChildEl = this.lastElementChild;
        const appendedMine =
          appendedNewMsg &&
          Boolean(
            lastChildEl &&
              (lastChildEl.classList.contains("outgoing") ||
                lastChildEl.classList.contains("msg-out") ||
                lastChildEl.classList.contains("sent") ||
                lastChildEl.classList.contains("from-me") ||
                lastChildEl.getAttribute("data-sender") === "me")
          );
        if ((wasNearBottom && appendedNewMsg) || appendedMine) {
          this.scrollTop = this.scrollHeight;
        } else if (!wasNearBottom) {
          this.scrollTop = savedScrollTop;
        }
      }
    });

    container._tcPatched = true;
  }

  // ===== 3. Prevent Unwanted Scroll Jumps & Coalesce Rapid Render Bursts =====
  function wrapChatAndAppRenders() {
    if (window.ChatUI && typeof window.ChatUI.renderActiveChat === "function" && !window.ChatUI._tcWrapped) {
      const origRender = window.ChatUI.renderActiveChat.bind(window.ChatUI);
      let lastChatIdSeen = "";
      let lastMsgCountSeen = 0;

      window.ChatUI.renderActiveChat = function (keepScroll) {
        const container = document.getElementById("messages-container");
        const chat = getActiveChatSafe();
        const curId = chat ? String(chat.id) : "";
        const msgs = (chat && chat.messages) || [];
        const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;

        let effectiveKeepScroll = Boolean(keepScroll);

        // Agar user purane messages parh raha hai aur background update aaye to neeche jump na kare
        if (!effectiveKeepScroll && container && curId && curId === lastChatIdSeen) {
          const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          const userSentNew = Boolean(lastMsg && lastMsg.sender === "me" && (msgs.length > lastMsgCountSeen || lastMsg._pending || (lastMsg._justConfirmedAt && Date.now() - lastMsg._justConfirmedAt < 4000)));
          if (distFromBottom > 140 && !userSentNew) {
            effectiveKeepScroll = true;
          }
        }

        lastChatIdSeen = curId;
        lastMsgCountSeen = msgs.length;
        return origRender(effectiveKeepScroll);
      };
      window.ChatUI._tcWrapped = true;
    }

    // Multiple WebSocket events ek hi second mein aayein to 1 smooth frame mein render karein
    if (window.App && typeof window.App.renderAll === "function" && !window.App._tcWrapped) {
      const origAll = window.App.renderAll.bind(window.App);
      let rafId = 0;
      window.App.renderAll = function () {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          origAll();
          saveChatsSnapshot(false);
        });
      };
      window.App._tcWrapped = true;
    }
  }

  // ===== Init =====
  function boot() {
    installAntiFlickerPatcher();
    wrapChatAndAppRenders();
    hydrateChatsInstantly();
    guardEmptyChatList();

    // Agar liveBridge thodi der baad ChatUI/App ready kare to dobara check kar lein
    setTimeout(() => {
      installAntiFlickerPatcher();
      wrapChatAndAppRenders();
    }, 350);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveChatsSnapshot(true);
  });
  window.addEventListener("pagehide", () => saveChatsSnapshot(true));
})();