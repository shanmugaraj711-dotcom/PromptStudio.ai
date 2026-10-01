# PromptStudio — Growth & Revenue Plan

*Written 1 October 2026, alongside the Prompt Doctor release.*

## 1. Why it wasn't getting noticed

| Problem | Effect |
|---|---|
| **Too many products on the first screen.** Prompt optimizer, Image → Prompt, Reference Coding, Studio, App Forge, WhatsApp. | A visitor can't say what PromptStudio does in 5 seconds, so they leave. |
| **The core promise was a commodity.** "Better prompts" is something ChatGPT does for free if you ask it. | No reason to come back, nothing to tell a friend. |
| **The working demo was the 4th section down.** The hero showed a static, fake before/after. | Most visitors never tried the product. |
| **Nothing to share.** The free result was a block of text with a Copy button. | Zero word-of-mouth loop. |
| **One indexable page and a 20-line README.** | No search traffic and no GitHub credibility. |

## 2. The new positioning

> **Bad prompt in. Great answer out.**
> Paste any prompt → get a score out of 100 → see what's missing → get the fixed version.

- **Prompt Doctor is the free front door** (traffic and virality). The score is the hook: people *love* being graded, and a number is something you can share ("mine was 23 😬").
- **Image → Prompt is the paid core.** It is the feature people pay credits for (see `PHASE-4-MONETIZATION.md`).
- **Studio and App Forge are the high-ticket upsell**, not the headline.

**Primary audience (India-first, works globally):** students, job seekers, small-business owners, creators and indie developers. These are people who use ChatGPT every day and know their answers are "meh".

## 3. What shipped in this release

1. **Prompt Doctor in the hero.** A 0–100 score, a 5-dimension breakdown, a "biggest gap" tip, a list of fixes, highlighted `[placeholders]`, one-click "Open in ChatGPT/Claude/Gemini/Grok", and **WhatsApp / X / LinkedIn score sharing** with UTM tags.
2. **`/api/v1/optimize` report fields** (`optimized_score`, `breakdown`, `improvements`), backward compatible.
3. **`/prompts` Prompt Library.** 24 original prompts across 6 audiences, searchable, each one sent to Prompt Doctor in one click. Indexable, and in the sitemap.
4. **Faster first load.** Route-level code splitting takes the landing page from ~460 kB to ~190 kB gzipped, with a stale-chunk auto-reload after deploys.
5. **Social preview card** (`public/og-image.png`), so every shared link shows the 18 → 89 visual.
6. **Fixed sticky header** on public pages, new SEO meta, a sitemap entry, and a full README.

## 4. 30-day distribution plan

### Week 1 — Instrument and soft launch
- [ ] Deploy and confirm `/api/v1/optimize` returns `breakdown` in production (`curl` example in the README).
- [ ] Submit `sitemap.xml` in **Google Search Console** and **Bing Webmaster Tools**.
- [ ] Add funnel analytics (Vercel Analytics or PostHog): `doctor_check`, `doctor_share_click`, `doctor_limit_hit`, `signup`, `first_generation`, `first_payment`. Tag the share-click buttons with `data-event` attributes.
- [ ] Watch provider cost per check in Admin, and raise `publicOptimizer.dailyIpLimit` from 2 to 3 if costs allow. A second free check is where people get hooked.
- [ ] Share in your own WhatsApp groups and with college friends. Ask for one thing only: *"What score did you get?"*

### Week 2 — The content engine ("Prompt Roast")
The format that spreads: **a bad prompt → its score → the fixed prompt → the two AI answers side by side.** It takes 30–45 seconds, works best in Hinglish, and costs nothing to make.
- [ ] 1 Reel/Short a day across Instagram, YouTube Shorts and LinkedIn. Topics: resume, interview, Instagram captions, exam notes, Midjourney logos.
- [ ] End card: "What does *your* prompt score? promptstudioai.in"
- [ ] Repurpose each one into an X thread and a LinkedIn post (see the "Repurpose one piece into five" prompt in the library).

### Week 3 — Launch moments
- [ ] **Product Hunt** (Tuesday–Thursday, 12:01 AM PT). Tagline below.
- [ ] **Show HN**: frame it as a technical story (rubric scoring, provider fallback, no-invented-facts placeholders).
- [ ] Reddit: r/ChatGPT, r/PromptEngineering, r/SideProject, r/developersIndia. Lead with value (the rubric and 3 free prompts), not the link. Follow each sub's self-promo rules.
- [ ] **Custom GPT on the GPT Store** that calls `/api/v1/optimize`. The API was designed to be GPT-Action-ready (`docs/API-V1.md`), so this is free distribution inside ChatGPT itself.

