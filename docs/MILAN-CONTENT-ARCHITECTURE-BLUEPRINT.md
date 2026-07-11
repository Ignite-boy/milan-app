# MILAN — Content Architecture Blueprint

**Core Topic / Niche:** Decentralized, privacy-first social media (Web5 / DWN + DID), with a *free music* traffic wedge, India-wide geo.
**Site:** milanlife.in · **Founder:** Nitesh Pandey · **Version:** 2026 semantic build

> Engineered to satisfy three retrieval systems at once: Google's ranking/knowledge-graph pipeline (classic + entity SEO), LLM answer engines (GEO / AEO), and vector/GraphRAG ingestion. Grounded in current 2026 practice (CMU GEO framework, recursive 512-token chunking, metadata-enriched retrieval).

---

## How the three engines actually rank you (the "Google's own SEO" reality)

Google no longer ranks *pages* — it ranks **entities and their relationships** inside the Knowledge Graph, then scores documents on **E-E-A-T** (Experience, Expertise, Authoritativeness, Trust) and Helpful-Content signals. Three consumers now read your content:

- **Classic crawler (Googlebot):** parses HTML, follows internal links, weighs anchor text, extracts schema. Rewards clean hierarchy, no cannibalization, fast render.
- **Answer engines (Gemini, ChatGPT, Perplexity, Copilot):** extract *passages*, not pages. They cite the 2–7 sources that best answer a prompt. Per CMU's GEO research, citation probability rises with **definitional opening sentences, high entity/stat density, and structured markup (FAQ/HowTo)**. Cross-platform presence (4+ surfaces) makes you 2.8× more likely to be recommended.
- **Vector / GraphRAG retrievers:** embed 400–512-token chunks and traverse an entity graph. Retrieval quality depends more on **chunking + metadata** than on the database itself — metadata enrichment alone lifts QA accuracy from ~55% to ~73%.

The blueprint below writes *once* for all three.

---

# Layer 1 — Core Entity Mapping (Ontology Blueprint)

### The Core Node

**`MILAN`** — *a decentralized, privacy-first social network built on Web5 primitives (DWN + DID) where the user owns their data.* This is the top-level entity; every URL, schema block, and vector chunk must resolve back to it via `sameAs` (Wikidata/Crunchbase/social profiles) and a single canonical `Organization` node.

### L1 Entities (Pillars) — 4 non-overlapping macro-categories

| Pillar | Entity meaning | Owns the intent of… |
|--------|----------------|---------------------|
| **P1 · Decentralized Social** | The category MILAN competes in (Web5 social, own-your-data) | brand + concept authority |
| **P2 · Privacy & Data Ownership** | The value proposition (no tracking, self-sovereign identity) | trust + differentiation |
| **P3 · Free Music** | The traffic wedge (search & play, no signup, no ads) | high-volume top-of-funnel |
| **P4 · Comparisons & Alternatives** | Decision layer (MILAN vs X, "alternative to Y") | commercial / conversion |

These four do not overlap: P1 = *what category*, P2 = *why it's safe*, P3 = *why you arrive*, P4 = *why you switch*.

### L2 Semantic Attributes (Spokes) — complete topical coverage

**P1 · Decentralized Social**
- What is Web5 (DWN + DID explained)
- Decentralized social media, defined (vs. centralized)
- How MILAN stores your data in your own node
- Web5 vs Web3 vs Web2
- Made-in-India decentralized social app

