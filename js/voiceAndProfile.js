(() => {
  "use strict";

  let activeChatId = null;
  let lastAuthHeader = null;

  // WAV Recorder state
  let audioStream = null;
  let audioCtx = null;
  let sourceNode = null;
  let processorNode = null;
  let pcmBuffers = [];
  let sampleRate = 16000;
  let recordTimer = null;
  let recordSeconds = 0;
  let isRecording = false;
  let currentlyPlayingAudio = null;

  const AUDIO_EXT_RE = /\.(wav|webm|ogg|opus|mp3|m4a|aac)(\?.*)?$/i;

  const ICONS = {
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
  };

  // ===== 1. Active Chat ID & Auth Token Track Karein =====
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

  // ===== 2. Universal 16kHz Mono WAV Encoder (Android 6-15 100% Clear Audio) =====
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
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let idx = 44;
    for (let i = 0; i < samples.length; i++, idx += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  }

  // ===== 3. Voice Recorder UI & Mic Capture =====
  function findComposerContainer() {
    const input = document.querySelector(
      '#messageInput, #msgInput, .message-input, .chat-input input, .chat-input textarea, textarea[placeholder*="Message" i], input[placeholder*="Message" i]'
    );
    if (!input) return null;
    return (
      input.closest(".chat-input-bar, .chat-composer, .composer, .input-area, .chat-input, form") ||
      input.parentElement
    );
  }

  function injectMicButton() {
    const composer = findComposerContainer();
    if (!composer || composer.querySelector("#tcVoiceMicBtn")) return;

    composer.style.position = composer.style.position || "relative";

    const btn = document.createElement("button");
    btn.id = "tcVoiceMicBtn";
    btn.type = "button";
    btn.className = "tc-mic-btn";
    btn.title = "Record Voice Note";
    btn.innerHTML = ICONS.mic;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startVoiceRecording(composer);
    });

    const sendBtn = composer.querySelector(
      '#sendBtn, .send-btn, button[type="submit"], button[aria-label*="send" i], button[title*="send" i]'
    );
    if (sendBtn && sendBtn.parentElement === composer) {
      composer.insertBefore(btn, sendBtn);
    } else {
      composer.appendChild(btn);
    }
  }

  async function startVoiceRecording(composer) {
    if (isRecording) return;
    if (!activeChatId) {
      showToast("Pehle koi chat open karein");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Microphone support nahi mil raha");
      return;
    }

    // Koi audio chal raha ho to pause kar dein
    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio = null;
    }

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      showToast("Mic permission allow karein (Settings > Apps > TeleClone)");
      return;
    }

    try {
      const AudioContextCls = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextCls();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      sampleRate = audioCtx.sampleRate || 44100;

      sourceNode = audioCtx.createMediaStreamSource(audioStream);
      processorNode = audioCtx.createScriptProcessor(4096, 1, 1);
      pcmBuffers = [];
      recordSeconds = 0;
      isRecording = true;

      // Silent gain node taake feedback/echo na aaye lekin processor chalta rahe
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      processorNode.onaudioprocess = (ev) => {
        if (!isRecording) return;
        const inputData = ev.inputBuffer.getChannelData(0);
        pcmBuffers.push(new Float32Array(inputData));

        // Live mic level meter calculate karein
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) sumSq += inputData[i] * inputData[i];
        const rms = Math.sqrt(sumSq / inputData.length);
        const pct = Math.min(100, Math.round(rms * 420));
        const meter = document.getElementById("tcMicLevelFill");
        if (meter) meter.style.width = `${Math.max(8, pct)}%`;
      };

      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      showRecordingBar(composer);
      recordTimer = setInterval(() => {
        recordSeconds += 1;
        const tEl = document.getElementById("tcRecTimer");
        if (tEl) tEl.textContent = formatTime(recordSeconds);
      }, 1000);
    } catch (err) {
      console.error("[VoiceRec]", err);
      await stopAudioEngine();
      showToast("Audio recorder start nahi ho saka");
    }
  }

  async function stopAudioEngine() {
    isRecording = false;
    clearInterval(recordTimer);
    recordTimer = null;

    try { if (processorNode) processorNode.disconnect(); } catch (_) {}
    try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
    processorNode = null;
    sourceNode = null;

    if (audioStream) {
      audioStream.getTracks().forEach((tr) => tr.stop());
      audioStream = null;
    }
    if (audioCtx) {
      try { await audioCtx.close(); } catch (_) {}
      audioCtx = null;
    }
  }

  function showRecordingBar(composer) {
    removeRecordingBar();
    const bar = document.createElement("div");
    bar.id = "tcVoiceRecBar";
    bar.className = "tc-rec-bar";
    bar.innerHTML = `
      <button type="button" class="tc-rec-cancel" title="Cancel">${ICONS.trash}</button>
      <div class="tc-rec-status">
        <span class="tc-rec-dot"></span>
        <span id="tcRecTimer">0:00</span>
        <div class="tc-mic-meter"><div id="tcMicLevelFill"></div></div>
      </div>
      <button type="button" class="tc-rec-send" title="Send Voice">${ICONS.send}</button>
    `;

    bar.querySelector(".tc-rec-cancel").addEventListener("click", async () => {
      pcmBuffers = [];
      await stopAudioEngine();
      removeRecordingBar();
    });

    bar.querySelector(".tc-rec-send").addEventListener("click", async () => {
      const captured = pcmBuffers.slice();
      const inRate = sampleRate;
      const dur = formatTime(recordSeconds || 1);
      pcmBuffers = [];
      await stopAudioEngine();
      removeRecordingBar();

      if (!captured.length) {
        showToast("Awaaz record nahi hui — dobara try karein");
        return;
      }

      const targetRate = 16000;
      const samples = downsampleBuffer(captured, inRate, targetRate);
      // Check karein ke mic bilkul dead/silent to nahi tha
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
      }
      if (peak < 0.002) {
        showToast("Mic se awaaz nahi aayi — phone mic permission check karein");
      }

      const wavBlob = encodeWavBlob(samples, targetRate);
      await uploadAndSendVoice(wavBlob, "audio/wav", ".wav", dur);
    });

    composer.appendChild(bar);
  }

  function removeRecordingBar() {
    const bar = document.getElementById("tcVoiceRecBar");
    if (bar) bar.remove();
  }

  async function uploadAndSendVoice(blob, mime, ext, durationStr) {
    const auth = getAuthHeader();
    if (!auth || !activeChatId) {
      showToast("Session expire ho gaya, dobara login karein");
      return;
    }

    showToast("Voice note send ho raha hai...");
    const filename = `voice_${Date.now()}${ext}`;

    try {
      const upRes = await origFetch("/api/chats/upload", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(filename),
          "X-File-Type": mime
        },
        body: blob
      });

      if (!upRes.ok) throw new Error(`Upload ${upRes.status}`);
      const upData = await upRes.json();
      const att = upData.attachment || {
        type: "voice",
        name: filename,
        src: upData.url || upData.src,
        label: `Voice message (${durationStr})`
      };
      att.type = "voice";
      att.duration = durationStr;
      att.label = `Voice message (${durationStr})`;

      const msgRes = await origFetch(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: "", attachment: att })
      });

      if (!msgRes.ok) throw new Error(`Send ${msgRes.status}`);
      showToast("Voice note sent");
    } catch (err) {
      console.error("[VoiceNote]", err);
      showToast(`Voice send error: ${err.message}`);
    }
  }

  // ===== 4. In-DOM Audio Player (Zero Silent-Playback Issues on Android) =====
  function upgradeVoiceAttachments() {
    const nodes = document.querySelectorAll('a[href*="/uploads/"], [data-src*="/uploads/"]');
    for (const el of nodes) {
      if (el.dataset.tcVoicePlayer === "1") continue;
      const src = el.getAttribute("href") || el.getAttribute("data-src") || "";
      if (!AUDIO_EXT_RE.test(src)) continue;

      el.dataset.tcVoicePlayer = "1";
      const player = buildVoicePlayerElement(src);
      el.replaceWith(player);
    }
  }

  function buildVoicePlayerElement(src) {
    const absSrc = new URL(src, window.location.origin).href;
    const wrap = document.createElement("div");
    wrap.className = "tc-voice-player";
    wrap.innerHTML = `
      <button type="button" class="tc-vp-btn" aria-label="Play voice note">${ICONS.play}</button>
      <div class="tc-vp-track-wrap">
        <div class="tc-vp-bar"><div class="tc-vp-fill"></div></div>
        <div class="tc-vp-meta"><span class="tc-vp-time">0:00</span><span>Voice note</span></div>
      </div>
      <audio preload="metadata" playsinline style="display:none"></audio>
    `;

    const audio = wrap.querySelector("audio");
    audio.src = absSrc;
    audio.muted = false;
    audio.volume = 1.0;

    const btn = wrap.querySelector(".tc-vp-btn");
    const bar = wrap.querySelector(".tc-vp-bar");
    const fill = wrap.querySelector(".tc-vp-fill");
    const timeEl = wrap.querySelector(".tc-vp-time");
    let blobFallbackTried = false;

    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        timeEl.textContent = formatTime(audio.duration);
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        const pct = (audio.currentTime / audio.duration) * 100;
        fill.style.width = `${Math.min(100, pct)}%`;
      }
      timeEl.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      btn.innerHTML = ICONS.play;
      fill.style.width = "0%";
      if (isFinite(audio.duration) && audio.duration > 0) {
        timeEl.textContent = formatTime(audio.duration);
      }
      if (currentlyPlayingAudio === audio) currentlyPlayingAudio = null;
    });

    audio.addEventListener("pause", () => {
      btn.innerHTML = ICONS.play;
    });

    async function playWithFallback() {
      if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
        currentlyPlayingAudio.pause();
      }
      currentlyPlayingAudio = audio;
      audio.muted = false;
      audio.volume = 1.0;

      try {
        await audio.play();
        btn.innerHTML = ICONS.pause;
      } catch (err) {
        if (!blobFallbackTried) {
          blobFallbackTried = true;
          try {
            const resp = await origFetch(absSrc);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const b = await resp.blob();
            audio.src = URL.createObjectURL(b);
            audio.load();
            await audio.play();
            btn.innerHTML = ICONS.pause;
            return;
          } catch (e2) {
            console.error("[VoicePlayFallback]", e2);
          }
        }
        showToast("Audio play nahi ho saka (media volume check karein)");
      }
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (audio.paused) playWithFallback();
      else audio.pause();
    });

    bar.addEventListener("click", (e) => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
    });

    return wrap;
  }

  // ===== 5. Chat Header Click -> Pro User Info Profile Sheet =====
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

  function setupHeaderProfileClick() {
    document.addEventListener(
      "click",
      (e) => {
        if (!activeChatId) return;
        const header = e.target.closest(
          ".chat-header, #chatHeader, .conversation-header, .chat-top-bar"
        );
        if (!header) return;

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
        openUserInfoSheet(activeChatId, readHeaderFallback(header));
      },
      true
    );
  }

  async function openUserInfoSheet(chatId, fallback) {
    const auth = getAuthHeader();
    if (!auth) {
      showToast("Login session nahi mila");
      return;
    }

    renderProfileSheet({ loading: true });

    try {
      const res = await origFetch(`/api/chats/${chatId}/info`, {
        headers: { Authorization: auth }
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        console.error("[UserInfo HTTP]", res.status, errTxt);
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
      showToast("Network error: User info load nahi ho saki");
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

  function syncAll() {
    injectMicButton();
    upgradeVoiceAttachments();
  }

  window.addEventListener("DOMContentLoaded", () => {
    setupHeaderProfileClick();
    syncAll();
    const obs = new MutationObserver(syncAll);
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();