# MILAN — Google Search Console Setup Guide (Step by Step)

**Site:** https://milanlife.in · **Stack:** Node/Express (static frontend) · **Updated:** July 2026

This guide is written for MILAN's actual setup — your real sitemaps, robots.txt, canonical rules, and the two "errors" Search Console is already showing. Do the steps in order; the whole thing takes ~20 minutes plus DNS propagation.

---

## TL;DR — do these 6 things

1. Add a **Domain property** (`milanlife.in`) — verified by **DNS TXT record**.
2. Submit **3 sitemaps**: `sitemap-index.xml`, `sitemap.xml`, `sitemap-keywords.xml`.
3. **URL-Inspect + Request Indexing** your money pages (home, /music, /decentralized-social-media).
4. Understand the two current notices — **both are benign** (www redirect + noindex on utility pages). No fix needed.
5. Set up the **Settings → Crawl stats** and **Page indexing** monitoring habit.
6. (Bonus) Add Bing Webmaster + IndexNow for faster discovery.

---

## Step 1 — Choose the right property type

Search Console offers two property types:

| Type | Covers | Verify by | Use when |
|------|--------|-----------|----------|
| **Domain property** ✅ recommended | `milanlife.in` + `www.` + `http`/`https` + all subdomains, all at once | **DNS TXT only** | You own the domain and want one complete view |
| URL-prefix property | Only the exact `https://milanlife.in/` (not www, not http) | HTML tag, file, GA, GTM, or DNS | Quick start / no DNS access |

**Pick Domain property.** Your server 301-redirects `www.milanlife.in → milanlife.in`, and a Domain property is the only type that captures both sides of that redirect in one place — so the "Page with redirect" data stays visible instead of splitting across properties.

> Go to https://search.google.com/search-console → property dropdown (top-left) → **Add property** → **Domain** → type `milanlife.in` (no `https://`, no `www`).

---

## Step 2 — Verify ownership via DNS TXT (Domain property)

1. After entering `milanlife.in`, GSC shows a **TXT record** like:
   `google-site-verification=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
2. Log in to wherever your DNS is managed (domain registrar or Cloudflare/Route53/etc. for `milanlife.in`).
3. Add a new record:
   - **Type:** `TXT`
   - **Name / Host:** `@` (the root — some panels want `milanlife.in` or leave blank)
   - **Value:** the full `google-site-verification=…` string
   - **TTL:** default (3600 / 1 hour)
4. Save, wait 5–30 min (sometimes up to a few hours) for propagation.
5. Back in GSC, click **Verify**.

**Verify propagation yourself** before clicking:
```bash
dig +short TXT milanlife.in        # look for the google-site-verification line
# or:  nslookup -type=TXT milanlife.in
```

> Keep the TXT record forever — deleting it un-verifies the property.

**Fallback (if you can't touch DNS right now):** add a URL-prefix property for `https://milanlife.in/` and verify with the **HTML meta tag** — paste it into `frontend/index.html` inside `<head>` (you already control that file), redeploy, then Verify. Switch to Domain property later.

---

## Step 3 — Submit your sitemaps

You already serve three sitemaps (confirmed in `robots.txt`). Submit all three so Google discovers every layer:

In GSC → **Sitemaps** (left menu) → enter each path → **Submit**:

```
sitemap-index.xml        ← master (points to the others)
sitemap.xml              ← core pages (home, /app, /music, /keywords, pillar pages)
sitemap-keywords.xml     ← long-tail keyword/topic pages
```

Enter just the path (GSC prepends `https://milanlife.in/`). Submitting `sitemap-index.xml` alone is technically enough, but submitting all three gives clearer per-file "Discovered / Indexed" counts.

**Expected status:** "Success" within a few hours; "Discovered URLs" fills in over days. If it says "Couldn't fetch," open `https://milanlife.in/sitemap.xml` in a browser to confirm it returns XML (yours does), then click the sitemap row → **Refresh**.

---

## Step 4 — Understand (don't "fix") the two current notices

Your screenshot showed two reasons. Both are **correct behavior for MILAN** — verify the affected URLs match the lists below, then leave them alone.

