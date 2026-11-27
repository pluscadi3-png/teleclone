(() => {
  "use strict";

  let activeChatId = null;
  let lastAuthHeader = null;
  let cameraStream = null;
  let facingMode = "environment"; // default: back camera
  let capturedBlob = null;
  let capturedPreviewUrl = null;
  let isSending = false;

  const ICONS = {
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    flip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    retake: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`
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

  function getStoreObj() {
    try {
      if (window.Store) return window.Store;
      if (typeof Store !== "undefined") return Store;
    } catch (_) {}
    return null;
  }

  function getAppObj() {
    try {
      if (window.App) return window.App;
      if (typeof App !== "undefined") return App;
    } catch (_) {}
    return null;
  }

  function getCurrentChatId() {
    const st = getStoreObj();
    try {
      if (st) {
        if (typeof st.getActiveChat === "function") {
          const c = st.getActiveChat();
          if (c && c.id) return Number(c.id);
        }
        if (st.state && st.state.activeChatId) return Number(st.state.activeChatId);
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

  // ===== 2. Hidden Native Camera Input (Fallback / Phone Camera App) =====
  function getNativeCameraInput() {
    let input = document.getElementById("tcNativeCameraInput");
    if (!input) {
      input = document.createElement("input");
      input.id = "tcNativeCameraInput";
      input.type = "file";
      input.accept = "image/*";
      input.setAttribute("capture", "environment");
      input.style.display = "none";
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        try {
          const compressed = await compressImageFile(file);
          stopCameraStream();
          openCameraModalUI();
          showPreviewStage(compressed);
        } catch (err) {
          console.error("[NativeCamera]", err);
          showToast("Could not read photo");
        }
      });
      document.body.appendChild(input);
    }
    return input;
  }

  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSide = 1600;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxSide || h > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : resolve(file)),
          "image/jpeg",
          0.86
        );
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }
// ===== 3. "+" Menu (#plus-attach-menu) aur #attach-menu mein Camera Button Inject Karein =====
  function injectCameraOption() {
    // 1. Asli "+" button ka menu (js/uiFixes.js wala #plus-attach-menu)
    const plusMenu = document.getElementById("plus-attach-menu");
    if (plusMenu && !document.getElementById("tcPlusCameraBtn")) {
      const btn = document.createElement("button");
      btn.id = "tcPlusCameraBtn";
      btn.type = "button";
      btn.className = "plus-menu-item tc-attach-camera-item";
      btn.innerHTML = `<span class="tc-cam-menu-ico">${ICONS.camera}</span><span>Camera</span>`;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        plusMenu.classList.add("hidden");
        const plusBtn = document.getElementById("plus-attach-btn");
        if (plusBtn) plusBtn.classList.remove("open");
        openCameraFlow();
      });

      plusMenu.insertBefore(btn, plusMenu.firstChild);
    }

    // 2. Backup: purana #attach-menu (agar kahin use ho)
    const attachMenu = document.getElementById("attach-menu");
    if (attachMenu && !document.getElementById("tcAttachCameraBtn")) {
      const btn2 = document.createElement("button");
      btn2.id = "tcAttachCameraBtn";
      btn2.type = "button";
      btn2.className = "attach-item tc-attach-camera-item";
      btn2.innerHTML = `<span class="tc-cam-menu-ico">${ICONS.camera}</span><span>Camera</span>`;

      btn2.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        attachMenu.classList.add("hidden");
        openCameraFlow();
      });

      attachMenu.insertBefore(btn2, attachMenu.firstChild);
    }
  }

  // ===== 4. Fullscreen Live Camera Modal + Preview + Send =====
  function openCameraFlow() {
    if (!getCurrentChatId()) {
      showToast("Please open a chat first");
      return;
    }
    facingMode = "environment";
    openCameraModalUI();
    startCameraStream();
  }

  function openCameraModalUI() {
    let modal = document.getElementById("tcCameraModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "tcCameraModal";
    modal.className = "tc-cam-modal";
    modal.innerHTML = `
      <div class="tc-cam-top">
        <button type="button" class="tc-cam-icon-btn" id="tcCamCloseBtn" title="Close">${ICONS.close}</button>
        <button type="button" class="tc-cam-pill-btn" id="tcCamNativeBtn">Phone Camera</button>
        <button type="button" class="tc-cam-icon-btn" id="tcCamFlipBtn" title="Switch Camera">${ICONS.flip}</button>
      </div>

      <div class="tc-cam-stage">
        <video id="tcCamVideo" autoplay playsinline muted></video>
        <img id="tcCamPreview" class="hidden" alt="Preview" />
        <div id="tcCamFallback" class="tc-cam-fallback hidden">
          <div class="tc-cam-fb-icon">${ICONS.camera}</div>
          <p id="tcCamFallbackText">In-app camera permission is not granted. Capture a photo using your phone camera:</p>
          <button type="button" class="tc-cam-fb-btn" id="tcCamFallbackBtn">Open Phone Camera</button>
        </div>
      </div>

      <div class="tc-cam-controls" id="tcCamShootBar">
        <button type="button" class="tc-cam-shutter" id="tcCamShutterBtn" aria-label="Take Photo"></button>
      </div>

      <div class="tc-cam-preview-bar hidden" id="tcCamPreviewBar">
        <button type="button" class="tc-cam-icon-btn" id="tcCamRetakeBtn" title="Retake">${ICONS.retake}</button>
        <input type="text" id="tcCamCaptionInput" class="tc-cam-caption" placeholder="Add a caption..." autocomplete="off" />
        <button type="button" class="tc-cam-send-btn" id="tcCamSendBtn" title="Send Photo">${ICONS.send}</button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#tcCamCloseBtn").addEventListener("click", closeCameraModal);
    modal.querySelector("#tcCamNativeBtn").addEventListener("click", () => {
      getNativeCameraInput().click();
    });
    modal.querySelector("#tcCamFallbackBtn").addEventListener("click", () => {
      getNativeCameraInput().click();
    });
    modal.querySelector("#tcCamFlipBtn").addEventListener("click", () => {
      facingMode = facingMode === "environment" ? "user" : "environment";
      startCameraStream();
    });
    modal.querySelector("#tcCamShutterBtn").addEventListener("click", captureFromVideo);
    modal.querySelector("#tcCamRetakeBtn").addEventListener("click", () => {
      clearCapturedPhoto();
      showLiveStage();
      startCameraStream();
    });
    modal.querySelector("#tcCamSendBtn").addEventListener("click", sendCapturedPhoto);
    modal.querySelector("#tcCamCaptionInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendCapturedPhoto();
      }
    });

    return modal;
  }

  function showLiveStage() {
    const modal = document.getElementById("tcCameraModal");
    if (!modal) return;
    modal.querySelector("#tcCamVideo").classList.remove("hidden");
    modal.querySelector("#tcCamPreview").classList.add("hidden");
    modal.querySelector("#tcCamFallback").classList.add("hidden");
    modal.querySelector("#tcCamShootBar").classList.remove("hidden");
    modal.querySelector("#tcCamPreviewBar").classList.add("hidden");
    modal.querySelector("#tcCamFlipBtn").style.visibility = "visible";
  }

  function showPreviewStage(blob) {
    const modal = document.getElementById("tcCameraModal");
    if (!modal) return;
    clearCapturedPhoto();
    capturedBlob = blob;
    capturedPreviewUrl = URL.createObjectURL(blob);

    const img = modal.querySelector("#tcCamPreview");
    img.src = capturedPreviewUrl;
    img.classList.remove("hidden");

    modal.querySelector("#tcCamVideo").classList.add("hidden");
    modal.querySelector("#tcCamFallback").classList.add("hidden");
    modal.querySelector("#tcCamShootBar").classList.add("hidden");
    modal.querySelector("#tcCamPreviewBar").classList.remove("hidden");
    modal.querySelector("#tcCamFlipBtn").style.visibility = "hidden";
    modal.querySelector("#tcCamCaptionInput").value = "";
  }

  function showCameraFallback(reason) {
    const modal = document.getElementById("tcCameraModal");
    if (!modal) return;
    modal.querySelector("#tcCamVideo").classList.add("hidden");
    modal.querySelector("#tcCamPreview").classList.add("hidden");
    modal.querySelector("#tcCamShootBar").classList.add("hidden");
    modal.querySelector("#tcCamPreviewBar").classList.add("hidden");
    modal.querySelector("#tcCamFallback").classList.remove("hidden");
    if (reason) modal.querySelector("#tcCamFallbackText").textContent = reason;
  }

  async function startCameraStream() {
    stopCameraStream();
    showLiveStage();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraFallback("Direct viewfinder is not available. Open Phone Camera below:");
      return;
    }

    const modal = document.getElementById("tcCameraModal");
    if (!modal) return;
    const video = modal.querySelector("#tcCamVideo");

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });
    } catch (err1) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err2) {
        console.warn("[CameraStream]", err2);
        showCameraFallback("Direct camera is blocked — tap Phone Camera below to take a photo:");
        return;
      }
    }

    video.srcObject = cameraStream;
    video.style.transform = facingMode === "user" ? "scaleX(-1)" : "none";
    try {
      await video.play();
    } catch (_) {}
  }

  function stopCameraStream() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    const video = document.getElementById("tcCamVideo");
    if (video) video.srcObject = null;
  }

  function clearCapturedPhoto() {
    capturedBlob = null;
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      capturedPreviewUrl = null;
    }
  }

  function closeCameraModal() {
    stopCameraStream();
    clearCapturedPhoto();
    isSending = false;
    const modal = document.getElementById("tcCameraModal");
    if (modal) modal.remove();
  }

  function captureFromVideo() {
    const video = document.getElementById("tcCamVideo");
    if (!video || !video.videoWidth || !video.videoHeight) {
      showToast("Camera is getting ready...");
      return;
    }

    const maxSide = 1600;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxSide || h > maxSide) {
      const scale = maxSide / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    if (facingMode === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast("Failed to capture photo");
          return;
        }
        stopCameraStream();
        showPreviewStage(blob);
      },
      "image/jpeg",
      0.86
    );
  }

  async function sendCapturedPhoto() {
    if (isSending || !capturedBlob) return;
    const chatId = getCurrentChatId();
    if (!chatId) {
      showToast("No active chat found");
      return;
    }

    isSending = true;
    const sendBtn = document.getElementById("tcCamSendBtn");
    const captionInput = document.getElementById("tcCamCaptionInput");
    const caption = captionInput ? captionInput.value.trim() : "";

    if (sendBtn) sendBtn.disabled = true;
    showToast("Uploading photo...");

    try {
      const auth = getAuthHeader();
      const filename = `camera_${Date.now()}.jpg`;
      const fd = new FormData();
      fd.append("file", capturedBlob, filename);

      const upRes = await origFetch("/api/upload", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
        body: fd
      });

      if (!upRes.ok) throw new Error(`Upload ${upRes.status}`);
      const upData = await upRes.json();
      const att = upData.attachment || {
        type: "photo",
        name: filename,
        src: upData.src || upData.url || "",
        label: "Photo"
      };
      att.type = "photo";
      att.label = "Photo";

      const st = getStoreObj();
      if (st && typeof st.addMessage === "function") {
        st.addMessage(chatId, {
          sender: "me",
          text: caption,
          attachment: att
        });
        const app = getAppObj();
        if (app && typeof app.renderAll === "function") app.renderAll();
      } else {
        const msgRes = await origFetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: {
            ...(auth ? { Authorization: auth } : {}),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text: caption, attachment: att })
        });
        if (!msgRes.ok) throw new Error(`Send ${msgRes.status}`);
      }

      closeCameraModal();
      showToast("Photo sent");
    } catch (err) {
      console.error("[CameraSend]", err);
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      showToast(`Photo send error: ${err.message}`);
    }
  }
// ===== Init =====
  function initCameraPlugin() {
    injectCameraOption();
    const obs = new MutationObserver(injectCameraOption);
    obs.observe(document.body, { childList: true, subtree: true });

    document.addEventListener(
      "click",
      (e) => {
        if (e.target.closest("#plus-attach-btn, #attach-btn")) {
          setTimeout(injectCameraOption, 20);
          setTimeout(injectCameraOption, 120);
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initCameraPlugin);
  } else {
    initCameraPlugin();
  }
})();