import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { launchPromptInAI } from '../../services/aiLaunchService';
import { PlaceholderFields, PromptPreview, usePlaceholderFill } from '../../components/prompt/PlaceholderFiller';

export const DOCTOR_TARGETS = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'Midjourney'];
const LAUNCH_IDS = { ChatGPT: 'chatgpt', Claude: 'claude-code', Gemini: 'gemini', Grok: 'grok' };
const SITE_URL = 'https://promptstudioai.in/';

export const DIMENSIONS = [
  { id: 'goal', label: 'Clear goal', tip: 'Say exactly what you want and what “done” looks like.' },
  { id: 'context', label: 'Context', tip: 'Who is it for? What situation are you in?' },
  { id: 'specificity', label: 'Specificity', tip: 'Swap vague words for concrete details and numbers.' },
  { id: 'format', label: 'Output format', tip: 'Ask for a length, structure, table or list.' },
  { id: 'constraints', label: 'Constraints & tone', tip: 'Set the tone, the quality bar and what to avoid.' },
];

const EXAMPLES = [
  { label: 'Blog post', prompt: 'write a blog about AI', target: 'ChatGPT' },
  { label: 'Bakery logo', prompt: 'make a logo for my bakery', target: 'Midjourney' },
  { label: 'Interview prep', prompt: 'help me prepare for my interview', target: 'Claude' },
  { label: 'Buggy code', prompt: 'fix my code it doesnt work', target: 'Gemini' },
];

const LOADING_STEPS = ['Reading your intent…', 'Grading 5 dimensions…', 'Finding what’s missing…', 'Rewriting for your AI…'];

export const scoreTone = (score) => {
  if (score >= 70) return { text: 'text-emerald-300', stroke: '#6ee7b7', bar: 'bg-emerald-300', label: 'Strong' };
  if (score >= 40) return { text: 'text-amber-300', stroke: '#fcd34d', bar: 'bg-amber-300', label: 'Needs work' };
  return { text: 'text-rose-400', stroke: '#fb7185', bar: 'bg-rose-400', label: 'Weak' };
};

function useCountUp(target, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number') return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame;
    if (reduceMotion) { frame = requestAnimationFrame(() => setValue(target)); return () => cancelAnimationFrame(frame); }
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function ScoreRing({ score, caption }) {
  const shown = useCountUp(score);
  const tone = scoreTone(score);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden="true">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={tone.stroke} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - shown / 100)} />
        </svg>
        <div className="absolute inset-0 grid place-items-center"><span className={`text-2xl font-black ${tone.text}`}>{shown}</span></div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">{caption}</span>
      <span className={`text-[11px] font-bold ${tone.text}`}>{tone.label}</span>
    </div>
  );
}

export const buildShareText = ({ score, optimizedScore }) => typeof optimizedScore === 'number'
  ? `My AI prompt scored ${score}/100 😬 PromptStudio's Prompt Doctor fixed it to ${optimizedScore}/100 in seconds. Check yours free:`
  : `My AI prompt scored ${score}/100 on PromptStudio's Prompt Doctor. Check yours free:`;

