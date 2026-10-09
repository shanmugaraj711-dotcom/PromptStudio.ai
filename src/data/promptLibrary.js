/**
 * Public, curated prompt templates shown at /prompts and on the landing page.
 * Placeholders use [square brackets] so the Prompt Doctor UI can highlight what to fill in.
 * Keep entries original, practical and free of invented facts.
 */
export const LIBRARY_CATEGORIES = Object.freeze([
  { id: 'students', label: 'Students', icon: '🎓', blurb: 'Learn faster, revise smarter, write better.' },
  { id: 'career', label: 'Jobs & Career', icon: '💼', blurb: 'Resumes, interviews and salary talks.' },
  { id: 'business', label: 'Small Business', icon: '🏪', blurb: 'Marketing, customers and daily operations.' },
  { id: 'creators', label: 'Creators', icon: '🎬', blurb: 'YouTube, Reels, threads and newsletters.' },
  { id: 'coding', label: 'Coding', icon: '💻', blurb: 'Build, debug and review with AI pair-programmers.' },
  { id: 'images', label: 'AI Images', icon: '🖼️', blurb: 'Midjourney, DALL·E, Gemini and Flux prompts.' },
  { id: 'video', label: 'AI Video', icon: '🎥', blurb: 'Shot-by-shot prompts for Veo, Sora, Runway and Kling.' },
]);

