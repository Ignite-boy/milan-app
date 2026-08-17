/* ============================================================================
   MILAN — Background audio keep-alive (additive, non-destructive)
   --------------------------------------------------------------------------
   Goal: music keeps playing when the app is minimised / screen locks —
   both on the /music page (Audius <audio> + YouTube engine) and for the
   YouTube embeds inside the home feed.

   How: mobile browsers auto-pause media when the page is hidden. That pause
   arrives within a few seconds of `visibilitychange -> hidden`. We track the
   playback state of every YouTube iframe (postMessage widget protocol) and of
   the music page's <audio>, and when a pause lands inside that short window
   we resume it. Pauses OUTSIDE the window (user pressed pause on the lock
   screen / media notification) are always respected.

   Notes:
   - Feed embeds need `enablejsapi=1` in their src (added in
     milan-youtube-feed.js); they are marked with `mbg=1` and get a
     "listening" handshake from us so the widget starts reporting state.
   - The /music page's IFrame-API player already does its own handshake; we
     only read its state passively (never re-handshake, so the API's own
     event binding is untouched).
   - Platform limit: if the PWA is fully swiped away from recents, the page
     is killed and nothing can keep playing. This module covers app-switch,
     home button and screen lock.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__milanBgAudio) return;

  var YT_ORIGIN = /^https:\/\/www\.youtube(-nocookie)?\.com$/;
  var YT_EMBED = /^(https?:)?\/\/www\.youtube(-nocookie)?\.com\/embed\//;
  var RESUME_WINDOW_MS = 7000;   // only auto-resume pauses this soon after hiding
  var NUDGE_MS = 900;            // retry cadence while hidden (browsers throttle to ~1s)
  var NUDGE_MAX = 12;            // give up after ~11s of trying

  var seq = 0;
  var tracked = [];              // [{ frame, state, needsHello, helloTries }]
  var hiddenAt = 0;
  var nudger = null;

  function entryFor(frame) {
    for (var i = 0; i < tracked.length; i++) if (tracked[i].frame === frame) return tracked[i];
    return null;
  }
  function post(frame, func) {
    try {
      frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: [] }), "*");
    } catch (e) {}
  }
  function hello(entry) {
    try {
      entry.frame.contentWindow.postMessage(
        JSON.stringify({ event: "listening", id: entry.id, channel: "widget" }), "*");
    } catch (e) {}
  }

  /* ---- discover YouTube iframes ----------------------------------------- */
  function scan() {
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var src = f.getAttribute("src") || "";
      if (!YT_EMBED.test(src) || entryFor(f)) continue;
      tracked.push({
        frame: f,
        id: "mbg" + (++seq),
        state: -1,
        // our own embeds (mbg=1) need the handshake; IFrame-API players do it themselves
        needsHello: /[?&]mbg=1/.test(src),
        helloTries: 0
      });
    }
    // drop iframes that left the DOM
    tracked = tracked.filter(function (t) { return document.contains(t.frame); });
  }

  /* ---- state tracking via the widget's postMessage events ---------------- */
  window.addEventListener("message", function (e) {
    if (!YT_ORIGIN.test(e.origin)) return;
    var data = e.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) { return; } }
    if (!data || typeof data !== "object") return;
    var st = data.info && typeof data.info.playerState === "number" ? data.info.playerState
           : (data.event === "onStateChange" && typeof data.info === "number" ? data.info : null);
    if (st === null) return;
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].frame.contentWindow === e.source) {
        var prev = tracked[i].state;
        tracked[i].state = st;
        tracked[i].needsHello = false;
        // browser paused us right after the app went to background -> resume
        if (st === 2 && (prev === 1 || prev === 3) && document.hidden &&
            hiddenAt && Date.now() - hiddenAt < RESUME_WINDOW_MS) {
          post(tracked[i].frame, "playVideo");
        }
        return;
      }
    }
  });

  /* ---- visibility handling ----------------------------------------------- */
  function playingEntries() {
    return tracked.filter(function (t) { return t.state === 1 || t.state === 3; });
  }
  function onHidden() {
    hiddenAt = Date.now();
    var targets = playingEntries();
    if (!targets.length) return;
    var tries = 0;
    clearInterval(nudger);
    nudger = setInterval(function () {
      if (!document.hidden || ++tries > NUDGE_MAX) { clearInterval(nudger); nudger = null; return; }
      var stillNeeded = false;
      targets.forEach(function (t) {
        if (!document.contains(t.frame)) return;
        if (t.state !== 1) { post(t.frame, "playVideo"); stillNeeded = true; }
      });
      if (!stillNeeded && tries > 2) { clearInterval(nudger); nudger = null; }
    }, NUDGE_MS);
  }
  function onVisible() {
    hiddenAt = 0;
    if (nudger) { clearInterval(nudger); nudger = null; }
  }
  document.addEventListener("visibilitychange", function () {
    document.hidden ? onHidden() : onVisible();
  });
  window.addEventListener("pagehide", function () { hiddenAt = Date.now(); });

  /* ---- music page <audio> (Audius engine) -------------------------------- */
  function guardAudio() {
    var aud = document.getElementById("audio");
    if (!aud || aud.__mbgGuard) return;
    aud.__mbgGuard = true;
    aud.addEventListener("pause", function () {
      if (!document.hidden || aud.ended || aud.seeking || !aud.currentTime) return;
      if (!hiddenAt || Date.now() - hiddenAt >= RESUME_WINDOW_MS) return; // user pause -> respect it
      setTimeout(function () {
        if (document.hidden && aud.paused && !aud.ended) aud.play().catch(function () {});
      }, 150);
    });
  }

  /* ---- boot --------------------------------------------------------------- */
  function tick() {
    scan();
    guardAudio();
    // handshake new feed embeds until the widget starts answering
    tracked.forEach(function (t) {
      if (t.needsHello && t.helloTries < 20) { t.helloTries++; hello(t); }
    });
  }
  function start() {
    tick();
    setInterval(tick, 1500);
    try {
      new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.__milanBgAudio = {
    _tracked: function () { return tracked; },
    _state: function () { return { hiddenAt: hiddenAt, players: tracked.map(function (t) { return t.state; }) }; }
  };
})();
