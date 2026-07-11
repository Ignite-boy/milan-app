# MILAN — Complete Google Search Console Kit · milanlife.in

Generated **2026-07-06** from the **live server routes** (`milan-app/backend/server.js`) + deployed sitemaps.

- **Canonical host:** `https://milanlife.in` (non-www, https).
- **In GSC use a _Domain_ property** (`milanlife.in`) — it covers http/https + www/non-www automatically, so you don't chase redirect variants.
- HTML-file verification is already present: `/google9928e17b30912a08.html`.

---

## 1) SITEMAPS — submit under GSC ▸ Sitemaps

Enter just the **path** (GSC prepends `https://milanlife.in/`):

```
sitemap-index.xml
sitemap.xml
sitemap-keywords.xml
sitemap-cities.xml
```

Full URLs (if it wants the whole URL):

```
https://milanlife.in/sitemap-index.xml
https://milanlife.in/sitemap.xml
https://milanlife.in/sitemap-keywords.xml
https://milanlife.in/sitemap-cities.xml
```

`sitemap-index.xml` is the **master** — the live server builds it dynamically and it already lists the other three (verified in `server.js` lines 606–624). Submitting only the index is enough; submitting all four just gives you per-file coverage stats in GSC.

---

## 2) CORE PAGES — canonical, indexable

```
https://milanlife.in/
https://milanlife.in/app
https://milanlife.in/music
https://milanlife.in/keywords
https://milanlife.in/decentralized-social-media
https://milanlife.in/private-social-network
https://milanlife.in/about
https://milanlife.in/privacy
https://milanlife.in/terms
https://milanlife.in/best-social-media-apps
https://milanlife.in/what-is-web5
https://milanlife.in/social-media-privacy
https://milanlife.in/cookie-policy
https://milanlife.in/disclaimer
```

The first 12 are in `sitemap.xml`. `cookie-policy` and `disclaimer` are served and indexable (no `noindex`) but are **not** currently in the sitemap — add them if you want them counted there.

---

## 3) CITY HUB PAGES — in `sitemap-cities.xml` (self-canonical local pages)

```
https://milanlife.in/decentralized-social-media/mumbai
https://milanlife.in/decentralized-social-media/delhi
https://milanlife.in/decentralized-social-media/bengaluru
https://milanlife.in/decentralized-social-media/hyderabad
https://milanlife.in/decentralized-social-media/chennai
https://milanlife.in/decentralized-social-media/kolkata
https://milanlife.in/decentralized-social-media/pune
https://milanlife.in/decentralized-social-media/jaipur
```

---

## 4) SEO ALIAS ROUTES — all return 200, canonical → their pillar page

Extra keyword coverage. Inspect after the core pages; confirm each shows the pillar as its Google-selected canonical.

**→ canonical `/decentralized-social-media`:**
```
https://milanlife.in/decentralized-social-network
https://milanlife.in/own-your-data
https://milanlife.in/own-your-data-social-media
https://milanlife.in/data-ownership-social-network
https://milanlife.in/web5-social-network
```

**→ canonical `/private-social-network`:**
```
https://milanlife.in/whatsapp-alternative
https://milanlife.in/instagram-alternative
https://milanlife.in/facebook-alternative
https://milanlife.in/no-tracking-social-app
https://milanlife.in/ad-free-social-network
https://milanlife.in/private-social-app-india
```

**→ canonical `/what-is-web5`:**
```
https://milanlife.in/web5
https://milanlife.in/web5-explained
https://milanlife.in/dwn-did-explained
```

**→ canonical `/best-social-media-apps`:**
```
https://milanlife.in/best-social-media
https://milanlife.in/best-privacy-social-apps
https://milanlife.in/best-social-media-app-2026
```

**→ canonical `/social-media-privacy`:**
```
https://milanlife.in/privacy-guide
https://milanlife.in/self-sovereign-identity
https://milanlife.in/social-media-data-privacy
https://milanlife.in/stop-social-media-tracking
```

**→ other aliases:**
```
https://milanlife.in/milan-music     (→ /music)
https://milanlife.in/cookies         (→ /cookie-policy)
https://milanlife.in/topics          (→ /keywords)
```

---

## 5) AI / GEO & SYSTEM FILES — confirm they return 200 (not for indexing)

```
https://milanlife.in/llms.txt
https://milanlife.in/ai-info            (also /ai-info.json)
https://milanlife.in/robots.txt
https://milanlife.in/sitemap.xml
https://milanlife.in/sitemap-index.xml
https://milanlife.in/sitemap-keywords.xml
https://milanlife.in/sitemap-cities.xml
https://milanlife.in/google9928e17b30912a08.html   (GSC verification file)
https://milanlife.in/health             (also /api/health)
```

---

## 6) DO NOT REQUEST INDEXING — noindex / disallowed / utility

If GSC lists these as "Excluded", that's **correct** — don't spend your daily Request-Indexing quota on them.

```
https://milanlife.in/404.html
https://milanlife.in/offline.html          (PWA offline shell)
https://milanlife.in/launch.html
https://milanlife.in/admin-users
https://milanlife.in/settings              (also /account/settings)
https://milanlife.in/verify-email          (also /verify)
https://milanlife.in/reset-password        (also /forgot-password)
```

Blocked in `robots.txt` (Disallow): `/api/`, `/admin`, `/admin-users.html`, `/launch.html`

---

## 7) REDIRECTS — expected "Page with redirect" in GSC (don't index)

```
http://milanlife.in/        → https://milanlife.in/
https://www.milanlife.in/   → https://milanlife.in/
```

---

## 8) Suggested workflow

1. **Add the Domain property** `milanlife.in` (DNS TXT) if not already — cleaner than a URL-prefix property.
2. **Submit the 4 sitemaps** (Section 1).
3. **Request Indexing** (URL Inspection ▸ Test Live ▸ Request Indexing) for the highest-value pages first — limit ~10–12/day:
   `/` · `/music` · `/decentralized-social-media` · `/what-is-web5` · `/social-media-privacy` · `/best-social-media-apps` · `/private-social-network` · `/keywords`
4. **Next day:** the 8 city pages + a few aliases (Section 4).
5. Let the rest be discovered from the sitemaps. After ~3–7 days, cross-check GSC "Discovered/Indexed" against these lists.

---

## 9) Two things worth fixing (optional — say the word and I'll do them)

1. **Stale static files.** `frontend/sitemap-index.xml` and `frontend/robots.txt` on disk are older and **omit `sitemap-cities.xml`**. Your **live** site is fine because the Node server generates correct versions at request time — but if anything ever serves the static files directly (e.g., an Apache fallback), the city sitemap would be missed. I can refresh the two static files to match the live output.
2. **`sitemap-keywords.xml` is mostly fragments.** It has 23 entries, but 22 are `/keywords#anchor` links to sections of the *same* page. Google collapses `#fragments` to the base URL `/keywords`, so they won't be indexed as separate pages. Harmless, but don't expect 23 indexed URLs from it. If you want those topics indexed individually, they'd need to become real pages (e.g., `/topics/social-network`).
