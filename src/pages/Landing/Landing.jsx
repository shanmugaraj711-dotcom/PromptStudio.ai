import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PRICING_PLANS } from '../../constants/pricingPlans';

const CARDS = [
  { key: 'marketing', label: 'Marketing', icon: '✦', idea: 'Make a launch post for my restaurant', prompt: 'Create a warm, concise launch post for my restaurant. Lead with the customer outcome, highlight signature dishes without inventing facts, use an inviting tone, and finish with a clear visit CTA.' },
  { key: 'coding', label: 'Coding', icon: '</>', idea: 'Build a website for my idea', prompt: 'Act as a senior frontend engineer. Turn this idea into a responsive production-ready website plan with reusable components, accessible semantics, clear states, mobile behavior, and an implementation sequence. Do not invent unsupported requirements.' },
  { key: 'business', label: 'Business', icon: '↗', idea: 'Write a business plan for my startup', prompt: 'Create a practical business plan covering target customer, problem, value proposition, business model, acquisition, operations, risks, assumptions, and the next three validation steps. Clearly separate facts from assumptions.' },
  { key: 'study', label: 'Study', icon: '◇', idea: 'Explain quantum computing simply', prompt: 'Explain quantum computing to a curious beginner using plain language, one intuitive analogy, a simple step-by-step example, common misconceptions, and a short recap. Avoid unnecessary mathematics.' },
  { key: 'creative', label: 'Creative', icon: '◉', idea: 'Create a logo for my brand', prompt: 'Develop a focused logo-generation brief from this idea: define the visual concept, mood, composition, typography direction, negative-space opportunity, and three useful variations without inventing the brand story.' },
];

const MODELS = ['ChatGPT', 'Claude', 'Gemini', 'Grok'];

function PromptCard({ card, active, index, onSelect }) {
  const offset = index - active;
  const distance = Math.abs(offset);
  const transform = `translateX(${offset * 76}px) translateZ(${Math.max(0, 180 - distance * 70)}px) rotateY(${offset * -18}deg) rotateZ(${offset * 1.5}deg) scale(${Math.max(0.78, 1 - distance * 0.1)})`;
  return (
    <button type="button" onClick={() => onSelect(index)} aria-label={`Show ${card.label} example`} className="absolute left-1/2 top-1/2 h-[390px] w-[270px] -translate-x-1/2 -translate-y-1/2 text-left transition-all duration-700 ease-out [transform-style:preserve-3d] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" style={{ transform, zIndex: 20 - distance, opacity: distance > 2 ? 0 : 1 }}>
      <div className={`h-full overflow-hidden rounded-[2rem] border p-5 shadow-2xl backdrop-blur-xl ${active === index ? 'border-emerald-300/60 bg-slate-900/95 shadow-emerald-400/20' : 'border-white/10 bg-slate-900/75'}`}>
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-slate-400"><span>{card.icon} {card.label}</span><span>0{index + 1}</span></div>
        <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Your idea</p>
          <p className="mt-3 text-lg font-bold leading-7 text-white">{card.idea}</p>
        </div>
        <div className="my-5 flex items-center gap-2 text-emerald-300"><span className="h-px flex-1 bg-emerald-300/30" /><span className="text-xs font-black">PROMPTSTUDIO</span><span className="h-px flex-1 bg-emerald-300/30" /></div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Better prompt</p>
        <p className="mt-3 line-clamp-7 text-sm leading-6 text-slate-200">{card.prompt}</p>
        <div className="mt-5 rounded-xl bg-emerald-300/10 px-3 py-2 text-center text-xs font-black text-emerald-300">Clear · Specific · Ready</div>
      </div>
    </button>
  );
}

