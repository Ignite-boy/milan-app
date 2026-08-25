(function () {
    "use strict";

    // ---------- Navigation ----------
    const go = (url) => {
        window.location.href = url;
    };

    const buttons = Array.from(document.querySelectorAll(".nav button"));

    if (buttons[0]) buttons[0].onclick = () => go("/app?view=home");
    if (buttons[1]) buttons[1].onclick = () => go("/app?view=mine");
    if (buttons[2]) buttons[2].onclick = () => go("/app?view=public");
    if (buttons[3]) buttons[3].onclick = () => go("/app?view=saved");

    const editProfileBtn = document.getElementById("editProfileBtn");
    if (editProfileBtn) {
        editProfileBtn.onclick = () => go("/settings");
    }

    // Privacy
    if (buttons[buttons.length - 2]) {
        buttons[buttons.length - 2].onclick = () => go("/privacy");
    }

    // MILAN AI
    const aiBtn = buttons[buttons.length - 1];
    if (aiBtn) {
        aiBtn.onclick = () => go("/app?view=ai");
    }

    // ---------- Top actions ----------
    const topActions = document.querySelectorAll(".top-actions .icon-btn");

    // logout is already handled elsewhere
    if (topActions[1]) topActions[1].onclick = () => go("/chat");
    if (topActions[2]) topActions[2].onclick = () => go("/music");

    // Theme toggle
    if (topActions[3]) {
        topActions[3].onclick = () => {
            const light = document.documentElement.dataset.milanTheme === "light";

            if (light) {
                delete document.documentElement.dataset.milanTheme;
                localStorage.setItem("milanTheme", "dark");
                document.documentElement.style.colorScheme = "dark";
            } else {
                document.documentElement.dataset.milanTheme = "light";
                localStorage.setItem("milanTheme", "light");
                document.documentElement.style.colorScheme = "light";
            }
        };
    }

    // Notifications
    if (topActions[4]) {
        topActions[4].onclick = () => go("/app?view=notifications");
    }

    // Restore theme preference
    const savedTheme = localStorage.getItem("milanTheme");
    if (savedTheme === "light") {
        document.documentElement.dataset.milanTheme = "light";
        document.documentElement.style.colorScheme = "light";
    }

    // ---------- Composer ----------
    const tools = Array.from(document.querySelectorAll(".composer-tools .tool"));

    // Image
    if (tools[0]) {
        tools[0].onclick = () => {
            let input = document.getElementById("composerImageInput");

            if (!input) {
                input = document.createElement("input");
                input.type = "file";
                input.id = "composerImageInput";
                input.accept = "image/*";
                input.hidden = true;

                input.addEventListener("change", () => {
                    const file = input.files?.[0];
                    if (!file) return;

                    tools[0].dataset.file = file.name;
                    tools[0].title = file.name;
                    tools[0].textContent = "✅";
                });

                document.body.appendChild(input);
            }

            input.click();
        };
    }

    // Attachment
    if (tools[1]) {
        tools[1].onclick = () => {
            let input = document.getElementById("composerFileInput");

            if (!input) {
                input = document.createElement("input");
                input.type = "file";
                input.id = "composerFileInput";
                input.hidden = true;

                input.addEventListener("change", () => {
                    const file = input.files?.[0];
                    if (!file) return;

                    tools[1].dataset.file = file.name;
                    tools[1].title = file.name;
                    tools[1].textContent = "✅";
                });

                document.body.appendChild(input);
            }

            input.click();
        };
    }

    // Emoji
    if (tools[2]) {
        tools[2].onclick = () => {
            const postText = document.getElementById("postText");
            if (!postText) return;

            const emoji = " 😊";
            const start = postText.selectionStart ?? postText.value.length;
            const end = postText.selectionEnd ?? postText.value.length;

            postText.value =
                postText.value.slice(0, start) +
                emoji +
                postText.value.slice(end);

            postText.focus();
            postText.selectionStart = postText.selectionEnd =
                start + emoji.length;
        };
    }

    // Privacy toggle
    if (tools[3]) {
        tools[3].onclick = () => {
            const active = tools[3].dataset.privacy === "private";

            tools[3].dataset.privacy = active ? "public" : "private";
            tools[3].textContent = active ? "🌍" : "🔒";
            tools[3].title = active ? "Public post" : "Private post";
        };
    }

    // ---------- Follow buttons ----------
    document.querySelectorAll(".follow").forEach((btn) => {
        btn.addEventListener("click", () => {
            const person =
                btn.closest(".person")?.querySelector(".person-info b")
                    ?.textContent
                    ?.trim() || "user";

            const following = btn.dataset.following === "true";

            btn.dataset.following = following ? "false" : "true";
            btn.textContent = following ? "Follow" : "Following";
            btn.setAttribute(
                "aria-label",
                following
                    ? `Follow ${person}`
                    : `Unfollow ${person}`
            );

            localStorage.setItem(
                "milan_follow_" + person.toLowerCase().replace(/\s+/g, "_"),
                following ? "false" : "true"
            );
        });
    });

    console.log("[MILAN] All primary UI controls activated.");
})();

