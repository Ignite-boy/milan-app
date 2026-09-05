/* MILAN V8 — Mobile navigation DOM placement.
 * On Chrome mobile, the desktop navigation buttons are physically moved into
 * a right-side hamburger drawer. The same button nodes are moved, so existing
 * handlers remain attached and the desktop sidebar stays untouched.
 */
(function () {
  "use strict";
  if (window.__milanMobileNavV8) return;
  window.__milanMobileNavV8 = true;

  if (!/\/app(\.html)?$/.test(location.pathname)) return;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    var topbar = document.querySelector(".topbar");
    var sidebar = document.querySelector(".sidebar");
    var nav = sidebar && sidebar.querySelector(".nav");
    if (!topbar || !sidebar || !nav) return;

    var style = document.createElement("style");
    style.id = "milan-mobile-nav-v8-style";
    style.textContent = `
      #milan-burger-v8,#milan-drawer-v8,#milan-drawer-ov-v8{display:none!important}
      @media (max-width:768px){
        .topbar{position:sticky!important;top:0!important;min-height:60px!important;padding:8px 58px 8px 12px!important;display:flex!important;align-items:center!important;z-index:3000!important}
        .topbar .search,.topbar .top-actions{display:none!important}
        .topbar .brand{min-width:0!important;flex:1 1 auto!important}
        .topbar .brand-text span{display:none!important}
        .sidebar{display:none!important}
        #milan-burger-v8{display:grid!important;position:absolute!important;right:10px!important;top:50%!important;transform:translateY(-50%)!important;width:42px!important;height:42px!important;place-items:center!important;padding:0!important;margin:0!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:12px!important;background:#121b2f!important;color:#fff!important;font:700 21px/1 system-ui,sans-serif!important;z-index:3010!important;cursor:pointer!important}
        #milan-drawer-ov-v8{position:fixed!important;inset:0!important;background:rgba(0,0,0,.68)!important;opacity:0!important;visibility:hidden!important;transition:opacity .18s ease,visibility .18s ease!important;z-index:4000!important}
        #milan-drawer-v8{position:fixed!important;top:0!important;right:0!important;bottom:0!important;width:min(88vw,360px)!important;display:flex!important;flex-direction:column!important;gap:0!important;overflow:auto!important;box-sizing:border-box!important;padding:16px!important;background:#091226!important;border-left:1px solid #263652!important;transform:translateX(105%)!important;transition:transform .22s ease!important;z-index:4010!important;box-shadow:-20px 0 50px rgba(0,0,0,.5)!important}
        body.milan-mobile-menu-open #milan-drawer-v8{transform:translateX(0)!important}
        body.milan-mobile-menu-open #milan-drawer-ov-v8{opacity:1!important;visibility:visible!important}
        body.milan-mobile-menu-open{overflow:hidden!important}
        #milan-drawer-v8 .m8-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:2px 0 14px!important}
        #milan-drawer-v8 .m8-title{font-size:20px!important;font-weight:800!important;color:#fff!important}
        #milan-drawer-v8 .m8-sub{display:block!important;margin-top:2px!important;font-size:11px!important;color:#7f8fad!important}
        #milan-drawer-v8 .m8-close{width:40px!important;height:40px!important;padding:0!important;border:1px solid #263652!important;border-radius:12px!important;background:#121d33!important;color:#fff!important;font-size:24px!important;cursor:pointer!important}
        #milan-drawer-v8 .m8-profile{padding:11px 13px!important;margin-bottom:14px!important;border-radius:14px!important;background:#101b31!important;color:#cdd7ea!important;font-size:13px!important}
        #milan-drawer-v8 .m8-section{margin:0 0 8px!important;color:#7383a3!important;font:800 11px/1 system-ui,sans-serif!important;letter-spacing:.08em!important;text-transform:uppercase!important}
        #milan-drawer-v8 .m8-nav{display:flex!important;flex-direction:column!important;gap:5px!important}
        #milan-drawer-v8 .m8-nav button{width:100%!important;min-height:46px!important;margin:0!important;padding:11px 14px!important;border:1px solid transparent!important;border-radius:12px!important;background:#111c31!important;color:#dce5f5!important;text-align:left!important;font:600 14px/1.25 system-ui,sans-serif!important;cursor:pointer!important}
        #milan-drawer-v8 .m8-nav button.active{background:linear-gradient(90deg,rgba(91,124,250,.2),rgba(91,124,250,.08))!important;border-color:rgba(91,124,250,.3)!important;color:#fff!important}
        #milan-drawer-v8 .m8-nav button.accent{background:linear-gradient(135deg,#6366f1,#8b5cf6)!important;color:#fff!important}
        #milan-drawer-v8 .m8-nav button:active{transform:scale(.99)!important}
        #milan-drawer-v8 .m8-more{margin-top:18px!important}
        #milan-drawer-v8 .m8-logout{width:100%!important;min-height:46px!important;margin-top:18px!important;padding:11px 14px!important;border:1px solid #4a2029!important;border-radius:12px!important;background:#25151a!important;color:#fda4af!important;text-align:left!important;font:600 14px/1.25 system-ui,sans-serif!important;cursor:pointer!important}
      }
    `;
    document.head.appendChild(style);

    var burger = document.createElement("button");
    burger.id = "milan-burger-v8";
    burger.type = "button";
    burger.setAttribute("aria-label", "Open navigation");
    burger.setAttribute("aria-expanded", "false");
    burger.textContent = "☰";
    topbar.appendChild(burger);

    var overlay = document.createElement("div");
    overlay.id = "milan-drawer-ov-v8";
    document.body.appendChild(overlay);

    var drawer = document.createElement("aside");
    drawer.id = "milan-drawer-v8";
    drawer.setAttribute("aria-label", "MILAN navigation");
    drawer.setAttribute("aria-hidden", "true");
    document.body.appendChild(drawer);

    var head = document.createElement("div");
    head.className = "m8-head";
    head.innerHTML = '<div><div class="m8-title">MILAN</div><span class="m8-sub">Your space</span></div>';
    var close = document.createElement("button");
    close.className = "m8-close";
    close.type = "button";
    close.setAttribute("aria-label", "Close navigation");
    close.textContent = "×";
    head.appendChild(close);
    drawer.appendChild(head);

    var profile = document.createElement("div");
    profile.className = "m8-profile";
    profile.textContent = "👤 " + ((document.getElementById("myName") || {}).textContent || "Your account").trim();
    drawer.appendChild(profile);

    var section = document.createElement("div");
    section.className = "m8-section";
    section.textContent = "Navigate";
    drawer.appendChild(section);

    var mobileNav = document.createElement("nav");
    mobileNav.className = "m8-nav";
    mobileNav.setAttribute("aria-label", "Primary navigation");
    drawer.appendChild(mobileNav);

    /* Move the REAL nav buttons into the drawer instead of cloning them. */
    while (nav.firstChild) mobileNav.appendChild(nav.firstChild);
    nav.remove();

    var more = document.createElement("div");
    more.className = "m8-section m8-more";
    more.textContent = "More";
    drawer.appendChild(more);

    var logout = document.createElement("button");
    logout.className = "m8-logout";
    logout.type = "button";
    logout.textContent = "⎋ Log out";
    drawer.appendChild(logout);

    function openMenu() {
      document.body.classList.add("milan-mobile-menu-open");
      drawer.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
      document.body.classList.remove("milan-mobile-menu-open");
      drawer.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
    }

    burger.addEventListener("click", function () {
      document.body.classList.contains("milan-mobile-menu-open") ? closeMenu() : openMenu();
    });
    close.addEventListener("click", closeMenu);
    overlay.addEventListener("click", closeMenu);
    mobileNav.addEventListener("click", function () { setTimeout(closeMenu, 60); });
    logout.addEventListener("click", function () {
      var lb = document.getElementById("logoutBtn");
      if (lb) lb.click();
      else location.href = "/";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  });
})();