function PublicTry() {
  const [prompt, setPrompt] = useState('');
  const [target, setTarget] = useState('ChatGPT');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { fetch('/api/public-visit', { cache: 'no-store', keepalive: true }).catch(() => {}); }, []);
  const optimize = async () => {
    const value = prompt.trim();
    if (value.length < 3 || loading) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/v1/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: value, target }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(data?.error?.message || 'Unable to optimize right now.'); e.code = data?.error?.code; throw e; }
      setResult(data);
    } catch (e) { setError(e.code === 'free_daily_limit' ? e.message : (e.message || 'Something went wrong. Please try again.')); }
    finally { setLoading(false); }
  };
  const copy = async () => { if (result?.optimized_prompt) { try { await navigator.clipboard.writeText(result.optimized_prompt); } catch {} } };
  return (
    <section id="try" className="relative border-y border-white/10 bg-[#05090c] px-5 py-24 text-white sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,.12),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,.10),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Try it yourself</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Don’t imagine the difference.<br /><span className="text-emerald-300">See it.</span></h2><p className="mt-5 max-w-lg text-slate-400">Paste the rough version. Pick your AI. Get a sharper prompt in seconds.</p><div className="mt-7 flex flex-wrap gap-2">{MODELS.map(m => <button type="button" key={m} onClick={() => setTarget(m)} className={`rounded-full border px-3 py-2 text-xs font-bold ${target === m ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-slate-400 hover:text-white'}`}>{m}</button>)}</div></div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[.04] p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-5"><div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') optimize(); }} maxLength={6000} rows={5} placeholder="Try: make a marketing post for my restaurant" className="w-full resize-none bg-transparent text-base leading-7 text-white outline-none placeholder:text-slate-600" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><span className="text-xs text-slate-500">{prompt.length}/6000 · 2 free optimizations daily</span><button type="button" onClick={optimize} disabled={prompt.trim().length < 3 || loading} className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:opacity-40">{loading ? 'Sharpening…' : 'Make it better →'}</button></div>{error && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">{error} {error.includes('today') && <Link to="/signup" className="ml-2 font-black underline">Sign up free</Link>}</div>}{result && <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">PromptStudio result</p><p className="mt-1 text-xs text-slate-500">Original score: {result.score}/100</p></div><button type="button" onClick={copy} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white">Copy</button></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-100">{result.optimized_prompt}</p></div>}</div></div>
      </div>
    </section>
  );
}

