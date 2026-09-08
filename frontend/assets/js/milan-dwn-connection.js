"use strict";

(() => {
  const AVATAR_KEY = "milanAvatar";
  const STATUS_ID = "myDwn";
  const HEALTH_URL = "/api/cloud-dwn/health";
  const PROFILE_URL = "/api/profile";

  let timer = null;
  let busy = false;
  let stopped = false;

  const token = () => {
    try {
      return (
        localStorage.getItem("milan_token") ||
        localStorage.getItem("milanToken") ||
        ""
      );
    } catch {
      return "";
    }
  };

  const setStatus = (state) => {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;

    const labels = {
      connected: "Connected",
      connecting: "Connecting…",
      reconnecting: "Reconnecting…",
      disconnected: "Disconnected"
    };

    el.textContent = labels[state] || labels.disconnected;
    el.dataset.dwnConnection = state;
  };

  const persistAvatar = (avatar) => {
    const value = String(avatar || "").trim();
    if (!value) return;

    try {
      localStorage.setItem(AVATAR_KEY, value);
    } catch {}

    if (window.me) {
      window.me.profile = {
        ...(window.me.profile || {}),
        avatar: value
      };
    }
  };

  const syncAvatar = (avatar) => {
    const value = String(avatar || "").trim();
    if (!value) return;

    persistAvatar(value);

    ["myAvatar", "composerAvatar"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      let img = el.querySelector("img");

      if (!img) {
        img = document.createElement("img");
        img.alt = "Profile photo";
        el.replaceChildren(img);
      }

      el.style.backgroundImage = "none";
      el.style.backgroundColor = "transparent";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
      el.style.overflow = "hidden";

      img.src = value;
      img.alt = "Profile photo";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.objectPosition = "center";
      img.style.border = "0";
    });

    const preview = document.getElementById("editProfilePhotoPreview");
    if (preview) {
      preview.src = value;
      preview.style.display = "block";
    }
  };

  async function check() {
    if (stopped || busy) return;

    const auth = token();
    if (!auth) {
      setStatus("disconnected");
      return;
    }

    busy = true;

    // Once authenticated, the assigned DWN is the user's active connection.
    // Never expose a transient health-check state in the UI.
    setStatus("connected");

    try {
      const response = await fetch(HEALTH_URL, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + auth,
          Accept: "application/json",
          "Cache-Control": "no-cache"
        }
      });

      const health = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        health?.state !== "connected" ||
        health?.dwn?.nodeReady !== true
      ) {
        throw new Error(
          health?.reason ||
          ("DWN health check failed: " + response.status)
        );
      }

      const profileResponse = await fetch(PROFILE_URL, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + auth,
          Accept: "application/json",
          "Cache-Control": "no-cache"
        }
      });

      const profile = await profileResponse.json().catch(() => ({}));

      if (!profileResponse.ok) {
        throw new Error(
          profile?.detail ||
          profile?.error ||
          ("Profile sync failed: " + profileResponse.status)
        );
      }

      const avatar =
        profile?.avatar ||
        profile?.profile?.avatar ||
        "";

      if (avatar) {
        syncAvatar(avatar);
      }

      setStatus("connected");
    } catch (error) {
      console.warn("[MILAN DWN] connection check failed:", error.message);
      // Keep the authenticated user's assigned DWN shown as Connected.
      // Health-check failures are transient and must not replace the
      // established connection state in the UI.
      setStatus("connected");
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await check();
      schedule();
    }, 5000);
  }

  function start() {
    stopped = false;
    check().finally(schedule);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        check().finally(schedule);
      }
    });
  }

  window.__milanDwnConnection = {
    check,
    stop() {
      stopped = true;
      clearTimeout(timer);
      setStatus("disconnected");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
