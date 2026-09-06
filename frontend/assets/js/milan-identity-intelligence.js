"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const POLL_MS = 5000;
  const REQUEST_TIMEOUT_MS = 8000;

  function token() {
    try {
      return (
        localStorage.getItem("milan_token") ||
        localStorage.getItem("milanToken") ||
        ""
      );
    } catch {
      return "";
    }
  }

  function shortenDid(did) {
    did = String(did || "").trim();

    if (!did) return "Resolving";
    if (did.length <= 30) return did;

    return `${did.slice(0, 17)}…${did.slice(-10)}`;
  }

  function toast(message) {
    let el = document.querySelector(".milan-identity-toast");

    if (!el) {
      el = document.createElement("div");
      el.className = "milan-identity-toast";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  async function copyText(text) {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      area.style.top = "0";
      area.style.opacity = "0";

      document.body.appendChild(area);
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);

      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...options,
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch {}

      return { ok: response.ok, status: response.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchIdentity() {
    const t = token();
    if (!t) return null;

    try {
      const response = await fetchJson("/api/auth/me", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + t
        }
      });

      if (!response.ok) {
        console.warn("[MILAN] identity fetch failed:", response.status);
        return null;
      }

      const data = response.data || {};
      const user = data?.user || data?.data?.user || data?.data || data;
      const profile = data?.profile || data?.data?.profile || user?.profile || {};

      const did = String(
        user?.did || profile?.did || data?.did || ""
      ).trim();

      const dwn = user?.dwn || profile?.dwn || data?.dwn || null;

      return { did, dwn };
    } catch (error) {
      console.warn("[MILAN] identity fetch error:", error);
      return null;
    }
  }

  async function probeDwn(did, identityDwn) {
    const rawIdentityDwn = String(
      typeof identityDwn === "string"
        ? identityDwn
        : identityDwn?.endpoint || identityDwn?.spaceId || identityDwn?.mode || identityDwn?.id || ""
    ).trim();

    if (!did) {
      return { state: "Resolving", detail: "DID not available yet" };
    }

    // A backend identity response that explicitly contains a DWN object is authoritative.
    if (identityDwn && typeof identityDwn === "object") {
      const mode = String(identityDwn.mode || "").toLowerCase();
      const endpoint = String(identityDwn.endpoint || "").trim();

      if (/offline|disconnected|unavailable|error/.test(mode)) {
        return { state: "Unavailable", detail: rawIdentityDwn || mode };
      }

      if (endpoint || identityDwn.spaceId || identityDwn.id || mode) {
        return { state: "Connected", detail: endpoint || rawIdentityDwn };
      }
    }

    // Live DWN probe. The existing /api/dwn GET endpoint is used only as a health probe;
    // no record contents are rendered or persisted in the browser.
    try {
      const response = await fetchJson(
        "/api/dwn?did=" + encodeURIComponent(did),
        {
          method: "GET",
          headers: { Accept: "application/json" }
        }
      );

      if (response.ok && response.data && Array.isArray(response.data.records)) {
        return {
          state: "Connected",
          detail: `records:${response.data.records.length}`
        };
      }

      if (response.status === 401 || response.status === 403) {
        return { state: "Unavailable", detail: "DWN access denied" };
      }

      return {
        state: "Unavailable",
        detail: `HTTP ${response.status || 0}`
      };
    } catch (error) {
      console.warn("[MILAN] DWN probe failed:", error);
      return { state: "Unavailable", detail: error?.message || "probe failed" };
    }
  }

  function writeBridge(did, dwn, privacy) {
    const didBridge = $("myDid");
    const dwnBridge = $("myDwn");
    const privacyBridge = $("privacyScore");

    if (didBridge && did) didBridge.textContent = did;

    if (dwnBridge) {
      if (typeof dwn === "string" && dwn.trim()) {
        dwnBridge.textContent = dwn.trim();
      } else if (dwn && typeof dwn === "object") {
        dwnBridge.textContent =
          dwn.endpoint || dwn.spaceId || dwn.mode || dwn.id || "Connected";
      }
    }

    if (privacyBridge && privacy) privacyBridge.textContent = privacy;
  }

  function updateDidChip(did) {
    const chip = document.querySelector(".milan-identity-status-chip.did");
    if (!chip) return;

    let inline = chip.querySelector(".milan-did-inline");

    if (!inline) {
      const oldValue = chip.querySelector(".value");
      inline = document.createElement("div");
      inline.className = "milan-did-inline";

      const value = document.createElement("span");
      value.className = "value";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "milan-did-copy";
      button.textContent = "⧉";
      button.title = "Copy full DID";
      button.setAttribute("aria-label", "Copy full DID");

      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const fullDid = button.dataset.fullDid || "";
        if (!fullDid) {
          toast("DID is still resolving");
          return;
        }

        const ok = await copyText(fullDid);

        if (ok) {
          button.textContent = "✓";
          button.classList.add("copied");
          toast("DID copied to clipboard");

          setTimeout(() => {
            button.textContent = "⧉";
            button.classList.remove("copied");
          }, 1300);
        } else {
          toast("Copy failed — select the DID manually");
        }
      });

      inline.appendChild(value);
      inline.appendChild(button);
      oldValue?.replaceWith(inline);
    }

    const value = inline.querySelector(".value");
    const button = inline.querySelector(".milan-did-copy");

    if (!did) {
      value.textContent = "Resolving";
      button.disabled = true;
      button.dataset.fullDid = "";
      chip.title = "DID is still resolving";
      chip.classList.remove("active", "resolving", "unavailable");
      chip.classList.add("resolving");
      return;
    }

    value.textContent = shortenDid(did);
    button.disabled = false;
    button.dataset.fullDid = did;
    chip.title = did;
    chip.classList.remove("active", "resolving", "unavailable");
    chip.classList.add("active");
  }

  function updateDwnChip(result) {
    const chip = document.querySelector(".milan-identity-status-chip.dwn");
    if (!chip) return;

    const value = chip.querySelector(".value");
    if (!value) return;

    const state = result?.state || "Resolving";
    value.textContent = state;

    chip.classList.remove("connected", "resolving", "isolated", "unavailable");
    chip.classList.add(state.toLowerCase());

    chip.title = result?.detail
      ? `DWN: ${result.detail}`
      : "DWN status is being resolved";
  }

  function updatePrivacyChip() {
    const chip = document.querySelector(".milan-identity-status-chip.privacy");
    if (!chip) return;

    const value = chip.querySelector(".value");
    const score = $("privacyScore")?.textContent.trim();

    if (value) value.textContent = score || "100%";
  }

  async function sync() {
    updateDidChip("");
    updateDwnChip({ state: "Resolving", detail: "Contacting identity service…" });

    const identity = await fetchIdentity();

    if (!identity) {
      updateDidChip("");
      updateDwnChip({ state: "Unavailable", detail: "Identity service unavailable" });
      updatePrivacyChip();
      return;
    }

    const did = identity.did;
    const dwnProbePromise = probeDwn(did, identity.dwn);

    if (did) updateDidChip(did);

    writeBridge(
      did,
      identity.dwn,
      $("privacyScore")?.textContent.trim()
    );

    const dwnResult = await dwnProbePromise;
    updateDwnChip(dwnResult);
    updatePrivacyChip();
  }

  function start() {
    sync();

    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await sync();
      } finally {
        running = false;
      }
    };

    setInterval(tick, POLL_MS);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });

    window.addEventListener("online", tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
