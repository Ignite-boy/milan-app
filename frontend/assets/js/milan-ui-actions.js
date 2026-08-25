(function () {
    "use strict";

    /* =========================================================
       MILAN — SINGLE AUTHORITATIVE HOME UI CONTROLLER
       One navigation layer
       One composer layer
       One feed loader
       One publish handler
       No duplicate listeners
       No alert boxes
       ========================================================= */

    const state = {
        pendingPosts: new Map(),
        feedLoading: false
    };

    const $ = (id) => document.getElementById(id);

    function getToken() {
        return (
            localStorage.getItem("milan_token") ||
            localStorage.getItem("milanToken") ||
            ""
        );
    }

    function go(url) {
        window.location.href = url;
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

    function getRecordId(record) {
        return String(
            record?.id ||
            record?.recordId ||
            record?.dwnRecordId ||
            ""
        );
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

    function getRecordTitle(record) {
        return String(
            record?.title ||
            record?.data?.title ||
            "MILAN Quote"
        ).trim();
    }

    function normalizeRecords(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.records)) return payload.records;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.entries)) return payload.entries;
        if (Array.isArray(payload?.feed)) return payload.feed;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
    }

    function showPublishStatus(message, isError = false) {
        let el = $("milanPublishStatus");

        if (!el) {
            el = document.createElement("div");
            el.id = "milanPublishStatus";
            el.style.cssText =
                "margin-top:8px;" +
                "min-height:18px;" +
                "font-size:12px;" +
                "text-align:right;" +
                "color:#94a3b8;";

            document
                .querySelector(".composer-bottom")
                ?.appendChild(el);
        }

        el.textContent = message || "";
        el.style.color = isError ? "#fca5a5" : "#94a3b8";
    }

    /* =========================================================
       PROFILE IDENTITY — anti-flicker
       ========================================================= */

    function initIdentityGuard() {
        const nameEl = $("myName");
        const emailEl = $("myEmail");

        if (!nameEl || !emailEl) return;

        const styleId = "milan-identity-guard";

        if (!$(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                #myName,
                #myEmail {
                    visibility:hidden;
                    opacity:0;
                    transition:opacity .15s ease;
                }

                #myName.milan-ready,
                #myEmail.milan-ready {
                    visibility:visible;
                    opacity:1;
                }
            `;
            document.head.appendChild(style);
        }

        const reveal = () => {
            const name = String(nameEl.textContent || "").trim();
            const email = String(emailEl.textContent || "").trim();

            const validName =
                name &&
                name !== "MILAN User" &&
                name !== "Milan User";

            const validEmail =
                email &&
                email !== "Welcome to Milan";

            if (validName && validEmail) {
                nameEl.classList.add("milan-ready");
                emailEl.classList.add("milan-ready");
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
    }

    /* =========================================================
       NAVIGATION
       ========================================================= */

    function initNavigation() {
        const navButtons = Array.from(
            document.querySelectorAll(".nav button")
        );

        if (navButtons[0]) {
            navButtons[0].onclick = () => go("/app?view=home");
        }

        if (navButtons[1]) {
            navButtons[1].onclick = () => go("/app?view=mine");
        }

        if (navButtons[2]) {
            navButtons[2].onclick = () => go("/app?view=public");
        }

        if (navButtons[3]) {
            navButtons[3].onclick = () => go("/app?view=saved");
        }

        const editProfile = $("editProfileBtn");

        if (editProfile) {
            editProfile.onclick = () => go("/settings");
        }

        if (navButtons[8]) {
            navButtons[8].onclick = () => go("/privacy");
        }

        if (navButtons[9]) {
            navButtons[9].onclick = () => go("/app?view=ai");
        }

        const topActions = document.querySelectorAll(
            ".top-actions .icon-btn"
        );

        if (topActions[1]) {
            topActions[1].onclick = () => go("/chat");
        }

        if (topActions[2]) {
            topActions[2].onclick = () => go("/music");
        }

        if (topActions[3]) {
            topActions[3].onclick = () => {
                const light =
                    document.documentElement.dataset.milanTheme === "light";

                if (light) {
                    delete document.documentElement.dataset.milanTheme;
                    document.documentElement.style.colorScheme = "dark";
                    localStorage.setItem("milanTheme", "dark");
                } else {
                    document.documentElement.dataset.milanTheme = "light";
                    document.documentElement.style.colorScheme = "light";
                    localStorage.setItem("milanTheme", "light");
                }
            };

            const savedTheme =
                localStorage.getItem("milanTheme");

            if (savedTheme === "light") {
                document.documentElement.dataset.milanTheme = "light";
                document.documentElement.style.colorScheme = "light";
            }
        }

        if (topActions[4]) {
            topActions[4].onclick = () =>
                go("/app?view=notifications");
        }
    }

    /* =========================================================
       COMPOSER TOOLS
       ========================================================= */

    function initComposerTools() {
        const tools = Array.from(
            document.querySelectorAll(".composer-tools .tool")
        );

        if (tools[0]) {
            tools[0].onclick = () => {
                let input = $("composerImageInput");

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

        if (tools[1]) {
            tools[1].onclick = () => {
                let input = $("composerFileInput");

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

        if (tools[2]) {
            tools[2].onclick = () => {
                const text = $("postText");
                if (!text) return;

                const emoji = " 😊";
                const start = text.selectionStart ?? text.value.length;
                const end = text.selectionEnd ?? text.value.length;

                text.value =
                    text.value.slice(0, start) +
                    emoji +
                    text.value.slice(end);

                text.focus();
                text.selectionStart = text.selectionEnd =
                    start + emoji.length;
            };
        }

        if (tools[3]) {
            tools[3].onclick = () => {
                const privateNow =
                    tools[3].dataset.privacy !== "public";

                tools[3].dataset.privacy =
                    privateNow ? "public" : "private";

                tools[3].textContent =
                    privateNow ? "🌍" : "🔒";

                tools[3].title =
                    privateNow ? "Public post" : "Private post";
            };
        }
    }

    /* =========================================================
       FEED CARD
       ========================================================= */

    function feedCard(record) {
        const id = escapeHtml(getRecordId(record));
        const text = escapeHtml(getRecordText(record))
            .replace(/\n/g, "<br>");

        const title = escapeHtml(getRecordTitle(record));

        const date = new Date(getRecordDate(record));

        const when =
            Number.isNaN(date.getTime())
                ? "Just now"
                : date.toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                });

        const name =
            document
                .getElementById("myName")
                ?.textContent
                ?.trim() ||
            "Milan User";

        return `
            <article
                class="milan-feed-card"
                data-record-id="${id}"
            >
                <div class="milan-feed-card-head">
                    <div class="milan-feed-avatar">M</div>

                    <div class="milan-feed-meta">
                        <strong class="milan-feed-name">
                            ${escapeHtml(name)}
                        </strong>
                        <span>${escapeHtml(when)}</span>
                    </div>
                </div>

                <div class="milan-feed-body">
                    <h3>${title}</h3>
                    <p>${text}</p>
                </div>

                <div class="milan-feed-actions">
                    <button type="button"
                            data-feed-action="like">
                        ♡ Like
                    </button>

                    <button type="button"
                            data-feed-action="comment">
                        💬 Comment
                    </button>

                    <button type="button"
                            data-feed-action="share">
                        ↗ Share
                    </button>

                    <button type="button"
                            data-feed-action="save">
                        🔖 Save
                    </button>
                </div>
            </article>
        `;
    }

    function bindFeedActions() {
        document
            .querySelectorAll(".milan-feed-card")
            .forEach((card) => {
                card
                    .querySelectorAll("[data-feed-action]")
                    .forEach((button) => {
                        button.onclick = () => {
                            const action =
                                button.dataset.feedAction;

                            if (action === "like") {
                                button.classList.toggle("active");
                                button.textContent =
                                    button.classList.contains("active")
                                        ? "♥ Liked"
                                        : "♡ Like";
                            }

                            if (action === "comment") {
                                const value =
                                    prompt("Write a comment");

                                if (value?.trim()) {
                                    button.textContent =
                                        "💬 Commented";
                                }
                            }

                            if (action === "share") {
                                const shareUrl =
                                    window.location.origin + "/app";

                                navigator.clipboard
                                    ?.writeText(shareUrl)
                                    .then(() => {
                                        button.textContent = "✓ Copied";

                                        setTimeout(() => {
                                            button.textContent =
                                                "↗ Share";
                                        }, 1200);
                                    })
                                    .catch(() => {});
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

    /* =========================================================
       FEED MERGE
       IMPORTANT:
       Server refresh NEVER deletes a just-published local record
       unless the server actually returns that same record ID.
       ========================================================= */

    function mergeRecords(serverRecords) {
        const byId = new Map();

        for (const record of serverRecords || []) {
            const id = getRecordId(record);

            if (id) {
                byId.set(id, record);
            }
        }

        for (const [id, record] of state.pendingPosts) {
            if (!byId.has(id)) {
                byId.set(id, record);
            } else {
                state.pendingPosts.delete(id);
            }
        }

        return Array.from(byId.values())
            .filter((record) =>
                getRecordText(record) ||
                getRecordTitle(record)
            )
            .sort(
                (a, b) =>
                    new Date(getRecordDate(b)) -
                    new Date(getRecordDate(a))
            );
    }

    function renderFeed(records) {
        const list = $("milanFeedList");

        if (!list) return;

        if (!records.length) {
            list.innerHTML = `
                <div class="milan-feed-empty">
                    No posts yet. Write your first quote above.
                </div>
            `;
            return;
        }

        list.innerHTML =
            records.map(feedCard).join("");

        bindFeedActions();
    }

    async function loadFeed(options = {}) {
        const list = $("milanFeedList");

        if (!list || state.feedLoading) return;

        const auth = getToken();

        if (!auth) {
            list.innerHTML = `
                <div class="milan-feed-empty">
                    Login required to load your feed.
                </div>
            `;
            return;
        }

        state.feedLoading = true;

        const keepExisting =
            options.keepExisting === true;

        if (!keepExisting && !list.children.length) {
            list.innerHTML = `
                <div class="milan-feed-loading">
                    Loading your MILAN feed…
                </div>
            `;
        }

        try {
            const response = await fetch(
                "/api/records",
                {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + auth,
                        "Accept": "application/json"
                    },
                    cache: "no-store"
                }
            );

            const payload =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ||
                    payload.detail ||
                    `Feed failed: HTTP ${response.status}`
                );
            }

            const serverRecords =
                normalizeRecords(payload);

            const merged =
                mergeRecords(serverRecords);

            renderFeed(merged);

        } catch (error) {
            console.error(
                "[MILAN] Feed load failed:",
                error
            );

            /*
             * CRITICAL:
             * Never erase an already visible feed because
             * a background refresh failed.
             */
            if (!list.children.length) {
                list.innerHTML = `
                    <div class="milan-feed-empty">
                        Feed is reconnecting…
                        <button
                            type="button"
                            id="milanFeedRetry">
                            Retry
                        </button>
                    </div>
                `;

                $("milanFeedRetry")?.addEventListener(
                    "click",
                    () => loadFeed({ keepExisting: true }),
                    { once: true }
                );
            }
        } finally {
            state.feedLoading = false;
        }
    }

    /* =========================================================
       SINGLE PUBLISH HANDLER
       ========================================================= */

    async function publish() {
        const button = $("publishBtn");
        const textarea = $("postText");

        if (!button || !textarea) return;

        const text =
            String(textarea.value || "").trim();

        if (!text) {
            showPublishStatus(
                "Write something first.",
                true
            );
            textarea.focus();
            return;
        }

        const auth = getToken();

        if (!auth) {
            showPublishStatus(
                "Login session missing.",
                true
            );
            return;
        }

        const originalText =
            button.textContent;

        try {
            button.disabled = true;
            button.textContent = "Saving…";
            showPublishStatus("Saving to DWN…");

            const createdAt =
                new Date().toISOString();

            const response =
                await fetch(
                    "/api/records",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                            "Authorization":
                                "Bearer " + auth,
                            "Accept":
                                "application/json"
                        },
                        body: JSON.stringify({
                            title: "MILAN Quote",

                            data: {
                                kind: "quote",
                                text,
                                createdAt
                            },

                            dataFormat:
                                "application/json",

                            accessMode: "private",
                            sharedWithDids: [],
                            tags: ["quote"]
                        })
                    }
                );

            const saved =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    saved.error ||
                    saved.detail ||
                    `DWN write failed: HTTP ${response.status}`
                );
            }

            const savedId =
                getRecordId(saved);

            /*
             * IMPORTANT:
             * Put the actual server/DWN response into the
             * pending collection BEFORE rendering.
             */
            if (savedId) {
                state.pendingPosts.set(
                    savedId,
                    saved
                );
            }

            textarea.value = "";

            /*
             * Immediately render the real saved record.
             */
            const currentRecords =
                Array.from(
                    state.pendingPosts.values()
                );

            renderFeed(
                mergeRecords(currentRecords)
            );

            button.textContent =
                "Saved ✓";

            showPublishStatus(
                "Saved to DWN ✓"
            );

            /*
             * Background sync is allowed, but it uses mergeRecords().
             * Therefore it CANNOT make the newly published post vanish.
             */
            setTimeout(() => {
                loadFeed({
                    keepExisting: true
                });
            }, 1500);

            setTimeout(() => {
                button.textContent =
                    originalText;

                button.disabled = false;

                showPublishStatus("");
            }, 1400);

        } catch (error) {
            console.error(
                "[MILAN] Publish failed:",
                error
            );

            button.textContent =
                originalText;

            button.disabled = false;

            showPublishStatus(
                "Could not save: " +
                (error.message ||
                    "Unknown error"),
                true
            );
        }
    }

    function initPublish() {
        const button = $("publishBtn");

        if (!button) return;

        /*
         * Replace the button once so any old click
         * listeners from previous builds are removed.
         */
        const cleanButton =
            button.cloneNode(true);

        button.replaceWith(cleanButton);

        cleanButton.addEventListener(
            "click",
            publish
        );
    }

    /* =========================================================
       FOLLOW BUTTONS
       ========================================================= */

    function initFollowButtons() {
        document
            .querySelectorAll(".follow")
            .forEach((button) => {
                if (
                    button.dataset.milanFollowBound === "1"
                ) {
                    return;
                }

                button.dataset.milanFollowBound =
                    "1";

                button.addEventListener(
                    "click",
                    () => {
                        const person =
                            button
                                .closest(".person")
                                ?.querySelector(
                                    ".person-info b"
                                )
                                ?.textContent
                                ?.trim() ||
                            "user";

                        const following =
                            button.dataset.following ===
                            "true";

                        button.dataset.following =
                            following
                                ? "false"
                                : "true";

                        button.textContent =
                            following
                                ? "Follow"
                                : "Following";

                        localStorage.setItem(
                            "milan_follow_" +
                            person
                                .toLowerCase()
                                .replace(
                                    /\s+/g,
                                    "_"
                                ),
                            following
                                ? "false"
                                : "true"
                        );
                    }
                );
            });
    }

    /* =========================================================
       INIT
       ========================================================= */

    function init() {
        initIdentityGuard();
        initNavigation();
        initComposerTools();
        initPublish();
        initFollowButtons();

        /*
         * ONLY ONE initial feed load.
         */
        loadFeed();
    }

    window.milanRefreshHomeFeed =
        () => loadFeed({
            keepExisting: true
        });

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }

    console.log(
        "[MILAN] Single authoritative UI controller active."
    );
})();