export const PROMPT_LIBRARY = Object.freeze([
  // Students
  {
    id: 'explain-like-a-tutor',
    category: 'students',
    title: 'Explain any topic like a patient tutor',
    bestFor: 'ChatGPT · Claude · Gemini',
    prompt: `Act as a patient tutor for a [class/grade or level] student preparing for [exam name].
Explain [topic] in three passes:
1. A one-paragraph intuition using an everyday Indian example.
2. The formal explanation with key terms in bold and any formulas written out.
3. A worked example solved step by step.
Then give me 5 practice questions of increasing difficulty. Do not show the answers until I reply "answers".
Keep the language simple and avoid jargon unless you define it first.`,
  },
  {
    id: 'revision-plan',
    category: 'students',
    title: 'Realistic exam revision timetable',
    bestFor: 'ChatGPT · Claude',
    prompt: `Create a day-by-day revision plan for [exam name] starting [start date] with the exam on [exam date].
Subjects and my confidence (1-5): [subject: confidence, subject: confidence, ...].
I can study [hours] hours on weekdays and [hours] hours on weekends.
Rules: give weaker subjects more time, schedule a full mock test every [N] days, keep one light day per week, and leave the final 2 days for revision only.
Output a table with columns: Date | Session 1 | Session 2 | Session 3 | Goal for the day.`,
  },
  {
    id: 'essay-feedback',
    category: 'students',
    title: 'Honest essay feedback with a rubric',
    bestFor: 'Claude · ChatGPT',
    prompt: `You are a strict but encouraging examiner. Grade the essay below for [course/exam] out of [max marks].
Score separately: thesis clarity, structure, evidence, language, and conclusion.
For each, quote the weakest sentence and rewrite it better.
Finish with the 3 changes that would raise the grade the most. Do not rewrite the whole essay.

Essay:
[paste essay]`,
  },
  {
    id: 'notes-to-flashcards',
    category: 'students',
    title: 'Turn notes into flashcards',
    bestFor: 'ChatGPT · Gemini',
    prompt: `Convert my notes below into 20 flashcards for active recall.
Format each as "Q: ... | A: ..." on one line so I can import them into Anki.
Mix question types: definitions, "why" questions, comparisons, and one-step application problems.
Skip anything trivial and do not add facts that are not in my notes.

Notes:
[paste notes]`,
  },

  // Career
  {
    id: 'resume-bullets',
    category: 'career',
    title: 'Rewrite resume bullets with impact',
    bestFor: 'ChatGPT · Claude',
    prompt: `Rewrite my resume bullets for a [target role] position at a [company type, e.g. product startup].
Use the format: strong action verb + what I did + measurable result.
If a bullet has no number, keep it honest and add a [metric?] placeholder I can fill in instead of inventing one.
Keep each bullet under 25 words and match keywords from this job description: [paste JD].

My current bullets:
[paste bullets]`,
  },
  {
    id: 'mock-interview',
    category: 'career',
    title: 'Mock interview, one question at a time',
    bestFor: 'ChatGPT · Claude · Gemini',
    prompt: `Run a mock interview for a [role] position with [years] years of experience.
Ask one question at a time and wait for my answer.
Mix behavioural (STAR), technical ([skills]) and one curveball question — 8 questions total.
After each answer, give a score out of 10, one thing I did well, and one specific improvement.
At the end, summarise my top 3 weaknesses and how to fix them before the real interview.`,
  },
  {
    id: 'salary-negotiation',
    category: 'career',
    title: 'Salary negotiation script',
    bestFor: 'Claude · ChatGPT',
    prompt: `I received an offer for [role] at [company] of [offered CTC]. I want [target CTC].
My leverage: [competing offer / niche skill / current CTC / notice period].
Write a polite, confident email asking for the higher number, plus a short phone script with responses to these likely pushbacks: "this is our budget", "we pay to band", and "we need an answer today".
Keep the tone collaborative, never ultimatum-like.`,
  },
  {
    id: 'linkedin-about',
    category: 'career',
    title: 'LinkedIn "About" that gets recruiter replies',
    bestFor: 'ChatGPT · Claude',
    prompt: `Write a LinkedIn About section for me in first person, 150-200 words.
Who I am: [role, years of experience, domain].
Proof points: [2-3 achievements with numbers].
What I want next: [type of role or clients].
Tone: confident, specific, human — no buzzwords like "passionate", "synergy" or "results-driven".
End with one line telling people how to reach me about [topic].`,
  },

  // Small business
  {
    id: 'instagram-week',
    category: 'business',
    title: 'One week of Instagram posts for a local shop',
    bestFor: 'ChatGPT · Gemini',
    prompt: `Plan 7 Instagram posts for [business name], a [type of business] in [city] that sells [products/services] to [target customers].
For each day give: post format (Reel, carousel, or photo), the hook in the first line, the caption (under 80 words), 5 relevant local hashtags, and a simple shot idea I can film on a phone.
Include one offer post using [current offer], one behind-the-scenes post, and one customer-question post.
Write in [English/Hinglish/Hindi] in a warm, local tone.`,
  },
  {
    id: 'google-review-replies',
    category: 'business',
    title: 'Reply to Google reviews (good and bad)',
    bestFor: 'ChatGPT · Claude',
    prompt: `Write replies to the Google reviews below for [business name].
For positive reviews: thank them by name, mention the specific thing they liked, and invite them back — under 40 words.
For negative reviews: apologise without being defensive, acknowledge the specific issue, explain what we are doing about it, and offer to continue on [phone/email]. Never argue or reveal private details.

Reviews:
[paste reviews]`,
  },
  {
    id: 'whatsapp-broadcast',
    category: 'business',
    title: 'WhatsApp broadcast that does not feel like spam',
    bestFor: 'ChatGPT · Gemini',
    prompt: `Write 3 versions of a WhatsApp broadcast message for [business name] announcing [offer/news], valid until [date].
Rules: under 60 words, open with the customer's benefit not our name, one clear call to action ([reply/visit/link]), at most 2 emojis, and a short opt-out line at the end.
Version A: friendly. Version B: urgent. Version C: festive for [festival].`,
  },
  {
    id: 'pricing-sanity-check',
    category: 'business',
    title: 'Sanity-check my pricing',
    bestFor: 'Claude · ChatGPT',
    prompt: `Act as a pragmatic small-business advisor. Review my pricing.
Product/service: [description]. My cost per unit: [cost]. Current price: [price]. Competitor prices: [list].
Customers: [who they are and what they value].
Tell me: my margin, whether I am under- or over-priced and why, 3 pricing experiments I can run this month (for example bundles, tiers, or a minimum order), and the risk of each. Show your calculations.`,
  },

  // Creators
  {
    id: 'youtube-script',
    category: 'creators',
    title: 'YouTube video script with a strong hook',
    bestFor: 'Claude · ChatGPT',
    prompt: `Write a [length]-minute YouTube script about [topic] for [audience].
Structure: a hook in the first 15 seconds that opens a curiosity gap, a one-line promise of what they will learn, 3-5 sections each ending with a mini-cliffhanger, and a call to action that feels earned.
Mark B-roll ideas in [brackets] and on-screen text in {braces}.
Also give me 5 title options under 60 characters and 3 thumbnail text ideas of no more than 4 words each.`,
  },
  {
    id: 'reel-hooks',
    category: 'creators',
    title: '20 scroll-stopping Reel hooks',
    bestFor: 'ChatGPT · Grok',
    prompt: `Give me 20 hooks for Instagram Reels / YouTube Shorts about [niche] for [audience].
Use a mix of these patterns: bold claim, mistake callout, "I tried X for 30 days", myth vs fact, and a question.
Each hook must be under 12 words and make sense with the sound off.
Tag each with the pattern it uses, and star the 3 you think will perform best and say why.`,
  },
  {
    id: 'repurpose-content',
    category: 'creators',
    title: 'Repurpose one piece into five',
    bestFor: 'Claude · Gemini',
    prompt: `Repurpose the content below into:
1. An X/Twitter thread (6-8 posts).
2. A LinkedIn post (under 200 words, with a story opening).
3. 3 Instagram carousel slides (headline + 1-line body each).
4. A 45-second Shorts script.
5. A newsletter intro paragraph.
Keep my voice, keep the facts exactly as written, and adapt the format natively for each platform.

Content:
[paste content or transcript]`,
  },
  {
    id: 'brand-deal-pitch',
    category: 'creators',
    title: 'Brand collaboration pitch email',
    bestFor: 'ChatGPT · Claude',
    prompt: `Write a short pitch email from me to [brand] proposing a paid collaboration.
About me: [platform], [follower count], [average views], audience is [demographics].
Why this brand fits: [reason].
Propose 2 concrete content ideas and one package with deliverables and a price of [rate].
Keep it under 150 words, confident and specific, with a subject line that is not generic.`,
  },

  // Coding
  {
    id: 'feature-spec-to-code',
    category: 'coding',
    title: 'Turn a feature idea into a build plan',
    bestFor: 'Claude · Cursor · ChatGPT',
    prompt: `You are a senior engineer. I want to add [feature] to my [stack, e.g. React + Node + Postgres] app.
Before writing code:
1. Ask me up to 5 clarifying questions if anything important is ambiguous.
2. Propose the data model changes, API endpoints, and UI components.
3. List edge cases and failure states.
Then implement it in small, reviewable steps, with tests for the core logic. Do not change unrelated code.`,
  },
  {
    id: 'debug-error',
    category: 'coding',
    title: 'Debug an error methodically',
    bestFor: 'Claude · ChatGPT · Gemini',
    prompt: `Help me debug this. Do not guess — reason from the evidence.
Environment: [language/framework + versions, OS].
What I expected: [expected].
What happens: [actual].
Error and stack trace:
[paste error]
Relevant code:
[paste code]
Give me: the most likely root cause, how to confirm it, the minimal fix, and how to prevent it from happening again.`,
  },
  {
    id: 'code-review',
    category: 'coding',
    title: 'Senior-level code review',
    bestFor: 'Claude · ChatGPT',
    prompt: `Review the code below as a senior [language] engineer.
Prioritise, in order: correctness bugs, security issues, performance problems, then readability.
For each finding give: severity (high/medium/low), the line, why it matters, and a corrected snippet.
Skip style nitpicks that a linter would catch. If the code is good, say so briefly.

[paste code]`,
  },
  {
    id: 'landing-page-build',
    category: 'coding',
    title: 'Build a responsive landing page',
    bestFor: 'v0 · Lovable · Bolt · Claude',
    prompt: `Build a responsive landing page for [product], which helps [audience] to [outcome].
Sections: hero with headline and primary CTA, 3 benefit cards, how-it-works in 3 steps, testimonials placeholder, pricing with [N] tiers, FAQ, and footer.
Stack: [React + Tailwind / plain HTML + CSS].
Requirements: mobile-first, accessible (semantic HTML, focus states, alt text), fast (no heavy libraries), brand colour [hex].
Use clearly marked placeholder copy where I have not given you the facts.`,
  },

  // Images
  {
    id: 'product-photo',
    category: 'images',
    title: 'Premium product photo',
    bestFor: 'Midjourney · Gemini · DALL·E',
    prompt: `Professional studio product photograph of [product], centred on a [surface, e.g. matte stone plinth], soft key light from the left with a gentle rim light, subtle reflection, shallow depth of field, neutral [colour] background, crisp edges and accurate materials, commercial advertising style, 85mm lens, high detail --ar 4:5`,
  },
  {
    id: 'brand-logo',
    category: 'images',
    title: 'Clean, minimal logo concepts',
    bestFor: 'Midjourney · DALL·E',
    prompt: `Minimal flat vector logo for "[brand name]", a [type of business], combining [symbol idea] with [second idea], [1-2 colours] on a white background, simple geometric shapes, strong silhouette that works at small sizes, no gradients, no mockup, no extra text --style raw`,
  },
  {
    id: 'festival-poster',
    category: 'images',
    title: 'Festival sale poster',
    bestFor: 'Gemini · DALL·E · Ideogram',
    prompt: `Vibrant [festival, e.g. Diwali] sale poster for [business name], warm festive palette of [colours], [traditional motif, e.g. diyas and rangoli] framing the composition, large clear headline space at the top reading "[headline text]", product hero in the centre, clean modern layout, print-ready, portrait 4:5`,
  },
  {
    id: 'cinematic-portrait',
    category: 'images',
    title: 'Cinematic portrait',
    bestFor: 'Midjourney · Flux',
    prompt: `Cinematic portrait of [subject description], [setting], golden-hour side lighting with soft shadows, natural skin texture, shallow depth of field, 50mm lens, subtle film grain, muted teal-and-amber colour grade, candid expression, editorial magazine style --ar 3:4`,
  },
  {
    id: 'video-product-shot',
    category: 'video',
    title: 'Product hero shot in 6 seconds',
    bestFor: 'Veo · Sora · Runway · Kling',
    prompt: `A [product name] on [surface, e.g. a marble counter]. The camera slowly pushes in from a low angle over 6 seconds. Soft window light from the left, shallow depth of field, a few drifting dust motes. The product stays sharp and centred. Colour palette: [two or three colours]. Clean, premium look, no text or logos on screen.`,
  },
  {
    id: 'video-explainer-scene',
    category: 'video',
    title: 'Friendly explainer scene',
    bestFor: 'Veo · Kling',
    prompt: `A [character description] stands in [setting] and gestures toward [visual element] while explaining [one idea] to the camera. Medium shot, static camera, warm daylight. The character says: "[one short sentence]" in a calm, friendly voice. 8 seconds, vertical 9:16.`,
  },
  {
    id: 'video-three-shot-reel',
    category: 'video',
    title: 'Three-shot sequence for a 15-second reel',
    bestFor: 'Sora · Veo · Kling',
    prompt: `Create a 3-shot sequence for a 15-second vertical video about [topic].
Shot 1 (0-5s): [opening action], handheld close-up.
Shot 2 (5-10s): [middle action], slow tracking shot.
Shot 3 (10-15s): [closing action] ending on a clear final frame.
Keep the same [character or product] and colour grade across all three shots. No subtitles unless I ask for them.`,
  },
  {
    id: 'video-cinematic-mood',
    category: 'video',
    title: 'Cinematic mood clip',
    bestFor: 'Runway · Veo · Sora',
    prompt: `[Subject] in [location] at [time of day]. Camera: [movement, e.g. a slow dolly-in]. Lighting: [lighting style]. Mood: [mood]. Motion: [what moves and how fast]. Style: [film look, e.g. 35mm, muted colour]. 5 seconds, 16:9.`,
  },
]);

export const getLibraryCategory = (id) => LIBRARY_CATEGORIES.find((category) => category.id === id) || null;
