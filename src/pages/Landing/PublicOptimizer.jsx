import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const TARGETS = ['ChatGPT', 'Claude', 'Gemini', 'General AI'];

function PublicOptimizer() {
  const [prompt, setPrompt] = useState('');
  const [target, setTarget] = useState('ChatGPT');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/public-visit', { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {});
  }, []);

  const optimize = async () => {
    const value = prompt.trim();
    if (value.length < 3 || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: value, target })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const requestError = new Error(data?.error?.message || 'Unable to optimize your prompt right now.');
        requestError.code = data?.error?.code;
        requestError.status = response.status;
        throw requestError;
      }

      setResult(data);
    } catch (requestError) {
      if (requestError.code === 'free_daily_limit' || requestError.status === 429) {
        setError({ type: 'limit', message: requestError.message || "You've used your free prompts for today." });
      } else {
        setError({ type: 'error', message: requestError.message || 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result?.optimized_prompt) return;
    try { await navigator.clipboard.writeText(result.optimized_prompt); } catch {}
  };

  return (
    <section id="optimizer" className="relative overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(139,92,246,0.14),transparent_32%)]" />
      <div className="relative mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Free prompt optimizer</div>
          <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] sm:text-5xl">Turn your rough idea into a better prompt.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">No account needed. Paste what you have, choose your AI, and PromptStudio will sharpen it in seconds.</p>
        </div>

        <div className="mt-9 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {TARGETS.map((item) => <button key={item} type="button" onClick={() => setTarget(item)} className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${target === item ? 'border-blue-400/50 bg-blue-400/15 text-blue-200' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'}`}>{item}</button>)}
            </div>

            <label htmlFor="public-prompt" className="sr-only">Your prompt</label>
            <textarea id="public-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') optimize(); }} maxLength={6000} rows={6} placeholder="e.g. Make a marketing post for my restaurant" className="mt-5 min-h-44 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/10" />

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">{prompt.length}/6000 · 2 free optimizations per day</span>
              <button type="button" onClick={optimize} disabled={prompt.trim().length < 3 || loading} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40">{loading ? 'Optimizing…' : 'Optimize my prompt →'}</button>
            </div>

            {error?.type === 'limit' && <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><p className="text-sm font-bold text-amber-100">{error.message}</p><p className="mt-1 text-xs leading-5 text-amber-100/70">Create a free PromptStudio account to unlock the full workspace, or upgrade when you need more generation capacity.</p><div className="mt-3 flex flex-wrap gap-2"><Link to="/signup" className="rounded-lg bg-white px-3.5 py-2 text-xs font-black text-slate-950">Sign up free</Link><Link to="/login" className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-bold text-white">Log in</Link></div></div>}
            {error?.type === 'error' && <div className="mt-5 rounded-2xl border border-red-300/15 bg-red-300/10 p-4 text-sm text-red-100">{error.message}</div>}

            {result && <div className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Optimized prompt</p><p className="mt-1 text-xs text-slate-500">Original prompt score: {result.score}/100</p></div><button type="button" onClick={copyResult} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-white/20 hover:text-white">Copy</button></div><div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-100">{result.optimized_prompt}</div><div className="mt-4 flex flex-wrap items-center gap-3"><Link to="/signup" className="rounded-lg bg-white px-3.5 py-2 text-xs font-black text-slate-950">Use PromptStudio for more →</Link><a href={result.link} className="text-xs font-bold text-slate-400 hover:text-white">Explore PromptStudio</a></div></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default PublicOptimizer;