/* =========================================================
   MILAN — DWN TEXT / QUOTE PERSISTENCE
   Every published composer text becomes a persistent
   private DWN record for the authenticated user.
   ========================================================= */
(function () {
    "use strict";

    function getMilanToken() {
        return (
            localStorage.getItem("milan_token") ||
            localStorage.getItem("milanToken") ||
            ""
        );
    }

    async function publishQuoteToDwn() {
        const textarea = document.getElementById("postText");
        const button = document.getElementById("publishBtn");

        if (!textarea || !button) return;

        const text = String(textarea.value || "").trim();

        if (!text) {
            alert("Write something first.");
            textarea.focus();
            return;
        }

        const token = getMilanToken();

        if (!token) {
            alert("Your login session is missing. Please login again.");
            return;
        }

        const privacyTool = document.querySelector(".composer-tools .tool:last-child");
        const accessMode =
            privacyTool?.dataset?.privacy === "public"
                ? "public"
                : "private";

        const oldText = button.textContent;

        try {
            button.disabled = true;
            button.textContent = "Saving…";

            const response = await fetch("/api/records", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    title: "MILAN Quote",
                    data: {
                        kind: "quote",
                        text,
                        createdAt: new Date().toISOString()
                    },
                    dataFormat: "application/json",
                    accessMode,
                    sharedWithDids: [],
                    tags: ["quote"]
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    result.detail ||
                    "Quote could not be stored on DWN."
                );
            }

            textarea.value = "";

            button.textContent = "Saved ✓";

            console.log("[MILAN] Quote stored on DWN:", {
                recordId: result.id || result.recordId || null,
                accessMode
            });

            setTimeout(() => {
                button.textContent = oldText;
                button.disabled = false;
            }, 1200);

        } catch (error) {
            console.error("[MILAN] DWN quote save failed:", error);

            button.textContent = oldText;
            button.disabled = false;

            alert(
                "Quote could not be saved to DWN.\n\n" +
                (error.message || "Unknown error")
            );
        }
    }

    function bindQuotePublisher() {
        const button = document.getElementById("publishBtn");

        if (!button || button.dataset.dwnQuoteBound === "1") return;

        button.dataset.dwnQuoteBound = "1";
        button.addEventListener("click", publishQuoteToDwn);

        console.log("[MILAN] DWN quote publisher active.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindQuotePublisher);
    } else {
        bindQuotePublisher();
    }
})();

/* =========================================================
   MILAN — LIVE HOME FEED
   Reads persistent records and renders them below composer.
   ========================================================= */
