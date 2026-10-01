import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PRICING_PLANS } from '../../constants/pricingPlans';
import { MarketingFooter, MarketingHeader } from '../../components/layout/MarketingShell';
import { LIBRARY_CATEGORIES, PROMPT_LIBRARY } from '../../data/promptLibrary';
import PromptDoctor, { DIMENSIONS } from './PromptDoctor';

const MODELS = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'Midjourney', 'Cursor', 'Lovable', 'v0'];

const PRODUCTS = [
  { id: 'image', tag: 'Most loved', title: 'Image → Prompt', text: 'Upload any photo, poster or design. Get the exact prompt to recreate the style in Midjourney, Gemini or DALL·E.', to: '/builder?mode=image', action: 'Try with an image', accent: 'border-emerald-300/30 bg-emerald-300/[.05]', tagClass: 'bg-emerald-300 text-slate-950' },
  { id: 'builder', tag: '3 versions', title: 'Prompt Builder', text: 'Describe a rough idea and get a main prompt plus Faithful, Professional and Creative versions, saved to your history.', to: '/builder?mode=standard', action: 'Build a prompt', accent: 'border-white/10 bg-white/[.025]', tagClass: 'bg-white/10 text-slate-200' },
  { id: 'coding', tag: 'For builders', title: 'Reference Coding', text: 'Drop in screenshots of an app or site. Get a build-ready prompt for Cursor, Claude Code, Lovable, v0 or Bolt.', to: '/reference-coding', action: 'Turn UI into code', accent: 'border-sky-300/20 bg-sky-300/[.04]', tagClass: 'bg-sky-300/20 text-sky-100' },
  { id: 'forge', tag: 'New', title: 'Studio & App Forge', text: 'Go from idea to a live website preview or an installable Android app without leaving PromptStudio.', to: '/studio', action: 'Open Studio', accent: 'border-violet-300/25 bg-violet-300/[.05]', tagClass: 'bg-violet-300/25 text-violet-100' },
];

const BEFORE_AFTER = {
  before: 'make a marketing post for my restaurant',
  after: `Write 3 Instagram captions for [restaurant name], a family restaurant in [city] known for [signature dish].
Audience: local families and office-goers looking for weekend plans.
Goal: drive table bookings for this Saturday's [offer].
Each caption: a hook in the first line, under 60 words, a warm and friendly tone, one call to action ("Book on WhatsApp: [number]"), and 3-5 local hashtags.
Avoid generic phrases like "delicious food" — describe the dish instead.`,
};

const FAQ = [
  { q: 'Is Prompt Doctor really free?', a: 'Yes. You get 2 free prompt checks every day without an account. A free account adds 3 full generations a day, with 3 alternative versions, saved history and Image → Prompt.' },
  { q: 'Which AI tools does it work with?', a: 'Any of them. Prompt Doctor tunes the rewrite for ChatGPT, Claude, Gemini, Grok or Midjourney, and the result works anywhere you can paste text — including Cursor, Lovable, v0 and Bolt.' },
  { q: 'How is my prompt scored?', a: 'On five dimensions worth 20 points each: a clear goal, context, specificity, output format, and constraints & tone. The report shows where you lost points and exactly what was fixed.' },
  { q: 'Do you store what I paste?', a: 'Free Prompt Doctor checks are not saved to any account or history. Your text is sent to our AI provider to produce the result, and we keep only anonymous daily usage counts. See the Privacy Policy for details.' },
  { q: 'Why not just ask ChatGPT to improve my prompt?', a: 'You can — but you will not see what was weak, you will not learn the pattern, and it tends to invent details. Prompt Doctor grades against a fixed rubric, marks unknown facts as [placeholders] instead of making them up, and tunes the output for the AI you are using.' },
  { q: 'How do payments work?', a: 'Pro is ₹79/month or ₹499/year. Creator Credits are one-time packs that never expire. All payments go through Razorpay secure checkout.' },
];

const libraryHighlights = LIBRARY_CATEGORIES.map((category) => ({ category, item: PROMPT_LIBRARY.find((entry) => entry.category === category.id) })).filter(({ item }) => item);

function SectionTitle({ eyebrow, title, text, center = false }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[11px] font-black uppercase tracking-[.22em] text-emerald-300">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>}
    </div>
  );
}

