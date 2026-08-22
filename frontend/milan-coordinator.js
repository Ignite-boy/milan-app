(function () {
  "use strict";

  const DEFERRED = [
    "/milan-modern-upload.js?v=20260710",
    "/milan-speed-addon.js?v=20260710",
    "/milan-ui.js?v=20260710",
    "/milan-v95-mobile-parity.js?v=20260710",
    "/milan-auto-upload.js?v=20260710",
    "/milan-youtube-feed.js?v=20260710b",
    "/milan-v100-background-audio.js?v=20260710",
    "/milan-live.js?v=20260710",
    "/milan-creative-mode.js?v=20260710",
    "/milan-launcher.js?v=20260710",
    "/milan-assistant.js?v=20260710",
    "/milan-core.js?v=20260627",
    "/milan-mobile.js?v=20260627",
    "/milan-polish.js?v=20260627",
    "/milan-feed.js?v=20260625",
    "/milan-premium.js?v=20260630",
    "/milan-more-menu.js?v=20260630"
  ];

  let released = false;

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve({ src, ok: true });
      s.onerror = () => resolve({ src, ok: false });
      document.head.appendChild(s);
    });
  }

  async function releaseApp() {
    if (released) return;
    released = true;

    document.documentElement.classList.add("milan-runtime-hydrating");

    await Promise.all(
      DEFERRED.map(loadScript)
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove(
          "milan-coordinated-boot",
          "milan-runtime-hydrating"
        );

        document.documentElement.classList.add("milan-runtime-ready");

        document.body.classList.remove(
          "milan-coordinated-boot",
          "milan-runtime-hydrating"
        );

        document.body.classList.add("milan-runtime-ready");

        window.__milanAppReady = true;

        window.dispatchEvent(
          new CustomEvent("milan:app-ready")
        );
      });
    });
  }

  window.addEventListener("milan:core-ready", releaseApp, { once: true });

  if (document.documentElement) {
    document.documentElement.classList.add("milan-coordinated-boot");
  }
})();
