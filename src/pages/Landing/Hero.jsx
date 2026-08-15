import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(96,165,250,0.12),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(167,139,250,0.12),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-4 py-2 text-xs font-bold text-blue-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Prompt intelligence for every AI
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Turn rough ideas into <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">better AI results.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              PromptStudio understands your goal, improves the prompt, compares strong approaches, and helps you launch it in the AI you already use.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
              <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-100">🧠 Intelligence</span>
              <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-100">🎨 Image prompts</span>
              <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-100">🚀 One-click launch</span>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/signup">
                <Button variant="primary" size="lg">
                  Start Free
                </Button>
              </Link>

              <a href="#prompt-builder">
                <Button variant="secondary" size="lg">
                  Try the Builder
                </Button>
              </a>
            </div>
          </div>

          <div className="relative flex min-h-[430px] items-center justify-center">
            <div className="absolute h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
            <div className="absolute -right-4 top-10 h-40 w-40 rounded-full bg-violet-200/30 blur-3xl" />

            <div className="relative w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_30px_90px_-35px_rgba(37,99,235,0.45)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">PromptStudio Intelligence</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">Your optimized prompt</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">READY</span>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <div className="h-2 w-24 rounded-full bg-blue-200" />
                <div className="mt-3 h-2 w-full rounded-full bg-slate-200" />
                <div className="mt-2 h-2 w-11/12 rounded-full bg-slate-200" />
                <div className="mt-2 h-2 w-4/5 rounded-full bg-slate-200" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-bold text-blue-700">Best fit</p><p className="mt-1 text-[9px] text-slate-500">Production</p></div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-[10px] font-bold text-violet-700">Creative</p><p className="mt-1 text-[9px] text-slate-500">Bold angle</p></div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3"><p className="text-[10px] font-bold text-sky-700">Visual</p><p className="mt-1 text-[9px] text-slate-500">Image-ready</p></div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white shadow-lg">
                <span className="text-xs font-semibold">Ready for your AI</span>
                <span className="text-xs font-bold">Launch →</span>
              </div>
            </div>

            <div className="absolute -bottom-1 -left-3 rounded-2xl border border-white bg-white px-4 py-3 shadow-xl sm:left-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Works with</p>
              <p className="mt-1 text-xs font-bold text-slate-800">ChatGPT · Claude · Gemini · Grok</p>
            </div>

            <div className="absolute -right-2 top-6 rounded-2xl border border-white bg-white px-4 py-3 shadow-xl">
              <p className="text-[10px] font-bold text-violet-600">PRO</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">Reusable workflows</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