function Landing() {
  const location = useLocation();
  const prefill = location.state?.doctorPrompt || '';
  const prefillTarget = location.state?.doctorTarget || 'ChatGPT';

  useEffect(() => { fetch('/api/public-visit', { cache: 'no-store', keepalive: true }).catch(() => {}); }, []);
  useEffect(() => {
    const id = prefill ? 'doctor' : location.hash.replace('#', '');
    if (!id) return undefined;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.key, prefill]);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#020608] text-white selection:bg-emerald-300 selection:text-slate-950">
      <MarketingHeader />
      <main>
        <section className="relative overflow-hidden border-b border-white/10 px-4 py-10 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(16,185,129,.18),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,.10),transparent_30%),linear-gradient(180deg,#020608,#061016)]" />
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="relative mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[.85fr_1.15fr]">
            <div className="max-w-xl lg:pt-8">
              <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">Free Prompt Doctor</span>
              <h1 className="mt-5 text-[2.6rem] font-black leading-[.98] tracking-[-.05em] sm:text-6xl lg:text-[2.9rem] xl:text-[3.7rem] 2xl:text-[4.1rem]">Bad prompt in.<br /><span className="text-emerald-300">Great answer out.</span></h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">AI is only as good as what you ask it. Paste any prompt — PromptStudio <strong className="text-white">scores it out of 100</strong>, shows exactly what’s missing, and rewrites it for ChatGPT, Claude, Gemini or Midjourney.</p>
              <ul className="mt-6 grid gap-2.5 text-sm text-slate-300">
                <li className="flex gap-2.5"><span className="text-emerald-300">✓</span>See your score across 5 dimensions in seconds</li>
                <li className="flex gap-2.5"><span className="text-emerald-300">✓</span>Learn why it was weak — not just a rewrite</li>
                <li className="flex gap-2.5"><span className="text-emerald-300">✓</span>No invented facts: unknowns become [placeholders]</li>
              </ul>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-500"><span>◇ No sign-up</span><span>◇ No card</span><span>◇ Works with every AI</span></div>
            </div>
            <PromptDoctor key={prefill ? location.key : "doctor"} initialPrompt={prefill} initialTarget={prefillTarget} />
          </div>
        </section>

        <section className="border-b border-white/10 px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-black uppercase tracking-[.18em] text-slate-600"><span className="text-slate-500">Works with</span>{MODELS.map((model) => <span key={model}>{model}</span>)}</div></section>

        <section className="px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="The rubric" title="Why most prompts get average answers." text="Every prompt is graded on the same five things. Miss one and the AI starts guessing — fix all five and it stops." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {DIMENSIONS.map((dimension, index) => (
                <article key={dimension.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
                  <div className="flex items-center justify-between text-[10px] font-black tracking-widest text-slate-600"><span>0{index + 1}</span><span>20 pts</span></div>
                  <h3 className="mt-5 text-base font-black">{dimension.label}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{dimension.tip}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#03080a] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Example" title="Same idea. Very different answer." />
            <div className="mt-8 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
              <article className="rounded-3xl border border-rose-300/20 bg-rose-300/[.04] p-5 sm:p-6">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.18em] text-rose-300">Before</span><span className="rounded-full bg-rose-400/15 px-2.5 py-1 text-xs font-black text-rose-300">18 / 100</span></div>
                <p className="mt-4 text-lg font-bold text-slate-200">“{BEFORE_AFTER.before}”</p>
                <ul className="mt-5 space-y-1.5 text-xs text-slate-400"><li>✗ No audience</li><li>✗ No platform or format</li><li>✗ No goal or call to action</li><li>✗ No tone</li></ul>
              </article>
              <article className="rounded-3xl border border-emerald-300/25 bg-emerald-300/[.05] p-5 sm:p-6">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">After Prompt Doctor</span><span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-black text-emerald-300">89 / 100</span></div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{BEFORE_AFTER.after}</p>
                <button type="button" onClick={() => document.getElementById('doctor')?.scrollIntoView({ behavior: 'smooth' })} className="mt-5 text-xs font-black text-emerald-300 hover:text-emerald-200">Try it on your own prompt →</button>
              </article>
            </div>
          </div>
        </section>

        <section id="products" className="scroll-mt-20 px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Go further with a free account" title="One workspace from idea to output." text="Prompt Doctor is the free front door. Inside, PromptStudio turns images, screenshots and rough ideas into prompts, websites and apps." />
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {PRODUCTS.map((product) => (
                <Link key={product.id} to={product.to} className={`group flex flex-col rounded-3xl border p-6 transition hover:-translate-y-1 hover:border-white/25 ${product.accent}`}>
                  <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${product.tagClass}`}>{product.tag}</span>
                  <h3 className="mt-5 text-2xl font-black tracking-[-.03em]">{product.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{product.text}</p>
                  <span className="mt-5 text-xs font-black text-emerald-300 group-hover:text-emerald-200">{product.action} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#03080a] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <SectionTitle eyebrow="Free prompt library" title="Steal these prompts." text="Ready-made, fill-in-the-blank prompts for students, job seekers, shop owners, creators and developers." />
              <Link to="/prompts" className="shrink-0 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black hover:bg-white/[.06]">Browse all {PROMPT_LIBRARY.length} prompts →</Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {libraryHighlights.map(({ category, item }) => (
                <Link key={item.id} to={`/prompts#${item.id}`} className="group rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:border-emerald-300/30">
                  <p className="text-[11px] font-bold text-slate-500">{category.icon} {category.label}</p>
                  <h3 className="mt-3 font-black">{item.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{item.prompt}</p>
                  <span className="mt-4 inline-block text-xs font-black text-emerald-300">Use this prompt →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><SectionTitle eyebrow="Simple pricing in ₹" title="Start free. Pay only when it's part of your day." /><p className="text-xs text-slate-500">Secure Razorpay checkout · Credits never expire</p></div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">{PRICING_PLANS.map((plan) => (
              <article key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 ${plan.highlighted ? 'border-emerald-300/40 bg-emerald-300/[.055]' : 'border-white/10 bg-white/[.025]'}`}>
                {plan.highlighted && <span className="absolute -top-2.5 right-5 rounded-full bg-emerald-300 px-2.5 py-1 text-[9px] font-black text-slate-950">MOST POPULAR</span>}
                <h3 className="text-base font-black">{plan.name}</h3>
                <div className="mt-2 text-3xl font-black">{plan.price}<span className="ml-1.5 text-xs font-semibold text-slate-500">/ {plan.period}</span></div>
                {plan.annualPrice && <p className="mt-1 text-xs font-bold text-emerald-300">or {plan.annualPrice} {plan.annualPeriod} — save 47%</p>}
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-400">{plan.description}</p>
                <ul className="mt-4 flex-1 space-y-2">{plan.features.slice(0, 6).map((feature) => <li key={feature} className="flex gap-2 text-xs leading-5 text-slate-300"><span className="text-emerald-300">✓</span>{feature}</li>)}</ul>
                <Link to="/signup" className={`mt-5 rounded-xl px-4 py-2.5 text-center text-xs font-black ${plan.highlighted ? 'bg-emerald-300 text-slate-950 hover:bg-emerald-200' : 'border border-white/10 bg-white/[.04] text-white hover:bg-white/[.08]'}`}>{plan.cta} →</Link>
              </article>
            ))}</div>
          </div>
        </section>

        <section id="faq" className="border-t border-white/10 bg-[#03080a] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <SectionTitle eyebrow="FAQ" title="Questions, answered." center />
            <div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[.02]">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-100">{item.q}<span className="text-emerald-300 transition group-open:rotate-45">+</span></summary>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,.14),transparent_45%),#020608] px-4 py-16 text-center sm:px-8">
          <h2 className="text-4xl font-black tracking-[-.05em] sm:text-5xl">What does <span className="text-emerald-300">your</span> prompt score?</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">Find out in 10 seconds. Free, no sign-up — and you will never write a lazy prompt again.</p>
          <button type="button" onClick={() => { document.getElementById('doctor')?.scrollIntoView({ behavior: 'smooth' }); window.setTimeout(() => document.getElementById('doctor-prompt')?.focus({ preventScroll: true }), 500); }} className="mt-7 rounded-2xl bg-emerald-300 px-6 py-3.5 text-sm font-black text-slate-950 hover:bg-emerald-200">Score my prompt free →</button>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default Landing;
