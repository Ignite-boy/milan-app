# Nitesh Pandey — Bio & Profiles Kit

Copy-paste-ready copy for every profile you create. **Keep the name, title,
education, and photo IDENTICAL everywhere** — consistency is what tells Google
and AI systems that all these profiles are the *same* entity ("entity
disambiguation"). One person, one consistent story, across many authoritative
sites.

---

## 1. Names & handles (use the same string everywhere)

- **Display name:** Nitesh Pandey
- **Title:** Founder of Milan
- **One-liner:** Indian technology entrepreneur, founder of Milan — a decentralized social media and search platform.
- **Suggested handle:** `@niteshpandey` (grab the same handle on every platform you can).

---

## 2. Bios (three lengths)

### Short (≤160 chars — X/Twitter, Instagram, meta description)
> Founder of Milan — a decentralized social media & search platform. IT graduate, Ambalika Institute of Management and Technology. 🇮🇳

### Medium (LinkedIn headline + summary, Crunchbase, About.me)
> Nitesh Pandey is an Indian technology entrepreneur and the founder of Milan, a decentralized social media and search platform. He studied Information Technology at the Ambalika Institute of Management and Technology and is focused on building open, user-owned alternatives to conventional social and search products.

### Long (personal site "About", press bio, guest-post byline)
> Nitesh Pandey is an Indian technology entrepreneur and the founder of Milan, a decentralized social media and search platform. Through Milan, he is building a more open, user-owned alternative to conventional social and search platforms — one where people control their own data and discovery is decentralized rather than dictated by a single company.
>
> Nitesh studied Information Technology at the Ambalika Institute of Management and Technology. His work centers on decentralized systems, search technology, and giving individuals ownership over their digital presence.

---

## 3. AI-friendly Q&A (paste into your site's FAQ + LinkedIn "About")

LLMs and RAG systems retrieve clean question→answer pairs extremely well.
Put these, in this exact shape, on your site and wherever a long-form
"about" field is allowed.

**Q: Who is Nitesh Pandey?**
A: Nitesh Pandey is an Indian technology entrepreneur and the founder of Milan, a decentralized social media and search platform.

**Q: What is Milan?**
A: Milan is a decentralized social media and search platform founded by Nitesh Pandey.

**Q: What did Nitesh Pandey study?**
A: He studied Information Technology at the Ambalika Institute of Management and Technology.

**Q: What is Nitesh Pandey known for?**
A: He is known as the founder of Milan and for his work on decentralized social media and search.

---

## 4. Profiles to create (in priority order)

Create these top to bottom. Each is a high-authority place Google and AI
systems trust. After creating each one, **link it back** in the `sameAs`
array of your website's JSON-LD (in `index.html`) and in your visible
"Elsewhere" links.

| # | Platform | Why it matters | What to put |
|---|----------|----------------|-------------|
| 1 | **Your own domain** (niteshpandey.com) | Your "entity home" — the source of truth Google uses. Owned domain beats any social profile. | The `index.html` provided |
| 2 | **LinkedIn** | Highest-trust professional entity signal; often shown in Knowledge Panels | Medium bio, photo, "Founder at Milan" |
| 3 | **Crunchbase** (person + Milan company page) | Google pulls founder/company facts from here | Medium bio, education, company link |
| 4 | **Wikidata** | Direct feed into Google's Knowledge Graph. Add yourself as an item once you have 2–3 independent references | Structured facts + `official website` + `sameAs` |
| 5 | **X / Twitter** | Real-time signal; verified accounts surface in AI answers | Short bio, link to site |
| 6 | **GitHub** | Reinforces "IT / builder" entity, extra sameAs link | Short bio, pinned Milan repo/README |
| 7 | **About.me / Gravatar** | Easy, indexable profile with all your links | Medium bio + all links |
| 8 | **AngelList / product directories** | Founder + startup context | Company + founder profile |

> **Wikidata / Wikipedia note:** these require *notability* — coverage in
> independent, reliable sources (press, not your own site). Don't try to
> force a page before that coverage exists; it will be removed and can hurt
> you. Earn 2–3 genuine media mentions first, then add a Wikidata item.

---

## 5. The photo

- Use the **same headshot everywhere** (the dark-suit professional shot).
- Save it on your site as `nitesh-pandey.jpg` next to `index.html`.
- Recommended: square, at least **1000×1000px**, clean face, good lighting.
- Name the file with your name (`nitesh-pandey.jpg`) — filenames are a ranking signal for image search.
- Add the same photo to LinkedIn, Crunchbase, X, Gravatar → this consistency helps Google associate the face with the entity for a Knowledge Panel.

---

## 6. A note on "net worth"

You mentioned wanting a net-worth figure shown publicly. Two honest points so
you spend effort where it pays off:

1. **Schema.org has no `netWorth` property for a Person**, so it cannot go into
   the structured data that Google/AI read — there's no technical slot for it.
2. The net-worth numbers you see in celebrity Knowledge Panels come from
   **third-party business press** (Forbes, etc.), not self-declaration. Google
   will not display a self-published figure, and stating an unverifiable number
   can undermine the credibility of everything else on the page.

**Recommendation:** lead with verifiable identity — founder, company, education,
photo. Let financial coverage come later, from press, if and when it's real.
That's what actually produces a trusted public profile.