(function () {
    "use strict";

    const token = () =>
        localStorage.getItem("milan_token") ||
        localStorage.getItem("milanToken") ||
        "";

    const esc = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[m]);

    function getRecordText(record) {
        const data = record?.data || {};

        return String(
            data.text ||
            data.caption ||
            record?.text ||
            record?.caption ||
            ""
        ).trim();
    }

    function getRecordTitle(record) {
        return String(
            record?.title ||
            record?.data?.title ||
            "MILAN Post"
        ).trim();
    }

    function getCreatedAt(record) {
        return (
            record?.dateCreated ||
            record?.createdAt ||
            record?.dateModified ||
            new Date().toISOString()
        );
    }

    function formatDate(value) {
        const d = new Date(value);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleString([], {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function normalizeRecords(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.records)) return payload.records;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.entries)) return payload.entries;
        if (Array.isArray(payload?.result?.entries)) return payload.result.entries;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
    }

    function recordCard(record) {
        const id = esc(
            record?.id ||
            record?.recordId ||
            record?.data?.recordId ||
            ""
        );

        const title = esc(getRecordTitle(record));
        const text = esc(getRecordText(record));
        const when = esc(formatDate(getCreatedAt(record)));

        return `
          <article class="milan-feed-card" data-record-id="${id}">
            <div class="milan-feed-card-head">
              <div class="milan-feed-avatar" id="feed-avatar-${id}">M</div>
              <div class="milan-feed-meta">
                <strong class="milan-feed-name">Milan User</strong>
                <span>${when}</span>
              </div>
            </div>

            <div class="milan-feed-body">
              <h3>${title}</h3>
              ${text ? `<p>${text.replace(/\n/g, "<br>")}</p>` : ""}
            </div>

            <div class="milan-feed-actions">
              <button type="button" data-action="like">♡ Like</button>
              <button type="button" data-action="comment">💬 Comment</button>
              <button type="button" data-action="share">↗ Share</button>
              <button type="button" data-action="save">🔖 Save</button>
            </div>
          </article>
        `;
    }

    function bindFeedActions() {
        document.querySelectorAll(".milan-feed-card").forEach((card) => {
            card.querySelectorAll("[data-action]").forEach((button) => {
                button.onclick = () => {
                    const action = button.dataset.action;

                    if (action === "like") {
                        button.classList.toggle("active");
                        button.textContent =
                            button.classList.contains("active")
                                ? "♥ Liked"
                                : "♡ Like";
                    }

                    if (action === "comment") {
                        const text = prompt("Write a comment");
                        if (text?.trim()) {
                            button.textContent = "💬 Commented";
                        }
                    }

                    if (action === "share") {
                        const url = window.location.origin + "/app";
                        navigator.clipboard?.writeText(url).then(
                            () => {
                                button.textContent = "✓ Copied";
                                setTimeout(() => {
                                    button.textContent = "↗ Share";
                                }, 1200);
                            },
                            () => {
                                button.textContent = "↗ Share";
                            }
                        );
                    }

                    if (action === "save") {
                        button.classList.toggle("active");
                        button.textContent =
                            button.classList.contains("active")
                                ? "✓ Saved"
                                : "🔖 Save";
                    }
                };
            });
        });
    }

    async function loadMilanHomeFeed() {
        const list = document.getElementById("milanFeedList");
        if (!list) return;

        const auth = token();

        if (!auth) {
            list.innerHTML = `
              <div class="milan-feed-empty">
                Login required to load your DWN feed.
              </div>`;
            return;
        }

        list.innerHTML = `
          <div class="milan-feed-loading">
            Loading your DWN posts…
          </div>`;

        try {
            const response = await fetch("/api/records", {
                headers: {
                    "Authorization": "Bearer " + auth,
                    "Accept": "application/json"
                },
                cache: "no-store"
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ||
                    payload.detail ||
                    `Feed failed: ${response.status}`
                );
            }

            const records = normalizeRecords(payload)
                .filter((record) => getRecordText(record) || record?.title)
                .sort((a, b) =>
                    new Date(getCreatedAt(b)) -
                    new Date(getCreatedAt(a))
                );

            if (!records.length) {
                list.innerHTML = `
                  <div class="milan-feed-empty">
                    No posts yet. Write your first quote above.
                  </div>`;
                return;
            }

            list.innerHTML = records.map(recordCard).join("");
            bindFeedActions();

        } catch (error) {
            console.error("[MILAN] Home DWN feed failed:", error);

            list.innerHTML = `
              <div class="milan-feed-empty milan-feed-error">
                Could not load your DWN feed.
                <button type="button" id="milanFeedRetry">Retry</button>
              </div>`;

            document.getElementById("milanFeedRetry")?.addEventListener(
                "click",
                loadMilanHomeFeed
            );
        }
    }

    // Override only the UI publisher completion so the newly-created
    // DWN record appears immediately below the composer.
    const originalPublishQuote = window.publishQuoteToDwn;

    window.publishQuoteToDwn = async function () {
        if (typeof originalPublishQuote === "function") {
            await originalPublishQuote();
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        await loadMilanHomeFeed();
    };

    function bindFeedRefresh() {
        document
            .getElementById("milanFeedRefresh")
            ?.addEventListener("click", loadMilanHomeFeed);
    }

    function init() {
        bindFeedRefresh();
        loadMilanHomeFeed();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Public helper for future UI refreshes.
    window.milanRefreshHomeFeed = loadMilanHomeFeed;
})();