### Week 4 — Compounding channels
- [ ] **Campus ambassadors**: 10 students, using the existing referral rewards. Give each one a unique `?ref=` code.
- [ ] **SEO pages**: turn library entries into `/prompts/:slug` pages that target searches like "chatgpt prompt for resume", "image to prompt" and "midjourney logo prompt". Add 5 prompts a week, and Hindi versions.
- [ ] Start the **Chrome extension**: a "Score this prompt" button inside ChatGPT, Claude and Gemini. This is the single biggest long-term distribution lever, because it lives where the user already is.

## 5. How the business makes money

Be honest about this: **prompt tools on their own rarely become big businesses.** The free tool brings traffic; the money comes from outcomes.

| Stream | Price | Who pays | Status |
|---|---|---|---|
| Creator Credits | ₹49 / ₹99 one-time | Image → Prompt heavy users | Live |
| Pro | ₹79/mo, ₹499/yr | Daily users | Live |
| **International Pro** | $5/mo, $39/yr | Non-INR visitors (Razorpay supports international cards) | **Add** — same product, about 5× the revenue per user |
| **Premium prompt packs** | ₹99–₹299 each | Exam aspirants, real-estate agents, shop owners, YouTubers | **Add** — 50 tested prompts + a mini-guide per niche |
| **Done-for-you websites (Studio)** | ₹2,999–₹9,999 | Local businesses with no website | **Highest-value**: Studio already generates and delivers sites |
| **Android app for a business (App Forge)** | ₹4,999+ | Shops, coaching centres, clinics | Upsell to website buyers |
| **Optimizer API keys** | ₹999+/mo | Startups embedding prompt quality checks | Build on `/api/v1/optimize` |
| **Team plan** | ₹299/seat/mo | Agencies and marketing teams sharing a prompt library | Later |

**The fastest path to first meaningful revenue:** use Prompt Doctor content to build an audience of small-business owners, then sell them a Studio website. Ten websites at ₹4,999 is ₹50k, more than ~630 Pro subscriptions a month.

**Unit economics to watch:** check the provider cost per check and per generation in Admin. Aim for credits priced so gross margin stays above 80%, which flash-tier models usually allow.

## 6. Metrics that matter

| Funnel step | Target to aim for |
|---|---|
| Landing visitor → runs a Prompt Doctor check | 25%+ |
| Check → clicks share | 5%+ |
| Check → hits the free limit | measure; this is purchase intent |
| Limit hit → signup | 15%+ |
| Signup → first Image → Prompt | 30%+ |
| Signup → first payment within 30 days | 2–4% |

Review these weekly. If check-rate is low, the hero copy is wrong. If share-rate is low, the score is not surprising enough. If signup-after-limit is low, the paywall message is wrong.

## 7. Product focus — say no to more features

- Freeze new features for 4 weeks. Polish Prompt Doctor → signup → Image → Prompt → payment.
- Put App Forge behind "Beta" until builds are reliable. A broken demo costs more trust than a missing one.
- Finish the open items in `PRELAUNCH-AUDIT-20260830.md`: production smoke test and WhatsApp E2E.

## 8. Ready-to-use launch copy

**Product Hunt tagline (60 chars):**
`Score your AI prompt out of 100 — then get the fixed version`

**Product Hunt description:**
> Most bad AI answers come from bad prompts. PromptStudio's free Prompt Doctor grades any prompt on 5 dimensions (goal, context, specificity, format, constraints), shows exactly where it lost points, and rewrites it for ChatGPT, Claude, Gemini, Grok or Midjourney — without inventing facts about you. No sign-up. Plus Image → Prompt, a free prompt library and more.

**Show HN title:**
`Show HN: Prompt Doctor – grades your AI prompt on a 5-part rubric and fixes it`

**LinkedIn post:**
> I graded 50 prompts my friends use with ChatGPT every day. The average score was 31/100.
> The problem is never the AI. It's that we skip 5 things: a clear goal, context, specifics, an output format and constraints.
> So I built a free tool that scores any prompt and shows exactly what's missing → promptstudioai.in
> What does yours score? Drop it in the comments 👇

*(Only post the "50 prompts / 31 average" line after you have actually run that test. Run it — it's a great post.)*

**WhatsApp message:**
> Try this 😄 Paste any prompt you use with ChatGPT and it gives it a score out of 100 + fixes it. Mine was 23 😬 → promptstudioai.in

**Reddit (r/ChatGPT) post title:**
`I made a rubric for grading prompts (5 dimensions, 20 pts each) — here's what most prompts miss`
