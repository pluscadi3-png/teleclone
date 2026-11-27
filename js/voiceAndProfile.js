(() => {
  "use strict";

  let activeChatId = null;
  let lastAuthHeader = null;

  // WAV Recorder state
  let audioStream = null;
  let recCtx = null;
  let sourceNode = null;
  let processorNode = null;
  let pcmBuffers = [];
  let recSampleRate = 16000;
  let isCapturing = false;

  // Player state
  const audioBufferCache = new Map();
  let activePlayback = null;

  const ICONS = {
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
  };

  // ===== 1. Active Chat ID & Auth Token Tracking =====
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const match = url.match(/\/api\/chats\/(\d+)(?:\/|$)/i);
      if (match) activeChatId = Number(match[1]);

      if (init && init.headers) {
        if (init.headers instanceof Headers) {
          const auth = init.headers.get("Authorization") || init.headers.get("authorization");
          if (auth) lastAuthHeader = auth;
        } else if (typeof init.headers === "object") {
          const auth = init.headers.Authorization || init.headers.authorization;
          if (auth) lastAuthHeader = auth;
        }
      }
    } catch (_) {}
    return origFetch(input, init);
  };

  function getCurrentChatId() {
    try {
      if (window.Store) {
        if (typeof window.Store.getActiveChat === "function") {
          const c = window.Store.getActiveChat();
          if (c && c.id) return Number(c.id);
        }
        if (window.Store.state && window.Store.state.activeChatId) {
          return Number(window.Store.state.activeChatId);
        }
      }
    } catch (_) {}
    return activeChatId;
  }

  function getAuthHeader() {
    if (lastAuthHeader) return lastAuthHeader;
    const keys = ["token", "auth_token", "access_token", "teleclone_token", "jwt", "tc_token"];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.length > 15) return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i)) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) return `Bearer ${v}`;
    }
    return "";
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? "0" : ""}${r}`;
  }

  function showToast(msg) {
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

  // ===== 2. Real 16kHz Mono WAV Recorder (Exposed as window.TCVoice) =====
  function downsampleBuffer(chunks, inRate, outRate) {
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    if (outRate >= inRate) return merged;
    const ratio = inRate / outRate;
    const newLen = Math.round(merged.length / ratio);
    const result = new Float32Array(newLen);
    let pos = 0;
    for (let i = 0; i < newLen; i++) {
      const nextPos = Math.min(merged.length, Math.round((i + 1) * ratio));
      let sum = 0;
      let count = 0;
      for (let j = pos; j < nextPos; j++) {
        sum += merged[j];
        count++;
      }
      result[i] = count > 0 ? sum / count : 0;
      pos = nextPos;
    }
    return result;
  }

  function encodeWavBlob(samples, rate) {
    // Agar awaaz halka ho to softly normalize karein taake clear sunai de
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
    }
    const gain = peak > 0.005 && peak < 0.45 ? Math.min(4.0, 0.85 / peak) : 1.0;

    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let idx = 44;
    for (let i = 0; i < samples.length; i++, idx += 2) {
      let s = Math.max(-1, Math.min(1, samples[i] * gain));
      view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async function cleanupRecorder() {
    isCapturing = false;
    try { if (processorNode) processorNode.disconnect(); } catch (_) {}
    try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
    processorNode = null;
    sourceNode = null;

    if (audioStream) {
      audioStream.getTracks().forEach((tr) => tr.stop());
      audioStream = null;
    }
    if (recCtx) {
      try { await recCtx.close(); } catch (_) {}
      recCtx = null;
    }
  }

  window.TCVoice = {
    async start() {
      stopActivePlayback();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Microphone is not supported on this device");
        return false;
      }

      // User gesture ke andar AudioContext pehle bana lein
      const AudioContextCls = window.AudioContext || window.webkitAudioContext;
      try {
        recCtx = new AudioContextCls();
        if (recCtx.state === "suspended") await recCtx.resume();
      } catch (err) {
        showToast("Could not start audio engine");
        return false;
      }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (err1) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          await cleanupRecorder();
          const code = (err2 && err2.name) || "PermissionError";
          showToast(`Mic error (${code}) — allow microphone permission in Settings > Apps > TeleClone`);
          return false;
        }
      }

      try {
        if (recCtx.state === "suspended") await recCtx.resume();
        recSampleRate = recCtx.sampleRate || 44100;
        sourceNode = recCtx.createMediaStreamSource(audioStream);
        processorNode = recCtx.createScriptProcessor(4096, 1, 1);
        pcmBuffers = [];
        isCapturing = true;

        const silentGain = recCtx.createGain();
        silentGain.gain.value = 0;

        processorNode.onaudioprocess = (ev) => {
          if (!isCapturing) return;
          pcmBuffers.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
        };

        sourceNode.connect(processorNode);
        processorNode.connect(silentGain);
        silentGain.connect(recCtx.destination);
        return true;
      } catch (err) {
        console.error("[TCVoice start]", err);
        await cleanupRecorder();
        showToast("Microphone recording failed");
        return false;
      }
    },

    async cancel() {
      pcmBuffers = [];
      await cleanupRecorder();
    },

   async stopAndUpload(durationStr) {
      const captured = pcmBuffers.slice();
      const inRate = recSampleRate;
      pcmBuffers = [];
      await cleanupRecorder();

      if (!captured.length) {
        showToast("No audio recorded — please check microphone permission");
        return null;
      }

      const targetRate = 16000;
      const samples = downsampleBuffer(captured, inRate, targetRate);
      const wavBlob = encodeWavBlob(samples, targetRate);

      const auth = getAuthHeader();
      const filename = `voice_${Date.now()}.wav`;

      // Foran chat mein voice note show karein (uploading spinner + clock ke sath)
      const activeCid = getCurrentChatId();
      const localUrl = URL.createObjectURL(wavBlob);
      const tempId =
        activeCid && window.TCOptimistic
          ? window.TCOptimistic.pushPending(activeCid, {
              text: "",
              attachment: {
                type: "voice",
                name: filename,
                size: `${Math.max(1, Math.round(wavBlob.size / 1024))} KB`,
                src: localUrl,
                duration: durationStr || "0:01",
                label: "Voice message",
                _uploading: true
              }
            })
          : null;

      const fd = new FormData();
      fd.append("file", wavBlob, filename);

      try {
        const res = await origFetch("/api/upload", {
          method: "POST",
          headers: auth ? { Authorization: auth } : {},
          body: fd
        });
        if (!res.ok) throw new Error(`Upload ${res.status}`);
        const data = await res.json();
        const att = data.attachment || {};
        return {
          type: "voice",
          name: att.name || filename,
          size: att.size || "",
          src: att.src || "",
          duration: durationStr || "0:01",
          label: "Voice message",
          _tempId: tempId
        };
      } catch (err) {
        console.error("[TCVoice upload]", err);
        if (tempId && activeCid && window.TCOptimistic) {
          window.TCOptimistic.markFailed(activeCid, tempId);
        }
        showToast(`Voice upload error: ${err.message}`);
        return null;
      }
    }
  };
  // ===== 3. Universal Voice Bubble Player (Sender & Receiver Dono Ke Liye) =====
  function stopActivePlayback() {
    if (!activePlayback) return;
    const p = activePlayback;
    activePlayback = null;
    if (p.rafId) cancelAnimationFrame(p.rafId);
    if (p.audio) {
      try { p.audio.pause(); } catch (_) {}
    }
    if (p.webSource) {
      try { p.webSource.stop(); } catch (_) {}
    }
    if (p.webCtx) {
      try { p.webCtx.close(); } catch (_) {}
    }
    if (p.btn) p.btn.textContent = "▶";
    if (p.progressEl) p.progressEl.style.width = "0%";
    if (p.durEl && p.origDuration) p.durEl.textContent = p.origDuration;
  }

  async function fetchAudioBytes(src) {
    const absUrl = new URL(src, window.location.origin).href;
    if (audioBufferCache.has(absUrl)) {
      return audioBufferCache.get(absUrl).slice(0);
    }
    const auth = getAuthHeader();
    const res = await origFetch(absUrl, {
      headers: auth ? { Authorization: auth } : {}
    });
    if (!res.ok) throw new Error(`Audio HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    if (!arr || arr.byteLength < 64) throw new Error("Audio file is empty");
    audioBufferCache.set(absUrl, arr);
    return arr.slice(0);
  }

  async function togglePlayVoiceCard(card, btn) {
    const src = (btn.getAttribute("data-voice-src") || card.getAttribute("data-voice-src") || "").trim();
    if (!src) {
      showToast("This is an expired sample voice note — record a new voice message");
      return;
    }

    // Agar yahi button chal raha hai to stop/pause kar dein
    if (activePlayback && activePlayback.btn === btn) {
      stopActivePlayback();
      return;
    }

    stopActivePlayback();

    const progressEl = card.querySelector(".voice-wave-progress");
    const durEl = card.querySelector(".voice-duration");
    const origDuration = durEl ? durEl.textContent : "";

    btn.textContent = "…";

    try {
      const arrayBuf = await fetchAudioBytes(src);

      // Primary: Web Audio API (Android WebView par 100% reliable, speaker route lock nahi hota)
      const AudioContextCls = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCls) {
        try {
          const webCtx = new AudioContextCls();
          if (webCtx.state === "suspended") await webCtx.resume();
          const decoded = await webCtx.decodeAudioData(arrayBuf.slice(0));
          const webSource = webCtx.createBufferSource();
          webSource.buffer = decoded;
          webSource.connect(webCtx.destination);

          const startTime = webCtx.currentTime;
          const totalDur = decoded.duration || 1;
          btn.textContent = "⏸";

          const state = { btn, progressEl, durEl, origDuration, webSource, webCtx, rafId: null };
          activePlayback = state;

          const tick = () => {
            if (activePlayback !== state) return;
            const elapsed = webCtx.currentTime - startTime;
            const pct = Math.min(100, (elapsed / totalDur) * 100);
            if (progressEl) progressEl.style.width = `${pct}%`;
            if (durEl) durEl.textContent = formatTime(elapsed);
            if (elapsed < totalDur) {
              state.rafId = requestAnimationFrame(tick);
            }
          };
          state.rafId = requestAnimationFrame(tick);

          webSource.onended = () => {
            if (activePlayback === state) stopActivePlayback();
          };

          webSource.start(0);
          return;
        } catch (webErr) {
          console.warn("[Voice WebAudio fallback]", webErr);
        }
      }

      // Secondary Fallback: Blob HTMLAudioElement
      const blobUrl = URL.createObjectURL(new Blob([arrayBuf], { type: "audio/wav" }));
      const audio = new Audio(blobUrl);
      audio.muted = false;
      audio.volume = 1.0;

      const state = { btn, progressEl, durEl, origDuration, audio };
      activePlayback = state;

      audio.addEventListener("timeupdate", () => {
        if (activePlayback !== state) return;
        if (isFinite(audio.duration) && audio.duration > 0) {
          if (progressEl) progressEl.style.width = `${Math.min(100, (audio.currentTime / audio.duration) * 100)}%`;
        }
        if (durEl) durEl.textContent = formatTime(audio.currentTime);
      });

      audio.addEventListener("ended", () => {
        URL.revokeObjectURL(blobUrl);
        if (activePlayback === state) stopActivePlayback();
      });

      await audio.play();
      btn.textContent = "⏸";
    } catch (err) {
      console.error("[VoicePlay]", err);
      btn.textContent = "▶";
      showToast(`Audio play error: ${err.message}`);
    }
  }

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(".voice-play-btn");
      if (!btn) return;
      const card = btn.closest(".msg-voice-card");
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      togglePlayVoiceCard(card, btn);
    },
    true
  );

  // ===== 4. Chat Header Click -> Pro User Info Profile Sheet =====
  function readHeaderFallback(header) {
    const img = header ? header.querySelector("img") : null;
    const titleEl = header
      ? header.querySelector("h1, h2, h3, .chat-title, .chat-name, .user-name, .peer-name, .name")
      : null;
    return {
      title: (titleEl && titleEl.textContent.trim()) || "User",
      avatar: (img && img.getAttribute("src")) || ""
    };
  }

  document.addEventListener(
    "click",
    (e) => {
      const header = e.target.closest(
        ".chat-header, #chatHeader, .conversation-header, .chat-top-bar"
      );
      if (!header) return;

      const chatId = getCurrentChatId();
      if (!chatId) return;

      const clickedBtn = e.target.closest("button");
      if (clickedBtn) {
        const cls = (clickedBtn.className || "").toLowerCase();
        const aria = (clickedBtn.getAttribute("aria-label") || "").toLowerCase();
        const isAvatarBtn =
          cls.includes("avatar") || cls.includes("profile") || cls.includes("user") || aria.includes("profile");
        if (!isAvatarBtn) return;
      }

      e.preventDefault();
      e.stopPropagation();
      openUserInfoSheet(chatId, readHeaderFallback(header));
    },
    true
  );

  async function openUserInfoSheet(chatId, fallback) {
    const auth = getAuthHeader();
    if (!auth) {
      showToast("Login session not found");
      return;
    }

    renderProfileSheet({ loading: true });

    try {
      const res = await origFetch(`/api/chats/${chatId}/info`, {
        headers: { Authorization: auth }
      });
      if (!res.ok) {
        showToast(`User info error (${res.status})`);
        renderProfileSheet({
          loading: false,
          data: { chat: { title: fallback.title, avatar: fallback.avatar, type: "private" }, user: null }
        });
        return;
      }
      const data = await res.json();
      if (data && data.chat && !data.chat.avatar && fallback.avatar) {
        data.chat.avatar = fallback.avatar;
      }
      renderProfileSheet({ loading: false, data });
    } catch (err) {
      console.error("[UserInfo]", err);
      showToast("Could not load user info");
      renderProfileSheet({
        loading: false,
        data: { chat: { title: fallback.title, avatar: fallback.avatar, type: "private" }, user: null }
      });
    }
  }

  function closeProfileSheet() {
    const el = document.getElementById("tcProfileBackdrop");
    if (el) el.remove();
  }

  function copyValue(val, label) {
    if (!val) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => showToast(`${label} copied`));
    } else {
      const ta = document.createElement("textarea");
      ta.value = val;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast(`${label} copied`);
    }
  }

  function renderProfileSheet({ loading, data }) {
    closeProfileSheet();

    const backdrop = document.createElement("div");
    backdrop.id = "tcProfileBackdrop";
    backdrop.className = "tc-profile-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeProfileSheet();
    });

    if (loading) {
      backdrop.innerHTML = `
        <div class="tc-profile-sheet">
          <div class="tc-ps-loading">Loading profile...</div>
        </div>`;
      document.body.appendChild(backdrop);
      return;
    }

    const chat = (data && data.chat) || {};
    const u = (data && data.user) || {};
    const isGroup = ["group", "channel"].includes((chat.type || "").toLowerCase());

    const title = isGroup ? (chat.title || "Group") : (u.name || chat.title || "User");
    const avatar = isGroup ? (chat.avatar || "") : (u.avatar || chat.avatar || "");
    const username = u.username ? (u.username.startsWith("@") ? u.username : `@${u.username}`) : "";
    const phone = u.phone || "";
    const bio = isGroup ? (chat.description || "") : (u.bio || "");
    const subStatus = isGroup
      ? `${chat.member_count || 1} members`
      : (u.is_bot ? "Bot" : (u.last_seen || "TeleClone User"));
    const initial = (title.trim()[0] || "U").toUpperCase();

    const avatarHtml = avatar
      ? `<img src="${avatar}" alt="${title}" class="tc-ps-avatar-img" />`
      : `<div class="tc-ps-avatar-fallback">${initial}</div>`;

    const downloadBtnHtml = avatar
      ? `<a href="${avatar}" download class="tc-ps-dl-btn" title="Download Photo">${ICONS.download}<span>Save Photo</span></a>`
      : "";

    const rows = [];
    if (!isGroup && username) {
      rows.push(`
        <div class="tc-ps-row" data-copy="${username}" data-label="Username">
          <div class="tc-ps-row-text">
            <div class="tc-ps-val">${username}</div>
            <div class="tc-ps-key">Username</div>
          </div>
          <span class="tc-ps-copy">${ICONS.copy}</span>
        </div>`);
    }
    if (!isGroup && phone) {
      rows.push(`
        <div class="tc-ps-row" data-copy="${phone}" data-label="Phone">
          <div class="tc-ps-row-text">
            <div class="tc-ps-val">${phone}</div>
            <div class="tc-ps-key">Mobile</div>
          </div>
          <span class="tc-ps-copy">${ICONS.copy}</span>
        </div>`);
    }
    if (bio) {
      rows.push(`
        <div class="tc-ps-row">
          <div class="tc-ps-row-text">
            <div class="tc-ps-val">${bio}</div>
            <div class="tc-ps-key">${isGroup ? "Description" : "Bio"}</div>
          </div>
        </div>`);
    }
    if (!rows.length) {
      rows.push(`
        <div class="tc-ps-row">
          <div class="tc-ps-row-text">
            <div class="tc-ps-val">No extra info added yet</div>
            <div class="tc-ps-key">Info</div>
          </div>
        </div>`);
    }

    backdrop.innerHTML = `
      <div class="tc-profile-sheet">
        <div class="tc-ps-topbar">
          <span>${isGroup ? "Group Info" : "User Info"}</span>
          <button type="button" class="tc-ps-close">${ICONS.close}</button>
        </div>
        <div class="tc-ps-hero">
          <div class="tc-ps-avatar-wrap">${avatarHtml}</div>
          <h3 class="tc-ps-name">${title}</h3>
          <div class="tc-ps-sub">${subStatus}</div>
          ${downloadBtnHtml}
        </div>
        <div class="tc-ps-card">
          ${rows.join("")}
        </div>
      </div>
    `;

    backdrop.querySelector(".tc-ps-close").addEventListener("click", closeProfileSheet);
    backdrop.querySelectorAll(".tc-ps-row[data-copy]").forEach((row) => {
      row.addEventListener("click", () => {
        copyValue(row.getAttribute("data-copy"), row.getAttribute("data-label"));
      });
    });

    document.body.appendChild(backdrop);
  }
})();