function ReferenceShowcase() {
  return (
    <section className="border-y border-white/10 bg-[#02070a] px-5 py-24 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Reference → Prompt</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">See an image you love?<br /><span className="text-emerald-300">Turn it into a prompt.</span></h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">Upload a reference image and PromptStudio helps translate the visual details into a structured, AI-ready prompt you can refine and reuse.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-2xl bg-emerald-300 px-6 py-4 text-sm font-black text-slate-950 hover:bg-emerald-200">Try Image → Prompt free</Link>
            <a href="#how" className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-4 text-sm font-bold text-white hover:bg-white/[.07]">See how it works</a>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.035] p-3 shadow-2xl shadow-black/30">
          <div className="grid gap-3 sm:grid-cols-[.8fr_auto_1.2fr] sm:items-center">
            <div className="min-h-[220px] rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-black p-5">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.18em] text-slate-500"><span>Reference image</span><span>01</span></div>
              <div className="mt-8 flex h-32 items-center justify-center rounded-2xl border border-emerald-300/10 bg-[radial-gradient(circle_at_55%_35%,rgba(52,211,153,.28),transparent_28%),radial-gradient(circle_at_35%_70%,rgba(59,130,246,.22),transparent_30%),#0b1116]">
                <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-bold text-slate-300">Visual reference</span>
              </div>
            </div>
            <div className="grid place-items-center text-2xl text-emerald-300">→</div>
            <div className="min-h-[220px] rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[.045] p-5">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.18em] text-emerald-300"><span>PromptStudio analysis</span><span>Ready</span></div>
              <div className="mt-6 space-y-3 text-sm leading-6 text-slate-200"><p><span className="text-emerald-300">Subject</span> · composition · lighting</p><p><span className="text-emerald-300">Style</span> · camera feel · color direction</p><p><span className="text-emerald-300">Details</span> · atmosphere · framing · mood</p></div>
              <div className="mt-6 rounded-xl bg-black/25 px-3 py-2 text-center text-xs font-black text-emerald-300">Structured AI-ready prompt</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const { user } = useAuth();
  const [active, setActive] = useState(2);
  const activeCard = useMemo(() => CARDS[active], [active]);
  const move = (dir) => setActive((active + dir + CARDS.length) % CARDS.length);
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030608] text-white selection:bg-emerald-300 selection:text-slate-950">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030608]/75 backdrop-blur-2xl"><nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8"><Link to="/" className="flex items-center gap-2.5" aria-label="PromptStudio home"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300 text-lg font-black text-slate-950">✦</span><span className="text-lg font-black tracking-tight">PromptStudio</span></Link><div className="hidden items-center gap-7 text-sm font-semibold text-slate-400 md:flex"><a href="#examples" className="transition hover:text-white">Examples</a><a href="#how" className="transition hover:text-white">How it works</a><a href="#pricing" className="transition hover:text-white">Pricing</a></div><div className="flex items-center gap-2">{user ? <Link to="/dashboard" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/5">Dashboard</Link> : <><Link to="/login" className="hidden rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 hover:text-white sm:block">Sign in</Link><Link to="/signup" className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-200">Try free →</Link></>}</div></nav></header>

      <main>
        <section className="relative min-h-[760px] overflow-hidden px-5 py-16 sm:px-8 lg:px-12"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_38%,rgba(16,185,129,.18),transparent_26%),radial-gradient(circle_at_55%_65%,rgba(59,130,246,.12),transparent_32%),linear-gradient(180deg,#030608,#061016)]" /><div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:64px_64px]" /><div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.78fr_1.22fr]"><div className="z-10 max-w-xl pt-8 lg:pt-0"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />AI prompt intelligence</div><h1 className="mt-6 text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-[5.25rem]">Turn your idea<br /><span className="text-emerald-300">into a prompt that works.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">Transform rough ideas and reference images into clear, structured prompts for the AI tools you already use.</p><div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => document.getElementById('try')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-2xl bg-emerald-300 px-6 py-4 text-sm font-black text-slate-950 shadow-[0_0_45px_rgba(110,231,183,.18)] hover:bg-emerald-200">Try it free →</button><Link to="/signup" className="rounded-2xl border border-white/15 bg-white/[.04] px-6 py-4 text-sm font-bold text-white hover:bg-white/[.08]">Create your workspace</Link></div><div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500"><span>✦ 2 free optimizations daily</span><span>•</span><span>No card required</span></div><div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600"><span className="rounded-full border border-white/5 px-3 py-1.5">Text → Prompt</span><span className="rounded-full border border-white/5 px-3 py-1.5">Image → Prompt</span><span className="rounded-full border border-white/5 px-3 py-1.5">Reference Coding</span></div></div>
        <div className="relative h-[560px] [perspective:1300px] sm:h-[610px]"><div className="absolute left-1/2 top-1/2 h-[310px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/10 blur-[90px]" /><div className="absolute left-1/2 top-[54%] h-12 w-[390px] -translate-x-1/2 rounded-[50%] border border-emerald-300/30 bg-emerald-300/10 shadow-[0_0_80px_rgba(52,211,153,.15)] blur-[1px]" />{CARDS.map((card, i) => <PromptCard key={card.key} card={card} index={i} active={active} onSelect={setActive} />)}<button type="button" onClick={() => move(-1)} aria-label="Previous example" className="absolute left-1 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/40 text-xl backdrop-blur-xl hover:border-emerald-300/50">‹</button><button type="button" onClick={() => move(1)} aria-label="Next example" className="absolute right-1 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/40 text-xl backdrop-blur-xl hover:border-emerald-300/50">›</button><div className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-slate-500">Explore what better prompts unlock</p><div className="mt-3 flex justify-center gap-1.5">{CARDS.map((card,i)=><button type="button" key={card.key} onClick={() => setActive(i)} aria-label={`Go to ${card.label}`} className={`h-1.5 rounded-full transition-all ${i===active?'w-8 bg-emerald-300':'w-1.5 bg-white/20'}`} />)}</div></div></div></div></section>

        <section id="examples" className="border-y border-white/10 bg-[#050a0d] px-5 py-24 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">The transformation</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">From “good enough”<br />to <span className="text-emerald-300">actually useful.</span></h2></div><p className="max-w-md text-sm leading-6 text-slate-500">PromptStudio adds the clarity, context, constraints and structure your idea was missing — without changing what you meant.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-[1fr_auto_1.25fr]"><div className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">Before</p><p className="mt-6 text-xl font-bold leading-8 text-slate-300">{activeCard.idea}</p><p className="mt-8 text-xs text-slate-600">Short. Vague. Hard to steer.</p></div><div className="grid place-items-center text-3xl text-emerald-300">→</div><div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/[.05] p-6 shadow-[0_0_70px_rgba(52,211,153,.06)]"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">After · PromptStudio</p><span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">Ready</span></div><p className="mt-5 text-base leading-7 text-slate-100">{activeCard.prompt}</p><button type="button" onClick={() => navigator.clipboard?.writeText(activeCard.prompt)} className="mt-6 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-white hover:border-emerald-300/40">Copy this prompt</button></div></div></div></section>

        <ReferenceShowcase />
        <PublicTry />

        <section id="how" className="px-5 py-24 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Simple by design</p><h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-.04em] sm:text-5xl">You bring the thought.<br />We make it <span className="text-emerald-300">usable.</span></h2><div className="mt-14 grid gap-5 md:grid-cols-3">{[['01','Dump the rough idea','No prompt engineering degree required. Say it the way you naturally think it.'],['02','Let PromptStudio sharpen it','We preserve your intent and add useful structure, specificity and constraints.'],['03','Take it anywhere','Copy the result into ChatGPT, Claude, Gemini, Grok or your coding workflow.']].map(([n,t,d])=><article key={n} className="rounded-3xl border border-white/10 bg-white/[.035] p-7 transition hover:-translate-y-1 hover:border-emerald-300/25"><span className="text-sm font-black text-emerald-300">{n}</span><h3 className="mt-10 text-xl font-black">{t}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{d}</p></article>)}</div></div></section>

        <section className="border-y border-white/10 bg-[#05090c] px-5 py-16 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3"><span className="mr-3 text-xs font-black uppercase tracking-[.18em] text-slate-600">Works with</span>{MODELS.map(m=><button type="button" key={m} onClick={() => document.getElementById('try')?.scrollIntoView({ behavior:'smooth' })} className="rounded-full border border-white/10 bg-white/[.03] px-5 py-3 text-sm font-bold text-slate-300 hover:border-emerald-300/30 hover:text-white">{m}</button>)}</div></section>

        <section id="pricing" className="px-5 py-24 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Start simple</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">More prompting power<br /><span className="text-emerald-300">when you need it.</span></h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{PRICING_PLANS.map(plan=><article key={plan.id} className={`relative flex flex-col rounded-3xl border p-7 ${plan.highlighted?'border-emerald-300/40 bg-emerald-300/[.08] shadow-[0_0_70px_rgba(52,211,153,.07)]':'border-white/10 bg-white/[.035]'}`}>{plan.highlighted && <span className="absolute -top-3 right-6 rounded-full bg-emerald-300 px-3 py-1 text-[10px] font-black text-slate-950">MOST POPULAR</span>}<h3 className="text-lg font-black">{plan.name}</h3><div className="mt-4 text-4xl font-black">{plan.price}<span className="ml-2 text-sm font-semibold text-slate-500">/ {plan.period}</span></div><p className="mt-4 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p><ul className="mt-7 flex-1 space-y-3">{plan.features.map(f=><li key={f} className="flex gap-2 text-sm text-slate-300"><span className="text-emerald-300">✓</span>{f}</li>)}</ul><Link to="/signup" className={`mt-8 rounded-xl px-4 py-3 text-center text-sm font-black ${plan.highlighted?'bg-emerald-300 text-slate-950 hover:bg-emerald-200':'border border-white/10 bg-white/[.05] text-white hover:bg-white/10'}`}>{plan.id==='pro'?'Start Pro':plan.id==='credits'?'Get Creator Credits':'Start Free'} →</Link></article>)}</div></div></section>

        <section className="relative overflow-hidden border-t border-white/10 bg-gradient-to-b from-[#06100d] to-[#030608] px-5 py-28 text-center sm:px-8"><div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/10 blur-[100px]" /><div className="relative"><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Ready?</p><h2 className="mt-4 text-5xl font-black tracking-[-.05em] sm:text-6xl">Think it.<br /><span className="text-emerald-300">Supercharge it.</span></h2><p className="mx-auto mt-5 max-w-xl text-slate-400">Bring the messy thought. Leave with a prompt that gets your AI closer to what you actually wanted.</p><button type="button" onClick={() => document.getElementById('try')?.scrollIntoView({ behavior:'smooth' })} className="mt-8 rounded-2xl bg-emerald-300 px-7 py-4 text-sm font-black text-slate-950 hover:bg-emerald-200">Optimize a prompt free →</button></div></section>
      </main>

      <footer className="border-t border-white/10 bg-[#020405] px-5 py-12 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between"><div><Link to="/" className="text-lg font-black">PromptStudio</Link><p className="mt-2 text-sm text-slate-600">Better prompts. Better AI results.</p></div><div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-500"><Link to="/help" className="hover:text-white">Help</Link><Link to="/contact" className="hover:text-white">Contact</Link><Link to="/privacy" className="hover:text-white">Privacy</Link><Link to="/terms" className="hover:text-white">Terms</Link><Link to="/refund" className="hover:text-white">Refunds</Link></div></div><p className="mx-auto mt-8 max-w-7xl border-t border-white/5 pt-6 text-xs text-slate-700">© {new Date().getFullYear()} PromptStudio AI. All rights reserved.</p></footer>
    </div>
  );
}

export default Landing;
