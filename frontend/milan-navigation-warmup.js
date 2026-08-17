/* MILAN navigation warm-up: public routes and static app assets only. */
(() => {
  'use strict';

  const APP_ASSETS = [
    '/milan-core.css?v=20260709',
    '/milan-core.js?v=20260712b',
    '/milan-ui.js?v=20260710',
    '/milan-modern-upload.js?v=20260710',
    '/milan-mobile-nav.js?v=20260712b',
    '/milan-premium.js?v=20260713'
  ];
  const PUBLIC_ROUTES = new Set([
    '/about', '/what-is-web5', '/decentralized-social-media',
    '/private-social-network', '/best-social-media-apps', '/music'
  ]);
  const prefetched = new Set();

  function sameOriginPath(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      if (url.origin !== location.origin || url.protocol !== location.protocol) return null;
      return url.pathname + url.search;
    } catch (_) {
      return null;
    }
  }

  function prefetch(rawUrl, as) {
    const href = sameOriginPath(rawUrl);
    if (!href || prefetched.has(href)) return;
    prefetched.add(href);

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    if (as) link.as = as;
    document.head.appendChild(link);

    if (as !== 'document' && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'milan:prefetch',
        urls: [href]
      });
    }
  }

  function warmApp() {
    prefetch('/app', 'document');
    APP_ASSETS.forEach((href) => prefetch(href, href.includes('.css') ? 'style' : 'script'));
  }

  function warmPublicRoute(rawUrl) {
    const href = sameOriginPath(rawUrl);
    if (!href || !PUBLIC_ROUTES.has(new URL(href, location.origin).pathname)) return;
    prefetch(href, 'document');

    // Chromium prerenders only public, side-effect-free pages. Interactive /app
    // and API endpoints are intentionally excluded to protect sessions and data.
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
      const rule = document.createElement('script');
      rule.type = 'speculationrules';
      rule.textContent = JSON.stringify({
        prerender: [{ source: 'list', urls: [href], eagerness: 'moderate' }]
      });
      document.head.appendChild(rule);
    }
  }

  function startIdleWarmup() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ''))) return;

    if (location.pathname === '/' || location.pathname === '/index.html') {
      APP_ASSETS.forEach((href) => prefetch(href, href.includes('.css') ? 'style' : 'script'));
    }
  }

  document.addEventListener('pointerover', (event) => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (link) warmPublicRoute(link.href);
  }, { passive: true });

  document.addEventListener('touchstart', (event) => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (link) warmPublicRoute(link.href);
  }, { passive: true });

  window.MilanNavigationWarmup = Object.freeze({ warmApp, warmPublicRoute });

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(startIdleWarmup, { timeout: 2500 });
  } else {
    window.setTimeout(startIdleWarmup, 1200);
  }
})();