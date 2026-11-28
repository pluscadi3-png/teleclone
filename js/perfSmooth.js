(() => {
  "use strict";

  let scrollIdleTimer = 0;
  window._tcIsScrolling = false;

  function markScrolling() {
    window._tcIsScrolling = true;
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      window._tcIsScrolling = false;
    }, 140);
  }

  function optimizeImages(root) {
    if (!root || !root.querySelectorAll) return;
    const imgs = root.querySelectorAll("img:not([data-tc-img-opt])");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      img.setAttribute("decoding", "async");
      if (!img.getAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }
      img.dataset.tcImgOpt = "1";
    }
  }

  function bindSmoothScrollTrackers() {
    const ids = ["messages-container", "chat-list"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el._tcScrollOptBound) return;
      el._tcScrollOptBound = true;
      el.addEventListener("scroll", markScrolling, { passive: true });
      optimizeImages(el);

      let imgRaf = 0;
      const obs = new MutationObserver(() => {
        if (imgRaf) return;
        imgRaf = requestAnimationFrame(() => {
          imgRaf = 0;
          optimizeImages(el);
        });
      });
      obs.observe(el, { childList: true, subtree: true });
    });
  }

  function bindViewportKeyboardSmooth() {
    if (!window.visualViewport || window._tcVvSmoothBound) return;
    window._tcVvSmoothBound = true;
    let prevH = window.visualViewport.height;
    let vvRaf = 0;

    window.visualViewport.addEventListener("resize", () => {
      const curH = window.visualViewport.height;
      const shrunk = curH < prevH - 60;
      prevH = curH;
      if (!shrunk) return;

      const mc = document.getElementById("messages-container");
      if (!mc) return;
      const dist = mc.scrollHeight - mc.scrollTop - mc.clientHeight;
      if (dist < 180) {
        if (vvRaf) cancelAnimationFrame(vvRaf);
        vvRaf = requestAnimationFrame(() => {
          vvRaf = 0;
          mc.scrollTop = mc.scrollHeight;
        });
      }
    });
  }

  function boot() {
    bindSmoothScrollTrackers();
    bindViewportKeyboardSmooth();
    setTimeout(bindSmoothScrollTrackers, 500);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
