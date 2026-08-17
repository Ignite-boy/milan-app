/* ============================================================================
   MILAN — Mobile UI Parity (additive, non-destructive)
   --------------------------------------------------------------------------
   Goal: every feature that shows on desktop is reachable on mobile / PWA.
   Previous builds hid .rightRail (People / Notifications / Saved) and the
   sidebar menu on small screens with no replacement, so mobile users lost
   access to those panels. This module:

     1. Injects a real bottom navigation bar (the CSS for .milanBottomNav
        already existed but no element was ever rendered).
     2. Re-exposes People, Notifications and Saved on mobile through a
        slide-up sheet that simply RELOCATES the existing .rightRail cards
        (no logic is duplicated — same DOM, same handlers).
     3. Keeps the composer one tap away ("Post" button focuses it).

   It only activates on small viewports and is a pure overlay: it never edits
   existing handlers, feed logic, or video code.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__MILAN_MOBILE_PARITY__) return;
  window.__MILAN_MOBILE_PARITY__ = true;

  var MOBILE_Q = "(max-width: 760px)";
  function isMobile() { return window.matchMedia(MOBILE_Q).matches; }
  function $(id) { return document.getElementById(id); }
  function q(sel, root) { return (root || document).querySelector(sel); }

  /* ---- styles (scoped, additive) ---------------------------------------- */
  var css = document.createElement("style");
  css.id = "milan-mobile-parity-css";
  css.textContent = [
    /* Bottom nav — render on every small screen, not only premium-ui */
    "@media (max-width:760px){",
    "  body.milan-mobile-ui .milanBottomNav{position:fixed;display:grid;grid-template-columns:repeat(5,1fr);left:10px;right:10px;",
    "    bottom:max(8px,env(safe-area-inset-bottom,0px));z-index:9000;min-height:64px;padding:7px;border-radius:24px;",
    "    background:rgba(10,18,38,.92);border:1px solid rgba(245,158,11,.22);box-shadow:0 18px 55px rgba(0,0,0,.45);",
    "    backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3)}",
    "  body.milan-mobile-ui.dark .milanBottomNav{background:rgba(6,12,28,.94)}",
    "  body.milan-mobile-ui .milanBottomNav button{display:grid;place-items:center;gap:2px;background:0 0;color:#8ba4d4;border:0;",
    "    border-radius:18px;padding:6px 2px;min-height:50px;box-shadow:none;font-size:10.5px;font-weight:800;cursor:pointer;line-height:1}",
    "  body.milan-mobile-ui .milanBottomNav button b{font-size:20px;line-height:1}",
    "  body.milan-mobile-ui .milanBottomNav button.active{background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(217,70,239,.16));color:#fbbf24}",
    "  body.milan-mobile-ui .milanBottomNav button .nbDot{position:absolute;transform:translate(14px,-14px);min-width:16px;height:16px;",
    "    padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:900;display:none;align-items:center;justify-content:center}",
    "  body.milan-mobile-ui .milanBottomNav button.hasCount .nbDot{display:flex}",
    /* keep content above the fixed nav */
    "  body.milan-mobile-ui{padding-bottom:calc(86px + env(safe-area-inset-bottom,0px))!important}",
    /* mobile sheet that hosts the relocated right-rail panels */
    "  #milanMobileSheet{position:fixed;inset:0;z-index:8900;display:none}",
    "  #milanMobileSheet.open{display:block}",
    "  #milanMobileSheet .sheetScrim{position:absolute;inset:0;background:rgba(2,6,23,.55)}",
    "  #milanMobileSheet .sheetCard{position:absolute;left:0;right:0;bottom:0;max-height:82vh;overflow:auto;",
    "    background:var(--card,#0a1a3e);border-top-left-radius:26px;border-top-right-radius:26px;",
    "    border-top:1px solid rgba(245,158,11,.22);box-shadow:0 -18px 60px rgba(0,0,0,.5);padding:10px 12px calc(20px + env(safe-area-inset-bottom,0px))}",
    "  #milanMobileSheet .sheetGrip{width:44px;height:5px;border-radius:999px;background:rgba(148,163,184,.45);margin:6px auto 10px}",
    "  #milanMobileSheet .sheetHost .rightBox{margin-bottom:12px}",
    /* On mobile, the in-page right rail stays hidden; its cards live in the sheet instead */
    "  body.milan-mobile-ui .rightRail{display:none!important}",
    /* Make sure the left menu (scopes) is reachable too — show it as chips */
    "  body.milan-mobile-ui .leftRail .menu{display:grid!important;grid-template-columns:repeat(2,1fr);gap:6px}",
    "}",
    /* Desktop: never show mobile-only chrome */
    "@media (min-width:761px){.milanBottomNav{display:none!important}#milanMobileSheet{display:none!important}}"
  ].join("");
  document.head.appendChild(css);

  /* ---- bottom nav element ----------------------------------------------- */
  var TABS = [
    { key: "home",    scope: "all",    icon: "🏠", label: "Home" },
    { key: "people",  panel: "people", icon: "👥", label: "People" },
    { key: "post",    action: "compose", icon: "✚", label: "Post" },
    { key: "alerts",  panel: "alerts", icon: "🔔", label: "Alerts" },
    { key: "saved",   panel: "saved",  icon: "🔖", label: "Saved" }
  ];

  var nav, sheet, sheetHost;

  function buildNav() {
    if ($("milanBottomNav")) return;
    nav = document.createElement("nav");
    nav.id = "milanBottomNav";
    nav.className = "milanBottomNav";
    nav.setAttribute("aria-label", "MILAN mobile navigation");
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.key = t.key;
      b.style.position = "relative";
      b.innerHTML = "<b>" + t.icon + "</b><span>" + t.label + "</span>" +
        (t.panel === "alerts" ? '<span class="nbDot" id="milanNavAlertDot">0</span>' : "");
      b.addEventListener("click", function () { onTab(t, b); });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);

    // slide-up sheet host
    sheet = document.createElement("div");
    sheet.id = "milanMobileSheet";
    sheet.innerHTML =
      '<div class="sheetScrim"></div>' +
      '<div class="sheetCard"><div class="sheetGrip"></div><div class="sheetHost"></div></div>';
    document.body.appendChild(sheet);
    sheetHost = q(".sheetHost", sheet);
    q(".sheetScrim", sheet).addEventListener("click", closeSheet);

    setActive("home");
  }

  function setActive(key) {
    if (!nav) return;
    nav.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.key === key);
    });
  }

  function onTab(t, btn) {
    if (t.scope) {
      closeSheet();
      // drive the existing scope buttons so all existing logic runs unchanged
      var src = document.querySelector('[data-scope="' + t.scope + '"]');
      if (src) src.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
      setActive(t.key);
      return;
    }
    if (t.action === "compose") {
      closeSheet();
      var comp = q(".composer");
      if (comp) {
        comp.scrollIntoView({ behavior: "smooth", block: "center" });
        var ta = q("textarea", comp);
        if (ta) setTimeout(function () { ta.focus(); }, 380);
      }
      setActive(t.key);
      return;
    }
    if (t.panel) {
      openPanel(t.panel);
      setActive(t.key);
    }
  }

  /* Relocate the matching .rightRail card into the sheet (move, don't clone,
     so existing event handlers and live updates keep working).
     Cards are found by their stable inner element id, NOT by position:
     returnSheetCards() re-appends cards at the END of the rail, so positional
     indexes go stale after the first open and "People" would start returning
     the Notifications/Saved card instead. */
  var PANEL_IDS = { people: "peopleList", alerts: "notifList", saved: "savedList" };
  function panelCard(panel) {
    var inner = PANEL_IDS[panel] && document.getElementById(PANEL_IDS[panel]);
    return inner ? inner.closest(".rightBox") : null;
  }

  function openPanel(panel) {
    if (!sheet) return;
    // park any previously shown card back into the rail before showing a new one
    returnSheetCards();
    sheetHost.innerHTML = "";
    var card = panelCard(panel);
    if (card) {
      card.dataset.milanParked = "1";
      sheetHost.appendChild(card);
    } else {
      sheetHost.innerHTML = '<div class="empty" style="margin:12px">This panel is loading…</div>';
    }
    sheet.classList.add("open");
    // trigger a refresh of the data behind the panel where helpers exist
    try {
      if (panel === "people" && typeof loadPeople === "function") loadPeople();
      if (panel === "alerts" && typeof loadNotifications === "function") loadNotifications();
      if (panel === "saved" && typeof renderSaved === "function") renderSaved();
    } catch (_) {}
  }

  function returnSheetCards() {
    var rail = document.querySelector(".rightRail");
    if (!rail || !sheetHost) return;
    Array.prototype.slice.call(sheetHost.children).forEach(function (c) {
      if (c.classList && c.classList.contains("rightBox")) rail.appendChild(c);
    });
    // restore the rail's original card order (People, Notifications, Saved)
    ["peopleList", "notifList", "savedList"].forEach(function (id) {
      var el = document.getElementById(id);
      var box = el && el.closest(".rightBox");
      if (box && box.parentNode === rail) rail.appendChild(box);
    });
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("open");
    returnSheetCards();
    setActive("home");
  }

  /* Reflect unread notification count on the Alerts tab badge */
  function syncAlertBadge() {
    var dot = $("milanNavAlertDot");
    if (!dot) return;
    var n = parseInt(($("notifCount") && $("notifCount").textContent) || "0", 10) || 0;
    dot.textContent = n > 99 ? "99+" : String(n);
    var btn = dot.closest("button");
    if (btn) btn.classList.toggle("hasCount", n > 0);
  }

  /* ---- activation ------------------------------------------------------- */
  function activate() {
    document.body.classList.add("milan-mobile-ui");
    buildNav();
    syncAlertBadge();
  }
  function deactivate() {
    document.body.classList.remove("milan-mobile-ui");
    closeSheet();
  }
  function refresh() { isMobile() ? activate() : deactivate(); }

  function start() {
    // Only meaningful once the app shell exists
    refresh();
    window.addEventListener("resize", refresh, { passive: true });
    if (window.matchMedia) {
      try { window.matchMedia(MOBILE_Q).addEventListener("change", refresh); }
      catch (_) { try { window.matchMedia(MOBILE_Q).addListener(refresh); } catch (e) {} }
    }
    // keep the alert badge fresh
    setInterval(syncAlertBadge, 4000);
    // observe the counters element for instant updates
    var nc = $("notifCount");
    if (nc && "MutationObserver" in window) {
      new MutationObserver(syncAlertBadge).observe(nc, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 400); });
  } else {
    setTimeout(start, 400);
  }
})();