/* =========================================================
   MILAN — FINAL PUBLISH → DWN → FEED SYNC
   Guarantees the composer publish button refreshes the
   live Home Feed after a successful DWN record write.
   ========================================================= */
(function () {
    "use strict";

    function bindFinalPublisher() {
        const oldButton = document.getElementById("publishBtn");
        if (!oldButton || oldButton.dataset.finalDwnPublisher === "1") return;

        // Clone removes every previous click listener without touching the UI.
        const button = oldButton.cloneNode(true);
        oldButton.replaceWith(button);
        button.dataset.finalDwnPublisher = "1";

        button.addEventListener("click", async function () {
            const textarea = document.getElementById("postText");
            const token =
                localStorage.getItem("milan_token") ||
                localStorage.getItem("milanToken") ||
                "";

            const text = String(textarea?.value || "").trim();

            if (!text) {
                alert("Write something first.");
                textarea?.focus();
                return;
            }

            if (!token) {
                alert("Please login again.");
                return;
            }

            const privacyTool =
                document.querySelector(".composer-tools .tool:last-child");

            const accessMode =
                privacyTool?.dataset?.privacy === "public"
                    ? "public"
                    : "private";

            const originalText = button.textContent;

            try {
                button.disabled = true;
                button.textContent = "Saving…";

                const response = await fetch("/api/records", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + token,
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        title: "MILAN Quote",
                        data: {
                            kind: "quote",
                            text,
                            createdAt: new Date().toISOString()
                        },
                        dataFormat: "application/json",
                        accessMode,
                        sharedWithDids: [],
                        tags: ["quote"]
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        result.detail ||
                        ("DWN save failed: HTTP " + response.status)
                    );
                }

                // Clear composer only after successful DWN write.
                textarea.value = "";

                button.textContent = "Saved ✓";

                console.log("[MILAN] Quote saved successfully:", result);

                // Refresh live Home Feed from DWN/API.
                if (typeof window.milanRefreshHomeFeed === "function") {
                    await window.milanRefreshHomeFeed();
                } else {
                    // Fallback: trigger a normal page-level feed event.
                    window.dispatchEvent(
                        new CustomEvent("milan:dwn-record-created", {
                            detail: result
                        })
                    );
                }

                // Scroll the newly updated feed into view.
                const feed = document.getElementById("milanHomeFeed");
                if (feed) {
                    setTimeout(() => {
                        feed.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                    }, 100);
                }

                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 1000);

            } catch (error) {
                console.error("[MILAN] Publish → DWN → Feed failed:", error);

                button.textContent = originalText;
                button.disabled = false;

                alert(
                    "Post could not be saved.\n\n" +
                    (error.message || "Unknown error")
                );
            }
        });

        console.log("[MILAN] Final DWN publish/feed sync active.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindFinalPublisher);
    } else {
        bindFinalPublisher();
    }
})();

/* =========================================================
   MILAN — AUTHORITATIVE PUBLISHER
   FINAL: Composer -> DWN -> Immediate Home Feed
   ========================================================= */
