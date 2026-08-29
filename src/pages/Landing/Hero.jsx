import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(59,130,246,0.24),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(139,92,246,0.22),transparent_32%),radial-gradient(circle_at_55%_85%,rgba(14,165,233,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              Visual intelligence for your AI
            </div>

            <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.4rem]">
              SEE IT.
              <span className="block bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">UNDERSTAND IT.</span>
              <span className="block">GET THE PROMPT.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Give PromptStudio a visual reference, an existing UI, or a rough idea. We understand what you are trying to create and turn it into a ready-to-use AI prompt.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/image-to-prompt">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">🖼️ Image → Prompt</Button>
              </Link>
              <Link to="/reference-coding">
                <Button variant="secondary" size="lg" className="w-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10 sm:w-auto">💻 Reference → Code Prompt</Button>
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-400">
              <span>🎁 3 free prompts every day</span>
              <span className="text-slate-700">•</span>
              <span>Reference image aware</span>
              <span className="text-slate-700">•</span>
              <span>Built for your AI workflow</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-10 rounded-[4rem] bg-gradient-to-br from-blue-500/20 via-violet-500/10 to-cyan-400/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.055] p-2 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">PromptStudio Reference Engine</span>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">Ready</span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link to="/image-to-prompt" className="group relative min-h-[290px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-3 transition hover:border-blue-400/40">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_35%,rgba(251,191,36,0.32),transparent_22%),radial-gradient(circle_at_30%_70%,rgba(59,130,246,0.28),transparent_30%)]" />
                    <div className="relative flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-slate-400"><span>Reference image</span><span>01</span></div>
                    <div className="relative mt-4 flex h-52 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                      <div className="absolute h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
                      <div className="relative h-36 w-28 rotate-[-7deg] rounded-[2rem] border border-white/20 bg-gradient-to-br from-amber-100 via-orange-300 to-rose-500 shadow-[0_30px_60px_-20px_rgba(251,146,60,0.75)] transition duration-500 group-hover:scale-105">
                        <div className="absolute left-4 top-5 h-8 w-16 rounded-full bg-white/60 blur-md" />
                        <div className="absolute bottom-5 right-4 h-8 w-8 rounded-full border border-white/30 bg-white/20" />
                      </div>
                    </div>
                    <div className="relative mt-3 flex items-center justify-between text-xs font-bold text-white"><span>Image → Prompt</span><span className="text-blue-300">→</span></div>
                  </Link>

                  <Link to="/reference-coding" className="group relative min-h-[290px] overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-slate-900 via-violet-950/70 to-slate-900 p-3 transition hover:border-violet-300/50">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(167,139,250,0.25),transparent_28%),radial-gradient(circle_at_75%_70%,rgba(59,130,246,0.22),transparent_30%)]" />
                    <div className="relative flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-slate-400"><span>UI / app reference</span><span className="text-violet-300">02</span></div>
                    <div className="relative mt-4 rounded-xl border border-white/10 bg-black/30 p-3 shadow-inner shadow-black/30">
                      <div className="flex gap-1.5"><span className="h-1.5 w-10 rounded-full bg-white/20" /><span className="h-1.5 w-6 rounded-full bg-white/10" /><span className="h-1.5 w-8 rounded-full bg-white/10" /></div>
                      <div className="mt-3 grid grid-cols-[0.35fr_1fr] gap-2">
                        <div className="space-y-2"><div className="h-14 rounded-lg bg-white/[0.07]" /><div className="h-8 rounded-lg bg-white/[0.05]" /><div className="h-8 rounded-lg bg-white/[0.05]" /></div>
                        <div className="space-y-2"><div className="h-20 rounded-lg bg-gradient-to-br from-blue-400/20 to-violet-400/20" /><div className="grid grid-cols-2 gap-2"><div className="h-12 rounded-lg bg-white/[0.06]" /><div className="h-12 rounded-lg bg-white/[0.06]" /></div></div>
                      </div>
                    </div>
                    <div className="relative mt-3 rounded-xl border border-violet-300/15 bg-white/[0.045] p-3">
                      <div className="text-[10px] font-bold text-violet-300">Intent understood</div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">Analyze the existing UI, preserve its purpose, improve the UX, and generate a production-ready implementation prompt.</p>
                    </div>
                    <div className="relative mt-3 flex items-center justify-between text-xs font-bold text-white"><span>Reference → Code Prompt</span><span className="text-violet-300">→</span></div>
                  </Link>
                </div>

                <div className="mt-3 flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:gap-5">
                  <span>ChatGPT</span><span>Claude</span><span>Gemini</span><span>Cursor</span><span>More AI</span>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold text-slate-300 shadow-xl backdrop-blur-xl sm:block"><span className="text-emerald-300">✦</span> Reference → Intent → Prompt</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
