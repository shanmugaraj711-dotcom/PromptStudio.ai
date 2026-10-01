import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MarketingFooter, MarketingHeader } from '../../components/layout/MarketingShell';
import { LIBRARY_CATEGORIES, PROMPT_LIBRARY, getLibraryCategory } from '../../data/promptLibrary';
import { DOCTOR_TARGETS } from '../Landing/PromptDoctor';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { PlaceholderFields, PromptPreview, usePlaceholderFill } from '../../components/prompt/PlaceholderFiller';

const firstSupportedTarget = (bestFor) => bestFor.split('·').map((name) => name.trim()).find((name) => DOCTOR_TARGETS.includes(name)) || 'ChatGPT';

function PromptCard({ item, highlighted }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [filling, setFilling] = useState(false);
  const fill = usePlaceholderFill(item.prompt);
  const category = getLibraryCategory(item.category);
  const copy = async () => { if (await copyToClipboard(fill.filledText)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } };
  const improve = () => navigate('/', { state: { doctorPrompt: fill.filledText, doctorTarget: firstSupportedTarget(item.bestFor) } });
  return (
    <article id={item.id} className={`flex scroll-mt-24 flex-col rounded-3xl border p-5 transition ${highlighted || filling ? 'border-emerald-300/50 bg-emerald-300/[.06] shadow-[0_0_40px_rgba(16,185,129,.15)]' : 'border-white/10 bg-white/[.025]'}`}>
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500"><span>{category?.icon} {category?.label}</span><span className="truncate">{item.bestFor}</span></div>
      <h2 className="mt-3 text-lg font-black tracking-[-.02em]">{item.title}</h2>
      <pre className="mt-3 max-h-56 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3.5 font-sans text-xs leading-5 text-slate-300"><PromptPreview text={item.prompt} values={fill.values} /></pre>
      {filling && <div className="mt-3"><PlaceholderFields idPrefix={item.id} placeholders={fill.placeholders} values={fill.values} onChange={fill.setValue} onClear={fill.clear} filledCount={fill.filledCount} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-lg bg-emerald-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-emerald-200">{copied ? 'Copied ✓' : fill.filledCount ? 'Copy my version' : 'Copy'}</button>
        {fill.placeholders.length > 0 && <button type="button" onClick={() => setFilling((value) => !value)} aria-expanded={filling} className="rounded-lg border border-amber-300/30 px-3 py-2 text-[11px] font-black text-amber-100 hover:bg-amber-300/10">{filling ? 'Hide blanks' : `✏️ Fill ${fill.placeholders.length} blank${fill.placeholders.length === 1 ? '' : 's'}`}</button>}
        <button type="button" onClick={improve} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-black text-slate-200 hover:border-emerald-300/40 hover:text-white">Score it in Prompt Doctor →</button>
      </div>
    </article>
  );
}

export default function PromptLibrary() {
  const location = useLocation();
  const navigate = useNavigate();
  const openDoctor = () => navigate({ pathname: '/', hash: '#doctor' });
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const highlightedId = location.hash.replace('#', '');

  useEffect(() => {
    if (!highlightedId) return undefined;
    const timer = window.setTimeout(() => document.getElementById(highlightedId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PROMPT_LIBRARY.filter((item) => (category === 'all' || item.category === category) && (!needle || `${item.title} ${item.prompt} ${item.bestFor}`.toLowerCase().includes(needle)));
  }, [category, query]);

  const chipClass = (active) => `rounded-full border px-3.5 py-2 text-xs font-bold transition ${active ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-slate-400 hover:text-white'}`;

  return (
    <div className="min-h-screen overflow-x-clip bg-[#020608] text-white">
      <MarketingHeader />
      <main className="px-4 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-black uppercase tracking-[.22em] text-emerald-300">Free prompt library</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-.05em] sm:text-6xl">Copy-paste prompts that actually work.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{PROMPT_LIBRARY.length} fill-in-the-blank prompts for ChatGPT, Claude, Gemini and Midjourney. Replace the <span className="rounded bg-amber-300/15 px-1 text-amber-200">[brackets]</span> with your details, or send one to Prompt Doctor to score it and tailor it to you.</p>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categories">
              <button type="button" role="tab" aria-selected={category === 'all'} onClick={() => setCategory('all')} className={chipClass(category === 'all')}>All</button>
              {LIBRARY_CATEGORIES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} onClick={() => setCategory(item.id)} className={chipClass(category === item.id)}>{item.icon} {item.label}</button>)}
            </div>
            <label className="relative block lg:w-72">
              <span className="sr-only">Search prompts</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prompts…" className="w-full rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/40" />
            </label>
          </div>

          {category !== 'all' && <p className="mt-4 text-sm text-slate-500">{getLibraryCategory(category)?.blurb}</p>}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => <PromptCard key={item.id} item={item} highlighted={item.id === highlightedId} />)}
          </div>
          {items.length === 0 && <div className="mt-6 rounded-3xl border border-white/10 bg-white/[.02] p-8 text-center"><p className="font-bold">No prompts match “{query}”.</p><p className="mt-2 text-sm text-slate-500">Paste your own idea into Prompt Doctor and it will build one for you.</p><button type="button" onClick={openDoctor} className="mt-4 rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950">Open Prompt Doctor →</button></div>}

          <section className="mt-14 rounded-3xl border border-emerald-300/25 bg-emerald-300/[.05] p-6 text-center sm:p-10">
            <h2 className="text-2xl font-black tracking-[-.03em] sm:text-3xl">Have a prompt of your own?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Prompt Doctor scores it out of 100, shows what is missing and rewrites it for the AI you use. Free, no sign-up.</p>
            <button type="button" onClick={openDoctor} className="mt-6 rounded-2xl bg-emerald-300 px-6 py-3.5 text-sm font-black text-slate-950 hover:bg-emerald-200">Score my prompt →</button>
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
