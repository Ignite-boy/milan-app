/* MILAN V7.3 — Mobile navigation drawer.
 * The logged-in mobile UI uses one hamburger in the top bar and one
 * slide-out navigation surface. Desktop navigation remains untouched.
 */
(function () {
  "use strict";
  if (window.__milanMobileNav) return;
  window.__milanMobileNav = true;

  var isApp = /\/app(\.html)?$/.test(location.pathname);
  if (!isApp) return;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(init);

  function esc(s) {
    return String(s).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[c];
    });
  }

  function init() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    var burger = document.createElement("button");
    burger.id = "milan-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Open navigation menu");
    burger.setAttribute("aria-expanded", "false");
    burger.innerHTML = "☰";
    topbar.appendChild(burger);

    var overlay = document.createElement("div");
    overlay.id = "milan-drawer-ov";

    var drawer = document.createElement("aside");
    drawer.id = "milan-drawer";
    drawer.setAttribute("aria-label", "MILAN navigation");
    drawer.setAttribute("aria-hidden", "true");

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    function realMenuButtons() {
      return Array.prototype.slice.call(
        document.querySelectorAll(".sidebar .nav button")
      );
    }

    function build() {
      var nameEl = document.querySelector(
        "#profileName, #userName, #myName, .profileCard h3, .profileName, .leftRail .profileCard b"
      );
      var name = (nameEl && nameEl.textContent ? nameEl.textContent : "Your account").trim().slice(0, 40);

      var btns = realMenuButtons();
      var seen = {};
      var navHtml = "";

      btns.forEach(function (b) {
        var t = (b.textContent || "").trim();
        if (!t || seen[t]) return;
        seen[t] = 1;
        navHtml += '<button class="md-item" type="button" data-fwd="1">' + esc(t) + "</button>";
      });

      if (!navHtml) {
        navHtml = '<a class="md-item" href="/app">🏠 Home Feed</a>';
      }

      drawer.innerHTML =
        '<div class="md-head">' +
          '<div><span class="md-brand">MILAN</span><span class="md-sub">Navigation</span></div>' +
          '<button class="md-close" type="button" aria-label="Close menu">×</button>' +
        '</div>' +
        '<div class="md-user">👤 ' + esc(name) + '</div>' +
        '<div class="md-sec">Your space</div>' +
        '<nav class="md-nav" aria-label="Primary navigation">' + navHtml + '</nav>' +
        '<button class="md-logout" id="milan-drawer-logout" type="button">⎋ Log out</button>';

      var byText = {};
      btns.forEach(function (b) {
        byText[(b.textContent || "").trim()] = b;
      });

      drawer.querySelectorAll('.md-item[data-fwd="1"]').forEach(function (it) {
        it.addEventListener("click", function () {
          var real = byText[it.textContent.trim()];
          closeDrawer();
          if (real) setTimeout(function () { real.click(); }, 80);
        });
      });

      drawer.querySelectorAll("a.md-item").forEach(function (a) {
        a.addEventListener("click", closeDrawer);
      });

      drawer.querySelector(".md-close").addEventListener("click", closeDrawer);
      drawer.querySelector("#milan-drawer-logout").addEventListener("click", function () {
        var lb = document.getElementById("logoutBtn");
        if (lb) { lb.click(); return; }
        try {
          localStorage.removeItem("milanToken");
          localStorage.removeItem("rememberedEmail");
        } catch (e) {}
        location.href = "/";
      });
    }

    function openDrawer() {
      build();
      document.body.classList.add("milan-drawer-open");
      drawer.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
    }

    function closeDrawer() {
      document.body.classList.remove("milan-drawer-open");
      drawer.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
    }

    burger.addEventListener("click", function () {
      document.body.classList.contains("milan-drawer-open") ? closeDrawer() : openDrawer();
    });

    overlay.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });
  }
})();