function ShareBar({ score, optimizedScore }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE_URL}?utm_source=share&utm_medium=score_card`;
  const text = buildShareText({ score, optimizedScore });
  const nativeShare = async () => {
    try { await navigator.share({ title: 'My Prompt Score', text, url }); } catch { /* dismissed */ }
  };
  const copyLink = async () => { if (await copyToClipboard(`${text} ${url}`)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); } };
  const linkClass = 'rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-slate-300 transition hover:border-white/25 hover:text-white';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-bold text-slate-500">Share your score:</span>
      {typeof navigator !== 'undefined' && navigator.share && <button type="button" onClick={nativeShare} className={linkClass}>Share…</button>}
      <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>WhatsApp</a>
      <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>X / Twitter</a>
      <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>LinkedIn</a>
      <button type="button" onClick={copyLink} className={linkClass}>{copied ? 'Copied ✓' : 'Copy link'}</button>
    </div>
  );
}

function DoctorReport({ result, target, onReset }) {
  const [copied, setCopied] = useState(false);
  const [launchNote, setLaunchNote] = useState('');
  const hasAfter = typeof result.optimized_score === 'number';
  const breakdown = result.breakdown;
  const weakest = breakdown ? [...DIMENSIONS].sort((a, b) => breakdown[a.id] - breakdown[b.id])[0] : null;
  const launchId = LAUNCH_IDS[target];
  const fill = usePlaceholderFill(result.optimized_prompt);
  const builderLink = `/builder?mode=standard&idea=${encodeURIComponent(fill.filledText.slice(0, 6000))}`;

  const copy = async () => { if (await copyToClipboard(fill.filledText)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); } };
  const launch = async () => {
    const outcome = await launchPromptInAI(fill.filledText, launchId);
    setLaunchNote(outcome.success ? `Copied — paste it into ${target} (Ctrl/⌘ + V).` : outcome.reason === 'popup_blocked' ? `Copied. Your browser blocked the new tab — open ${target} and paste.` : 'Could not copy automatically — use the Copy button.');
  };

  return (
    <div className="workspace-panel-enter mt-5 space-y-4" aria-live="polite">
      {result.personalBest && <p className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2.5 text-center text-sm font-bold text-emerald-100">🎉 New personal best — your prompts are getting better.</p>}
      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-5">
            <ScoreRing score={result.score} caption="Your prompt" />
            {hasAfter && <><span className="text-2xl text-slate-600" aria-hidden="true">→</span><ScoreRing score={result.optimized_score} caption="After fix" /></>}
          </div>
          {hasAfter && <div className="text-center sm:text-right"><p className="text-4xl font-black text-emerald-300">+{result.optimized_score - result.score}</p><p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">points better</p></div>}
        </div>
        {breakdown && <div className="mt-5 grid gap-2.5">
          {DIMENSIONS.map((dimension) => {
            const value = breakdown[dimension.id];
            const tone = scoreTone(value * 5);
            return (
              <div key={dimension.id} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-xs sm:grid-cols-[9rem_1fr_2.5rem]">
                <span className="font-bold text-slate-300">{dimension.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/[.06]"><span className={`block h-full rounded-full ${tone.bar} transition-all duration-700`} style={{ width: `${value * 5}%` }} /></span>
                <span className={`text-right font-black ${tone.text}`}>{value}/20</span>
              </div>
            );
          })}
          {weakest && <p className="mt-1 rounded-xl bg-white/[.03] px-3 py-2 text-xs text-slate-400"><span className="font-bold text-amber-200">Biggest gap — {weakest.label}:</span> {weakest.tip}</p>}
        </div>}
      </div>

      {result.improvements?.length > 0 && <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">What the doctor fixed</p>
        <ul className="mt-3 space-y-2">{result.improvements.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-200"><span className="text-emerald-300">✓</span>{item}</li>)}</ul>
      </div>}

      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[.05] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Your fixed prompt · for {target}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="rounded-lg bg-emerald-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-emerald-200">{copied ? 'Copied ✓' : 'Copy prompt'}</button>
            {launchId && <button type="button" onClick={launch} className="rounded-lg border border-emerald-300/30 px-3 py-2 text-[11px] font-black text-emerald-200 hover:bg-emerald-300/10">Open in {target} ↗</button>}
          </div>
        </div>
        <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-100"><PromptPreview text={result.optimized_prompt} values={fill.values} /></div>
        {fill.placeholders.length > 0 && <div className="mt-3"><PlaceholderFields idPrefix="doctor-blank" placeholders={fill.placeholders} values={fill.values} onChange={fill.setValue} onClear={fill.clear} filledCount={fill.filledCount} /><p className="mt-2 text-[11px] text-slate-500">We never invent facts about you — add your details here and Copy gives you the finished prompt.</p></div>}
        {launchNote && <p className="mt-2 text-[11px] font-bold text-emerald-200">{launchNote}</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.02] p-4 sm:flex-row sm:items-center sm:justify-between">
        <ShareBar score={result.score} optimizedScore={result.optimized_score} />
        <button type="button" onClick={onReset} className="text-left text-[11px] font-bold text-slate-400 hover:text-white sm:text-right">↺ Check another prompt</button>
      </div>

      <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[.05] p-4 text-sm text-slate-300">
        <span className="font-bold text-white">Want 3 different versions of this prompt?</span> Faithful, Professional and Creative — saved to your history. Free account, 3 generations a day.{' '}
        <Link to={builderLink} className="font-black text-violet-200 hover:text-white">Open in Prompt Builder →</Link>
      </div>
    </div>
  );
}

// Recent checks live only in this visitor's browser — a convenience, never the source of truth.
const HISTORY_KEY = 'ps-doctor-recent';
const HISTORY_LIMIT = 5;
const readHistory = () => {
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(items) ? items.filter((item) => typeof item?.prompt === 'string' && item.result?.optimized_prompt).slice(0, HISTORY_LIMIT) : [];
  } catch { return []; }
};
const writeHistory = (items) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* storage blocked or full */ } };

function RecentChecks({ history, onOpen, onClear }) {
  const best = Math.max(...history.map((item) => item.result.score));
  return (
    <div className="mt-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3">
      <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-bold text-slate-400">Your recent checks <span className="font-normal text-slate-600">· best {best}/100</span></span><button type="button" onClick={onClear} className="text-slate-600 hover:text-white">Clear</button></div>
      <div className="mt-2 flex flex-col gap-1.5">
        {history.map((item) => (
          <button key={item.id} type="button" onClick={() => onOpen(item)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[.04]">
            <span className={`w-9 shrink-0 text-right font-black ${scoreTone(item.result.score).text}`}>{item.result.score}</span>
            <span className="truncate">{item.prompt}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-600">{item.target}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PromptDoctor({ initialPrompt = '', initialTarget = 'ChatGPT' }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [target, setTarget] = useState(DOCTOR_TARGETS.includes(initialTarget) ? initialTarget : 'ChatGPT');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [history, setHistory] = useState(readHistory);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setInterval(() => setLoadingStep((step) => Math.min(step + 1, LOADING_STEPS.length - 1)), 1400);
    return () => window.clearInterval(timer);
  }, [loading]);

  const diagnose = async () => {
    const value = prompt.trim();
    if (value.length < 3 || loading) return;
    setLoadingStep(0); setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch('/api/v1/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: value, target }) });
      const data = await response.json().catch(() => ({}));
      const left = Number(response.headers.get('X-RateLimit-Remaining'));
      if (Number.isFinite(left) && response.headers.get('X-RateLimit-Remaining') !== null) setRemaining(left);
      if (!response.ok) {
        const requestError = new Error(data?.error?.message || 'Unable to check your prompt right now.');
        requestError.code = data?.error?.code; requestError.status = response.status;
        throw requestError;
      }
      if (!data?.optimized_prompt) throw new Error('The doctor returned an incomplete report. Please try again.');
      const previousBest = history.length ? Math.max(...history.map((item) => item.result.score)) : null;
      const report = { ...data, target, personalBest: previousBest !== null && data.score > previousBest };
      setResult(report);
      const next = [{ id: Date.now(), prompt: value, target, result: report }, ...history.filter((item) => item.prompt !== value)].slice(0, HISTORY_LIMIT);
      setHistory(next); writeHistory(next);
    } catch (requestError) {
      const limited = requestError.code === 'free_daily_limit' || requestError.status === 429;
      setError({ type: limited ? 'limit' : 'error', message: limited ? requestError.message || 'You’ve used today’s free checks.' : requestError.message || 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setResult(null); setError(null); setPrompt(''); textareaRef.current?.focus(); };
  const pickExample = (example) => { setPrompt(example.prompt); setTarget(example.target); setResult(null); setError(null); };
  const openRecent = (item) => { setPrompt(item.prompt); setTarget(item.target); setError(null); setResult({ ...item.result, personalBest: false }); };
  const clearHistory = () => { setHistory([]); writeHistory([]); };
  const continueLink = `/builder?mode=standard&idea=${encodeURIComponent(prompt.trim().slice(0, 6000))}`;

  return (
    <div id="doctor" className="scroll-mt-24 rounded-[1.75rem] border border-emerald-300/25 bg-slate-950/80 p-2.5 shadow-[0_0_90px_rgba(16,185,129,.12)] backdrop-blur-xl sm:p-3">
      <div className="rounded-[1.35rem] border border-white/10 bg-black/40 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-black text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />Prompt Doctor</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Free · no sign-up</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Target AI">
          {DOCTOR_TARGETS.map((item) => <button key={item} type="button" role="radio" aria-checked={target === item} onClick={() => setTarget(item)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${target === item ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-slate-500 hover:text-white'}`}>{item}</button>)}
        </div>

        <label htmlFor="doctor-prompt" className="sr-only">Paste your prompt</label>
        <textarea
          id="doctor-prompt"
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') diagnose(); }}
          maxLength={6000}
          rows={4}
          placeholder="Paste the prompt you were about to send to AI…"
          className="mt-3 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-300/10"
        />

        {!result && !loading && <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-[11px] text-slate-600">Try a weak one:</span>{EXAMPLES.map((example) => <button key={example.label} type="button" onClick={() => pickExample(example)} className="rounded-md border border-white/[.07] px-2 py-1 text-[11px] text-slate-400 hover:border-white/20 hover:text-white">{example.label}</button>)}</div>}
        {!result && !loading && history.length > 0 && <RecentChecks history={history} onOpen={openRecent} onClear={clearHistory} />}

        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] text-slate-600">{prompt.length}/6000 · {remaining === null ? '2 free checks daily' : `${remaining} free check${remaining === 1 ? '' : 's'} left today`} · Ctrl+Enter</span>
          <button type="button" onClick={diagnose} disabled={prompt.trim().length < 3 || loading} className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{loading ? LOADING_STEPS[loadingStep] : 'Score & fix my prompt →'}</button>
        </div>

        {loading && <div className="mt-4 grid gap-2" aria-hidden="true">{DIMENSIONS.map((dimension, index) => <div key={dimension.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-xs text-slate-600 sm:grid-cols-[9rem_1fr]"><span>{dimension.label}</span><span className="h-2 overflow-hidden rounded-full bg-white/[.05]"><span className="block h-full w-1/3 animate-pulse rounded-full bg-emerald-300/30" style={{ animationDelay: `${index * 120}ms` }} /></span></div>)}</div>}

        {error?.type === 'limit' && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><p className="text-sm font-bold text-amber-100">{error.message}</p><p className="mt-1 text-xs leading-5 text-amber-100/70">Keep going with a free account: 3 full generations every day, with 3 versions of each prompt, history and Image → Prompt. Your text comes with you.</p><div className="mt-3 flex flex-wrap gap-2"><Link to={continueLink} className="rounded-lg bg-white px-3.5 py-2 text-xs font-black text-slate-950">Continue free in Prompt Builder →</Link><Link to="/login" state={{ from: { pathname: '/builder', search: `?mode=standard&idea=${encodeURIComponent(prompt.trim().slice(0, 6000))}` } }} className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-bold text-white">Log in</Link></div></div>}
        {error?.type === 'error' && <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error.message}</p>}

        {result && <DoctorReport result={result} target={result.target || target} onReset={reset} />}
      </div>
    </div>
  );
}
