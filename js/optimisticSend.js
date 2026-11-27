(() => {
  "use strict";

  const resolvedTempIds = new Set();
  const pendingRawUploads = new Map(); // chatId -> tempId (for uiFixes + button)

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function getActiveChatId() {
    const st = getStoreObj();
    if (!st) return "";
    if (typeof st.getState === "function" && st.getState().activeChatId) {
      return String(st.getState().activeChatId);
    }
    if (typeof st.getActiveChat === "function") {
      const c = st.getActiveChat();
      if (c && c.id) return String(c.id);
    }
    return "";
  }

  function getChatSafe(cid) {
    const st = getStoreObj();
    if (!st) return null;
    if (typeof st.getChatById === "function") {
      const c = st.getChatById(String(cid));
      if (c) return c;
    }
    if (typeof st.getState === "function") {
      return (st.getState().chats || []).find((c) => String(c.id) === String(cid)) || null;
    }
    return null;
  }

  function formatNowTime() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function buildAttachmentMeta(name, mime, sizeBytes, localUrl) {
    const fname = name || "file";
    const ftype = (mime || "").toLowerCase();
    const lower = fname.toLowerCase();

    const isImg =
      ftype.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|jfif)$/.test(lower);
    const isVid =
      ftype.startsWith("video/") || /\.(mp4|mov|m4v|mkv|3gp|avi)$/.test(lower);
    const isAud =
      !isVid &&
      (ftype.startsWith("audio/") || /\.(wav|webm|ogg|opus|mp3|m4a|aac)$/.test(lower));

    const type = isImg ? "photo" : isVid ? "video" : isAud ? "voice" : "file";
    const label = isImg ? "Photo" : isVid ? "Video" : isAud ? "Voice message" : fname;

    return {
      type,
      name: fname,
      size: formatFileSize(sizeBytes),
      src: localUrl || "",
      label,
      duration: isAud ? "0:01" : undefined,
      _uploading: true
    };
  }

  function refreshChatUI(cid, scrollDown) {
    const activeId = getActiveChatId();
    if (activeId && String(activeId) === String(cid) && window.ChatUI) {
      window.ChatUI.renderActiveChat(!scrollDown);
    }
    if (window.App && typeof window.App.renderAll === "function") {
      window.App.renderAll();
    }
  }

  function releaseBlobLater(url) {
    if (url && url.startsWith("blob:")) {
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 4500);
    }
  }

  // ===== 1. Push Instant Optimistic Message =====
  function pushPending(cid, msgData = {}) {
    const chat = getChatSafe(cid);
    if (!chat) return null;

    if (!Array.isArray(chat.messages)) chat.messages = [];
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let att = null;
    let localUrl = "";
    if (msgData.attachment) {
      att = { ...msgData.attachment };
      const srcStr = String(att.src || "");
      if (srcStr.startsWith("blob:")) localUrl = srcStr;
      if (att._uploading === undefined) {
        att._uploading = Boolean(srcStr.startsWith("blob:") || srcStr.startsWith("data:") || att.type === "voice");
      }
    }

    const pendingMsg = {
      id: tempId,
      _tempId: tempId,
      _pending: true,
      _localUrl: localUrl,
      sender: "me",
      text: msgData.text || "",
      replyTo: msgData.replyTo || null,
      attachment: att,
      poll: msgData.poll || null,
      silent: Boolean(msgData.silent),
      time: formatNowTime(),
      timestamp: Date.now(),
      status: "sending"
    };

    chat.messages.push(pendingMsg);

    const preview =
      pendingMsg.text ||
      (att ? `📎 ${att.label || att.name || "Media"}` : "Message");
    chat.lastMessage = preview.replace(/\n/g, " ").slice(0, 70);
    chat.lastSender = "You";
    chat.lastTime = pendingMsg.time;
    chat.lastTimestamp = pendingMsg.timestamp;

    refreshChatUI(cid, true);
    return tempId;
  }

  function pushPendingFile(cid, file, caption = "") {
    if (!file) return null;
    const localUrl = URL.createObjectURL(file);
    const att = buildAttachmentMeta(file.name, file.type, file.size, localUrl);
    return pushPending(cid, { text: caption || "", attachment: att });
  }

  // ===== 2. Upgrade Pending Bubble When Server Confirms (HTTP POST) =====
  function markSent(cid, tempId, serverMsg) {
    if (!tempId || resolvedTempIds.has(tempId)) return;
    const chat = getChatSafe(cid);
    if (!chat || !Array.isArray(chat.messages)) return;

    const idx = chat.messages.findIndex((m) => m._tempId === tempId || String(m.id) === String(tempId));
    if (idx === -1) return;

    const old = chat.messages[idx];
    resolvedTempIds.add(tempId);

    if (serverMsg && serverMsg.id) {
      // Duplicate check in case WS already inserted it
      const existingIdx = chat.messages.findIndex((m, i) => i !== idx && String(m.id) === String(serverMsg.id));
      if (existingIdx !== -1) {
        chat.messages.splice(idx, 1);
      } else {
        chat.messages[idx] = {
          ...serverMsg,
          status: serverMsg.status || "sent"
        };
      }
      releaseBlobLater(old._localUrl);
    } else {
      old._pending = false;
      old._justConfirmedAt = Date.now();
      old.status = "sent";
      if (old.attachment) delete old.attachment._uploading;
    }

    refreshChatUI(cid, false);
  }

  // ===== 3. Mark Failed If Upload/Send Fails =====
  function markFailed(cid, tempId) {
    if (!tempId) return;
    const chat = getChatSafe(cid);
    if (!chat || !Array.isArray(chat.messages)) return;

    const m = chat.messages.find((x) => x._tempId === tempId || String(x.id) === String(tempId));
    if (!m) return;

    m._pending = false;
    m.status = "failed";
    if (m.attachment) delete m.attachment._uploading;
    refreshChatUI(cid, false);
  }

  // ===== 4. Deduplicate Incoming WebSocket "new_message" Against Pending Bubble =====
  function reconcileIncoming(cid, serverMsg) {
    const chat = getChatSafe(cid);
    if (!chat || !Array.isArray(chat.messages) || !serverMsg) return false;

    const sid = String(serverMsg.id);
    const alreadyIdx = chat.messages.findIndex((m) => String(m.id) === sid);
    if (alreadyIdx !== -1) {
      chat.messages[alreadyIdx] = { ...chat.messages[alreadyIdx], ...serverMsg };
      return true;
    }

    const now = Date.now();
    const sText = (serverMsg.text || "").trim();
    const sHasAtt = Boolean(serverMsg.attachment);
    const sType = sHasAtt ? (serverMsg.attachment.type || "") : "";

    let matchIdx = -1;
    for (let i = 0; i < chat.messages.length; i++) {
      const m = chat.messages[i];
      const isCandidate =
        m.sender === "me" &&
        (m._pending || (m._justConfirmedAt && now - m._justConfirmedAt < 10000));
      if (!isCandidate) continue;

      const mHasAtt = Boolean(m.attachment);
      if (sHasAtt !== mHasAtt) continue;

      if (sHasAtt) {
        const mType = m.attachment.type || "";
        if (mType === sType || !sType || !mType) {
          matchIdx = i;
          break;
        }
      } else if ((m.text || "").trim() === sText) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx === -1) return false;

    const old = chat.messages[matchIdx];
    if (old._tempId) resolvedTempIds.add(old._tempId);
    chat.messages[matchIdx] = {
      ...serverMsg,
      status: serverMsg.status || "sent"
    };
    releaseBlobLater(old._localUrl);
    return true;
  }

  // ===== 5. Auto-Intercept uiFixes.js "+" Binary Upload Button =====
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = ((init && init.method) || "GET").toUpperCase();

    // Case A: uiFixes.js binary /api/upload (X-Filename header)
    if (method === "POST" && /\/api\/upload(\?|$)/.test(url) && init && init.headers) {
      const h = init.headers;
      const xFname = h["X-Filename"] || h["x-filename"];
      const xFtype = h["X-File-Type"] || h["x-file-type"] || "";
      const ctype = (h["Content-Type"] || h["content-type"] || "").toLowerCase();

      if (xFname && ctype === "application/octet-stream" && init.body) {
        const activeCid = getActiveChatId();
        const modalOpen = Boolean(
          document.querySelector(".tc-pro-settings-open, .tc-pro-profile-open, #tcAddPostBackdrop")
        );
        if (activeCid && !modalOpen) {
          let fname = "file";
          try { fname = decodeURIComponent(xFname); } catch (_) { fname = xFname; }
          const blob = new Blob([init.body], { type: xFtype || "application/octet-stream" });
          const localUrl = URL.createObjectURL(blob);
          const att = buildAttachmentMeta(fname, xFtype, blob.size, localUrl);
          const msgInp = document.getElementById("msg-input");
          const cap = msgInp ? msgInp.value.trim() : "";

          const tempId = pushPending(activeCid, { text: cap, attachment: att });
          if (tempId) pendingRawUploads.set(String(activeCid), tempId);

          const p = origFetch(input, init);
          p.then((res) => {
            if (!res.ok && tempId) {
              markFailed(activeCid, tempId);
              pendingRawUploads.delete(String(activeCid));
            }
          }).catch(() => {
            if (tempId) {
              markFailed(activeCid, tempId);
              pendingRawUploads.delete(String(activeCid));
            }
          });
          return p;
        }
      }
    }

    // Case B: Follow-up POST /api/chats/{cid}/messages from uiFixes.js
    const msgPostMatch = method === "POST" && url.match(/\/api\/chats\/([^/]+)\/messages(\?|$)/);
    if (msgPostMatch && pendingRawUploads.has(String(msgPostMatch[1]))) {
      const cid = String(msgPostMatch[1]);
      const tempId = pendingRawUploads.get(cid);
      pendingRawUploads.delete(cid);

      const p = origFetch(input, init);
      p.then((res) => {
        if (!res.ok) {
          markFailed(cid, tempId);
        } else {
          res
            .clone()
            .json()
            .then((data) => {
              if (data && data.message && data.message.id) {
                markSent(cid, tempId, {
                  id: String(data.message.id),
                  sender: "me",
                  text: data.message.text || "",
                  attachment: data.message.attachment || null,
                  time: data.message.time || formatNowTime(),
                  timestamp: data.message.timestamp || Date.now(),
                  status: data.message.status || "sent"
                });
              } else {
                markSent(cid, tempId, null);
              }
            })
            .catch(() => markSent(cid, tempId, null));
        }
      }).catch(() => markFailed(cid, tempId));
      return p;
    }

    return origFetch(input, init);
  };

  window.TCOptimistic = {
    pushPending,
    pushPendingFile,
    markSent,
    markFailed,
    reconcileIncoming
  };
})();