(function () {
    "use strict";

    function token() {
        return (
            localStorage.getItem("milan_token") ||
            localStorage.getItem("milanToken") ||
            ""
        );
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[m]);
    }

    function extractText(record) {
        return String(
            record?.data?.text ||
            record?.text ||
            record?.data?.caption ||
            record?.caption ||
            ""
        ).trim();
    }

    function extractDate(record) {
        return (
            record?.dateCreated ||
            record?.createdAt ||
            record?.dateModified ||
            new Date().toISOString()
        );
    }

    function makeFeedCard(record, fallbackText = "") {
        const text = extractText(record) || fallbackText;
        const recordId =
            record?.id ||
            record?.recordId ||
            record?.dwnRecordId ||
            ("local-" + Date.now());

        const title =
            record?.title ||
            record?.data?.title ||
            "MILAN Quote";

        const date = new Date(extractDate(record));
        const when = Number.isNaN(date.getTime())
            ? "Just now"
            : date.toLocaleString([], {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
            });

        return `
            <article class="milan-feed-card" data-record-id="${escapeHtml(recordId)}">
                <div class="milan-feed-card-head">
                    <div class="milan-feed-avatar">M</div>
                    <div class="milan-feed-meta">
                        <strong class="milan-feed-name">
                            ${escapeHtml(
                                document.getElementById("myName")?.textContent?.trim() ||
                                "Milan User"
                            )}
                        </strong>
                        <span>${escapeHtml(when)}</span>
                    </div>
                </div>

                <div class="milan-feed-body">
                    <h3>${escapeHtml(title)}</h3>
                    <p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>
                </div>

                <div class="milan-feed-actions">
                    <button type="button" data-action="like">♡ Like</button>
                    <button type="button" data-action="comment">💬 Comment</button>
                    <button type="button" data-action="share">↗ Share</button>
                    <button type="button" data-action="save">🔖 Save</button>
                </div>
            </article>
        `;
    }

    function bindFeedButtons(root) {
        root.querySelectorAll(".milan-feed-card").forEach((card) => {
            card.querySelectorAll("[data-action]").forEach((button) => {
                button.onclick = () => {
                    const action = button.dataset.action;

                    if (action === "like") {
                        button.classList.toggle("active");
                        button.textContent =
                            button.classList.contains("active")
                                ? "♥ Liked"
                                : "♡ Like";
                    }

                    if (action === "comment") {
                        const value = prompt("Write a comment");
                        if (value && value.trim()) {
                            button.textContent = "💬 Commented";
                        }
                    }

                    if (action === "share") {
                        const shareUrl = window.location.origin + "/app";
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(shareUrl).then(() => {
                                button.textContent = "✓ Copied";
                                setTimeout(() => {
                                    button.textContent = "↗ Share";
                                }, 1200);
                            });
                        }
                    }

                    if (action === "save") {
                        button.classList.toggle("active");
                        button.textContent =
                            button.classList.contains("active")
                                ? "✓ Saved"
                                : "🔖 Save";
                    }
                };
            });
        });
    }

    function prependFeedRecord(record, text) {
        const list = document.getElementById("milanFeedList");
        if (!list) return;

        const empty = list.querySelector(".milan-feed-empty");
        if (empty) empty.remove();

        const wrapper = document.createElement("div");
        wrapper.innerHTML = makeFeedCard(record, text);

        const card = wrapper.firstElementChild;
        if (!card) return;

        list.prepend(card);
        bindFeedButtons(list);

        const feed = document.getElementById("milanHomeFeed");
        if (feed) {
            setTimeout(() => {
                feed.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }, 80);
        }
    }

    async function loadFeedFromServer() {
        const list = document.getElementById("milanFeedList");
        const auth = token();

        if (!list || !auth) return;

        try {
            const response = await fetch("/api/records", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + auth,
                    "Accept": "application/json"
                },
                cache: "no-store"
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ||
                    payload.detail ||
                    ("Feed failed: HTTP " + response.status)
                );
            }

            const records =
                Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload.records)
                    ? payload.records
                    : Array.isArray(payload.items)
                    ? payload.items
                    : Array.isArray(payload.entries)
                    ? payload.entries
                    : Array.isArray(payload.data)
                    ? payload.data
                    : [];

            const valid = records
                .filter((r) => extractText(r) || r?.title)
                .sort(
                    (a, b) =>
                        new Date(extractDate(b)) -
                        new Date(extractDate(a))
                );

            if (!valid.length) {
                list.innerHTML = `
                    <div class="milan-feed-empty">
                        No posts yet. Write your first quote above.
                    </div>
                `;
                return;
            }

            list.innerHTML = valid.map((r) => makeFeedCard(r)).join("");
            bindFeedButtons(list);

        } catch (error) {
            console.error("[MILAN] DWN feed read failed:", error);
        }
    }

    function installPublisher() {
        const existing = document.getElementById("publishBtn");
        if (!existing || existing.dataset.milanAuthoritative === "1") {
            return;
        }

        const button = existing.cloneNode(true);
        existing.replaceWith(button);

        button.dataset.milanAuthoritative = "1";

        button.addEventListener(
            "click",
            async function () {
                const textarea = document.getElementById("postText");
                const text = String(textarea?.value || "").trim();

                if (!text) {
                    alert("Write something first.");
                    textarea?.focus();
                    return;
                }

                const auth = token();

                if (!auth) {
                    alert("Please login again.");
                    return;
                }

                const privacyTool =
                    document.querySelector(
                        ".composer-tools .tool:last-child"
                    );

                const accessMode =
                    privacyTool?.dataset?.privacy === "public"
                        ? "public"
                        : "private";

                const original = button.textContent;

                try {
                    button.disabled = true;
                    button.textContent = "Saving…";

                    const createdAt = new Date().toISOString();

                    const response = await fetch("/api/records", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + auth,
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({
                            title: "MILAN Quote",
                            data: {
                                kind: "quote",
                                text,
                                createdAt
                            },
                            dataFormat: "application/json",
                            accessMode,
                            sharedWithDids: [],
                            tags: ["quote"]
                        })
                    });

                    const saved = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        throw new Error(
                            saved.error ||
                            saved.detail ||
                            ("DWN write failed: HTTP " + response.status)
                        );
                    }

                    console.log("[MILAN] REAL DWN record created:", saved);

                    // Only clear AFTER the DWN write succeeded.
                    textarea.value = "";

                    // Immediate UI update from the actual returned record.
                    prependFeedRecord(saved, text);

                    button.textContent = "Saved ✓";

                    // Background consistency check with authoritative DWN/API feed.
                    setTimeout(() => {
                        loadFeedFromServer();
                    }, 1200);

                    setTimeout(() => {
                        button.textContent = original;
                        button.disabled = false;
                    }, 1200);

                } catch (error) {
                    console.error(
                        "[MILAN] Publish -> DWN -> Feed failed:",
                        error
                    );

                    button.textContent = original;
                    button.disabled = false;

                    alert(
                        "Post could not be saved to DWN.\n\n" +
                        (error.message || "Unknown error")
                    );
                }
            },
            true
        );

        console.log("[MILAN] AUTHORITATIVE DWN publisher installed.");
    }

    function start() {
        installPublisher();

        const observer = new MutationObserver(() => {
            const btn = document.getElementById("publishBtn");
            if (btn && btn.dataset.milanAuthoritative !== "1") {
                installPublisher();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        loadFeedFromServer();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();

/* =========================================================
   MILAN — PUBLISH BUTTON TEST
   Shows exactly what the user typed before DWN integration.
   ========================================================= */
(function () {
    "use strict";

    function bindPublishTest() {
        const oldBtn = document.getElementById("publishBtn");
        const textarea = document.getElementById("postText");

        if (!oldBtn || !textarea || oldBtn.dataset.publishTestBound === "1") {
            return;
        }

        const btn = oldBtn.cloneNode(true);
        oldBtn.replaceWith(btn);
        btn.dataset.publishTestBound = "1";

        btn.addEventListener("click", function () {
            const text = String(textarea.value || "").trim();

            if (!text) {
                alert("Please write something first.");
                textarea.focus();
                return;
            }

            alert(
                "MILAN Publish\n\n" +
                "Your text:\n\n" +
                text
            );
        });

        console.log("[MILAN] Publish button test handler active.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindPublishTest);
    } else {
        bindPublishTest();
    }
})();

/* =========================================================
   MILAN — LIVE FEED + IDENTITY STABILITY FIX
   1. Never show a false/blank profile identity during reload.
   2. Use the existing production social-feed endpoint first.
   3. Fall back to /api/records only when necessary.
   4. Retry transient feed failures instead of showing a
      permanent "Could not load your DWN feed" message.
   ========================================================= */
(function () {
    "use strict";

    const getToken = () =>
        localStorage.getItem("milan_token") ||
        localStorage.getItem("milanToken") ||
        "";

    /* ---------- Profile identity anti-flicker ---------- */
    function installIdentityGuard() {
        const styleId = "milan-identity-guard-style";

        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                #myName,
                #myEmail {
                    visibility: hidden;
                    opacity: 0;
                    transition: opacity .16s ease;
                }

                #myName.milan-identity-ready,
                #myEmail.milan-identity-ready {
                    visibility: visible;
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }

        const nameEl = document.getElementById("myName");
        const emailEl = document.getElementById("myEmail");

        if (!nameEl || !emailEl) return;

        nameEl.classList.remove("milan-identity-ready");
        emailEl.classList.remove("milan-identity-ready");

        const reveal = () => {
            const name = String(nameEl.textContent || "").trim();
            const email = String(emailEl.textContent || "").trim();

            if (
                name &&
                name !== "MILAN User" &&
                email &&
                email !== "Welcome to Milan"
            ) {
                nameEl.classList.add("milan-identity-ready");
                emailEl.classList.add("milan-identity-ready");
                return true;
            }

            return false;
        };

        if (reveal()) return;

        const observer = new MutationObserver(() => {
            if (reveal()) observer.disconnect();
        });

        observer.observe(nameEl, {
            childList: true,
            characterData: true,
            subtree: true
        });

        observer.observe(emailEl, {
            childList: true,
            characterData: true,
            subtree: true
        });

        // Authoritative identity fetch so the name does not depend only
        // on another script finishing at exactly the right moment.
        const auth = getToken();

        if (auth) {
            fetch("/api/auth/me", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + auth,
                    "Accept": "application/json"
                },
                cache: "no-store"
            })
                .then(async (response) => {
                    if (!response.ok) return null;
                    return response.json();
                })
                .then((me) => {
                    if (!me) return;

                    const profile = me.profile || {};
                    const name =
                        profile.display_name ||
                        profile.name ||
                        me.name ||
                        me.email?.split("@")[0] ||
                        "";

                    const email = me.email || "";

                    if (name) nameEl.textContent = name;
                    if (email) emailEl.textContent = email;

                    reveal();
                })
                .catch(() => {
                    // Existing boot/auth system remains authoritative.
                });
        }
    }

    /* ---------- Robust Home Feed ---------- */

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[m]);
    }

    function getRecordText(record) {
        const data = record?.data || {};

        return String(
            data.text ||
            data.caption ||
            record?.text ||
            record?.caption ||
            ""
        ).trim();
    }

    function getRecordDate(record) {
        return (
            record?.dateModified ||
            record?.dateCreated ||
            record?.createdAt ||
            new Date().toISOString()
        );
    }

    function normalizeFeedPayload(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.records)) return payload.records;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.entries)) return payload.entries;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.feed)) return payload.feed;
        return [];
    }

    async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
        let lastError = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    cache: "no-store"
                });

                const body = await response.json().catch(() => ({}));

                if (response.ok) {
                    return body;
                }

                const error = new Error(
                    body?.error ||
                    body?.detail ||
                    `HTTP ${response.status}`
                );

                error.status = response.status;

                // Retry only transient failures.
                if (
                    ![408, 425, 429, 500, 502, 503, 504, 530].includes(
                        response.status
                    )
                ) {
                    throw error;
                }

                lastError = error;
            } catch (error) {
                lastError = error;
            }

            if (attempt < attempts) {
                await new Promise((resolve) =>
                    setTimeout(resolve, 500 * attempt)
                );
            }
        }

        throw lastError || new Error("Feed request failed");
    }

    function renderStableFeed(records) {
        const list = document.getElementById("milanFeedList");
        if (!list) return;

        const clean = records
            .filter((record) =>
                getRecordText(record) || record?.title
            )
            .sort(
                (a, b) =>
                    new Date(getRecordDate(b)) -
                    new Date(getRecordDate(a))
            );

        if (!clean.length) {
            list.innerHTML = `
                <div class="milan-feed-empty">
                    No posts yet. Write your first quote above.
                </div>
            `;
            return;
        }

        list.innerHTML = clean.map((record) => {
            const text = escapeHtml(getRecordText(record))
                .replace(/\n/g, "<br>");

            const title = escapeHtml(
                record?.title || "MILAN Quote"
            );

            const date = new Date(getRecordDate(record));
            const when = Number.isNaN(date.getTime())
                ? "Just now"
                : date.toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                });

            const id = escapeHtml(
                record?.id ||
                record?.recordId ||
                record?.dwnRecordId ||
                ""
            );

            return `
                <article class="milan-feed-card" data-record-id="${id}">
                    <div class="milan-feed-card-head">
                        <div class="milan-feed-avatar">M</div>
                        <div class="milan-feed-meta">
                            <strong class="milan-feed-name">
                                ${escapeHtml(
                                    document.getElementById("myName")
                                        ?.textContent?.trim() ||
                                    "MILAN User"
                                )}
                            </strong>
                            <span>${escapeHtml(when)}</span>
                        </div>
                    </div>

                    <div class="milan-feed-body">
                        <h3>${title}</h3>
                        <p>${text}</p>
                    </div>

                    <div class="milan-feed-actions">
                        <button type="button">♡ Like</button>
                        <button type="button">💬 Comment</button>
                        <button type="button">↗ Share</button>
                        <button type="button">🔖 Save</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function loadStableHomeFeed() {
        const list = document.getElementById("milanFeedList");
        const auth = getToken();

        if (!list) return;

        if (!auth) {
            list.innerHTML = `
                <div class="milan-feed-empty">
                    Login required to load your feed.
                </div>
            `;
            return;
        }

        list.innerHTML = `
            <div class="milan-feed-loading">
                Loading your MILAN feed…
            </div>
        `;

        const headers = {
            "Authorization": "Bearer " + auth,
            "Accept": "application/json"
        };

        let records = [];

        try {
            /*
             * PRIMARY PATH:
             * This is the same production feed path already used by
             * MILAN's main boot/loadFeed() system.
             */
            const payload = await fetchJsonWithRetry(
                "/api/social/feed?scope=all",
                { headers },
                3
            );

            records = normalizeFeedPayload(payload);

        } catch (primaryError) {
            console.warn(
                "[MILAN] /social/feed failed, trying DWN records fallback:",
                primaryError.message
            );

            try {
                /*
                 * FALLBACK PATH:
                 * Direct DWN record listing.
                 */
                const payload = await fetchJsonWithRetry(
                    "/api/records",
                    { headers },
                    3
                );

                records = normalizeFeedPayload(payload);

            } catch (fallbackError) {
                console.error(
                    "[MILAN] Both feed paths failed:",
                    fallbackError
                );

                /*
                 * Never replace a working feed with a scary permanent
                 * error message. Keep the retry control lightweight.
                 */
                list.innerHTML = `
                    <div class="milan-feed-empty">
                        Feed is reconnecting…
                        <button type="button"
                                id="milanFeedRetryStable">
                            Retry
                        </button>
                    </div>
                `;

                document
                    .getElementById("milanFeedRetryStable")
                    ?.addEventListener(
                        "click",
                        loadStableHomeFeed,
                        { once: true }
                    );

                return;
            }
        }

        renderStableFeed(records);
    }

    function installFeedFix() {
        const list = document.getElementById("milanFeedList");

        if (!list) return;

        // Replace the old error-prone loader exposed globally.
        window.milanRefreshHomeFeed = loadStableHomeFeed;

        const refresh = document.getElementById("milanFeedRefresh");

        if (
            refresh &&
            refresh.dataset.stableFeedBound !== "1"
        ) {
            refresh.dataset.stableFeedBound = "1";
            refresh.addEventListener(
                "click",
                loadStableHomeFeed
            );
        }

        loadStableHomeFeed();
    }

    function start() {
        installIdentityGuard();
        installFeedFix();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
