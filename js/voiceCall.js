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
    videoOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
    videoOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    flipCam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><path d="M9 13a3 3 0 0 1 5.12-2.12L15 12"/><path d="M15 14a3 3 0 0 1-5.12 2.12L9 15"/></svg>`,
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
    const finalStatus = statusOverride || (elapsedSec > 0 ? "completed" : "missed");

    fetch("/api/calls/log", {
      method: "POST",
      keepalive: true,
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        callId: call.callId || "",
        direction: call.direction || "outgoing",
        targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
        chatId: call.chatId ? Number(call.chatId) : null,
        callType: call.callType === "video" ? "video" : "voice",
        status: finalStatus,
        duration: formatDuration(elapsedSec)
      })
    }).catch(() => {});
  }

  // ===== Built-in Web Audio Ringtone & Ringback =====
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

  // ===== Persistent Remote Audio Element (Never cuts out on minimize) =====
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

  function attachMediaStreams() {
    const call = activeCall;
    if (!call) return;

    if (call.remoteStream) {
      const audioEl = getRemoteAudioEl();
      if (audioEl.srcObject !== call.remoteStream) {
        audioEl.srcObject = call.remoteStream;
      }
      audioEl.muted = false;
      audioEl.volume = call.speakerOn ? 1.0 : 0.65;
      audioEl.play().catch(() => {});

      const remoteVid = document.getElementById("tcRemoteCallVideo");
      if (remoteVid) {
        if (remoteVid.srcObject !== call.remoteStream) {
          remoteVid.srcObject = call.remoteStream;
        }
        remoteVid.muted = true; // Audio handled by persistent #tcRemoteCallAudio
        remoteVid.play().catch(() => {});
      }
    }

    if (call.localStream) {
      const localVid = document.getElementById("tcLocalCallVideo");
      if (localVid) {
        if (localVid.srcObject !== call.localStream) {
          localVid.srcObject = call.localStream;
        }
        localVid.muted = true;
        localVid.play().catch(() => {});
      }
    }
  }

  async function acquireMediaStream(wantVideo, facingMode) {
    const audioCfg = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if (!wantVideo) {
      return {
        stream: await navigator.mediaDevices.getUserMedia({ audio: audioCfg, video: false }),
        hasVideo: false
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioCfg,
        video: {
          facingMode: facingMode || "user",
          width: { ideal: 720 },
          height: { ideal: 1280 }
        }
      });
      return { stream, hasVideo: true };
    } catch (err) {
      // Fallback to basic video constraints, then audio-only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioCfg, video: true });
        return { stream, hasVideo: true };
      } catch (_) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioCfg, video: false });
        toast("Camera unavailable — continuing with audio");
        return { stream, hasVideo: false };
      }
    }
  }

  // ===== WebRTC PeerConnection =====
  async function createPeerConnection(call) {
    const iceServers = await loadIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    call.pc = pc;
    call.remoteStream = new MediaStream();

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
      if (ev.streams && ev.streams[0]) {
        ev.streams[0].getTracks().forEach((tr) => {
          if (!call.remoteStream.getTracks().some((t) => t.id === tr.id)) {
            call.remoteStream.addTrack(tr);
          }
        });
      } else if (ev.track) {
        if (!call.remoteStream.getTracks().some((t) => t.id === ev.track.id)) {
          call.remoteStream.addTrack(ev.track);
        }
      }
      if (ev.track && ev.track.kind === "video") {
        call.hasRemoteVideo = true;
        renderCallUI();
      }
      attachMediaStreams();
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

  // ===== Outgoing Voice / Video Call =====
  async function startCall({ targetUserId, chatId, name, avatarUrl, color, callType = "voice" }) {
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
      toast("Calling is not supported on this browser");
      return;
    }

    const isVideo = callType === "video";
    const callId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const call = {
      callId,
      callType: isVideo ? "video" : "voice",
      direction: "outgoing",
      state: "calling",
      targetUserId: targetUserId ? String(targetUserId) : null,
      chatId: chatId ? String(chatId) : null,
      peerName: name || "User",
      peerAvatar: avatarUrl || "",
      peerColor: color || "linear-gradient(135deg,#334155,#1e293b)",
      muted: false,
      speakerOn: true,
      cameraOff: !isVideo,
      facingMode: "user",
      hasRemoteVideo: false,
      minimized: false,
      localStream: null,
      remoteStream: null,
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
      const { stream, hasVideo } = await acquireMediaStream(isVideo, call.facingMode);
      if (!activeCall || activeCall.callId !== callId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      call.localStream = stream;
      call.cameraOff = !hasVideo;
      if (isVideo && !hasVideo) call.callType = "voice";

      const pc = await createPeerConnection(call);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: call.callType === "video"
      });
      await pc.setLocalDescription(offer);

      const sent = sendSignal({
        type: "call_offer",
        callId,
        callType: call.callType,
        targetUserId: call.targetUserId ? Number(call.targetUserId) : null,
        chatId: call.chatId ? Number(call.chatId) : null,
        sdp: offer
      });

      if (!sent) {
        endActiveCall(false, "Server connection lost");
        return;
      }

      renderCallUI();
      startRingbackTone();
      call.ringTimeout = setTimeout(() => {
        if (activeCall && activeCall.callId === callId && activeCall.state !== "connected") {
          endActiveCall(true, "No answer", "missed");
        }
      }, 35000);
    } catch (err) {
      const msg =
        err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          ? "Camera or microphone permission denied — allow access in Settings"
          : "Could not start call";
      endActiveCall(false, msg);
    }
  }

  // ===== Accept Incoming Voice / Video Call =====
  async function acceptIncomingCall() {
    const call = activeCall;
    if (!call || call.state !== "incoming" || !call.pendingOffer) return;

    stopTone();
    clearTimeout(call.ringTimeout);
    call.state = "connecting";
    renderCallUI();

    try {
      const wantVideo = call.callType === "video";
      const { stream, hasVideo } = await acquireMediaStream(wantVideo, call.facingMode);

      if (!activeCall || activeCall.callId !== call.callId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      call.localStream = stream;
      call.cameraOff = !hasVideo;

      const pc = await createPeerConnection(call);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(call.pendingOffer));
      await flushQueuedIce(call);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: "call_answer",
        callId: call.callId,
        callType: call.callType,
        targetUserId: Number(call.targetUserId),
        chatId: call.chatId ? Number(call.chatId) : null,
        sdp: answer
      });

      renderCallUI();

      setTimeout(() => {
        if (activeCall && activeCall.callId === call.callId && activeCall.state === "connecting") {
          onCallConnected(call);
        }
      }, 1600);
    } catch (err) {
      sendSignal({
        type: "call_reject",
        callId: call.callId,
        targetUserId: Number(call.targetUserId),
        reason: "Permissions unavailable"
      });
      endActiveCall(false, "Microphone/camera permission is required to answer");
    }
  }

  // ===== Decline / End / Controls =====
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

    logCallHistory(call, historyStatus);

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

  function toggleCamera() {
    if (!activeCall || activeCall.callType !== "video" || !activeCall.localStream) return;
    const vTracks = activeCall.localStream.getVideoTracks();
    if (!vTracks.length) {
      toast("No camera available");
      return;
    }
    activeCall.cameraOff = !activeCall.cameraOff;
    vTracks.forEach((t) => {
      t.enabled = !activeCall.cameraOff;
    });
    renderCallUI();
  }

  async function switchCamera() {
    const call = activeCall;
    if (!call || call.callType !== "video" || !call.localStream) return;

    const nextMode = call.facingMode === "user" ? "environment" : "user";
    try {
      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: nextMode }, width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false
        });
      } catch (_) {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode },
          audio: false
        });
      }

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !call.cameraOff;

      // Replace track inside RTCPeerConnection without dropping the call
      if (call.pc) {
        const sender = call.pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      // Swap track on localStream and stop old camera track
      const oldTracks = call.localStream.getVideoTracks();
      oldTracks.forEach((ot) => {
        call.localStream.removeTrack(ot);
        try { ot.stop(); } catch (_) {}
      });
      call.localStream.addTrack(newTrack);
      call.facingMode = nextMode;

      renderCallUI();
    } catch (_) {
      toast("Could not switch camera on this device");
    }
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
      const isVid = data.callType === "video";
      activeCall = {
        callId: data.callId,
        callType: isVid ? "video" : "voice",
        direction: "incoming",
        state: "incoming",
        targetUserId: String(data.fromUserId),
        chatId: data.chatId ? String(data.chatId) : null,
        peerName: caller.name || caller.username || "Incoming Caller",
        peerAvatar: caller.avatarUrl || "",
        peerColor: caller.avatarColor || "linear-gradient(135deg,#334155,#1e293b)",
        muted: false,
        speakerOn: true,
        cameraOff: !isVid,
        facingMode: "user",
        hasRemoteVideo: false,
        minimized: false,
        localStream: null,
        remoteStream: null,
        pc: null,
        iceQueue: [],
        pendingOffer: data.sdp,
        connectedAt: 0,
        durationTimer: null,
        ringTimeout: null,
        logged: false
      };

      sendSignal({
        type: "call_ringing",
        callId: data.callId,
        targetUserId: Number(data.fromUserId)
      });

      renderCallUI();
      startIncomingRingtone();

      activeCall.ringTimeout = setTimeout(() => {
        if (activeCall && activeCall.callId === data.callId && activeCall.state === "incoming") {
          endActiveCall(false, isVid ? "Missed video call" : "Missed voice call", "missed");
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
        endActiveCall(true, "Failed to establish call connection");
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

  // ===== Render OLED Voice & Video Call Screen =====
  function renderCallUI() {
    const call = activeCall;
    const oldOv = document.getElementById("tcVoiceCallOverlay");
    const oldBar = document.getElementById("tcVoiceCallMiniBar");

    if (!call) {
      if (oldOv) oldOv.remove();
      if (oldBar) oldBar.remove();
      return;
    }

    const isVideo = call.callType === "video";
    const statusLabel =
      call.state === "incoming"
        ? isVideo
          ? "Incoming video call..."
          : "Incoming voice call..."
        : call.state === "calling"
        ? "Calling..."
        : call.state === "ringing"
        ? "Ringing..."
        : call.state === "connecting"
        ? "Connecting..."
        : formatDuration(Math.floor((Date.now() - call.connectedAt) / 1000));

    // Minimized top bar
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
    ov.classList.toggle("tc-vc-video-mode", isVideo);

    const avInner = call.peerAvatar
      ? `<img src="${esc(call.peerAvatar)}" alt="${esc(call.peerName)}" />`
      : `<div class="tc-vc-av-fb" style="background:${esc(call.peerColor)}">${esc((call.peerName || "U")[0].toUpperCase())}</div>`;

    const isPulsing = call.state === "calling" || call.state === "ringing" || call.state === "incoming";
    const showRemoteStage = isVideo && call.hasRemoteVideo && call.state === "connected";
    const showLocalPip = isVideo && call.localStream && !call.cameraOff;

    let controlsHtml = "";
    if (call.state === "incoming") {
      controlsHtml = `
        <div class="tc-vc-controls tc-vc-incoming-ctrls">
          <div class="tc-vc-btn-col">
            <button type="button" class="tc-vc-round-btn tc-vc-decline" id="tcVcDeclineBtn" aria-label="Decline">
              ${ICONS.phone}
            </button>
            <span>Decline</span>
          </div>
          <div class="tc-vc-btn-col">
            <button type="button" class="tc-vc-round-btn tc-vc-accept" id="tcVcAcceptBtn" aria-label="Accept">
              ${isVideo ? ICONS.videoOn : ICONS.phone}
            </button>
            <span>Accept</span>
          </div>
        </div>
      `;
    } else if (isVideo) {
      controlsHtml = `
        <div class="tc-vc-controls tc-vc-video-ctrls">
          <div class="tc-vc-btn-col">
            <button type="button" class="tc-vc-round-btn" id="tcVcFlipBtn" aria-label="Flip Camera">
              ${ICONS.flipCam}
            </button>
            <span>Flip</span>
          </div>
          <div class="tc-vc-btn-col">
            <button type="button" class="tc-vc-round-btn ${call.cameraOff ? "active-warn" : ""}" id="tcVcCamBtn" aria-label="Camera">
              ${call.cameraOff ? ICONS.videoOff : ICONS.videoOn}
            </button>
            <span>${call.cameraOff ? "Cam Off" : "Camera"}</span>
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
    } else {
      controlsHtml = `
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
    }

    ov.innerHTML = `
      ${
        isVideo
          ? `<video id="tcRemoteCallVideo" class="tc-vc-remote-vid ${showRemoteStage ? "visible" : ""}" autoplay playsinline muted></video>`
          : ""
      }
      ${
        showLocalPip
          ? `<div class="tc-vc-pip-box">
               <video id="tcLocalCallVideo" class="tc-vc-local-vid ${call.facingMode === "user" ? "mirrored" : ""}" autoplay playsinline muted></video>
             </div>`
          : ""
      }
      <div class="tc-vc-shell">
        <div class="tc-vc-top">
          <button type="button" class="tc-vc-min-btn" id="tcVcMinBtn" title="Minimize">${ICONS.minimize}</button>
          <div class="tc-vc-top-meta">
            <div class="tc-vc-badge">${isVideo ? "Video Call" : "Voice Call"}</div>
            ${
              showRemoteStage
                ? `<div class="tc-vc-top-name">${esc(call.peerName)}</div>
                   <div class="tc-vc-top-timer" id="tcCallStatusTxt">${esc(statusLabel)}</div>`
                : ""
            }
          </div>
          <div style="width:42px;"></div>
        </div>

        ${
          showRemoteStage
            ? `<div style="flex:1;"></div>`
            : `<div class="tc-vc-center">
                 <div class="tc-vc-ring-wrap ${isPulsing ? "pulsing" : ""}">
                   <div class="tc-vc-avatar">${avInner}</div>
                 </div>
                 <div class="tc-vc-name">${esc(call.peerName)}</div>
                 <div class="tc-vc-status ${call.state === "connected" ? "live" : ""}" id="tcCallStatusTxt">${esc(statusLabel)}</div>
               </div>`
        }

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
    const camBtn = ov.querySelector("#tcVcCamBtn");
    const flipBtn = ov.querySelector("#tcVcFlipBtn");
    const endBtn = ov.querySelector("#tcVcEndBtn");

    if (acceptBtn) acceptBtn.onclick = acceptIncomingCall;
    if (declineBtn) declineBtn.onclick = declineIncomingCall;
    if (muteBtn) muteBtn.onclick = toggleMute;
    if (spkBtn) spkBtn.onclick = toggleSpeaker;
    if (camBtn) camBtn.onclick = toggleCamera;
    if (flipBtn) flipBtn.onclick = switchCamera;
    if (endBtn) endBtn.onclick = () => endActiveCall(true, "Call ended");

    attachMediaStreams();
  }

  // ===== Inject Video Call Button Next to #chat-call-btn =====
  function ensureChatHeaderVideoButton() {
    const voiceBtn = document.getElementById("chat-call-btn");
    if (!voiceBtn || document.getElementById("chat-video-call-btn")) return;

    const vidBtn = document.createElement("button");
    vidBtn.id = "chat-video-call-btn";
    vidBtn.type = "button";
    vidBtn.className = voiceBtn.className || "icon-btn";
    vidBtn.title = "Video Call";
    vidBtn.setAttribute("aria-label", "Video Call");
    vidBtn.innerHTML = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
    voiceBtn.insertAdjacentElement("afterend", vidBtn);
  }

  function triggerActiveChatCall(callType) {
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
      toast(`${callType === "video" ? "Video" : "Voice"} calls are only available in 1-on-1 personal chats`);
      return;
    }

    startCall({
      targetUserId: chat.peerUserId || chat.otherUserId || chat.targetUserId || null,
      chatId: chat.id,
      name: chat.name,
      avatarUrl: chat.avatarUrl || "",
      color: chat.color || "",
      callType
    });
  }

  // Hook both Voice (#chat-call-btn) & Video (#chat-video-call-btn) header buttons
  document.addEventListener(
    "click",
    (e) => {
      const voiceBtn = e.target.closest("#chat-call-btn");
      const videoBtn = e.target.closest("#chat-video-call-btn");
      if (!voiceBtn && !videoBtn) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerActiveChatCall(videoBtn ? "video" : "voice");
    },
    true
  );

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", ensureChatHeaderVideoButton);
  } else {
    ensureChatHeaderVideoButton();
  }
  setTimeout(ensureChatHeaderVideoButton, 600);

  window.addEventListener("beforeunload", () => {
    if (activeCall) endActiveCall(true, "");
  });

  // ===== LIVE RECENT CALLS LOG UI =====
  let callsFilter = "all";
  let cachedCallsList = [];

  function closeLiveCallsModal() {
    const el = document.getElementById("tcCallsLogOverlay");
    if (el) el.remove();
  }

  function closeAppDrawerSafe() {
    ["drawer", "side-drawer", "nav-drawer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("open", "active");
    });
    document.querySelectorAll(".drawer.open, .side-drawer.open").forEach((el) => el.classList.remove("open"));
    const ov = document.getElementById("drawer-overlay") || document.querySelector(".drawer-overlay");
    if (ov) {
      if (!ov.classList.contains("hidden")) {
        try { ov.click(); } catch (_) {}
      }
      ov.classList.add("hidden");
      ov.classList.remove("open", "active");
    }
  }

  function findChatIdForPeer(peerUserId) {
    try {
      const st = getStoreObj();
      const chats = st && typeof st.getState === "function" ? st.getState().chats || [] : [];
      const match = chats.find((c) => String(c.peerUserId || c.otherUserId || "") === String(peerUserId));
      return match ? match.id : null;
    } catch (_) {
      return null;
    }
  }

  function renderCallsListBody() {
    const body = document.getElementById("tcCallsLogBody");
    const missedBadge = document.getElementById("tcCallsMissedCount");
    if (!body) return;

    const missedCount = cachedCallsList.filter((c) => c.direction === "incoming" && c.status === "missed").length;
    if (missedBadge) {
      missedBadge.textContent = missedCount > 0 ? String(missedCount) : "";
      missedBadge.style.display = missedCount > 0 ? "inline-flex" : "none";
    }

    const items =
      callsFilter === "missed"
        ? cachedCallsList.filter((c) => c.direction === "incoming" && c.status === "missed")
        : cachedCallsList;

    if (!items.length) {
      body.innerHTML = `<div class="tc-cl-empty">${
        callsFilter === "missed" ? "No missed calls." : "No recent calls yet."
      }</div>`;
      return;
    }

    body.innerHTML = items
      .map((c, idx) => {
        const isIncoming = c.direction === "incoming";
        const isMissed = c.status === "missed";
        const isVideo = c.callType === "video";
        const isIncomingMissed = isIncoming && isMissed;
        const typeLbl = isVideo ? "Video" : "Voice";
        const arrow = isIncoming ? "\u2199" : "\u2197";

        let subText = "";
        let arrowClass = "ok";
        if (isIncomingMissed) {
          subText = `Missed ${typeLbl.toLowerCase()} call`;
          arrowClass = "missed";
        } else if (isIncoming) {
          subText = `Incoming ${typeLbl.toLowerCase()} \u2022 ${c.duration || "00:00"}`;
        } else if (isMissed) {
          subText = `Outgoing ${typeLbl.toLowerCase()} \u2022 No answer`;
          arrowClass = "muted";
        } else {
          subText = `Outgoing ${typeLbl.toLowerCase()} \u2022 ${c.duration || "00:00"}`;
        }

        const av = c.avatarUrl
          ? `<img src="${esc(c.avatarUrl)}" alt="${esc(c.name)}" />`
          : `<div class="tc-cl-av-fb" style="background:${esc(c.color || "linear-gradient(135deg,#334155,#1e293b)")}">${esc(c.initials || (c.name || "U")[0].toUpperCase())}</div>`;

        return `
          <div class="tc-cl-row" data-cl-idx="${idx}">
            <div class="tc-cl-av">${av}</div>
            <div class="tc-cl-info">
              <div class="tc-cl-name ${isIncomingMissed ? "missed" : ""}">${esc(c.name || "Unknown")}</div>
              <div class="tc-cl-sub">
                <span class="tc-cl-arrow ${arrowClass}">${arrow}</span>
                <span>${esc(subText)}</span>
                ${c.time ? `<span class="tc-cl-time">\u2022 ${esc(c.time)}</span>` : ""}
              </div>
            </div>
            <div class="tc-cl-actions">
              <button type="button" class="tc-cl-act-btn" data-cl-redial="voice" data-cl-idx="${idx}" title="Voice Call">${ICONS.phone}</button>
              <button type="button" class="tc-cl-act-btn" data-cl-redial="video" data-cl-idx="${idx}" title="Video Call">${ICONS.videoOn}</button>
            </div>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("[data-cl-redial]").forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const item = items[Number(btn.getAttribute("data-cl-idx"))];
        if (!item) return;
        const ctype = btn.getAttribute("data-cl-redial") === "video" ? "video" : "voice";
        closeLiveCallsModal();
        startCall({
          targetUserId: item.peerUserId,
          chatId: findChatIdForPeer(item.peerUserId),
          name: item.name,
          avatarUrl: item.avatarUrl || "",
          color: item.color || "",
          callType: ctype
        });
      };
    });
  }

  async function fetchLiveCalls() {
    const body = document.getElementById("tcCallsLogBody");
    const token = getActiveToken();
    if (!token) {
      if (body) body.innerHTML = '<div class="tc-cl-empty">Please sign in to view call history.</div>';
      return;
    }
    if (body && !cachedCallsList.length) {
      body.innerHTML = '<div class="tc-cl-empty">Loading calls...</div>';
    }
    try {
      const res = await fetch(`/api/calls?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not load calls");
      cachedCallsList = Array.isArray(data.calls) ? data.calls : [];
      renderCallsListBody();
    } catch (err) {
      if (body) body.innerHTML = `<div class="tc-cl-empty">${esc(err.message || "Failed to load calls")}</div>`;
    }
  }

  function openLiveCallsModal() {
    closeLiveCallsModal();
    callsFilter = "all";
    closeAppDrawerSafe();

    const ov = document.createElement("div");
    ov.id = "tcCallsLogOverlay";
    ov.className = "tc-cl-overlay";
    ov.innerHTML = `
      <div class="tc-cl-sheet">
        <div class="tc-cl-head">
          <button type="button" class="tc-cl-icon-btn" id="tcCallsCloseBtn" aria-label="Back">&#8592;</button>
          <div class="tc-cl-title">Recent Calls</div>
          <button type="button" class="tc-cl-icon-btn" id="tcCallsRefreshBtn" title="Refresh">&#8635;</button>
        </div>
        <div class="tc-cl-tabs">
          <button type="button" class="tc-cl-tab active" data-cl-tab="all">All</button>
          <button type="button" class="tc-cl-tab" data-cl-tab="missed">Missed <span id="tcCallsMissedCount" class="tc-cl-badge"></span></button>
        </div>
        <div id="tcCallsLogBody" class="tc-cl-body">
          <div class="tc-cl-empty">Loading calls...</div>
        </div>
      </div>
    `;

    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeLiveCallsModal();
    });
    ov.querySelector("#tcCallsCloseBtn").onclick = closeLiveCallsModal;
    ov.querySelector("#tcCallsRefreshBtn").onclick = fetchLiveCalls;
    ov.querySelectorAll("[data-cl-tab]").forEach((tab) => {
      tab.onclick = () => {
        callsFilter = tab.getAttribute("data-cl-tab") === "missed" ? "missed" : "all";
        ov.querySelectorAll("[data-cl-tab]").forEach((t) => t.classList.toggle("active", t === tab));
        renderCallsListBody();
      };
    });

    document.body.appendChild(ov);
    fetchLiveCalls();
  }

  function hookDrawerCallsAction() {
    if (window.SocialUI && typeof window.SocialUI.handleAction === "function" && !window.SocialUI._tcCallsHooked) {
      const origHandle = window.SocialUI.handleAction.bind(window.SocialUI);
      window.SocialUI.handleAction = function (action) {
        if (action === "calls") {
          openLiveCallsModal();
          return true;
        }
        return origHandle(action);
      };
      window.SocialUI._tcCallsHooked = true;
    }
  }

  if (!window._tcDrawerCallsClickBound) {
    window._tcDrawerCallsClickBound = true;
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-action="calls"]') : null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openLiveCallsModal();
      },
      true
    );
  }

  hookDrawerCallsAction();
  window.addEventListener("DOMContentLoaded", hookDrawerCallsAction);
  setTimeout(hookDrawerCallsAction, 600);
  // ===== END LIVE RECENT CALLS LOG UI =====

  // ===== IN-CHAT CALL CARD ENHANCER =====
  const CALL_MSG_RE = /^(?:\uD83D\uDCDE|\uD83D\uDCF9)\s+(Missed\s+)?(Voice|Video)\s+Call(?:\s*(?:\u2022|-)?\s+(\d{1,2}:\d{2}))?$/;

  function enhanceInChatCallCards() {
    const container =
      document.getElementById("messages-container") ||
      document.getElementById("chat-messages") ||
      document.querySelector(".messages-container") ||
      document.querySelector(".chat-messages");
    if (!container) return;

    const nodes = container.querySelectorAll(".msg-text, .message-text, .bubble-text, .msg-body");
    nodes.forEach((el) => {
      if (el.dataset.tcCallCard === "1") return;
      if (el.children.length > 0) return;
      if (el.closest(".reply-preview, .reply-quote, .msg-reply, .chat-item, .chat-list")) return;

      const raw = (el.textContent || "").trim();
      const m = CALL_MSG_RE.exec(raw);
      if (!m) return;

      const isMissed = Boolean(m[1]);
      const isVideo = m[2] === "Video";
      const duration = m[3] || "";
      const isOut = Boolean(el.closest(".outgoing, .msg-out, .sent, .from-me, [data-sender='me']"));

      let title = isVideo ? "Video Call" : "Voice Call";
      let sub = duration || "Completed";
      if (isMissed) {
        title = isOut
          ? (isVideo ? "Cancelled Video Call" : "Cancelled Voice Call")
          : (isVideo ? "Missed Video Call" : "Missed Voice Call");
        sub = isOut ? "No answer" : "Tap to call back";
      } else {
        sub = (isOut ? "Outgoing" : "Incoming") + (duration ? " \u2022 " + duration : "");
      }

      el.dataset.tcCallCard = "1";
      el.innerHTML =
        '<div class="tc-chat-call-card ' + (isMissed ? "missed" : "completed") + '" data-tc-card-call="' + (isVideo ? "video" : "voice") + '">' +
          '<div class="tc-ccc-ico">' + (isVideo ? ICONS.videoOn : ICONS.phone) + "</div>" +
          '<div class="tc-ccc-meta">' +
            '<div class="tc-ccc-title">' + esc(title) + "</div>" +
            '<div class="tc-ccc-sub">' + esc(sub) + "</div>" +
          "</div>" +
        "</div>";

      const card = el.querySelector(".tc-chat-call-card");
      if (card) {
        card.onclick = (ev) => {
          ev.stopPropagation();
          triggerActiveChatCall(isVideo ? "video" : "voice");
        };
      }
    });
  }

  let _tcCardRaf = 0;
  function scheduleEnhanceCallCards() {
    if (_tcCardRaf) return;
    _tcCardRaf = requestAnimationFrame(() => {
      _tcCardRaf = 0;
      enhanceInChatCallCards();
    });
  }

  function startCallCardObserver() {
    enhanceInChatCallCards();
    const target = document.body;
    if (!target || target._tcCallCardObs) return;
    const obs = new MutationObserver(scheduleEnhanceCallCards);
    obs.observe(target, { childList: true, subtree: true });
    target._tcCallCardObs = obs;
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startCallCardObserver);
  } else {
    startCallCardObserver();
  }
  // ===== END IN-CHAT CALL CARD ENHANCER =====


  window.TCVoiceCall = {
    startCall,
    startVideoCall: (opts) => startCall({ ...(opts || {}), callType: "video" }),
    endCall: () => endActiveCall(true, "Call ended"),
    isActive: () => Boolean(activeCall),
    openCallsLog: openLiveCallsModal
  };
})();