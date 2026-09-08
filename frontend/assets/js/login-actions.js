/* MILAN — external login-page actions */
"use strict";

(function () {
  const getEmail = () => String(document.getElementById("loginEmail")?.value || "").trim().toLowerCase();
  const getPassword = () => String(document.getElementById("loginPass")?.value || "");
  const show = (message, error = false) => {
    const el = document.getElementById("authMsg");
    if (!el) return;
    el.textContent = message;
    el.style.color = error ? "#e5484d" : "#10b981";
  };

  async function passwordLogin(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const button = document.getElementById("loginBtn");
    const email = getEmail();
    const password = getPassword();

    if (!email || !password) {
      show("Please enter email and password.", true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Logging in...";
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store"
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Login failed (${response.status})`);
      }
      if (!data.token) {
        throw new Error("No login token received.");
      }

      localStorage.setItem("milan_token", data.token);
      localStorage.removeItem("milanBootCache");

      // Best-effort profile hydration; login must not be blocked by it.
      try {
        const profileResponse = await fetch("/api/profile", {
          headers: { Accept: "application/json", Authorization: "Bearer " + data.token },
          cache: "no-store"
        });
        const profile = await profileResponse.json().catch(() => ({}));
        if (profile?.avatar) localStorage.setItem("milanAvatar", profile.avatar);
      } catch (_) {}

      show("✅ Login successful. Opening MILAN...", false);
      window.location.replace("/app?login=" + Date.now());
    } catch (error) {
      localStorage.removeItem("milan_token");
      show(error.message || "Login failed.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Login →";
      }
    }
  }

  function bindLoginPageActions() {
    const toggleBtn = document.getElementById("togglePasswordBtn");
    const password = document.getElementById("loginPass");

    if (toggleBtn && password && !toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = "1";
      toggleBtn.addEventListener("click", function () {
        password.type = password.type === "password" ? "text" : "password";
      });
    }

    const forgot = document.getElementById("forgotPasswordLink");
    const email = document.getElementById("loginEmail");
    if (forgot && email && !forgot.dataset.bound) {
      forgot.dataset.bound = "1";
      forgot.addEventListener("click", function () {
        const value = String(email.value || "").trim();
        this.href = value ? "/reset-password?email=" + encodeURIComponent(value) : "/reset-password";
      });
    }

    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn && !window.__milanPasswordLoginHotfix) {
      window.__milanPasswordLoginHotfix = true;
      // Capture before login.js's target listener so the old optional-ID3 gate
      // cannot intercept a normal password login.
      document.addEventListener("click", passwordLogin, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLoginPageActions, { once: true });
  } else {
    bindLoginPageActions();
  }
})();