**P2 · Privacy & Data Ownership**
- How social media tracks you (and how MILAN doesn't)
- Self-sovereign identity / portable DID
- No ads, no tracking, no data selling — how it works
- Own your data: what "data ownership" actually means
- Social media privacy guide (practical steps)

**P3 · Free Music**
- Free Bollywood music app, no ads
- Play Hollywood / English songs online free, no signup
- Ad-free music streaming in India
- Free `[artist]` songs online (templated: Arijit Singh, etc.)
- Privacy-friendly music player, no tracking (bridge to P2)

**P4 · Comparisons & Alternatives**
- MILAN vs Mastodon
- MILAN vs Bluesky
- Facebook alternative — no ads, no tracking
- Instagram alternative for privacy (India)
- WhatsApp alternative (private social network)

---

# Layer 2 — Traditional SEO Clustering (Intent & SERP Alignment)

**URL grammar:** `/{pillar}/{spoke}` — hierarchy is preserved so both crawlers and vector rerankers can infer parent from path. Pillar hubs live at the short root alias; spokes nest beneath.

**Anti-cannibalization law:** *one page = one primary entity/query.* Never target the same head term on two URLs. Sibling spokes link laterally with **descriptive anchors** (never "click here"), and every spoke links **up** to its pillar and **across** to 2–3 siblings + the `/app` CTA.

### P1 · Decentralized Social → hub `/decentralized-social-media`

| Spoke URL | Primary query | Intent | Internal-link directive |
|-----------|---------------|--------|--------------------------|
| `/decentralized-social-media/what-is-web5` | what is web5 / web5 explained | Informational | ← hub; → `web5-vs-web3`, `own-your-node`; anchor "what Web5 is" |
| `/decentralized-social-media/what-it-is` | decentralized social media | Informational | canonical concept page; hub links here first |
| `/decentralized-social-media/own-your-node` | own your data social media app | Commercial | → P2 `data-ownership`; CTA `/app` |
| `/decentralized-social-media/web5-vs-web3` | web5 vs web3 | Informational | ← `what-is-web5` only (avoid dupe with hub) |
| `/decentralized-social-media/made-in-india` | made in india social media app | Navigational/Brand | → hub; geo-alias `/india` |

### P2 · Privacy & Data Ownership → hub `/privacy`

| Spoke URL | Primary query | Intent | Internal-link directive |
|-----------|---------------|--------|--------------------------|
| `/privacy/how-social-media-tracks-you` | how social media tracks you | Informational | → `data-ownership`; anchor "how tracking works" |
| `/privacy/self-sovereign-identity` | self-sovereign identity / DID | Informational | ← P1 `what-is-web5` (shared entity, distinct angle) |
| `/privacy/no-ads-no-tracking` | privacy first social network no tracking | Commercial | CTA `/app`; → P4 `facebook-alternative` |
| `/privacy/data-ownership` | own your data social media | Commercial | hub of the "ownership" concept; guard vs P1 `own-your-node` (P1 = product, P2 = concept) |
| `/privacy/social-media-privacy-guide` | social media privacy | Informational | linkable asset; → all P2 siblings |

### P3 · Free Music → hub `/music`

| Spoke URL | Primary query | Intent | Internal-link directive |
|-----------|---------------|--------|--------------------------|
| `/music/free-bollywood-no-ads` | free bollywood music app no ads | Transactional | CTA play; → `/privacy/no-ads-no-tracking` |
| `/music/play-free-no-signup` | play songs online free without signup | Transactional | → hub; bridge to P2 |
| `/music/ad-free-streaming-india` | ad free music streaming app india | Commercial | geo page; → hub |
| `/music/artist/[slug]` | free `[artist]` songs online | Transactional | **templated**, 1 page/artist; each → hub, never to each other (cannibalization guard) |
| `/music/privacy-friendly-player` | privacy friendly music app no tracking | Commercial | **bridge spoke** → P2 hub (funnel music → privacy story) |

### P4 · Comparisons & Alternatives → hub `/alternatives`

| Spoke URL | Primary query | Intent | Internal-link directive |
|-----------|---------------|--------|--------------------------|
| `/alternatives/milan-vs-mastodon` | milan vs mastodon | Commercial | ← hub; → `milan-vs-bluesky`; CTA `/app` |
| `/alternatives/milan-vs-bluesky` | milan vs bluesky | Commercial | ← hub; → `milan-vs-mastodon` |
| `/alternatives/facebook-alternative` | facebook alternative no ads no tracking | Commercial | → P2 `no-ads-no-tracking` |
| `/alternatives/instagram-alternative-india` | instagram alternative for privacy india | Commercial | geo; → hub |
| `/alternatives/whatsapp-alternative` | whatsapp alternative private social | Commercial | → P2 hub |

**Route aliases (extra coverage, no 301 chains):** `/web5`, `/privacy-guide`, `/whatsapp-alternative`, `/instagram-alternative`, `/best-social-media` → canonical to their spoke via `rel=canonical`, never duplicated content.

---

# Layer 3 — GEO Optimization Structure (LLM Readability)

Programmatic template every spoke page renders. Goal: maximize passage extraction + citation probability across answer engines.

### 3.1 Entity Definition block (first thing on the page)

The opening sentence is the single highest-leverage citation lever. Use the **Entity + Category + Differentiator** pattern, kept **under 80 words** so the whole block fits one extraction window:

```
MILAN is a decentralized, privacy-first social network (category) that runs on
Web5 Decentralized Web Nodes, so every user physically owns their data instead
of a company (differentiator). It has no ads, no tracking, and free music search.
```

Rules: subject-first, present tense, no marketing preamble before the definition, one verifiable fact in sentence two. Repeat the exact entity string (`MILAN`) rather than pronouns.

### 3.2 Data Densification (raise entity + stat density per paragraph)

Information density beats keyword density as a ranking/citation signal. Per section:

- **Bold the entity names** on first mention: **DWN**, **DID**, **Web5**, **self-sovereign identity**.
- Convert any 3+ item explanation into a **bulleted list**.
- Convert any comparison or spec into a **table** (answer engines lift tables verbatim).
- Insert **≥1 verifiable statistic or named entity per paragraph** (e.g., "856-city India geo coverage", "@web5/dids", "@tbd54566975/dwn-sdk-js").
- Front-load the answer: state the conclusion in sentence one, evidence after ("inverted pyramid").
- Add a **TL;DR / Key takeaways** box near the top (3–5 bullets) — highly extractable.

### 3.3 Schema.org markup (anchors the cluster in the Knowledge Graph)

| Page type | Required schema | Key properties |
|-----------|-----------------|----------------|
| Homepage / brand | `Organization` + `WebSite` | `name`, `url`, `logo`, `founder` (Nitesh Pandey), `sameAs[]`, `SearchAction` |
| App pages | `SoftwareApplication` | `applicationCategory: SocialNetworkingApplication`, `operatingSystem`, `offers` (free) |
| P1/P2 explainers | `TechArticle` + `FAQPage` | `about` (→ entity), `headline`, `author`, `datePublished`, `dateModified` |
| P3 music | `MusicPlaylist` / `WebApplication` + `FAQPage` | `genre`, `offers` free, `isAccessibleForFree: true` |
| P4 comparisons | `TechArticle` + `FAQPage` | `about[]` (both entities), comparison in `Table` |
| Every spoke | `BreadcrumbList` | reflects `/{pillar}/{spoke}` — feeds hierarchy to crawlers *and* rerankers |

Minimal `Organization` anchor (place once, sitewide):

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "MILAN",
  "url": "https://milanlife.in",
  "logo": "https://milanlife.in/logo.png",
  "founder": { "@type": "Person", "name": "Nitesh Pandey" },
  "description": "Decentralized, privacy-first social network on Web5 (DWN + DID) where you own your data. No ads, no tracking, free music.",
  "sameAs": [
    "https://www.crunchbase.com/organization/milan",
    "https://www.producthunt.com/products/milan",
    "https://en.wikipedia.org/wiki/..."
  ]
}
```

Every spoke's `FAQPage` should mirror the real "People Also Ask" questions for its query — those are the exact prompts answer engines resolve.

### 3.4 Off-page GEO (the part on-page can't fix)

Citations also depend on **brand search volume, training-data frequency, and cross-platform presence**. Ship the same entity definition to Reddit, Product Hunt, a Wikipedia/Wikidata entry, and a directory listing. Publish one **linkable original asset** — e.g., *"State of Social Media Privacy in India 2026"* survey — to raise authoritativeness and earn the backlinks that make everything else rank.

---

# Layer 4 — GraphRAG & Vector Readiness (Chunking Strategy)

Format so the same published HTML is ingestion-ready for a vector DB / GraphRAG pipeline with zero rewriting.

### 4.1 Logical chunk boundaries

- **Split at `H2`/`H3` semantic shifts**, then apply **recursive character splitting at 512 tokens with ~15% overlap (~75 tokens)** — the 2026 benchmark default (85–90% recall, low overhead).
- **Never split a definition, a table, or a list** across chunks. Keep each `FAQ` Q+A as one atomic chunk.
- Author each `H3` section to be **self-contained** (~350–500 tokens) so it answers standalone — this doubles as the passage answer engines cite.
- Prepend each chunk with a **breadcrumb context header** (`MILAN > Privacy > Data Ownership >`) so an isolated chunk still knows its lineage.

### 4.2 Metadata tags appended to every chunk

Metadata enrichment alone lifts retrieval QA accuracy ~55% → ~73%. Append:

```json
{
  "core_node": "MILAN",
  "parent_entity": "Privacy & Data Ownership",     // L1 pillar
  "child_concept": "data-ownership",               // L2 spoke
  "url": "/privacy/data-ownership",
  "canonical_entity": "self-sovereign identity",
  "audience_intent_level": "commercial",           // info | commercial | transactional | navigational
  "funnel_stage": "consideration",                 // awareness | consideration | decision
  "geo": "IN",
  "lang": "en",                                     // en | hi
  "content_type": "TechArticle",
  "last_modified": "2026-07-04",
  "sibling_spokes": ["how-social-media-tracks-you", "no-ads-no-tracking"],
  "cta_target": "/app"
}
```

The reranker uses `audience_intent_level` + `funnel_stage` to match query intent; `parent_entity`/`child_concept` let GraphRAG walk the hierarchy; `sibling_spokes` seeds graph edges.

### 4.3 Node-and-Edge logic (how a query traverses the graph)

Nodes = entities (Core, Pillars, Spokes). Edges = typed relations. A vector query resolves to the nearest **Spoke chunk**, then GraphRAG traverses *up* to the Core for authoritative context and *across* to siblings for completeness:

```
Query: "is there a social app where nobody sells my data?"
        │  (vector match on embedding)
        ▼