### "Page with redirect"
- **Cause:** `server.js` 301-redirects `www.milanlife.in/* → milanlife.in/*` to consolidate ranking signals. Google logs the `www.` (and any `http://`) URL as *"Page with redirect — not indexed,"* which is exactly what you want — the **non-www** version gets indexed instead.
- **Action:** None. Open the report, confirm the listed URLs are `www.` / `http://` variants or old aliases. Only investigate if a **real content URL** (e.g. `https://milanlife.in/music`) shows up here — that would mean a bad internal link or wrong canonical.

### "Excluded by 'noindex' tag"
- **Cause:** these 6 utility pages intentionally carry `<meta name="robots" content="noindex">`:
  `404.html`, `admin-users.html`, `launch.html`, `reset-password.html`, `settings.html`, `verify-email.html`.
- **Action:** None — login/settings/error pages should never be indexed. Confirm the excluded list contains **only** these. If a pillar/spoke page (from your content blueprint) ever appears here, that page accidentally has a `noindex` meta or an `X-Robots-Tag: noindex` header — remove it and re-inspect.

> Checked and clean: your server sets `X-Robots-Tag: all` (fully indexable) on SEO routes and **no** hidden `noindex` header anywhere. So content pages are safe.

---

## Step 5 — Index your money pages now (URL Inspection)

Don't wait for the crawl. Push your priority URLs manually:

1. Top **search bar** in GSC → paste a full URL → Enter.
2. Click **Test Live URL** (top-right) → confirms the page is crawlable and shows no rogue noindex/redirect.
3. Click **Request Indexing**.

Do these first (in order of value):
```
https://milanlife.in/                         (home / brand)
https://milanlife.in/music                     (traffic wedge)
https://milanlife.in/decentralized-social-media (pillar)
https://milanlife.in/what-is-web5
https://milanlife.in/social-media-privacy
https://milanlife.in/best-social-media-apps
https://milanlife.in/private-social-network
```

> **Limit:** ~10–12 Request-Indexing submissions per property per day. Do your highest-value URLs first; the rest get picked up from the sitemap anyway. Requesting again doesn't speed it up.

---

## Step 6 — Settings, monitoring & cadence

- **Settings → Ownership verification:** keep DNS TXT in place.
- **Settings → Crawl stats:** confirm Googlebot is fetching without spikes of 5xx/404.
- **Page indexing report:** check weekly. Healthy trajectory = "Indexed" climbing, "Not indexed" being only redirects + noindex utility pages.
- **Performance report:** after ~1–2 weeks, real queries appear. **This is gold** — the exact phrases bringing impressions are your next content targets (feeds directly into the cluster blueprint's L2 spokes and FAQ sections).
- **Refresh `lastmod`** in sitemaps whenever you update a page (your `changefreq`/`priority` are already set sensibly).

**Weekly 5-minute routine:** Performance (new queries) → Page indexing (new errors?) → Sitemaps (all "Success") → Request-index any new pillar/spoke pages you shipped.

---

## Step 7 (Bonus) — Faster discovery beyond Google

- **Bing Webmaster Tools** (bing.com/webmasters): "Import from GSC" copies your property + sitemaps in one click — powers Bing **and** ChatGPT/Copilot search.
- **IndexNow** (supported by Bing/Yandex): ping new URLs instantly. Your `robots.txt` already welcomes `GPTBot`, `PerplexityBot`, and `ClaudeBot`, so answer engines can crawl freely — IndexNow just speeds the ping.

---

## Quick reference

| Thing | Value |
|-------|-------|
| Property type | Domain: `milanlife.in` |
| Verification | DNS TXT (`google-site-verification=…`, Host `@`) |
| Sitemaps | `sitemap-index.xml`, `sitemap.xml`, `sitemap-keywords.xml` |
| Canonical host | non-www `https://milanlife.in` (301 from www) |
| Intentionally noindex | 404, admin-users, launch, reset-password, settings, verify-email |
| Blocked in robots | `/api/`, `/admin`, `/admin-users.html`, `/launch.html` |
| Request-index/day | ~10–12 URLs |

*Both current GSC notices are expected behavior — verify the affected URLs, then focus energy on Performance-report queries and shipping the content clusters.*
