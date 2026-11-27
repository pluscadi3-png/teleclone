(() => {
  "use strict";

  const ACCOUNTS_KEY = "tc_saved_accounts_v1";
  const JWT_KEY_CACHE = "tc_detected_jwt_key";
  const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  const ICONS = {
    micOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/></svg>`,
    minimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
  };

  let activeCall = null;
  let cachedIceServers = DEFAULT_ICE_SERVERS;
  let toneCtx = null;
  let toneInterval = null;

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
    t._tid = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function getActiveToken() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === ACCOUNTS_KEY || k === JWT_KEY_CACHE || k === "tc_offline_token_sig") continue;
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("eyJ") && v.split(".").length === 3) {
        localStorage.setItem(JWT_KEY_CACHE, k);
        return v;
      }
    }
    return localStorage.getItem(localStorage.getItem(JWT_KEY_CACHE) || "teleclone_jwt") || "";
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function sendSignal(payload) {
    if (window.TCWS && typeof window.TCWS.send === "function") {
      return window.TCWS.send(payload);
    }
    return false;
  }

  async function loadIceServers() {
    try {
      const res = await fetch("/api/calls/ice");
      const data = await res.json().catch(() => ({}));
      if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
        cachedIceServers = data.iceServers;
      }
    } catch (_) {}
    return cachedIceServers;
  }

  function logCallHistory(call, statusOverride) {
    if (!call || call.logged) return;
    call.logged = true;
    const token = getActiveToken();
    if (!token) return;

    const elapsedSec = call.connectedAt ? Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000)) : 0;
    const finalStatus = statusOverride || (call.direction === "incoming" ? (elapsedSec > 0 ? "incoming" : "missed") : "outgoing");

    fetch("/api/calls/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
        chatId: call.chatId ? Number(call.chatId) : null,
        callType: "voice",
        status: finalStatus,
        duration: formatDuration(elapsedSec)
      })
    }).catch(() => {});
  }

  // ===== Built-in Web Audio Ringtone & Ringback Synthesizer =====
  function stopTone() {
    if (toneInterval) {
      clearInterval(toneInterval);
      toneInterval = null;
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(0); } catch (_) {}
    }
    if (toneCtx) {
      try { toneCtx.close(); } catch (_) {}
      toneCtx = null;
    }
  }

  function playToneBurst(freqs, durationMs, gainLevel) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!toneCtx) toneCtx = new AC();
      if (toneCtx.state === "suspended") toneCtx.resume().catch(() => {});

      const now = toneCtx.currentTime;
      const gain = toneCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainLevel, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      gain.connect(toneCtx.destination);

      freqs.forEach((f) => {
        const osc = toneCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + durationMs / 1000 + 0.04);
      });
    } catch (_) {}
  }

  function startRingbackTone() {
    stopTone();
    const beep = () => playToneBurst([440, 480], 1100, 0.045);
    beep();
    toneInterval = setInterval(beep, 3000);
  }

  function startIncomingRingtone() {
    stopTone();
    const chime = () => {
      playToneBurst([587.33, 880], 260, 0.08);
      setTimeout(() => {
        if (activeCall && activeCall.state === "incoming") {
          playToneBurst([659.25, 987.77], 340, 0.08);
        }
      }, 280);
      if (navigator.vibrate) {
        try { navigator.vibrate([320, 180, 320]); } catch (_) {}
      }
    };
    chime();
    toneInterval = setInterval(chime, 2300);
  }

  // ===== Remote Audio Element =====
  function getRemoteAudioEl() {
    let el = document.getElementById("tcRemoteCallAudio");
    if (!el) {
      el = document.createElement("audio");
      el.id = "tcRemoteCallAudio";
      el.autoplay = true;
      el.playsInline = true;
      el.style.display = "none";
      document.body.appendChild(el);
    }
    return el;
  }

  // ===== WebRTC PeerConnection Setup =====
  async function createPeerConnection(call) {
    const iceServers = await loadIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    call.pc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && activeCall && activeCall.callId === call.callId) {
        sendSignal({
          type: "call_ice",
          callId: call.callId,
          targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
          chatId: call.chatId ? Number(call.chatId) : null,
          candidate: ev.candidate
        });
      }
    };

    pc.ontrack = (ev) => {
      const stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      const audioEl = getRemoteAudioEl();
      audioEl.srcObject = stream;
      audioEl.muted = false;
      audioEl.volume = call.speakerOn ? 1.0 : 0.72;
      audioEl.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (!activeCall || activeCall.callId !== call.callId) return;
      const st = pc.connectionState;
      if (st === "connected") {
        onCallConnected(call);
      } else if (st === "failed" || st === "closed") {
        endActiveCall(false, "Connection lost");
      } else if (st === "disconnected") {
        updateCallStatusText("Reconnecting...");
        setTimeout(() => {
          if (activeCall && activeCall.callId === call.callId && pc.connectionState === "disconnected") {
            endActiveCall(false, "Call disconnected");
          }
        }, 7000);
      }
    };

    return pc;
  }

  async function flushQueuedIce(call) {
    if (!call || !call.pc || !call.pc.remoteDescription || !call.iceQueue.length) return;
    const queue = call.iceQueue.splice(0, call.iceQueue.length);
    for (const cand of queue) {
      try {
        await call.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (_) {}
    }
  }

  function onCallConnected(call) {
    if (call.state === "connected") return;
    stopTone();
    clearTimeout(call.ringTimeout);
    call.state = "connected";
    call.connectedAt = Date.now();
    renderCallUI();

    clearInterval(call.durationTimer);
    call.durationTimer = setInterval(() => {
      if (!activeCall || activeCall.callId !== call.callId) return;
      const secs = Math.floor((Date.now() - call.connectedAt) / 1000);
      const lbl = formatDuration(secs);
      const statusEl = document.getElementById("tcCallStatusTxt");
      const miniEl = document.getElementById("tcCallMiniTimer");
      if (statusEl) statusEl.textContent = lbl;
      if (miniEl) miniEl.textContent = lbl;
    }, 1000);
  }

  function updateCallStatusText(txt) {
    const statusEl = document.getElementById("tcCallStatusTxt");
    const miniEl = document.getElementById("tcCallMiniTimer");
    if (statusEl) statusEl.textContent = txt;
    if (miniEl) miniEl.textContent = txt;
  }

  // ===== Outgoing Call =====
  async function startVoiceCall({ targetUserId, chatId, name, avatarUrl, color }) {
    if (activeCall) {
      activeCall.minimized = false;
      renderCallUI();
      return;
    }
    if (!window.TCWS || !window.TCWS.isOpen()) {
      toast("Connecting to server — please try again in a moment");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Voice calling is not supported on this browser");
      return;
    }

    const callId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const call = {
      callId,
      direction: "outgoing",
      state: "calling",
      targetUserId: targetUserId ? String(targetUserId) : null,
      chatId: chatId ? String(chatId) : null,
      peerName: name || "User",
      peerAvatar: avatarUrl || "",
      peerColor: color || "linear-gradient(135deg,#334155,#1e293b)",
      muted: false,
      speakerOn: true,
      minimized: false,
      localStream: null,
      pc: null,
      iceQueue: [],
      pendingOffer: null,
      connectedAt: 0,
      durationTimer: null,
      ringTimeout: null,
      logged: false
    };

    activeCall = call;
    renderCallUI();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      if (!activeCall || activeCall.callId !== callId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      call.localStream = stream;
      const pc = await createPeerConnection(call);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const sent = sendSignal({
        type: "call_offer",
        callId,
        targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
        chatId: call.chatId ? Number(call.chatId) : null,
        sdp: offer
      });

      if (!sent) {
        endActiveCall(false, "Server connection lost");
        return;
      }

      startRingbackTone();
      call.ringTimeout = setTimeout(() => {
        if (activeCall && activeCall.callId === callId && activeCall.state !== "connected") {
          endActiveCall(true, "No answer", "missed");
        }
      }, 35000);
    } catch (err) {
      const msg =
        err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          ? "Microphone permission denied — allow mic access in Settings"
          : "Could not start voice call";
      endActiveCall(false, msg);
    }
  }

  // ===== Accept Incoming Call =====
  async function acceptIncomingCall() {
    const call = activeCall;
    if (!call || call.state !== "incoming" || !call.pendingOffer) return;

    stopTone();
    clearTimeout(call.ringTimeout);
    call.state = "connecting";
    renderCallUI();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      if (!activeCall || activeCall.callId !== call.callId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      call.localStream = stream;
      const pc = await createPeerConnection(call);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(call.pendingOffer));
      await flushQueuedIce(call);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: "call_answer",
        callId: call.callId,
        targetUserId: Number(call.targetUserId),
        chatId: call.chatId ? Number(call.chatId) : null,
        sdp: answer
      });

      // Fallback connected state if ICE takes a second
      setTimeout(() => {
        if (activeCall && activeCall.callId === call.callId && activeCall.state === "connecting") {
          onCallConnected(call);
        }
      }, 1500);
    } catch (err) {
      sendSignal({
        type: "call_reject",
        callId: call.callId,
        targetUserId: Number(call.targetUserId),
        reason: "Mic unavailable"
      });
      endActiveCall(false, "Microphone permission is required to answer calls");
    }
  }

  // ===== Reject / End Call =====
  function declineIncomingCall() {
    const call = activeCall;
    if (!call) return;
    sendSignal({
      type: "call_reject",
      callId: call.callId,
      targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
      chatId: call.chatId ? Number(call.chatId) : null
    });
    endActiveCall(false, "Call declined", "missed");
  }

  function endActiveCall(notifyPeer = true, noticeMsg = "", historyStatus = null) {
    const call = activeCall;
    if (!call) return;
    activeCall = null;

    stopTone();
    clearTimeout(call.ringTimeout);
    clearInterval(call.durationTimer);

    if (notifyPeer) {
      sendSignal({
        type: "call_end",
        callId: call.callId,
        targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
        chatId: call.chatId ? Number(call.chatId) : null
      });
    }

    if (call.direction === "outgoing" || call.connectedAt > 0 || historyStatus === "missed") {
      logCallHistory(call, historyStatus);
    }

    if (call.localStream) {
      call.localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
    }
    if (call.pc) {
      try { call.pc.close(); } catch (_) {}
    }

    const audioEl = document.getElementById("tcRemoteCallAudio");
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
    }

    const ov = document.getElementById("tcVoiceCallOverlay");
    if (ov) ov.remove();
    const bar = document.getElementById("tcVoiceCallMiniBar");
    if (bar) bar.remove();

    if (noticeMsg) toast(noticeMsg);
  }

  function toggleMute() {
    if (!activeCall) return;
    activeCall.muted = !activeCall.muted;
    if (activeCall.localStream) {
      activeCall.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !activeCall.muted;
      });
    }
    renderCallUI();
  }

  function toggleSpeaker() {
    if (!activeCall) return;
    activeCall.speakerOn = !activeCall.speakerOn;
    const audioEl = document.getElementById("tcRemoteCallAudio");
    if (audioEl) {
      audioEl.volume = activeCall.speakerOn ? 1.0 : 0.65;
    }
    renderCallUI();
  }

  // ===== Incoming Signaling Handler =====
  window.addEventListener("tc-call-signal", async (e) => {
    const data = e && e.detail;
    if (!data || !data.type) return;

    if (data.type === "call_offer") {
      if (activeCall) {
        sendSignal({
          type: "call_busy",
          callId: data.callId,
          targetUserId: Number(data.fromUserId)
        });
        return;
      }

      const caller = data.caller || {};
      activeCall = {
        callId: data.callId,
        direction: "incoming",
        state: "incoming",
        targetUserId: String(data.fromUserId),
        chatId: data.chatId ? String(data.chatId) : null,
        peerName: caller.name || caller.username || "Incoming Caller",
        peerAvatar: caller.avatarUrl || "",
        peerColor: caller.avatarColor || "linear-gradient(135deg,#334155,#1e293b)",
        muted: false,
        speakerOn: true,
        minimized: false,
        localStream: null,
        pc: null,
        iceQueue: [],
        pendingOffer: data.sdp,
        connectedAt: 0,
        durationTimer: null,
        ringTimeout: null,
        logged: false
      };

      // Notify caller that our phone is ringing
      sendSignal({
        type: "call_ringing",
        callId: data.callId,
        targetUserId: Number(data.fromUserId)
      });

      renderCallUI();
      startIncomingRingtone();

      activeCall.ringTimeout = setTimeout(() => {
        if (activeCall && activeCall.callId === data.callId && activeCall.state === "incoming") {
          endActiveCall(false, "Missed voice call", "missed");
        }
      }, 36000);
      return;
    }

    if (!activeCall || (data.callId && data.callId !== activeCall.callId)) return;

    if (data.fromUserId && !activeCall.targetUserId) {
      activeCall.targetUserId = String(data.fromUserId);
    }

    if (data.type === "call_ringing") {
      if (activeCall.state === "calling") {
        activeCall.state = "ringing";
        updateCallStatusText("Ringing...");
      }
    } else if (data.type === "call_answer") {
      try {
        if (activeCall.pc && data.sdp) {
          await activeCall.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushQueuedIce(activeCall);
          onCallConnected(activeCall);
        }
      } catch (_) {
        endActiveCall(true, "Failed to establish voice connection");
      }
    } else if (data.type === "call_ice") {
      if (data.candidate) {
        if (activeCall.pc && activeCall.pc.remoteDescription) {
          try {
            await activeCall.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (_) {}
        } else {
          activeCall.iceQueue.push(data.candidate);
        }
      }
    } else if (data.type === "call_reject") {
      endActiveCall(false, "Call declined", "missed");
    } else if (data.type === "call_busy") {
      endActiveCall(false, `${activeCall.peerName} is busy on another call`, "missed");
    } else if (data.type === "call_offline") {
      endActiveCall(false, `${activeCall.peerName} is offline`, "missed");
    } else if (data.type === "call_end") {
      endActiveCall(false, "Call ended");
    }
  });

  // ===== Render OLED Voice Call Screen & Minimized Bar =====
  function renderCallUI() {
    const call = activeCall;
    const oldOv = document.getElementById("tcVoiceCallOverlay");
    const oldBar = document.getElementById("tcVoiceCallMiniBar");

    if (!call) {
      if (oldOv) oldOv.remove();
      if (oldBar) oldBar.remove();
      return;
    }

    const statusLabel =
      call.state === "incoming"
        ? "Incoming voice call..."
        : call.state === "calling"
        ? "Calling..."
        : call.state === "ringing"
        ? "Ringing..."
        : call.state === "connecting"
        ? "Connecting..."
        : formatDuration(Math.floor((Date.now() - call.connectedAt) / 1000));

    // Minimized top bar so user can still chat during active call
    if (call.minimized) {
      if (oldOv) oldOv.remove();
      let bar = oldBar;
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "tcVoiceCallMiniBar";
        bar.className = "tc-vc-minibar";
        document.body.appendChild(bar);
      }
      bar.innerHTML = `
        <div class="tc-vc-mini-left" id="tcCallMiniExpand">
          <span class="tc-vc-mini-dot"></span>
          <span class="tc-vc-mini-name">${esc(call.peerName)}</span>
          <span class="tc-vc-mini-time" id="tcCallMiniTimer">${esc(statusLabel)}</span>
        </div>
        <button type="button" class="tc-vc-mini-end" id="tcCallMiniEnd">End</button>
      `;
      bar.querySelector("#tcCallMiniExpand").onclick = () => {
        call.minimized = false;
        renderCallUI();
      };
      bar.querySelector("#tcCallMiniEnd").onclick = (e) => {
        e.stopPropagation();
        endActiveCall(true, "Call ended");
      };
      return;
    }

    if (oldBar) oldBar.remove();

    let ov = oldOv;
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "tcVoiceCallOverlay";
      ov.className = "tc-vc-overlay";
      document.body.appendChild(ov);
    }

    const avInner = call.peerAvatar
      ? `<img src="${esc(call.peerAvatar)}" alt="${esc(call.peerName)}" />`
      : `<div class="tc-vc-av-fb" style="background:${esc(call.peerColor)}">${esc((call.peerName || "U")[0].toUpperCase())}</div>`;

    const isPulsing = call.state === "calling" || call.state === "ringing" || call.state === "incoming";

    const controlsHtml =
      call.state === "incoming"
        ? `
          <div class="tc-vc-controls tc-vc-incoming-ctrls">
            <div class="tc-vc-btn-col">
              <button type="button" class="tc-vc-round-btn tc-vc-decline" id="tcVcDeclineBtn" aria-label="Decline">
                ${ICONS.phone}
              </button>
              <span>Decline</span>
            </div>
            <div class="tc-vc-btn-col">
              <button type="button" class="tc-vc-round-btn tc-vc-accept" id="tcVcAcceptBtn" aria-label="Accept">
                ${ICONS.phone}
              </button>
              <span>Accept</span>
            </div>
          </div>
        `
        : `
          <div class="tc-vc-controls">
            <div class="tc-vc-btn-col">
              <button type="button" class="tc-vc-round-btn ${call.speakerOn ? "active" : ""}" id="tcVcSpeakerBtn" aria-label="Speaker">
                ${ICONS.speaker}
              </button>
              <span>Speaker</span>
            </div>
            <div class="tc-vc-btn-col">
              <button type="button" class="tc-vc-round-btn ${call.muted ? "active-warn" : ""}" id="tcVcMuteBtn" aria-label="Mute">
                ${call.muted ? ICONS.micOff : ICONS.micOn}
              </button>
              <span>${call.muted ? "Unmute" : "Mute"}</span>
            </div>
            <div class="tc-vc-btn-col">
              <button type="button" class="tc-vc-round-btn tc-vc-decline" id="tcVcEndBtn" aria-label="End Call">
                ${ICONS.phone}
              </button>
              <span>End</span>
            </div>
          </div>
        `;

    ov.innerHTML = `
      <div class="tc-vc-shell">
        <div class="tc-vc-top">
          <button type="button" class="tc-vc-min-btn" id="tcVcMinBtn" title="Minimize">${ICONS.minimize}</button>
          <div class="tc-vc-badge">Voice Call</div>
          <div style="width:40px;"></div>
        </div>

        <div class="tc-vc-center">
          <div class="tc-vc-ring-wrap ${isPulsing ? "pulsing" : ""}">
            <div class="tc-vc-avatar">${avInner}</div>
          </div>
          <div class="tc-vc-name">${esc(call.peerName)}</div>
          <div class="tc-vc-status ${call.state === "connected" ? "live" : ""}" id="tcCallStatusTxt">${esc(statusLabel)}</div>
        </div>

        ${controlsHtml}
      </div>
    `;

    ov.querySelector("#tcVcMinBtn").onclick = () => {
      call.minimized = true;
      renderCallUI();
    };

    const acceptBtn = ov.querySelector("#tcVcAcceptBtn");
    const declineBtn = ov.querySelector("#tcVcDeclineBtn");
    const muteBtn = ov.querySelector("#tcVcMuteBtn");
    const spkBtn = ov.querySelector("#tcVcSpeakerBtn");
    const endBtn = ov.querySelector("#tcVcEndBtn");

    if (acceptBtn) acceptBtn.onclick = acceptIncomingCall;
    if (declineBtn) declineBtn.onclick = declineIncomingCall;
    if (muteBtn) muteBtn.onclick = toggleMute;
    if (spkBtn) spkBtn.onclick = toggleSpeaker;
    if (endBtn) endBtn.onclick = () => endActiveCall(true, "Call ended");
  }

  // ===== Hook Active Chat Call Button (#chat-call-btn) =====
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("#chat-call-btn");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const st = getStoreObj();
      const chat =
        st && typeof st.getActiveChat === "function"
          ? st.getActiveChat()
          : st && typeof st.getState === "function"
          ? (st.getState().chats || []).find((c) => String(c.id) === String(st.getState().activeChatId))
          : null;

      if (!chat) {
        toast("Open a chat first to place a call");
        return;
      }
      if (chat.type !== "personal" || chat.isBot) {
        toast("Voice calls are only available in 1-on-1 personal chats");
        return;
      }

      startVoiceCall({
        targetUserId: chat.peerUserId || chat.otherUserId || chat.targetUserId || null,
        chatId: chat.id,
        name: chat.name,
        avatarUrl: chat.avatarUrl || "",
        color: chat.color || ""
      });
    },
    true
  );

  window.addEventListener("beforeunload", () => {
    if (activeCall) endActiveCall(true, "");
  });

  window.TCVoiceCall = {
    startCall: startVoiceCall,
    endCall: () => endActiveCall(true, "Call ended"),
    isActive: () => Boolean(activeCall)
  };
})();