[L2 Spoke] data-ownership ──sameCluster──> [L2] no-ads-no-tracking
        │ child_of                                │ supports
        ▼                                         ▼
[L1 Pillar] Privacy & Data Ownership ──siblingPillar──> [L1] Decentralized Social
        │ part_of                                        │
        ▼                                                ▼
[Core Node] MILAN  <────────── converges_to ──────── all pillars
        │ offers
        ▼
[CTA] /app   (decision edge surfaced when funnel_stage = decision)
```

**Edge types to encode:** `part_of` (spoke→pillar→core), `sibling` (spoke↔spoke), `bridges_to` (music→privacy), `compares` (P4 spoke→competitor entity), `offers` (core→app/music), `sameAs` (core→external KG). Local Search answers entity-specific prompts from Spoke chunks + raw text; Global Search answers broad prompts ("what is MILAN?") from Pillar/Core community summaries.

---

## Implementation checklist (ship order)

1. Stand up the 4 pillar hubs + `Organization`/`BreadcrumbList` schema sitewide.
2. Publish P3 (music) spokes first — fastest to rank, highest volume — each with the entity-definition block + `FAQPage`.
3. Layer P1/P2 explainers with `TechArticle` + dense tables; wire internal links per Layer 2 rules.
4. Add P4 comparison spokes once 2–3 real competitor differences are verifiable.
5. Emit `llms.txt` + keep `dateModified` fresh; register entity on Wikidata/Crunchbase/Product Hunt for cross-platform GEO.
6. Export published HTML → 512-token chunks + metadata (Layer 4) into the vector store; verify Local + Global search return the right Spoke→Core path.

*One content system, three retrieval engines, zero rewrites.*
