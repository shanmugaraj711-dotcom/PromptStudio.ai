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
              <span className="block bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">GET THE PROMPT.</span>
              <span className="block">CREATE IT.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Turn any image into a powerful AI prompt — or start with an idea. PromptStudio makes the path from your thought to a ready-to-use prompt simple.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/image-to-prompt">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">🖼️ Try Image → Prompt</Button>
              </Link>
              <Link to="/builder">
                <Button variant="secondary" size="lg" className="w-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10 sm:w-auto">✦ Build a Prompt</Button>
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-400">
              <span>Reference image aware</span>
              <span className="text-slate-700">•</span>
              <span>Built for ChatGPT, Claude & Gemini</span>
              <span className="text-slate-700">•</span>
              <span>One workspace</span>
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
                    <span className="ml-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">PromptStudio Visual Engine</span>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">Ready</span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
                  <Link to="/image-to-prompt" className="group relative min-h-[290px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-3 transition hover:border-blue-400/40">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_35%,rgba(251,191,36,0.32),transparent_22%),radial-gradient(circle_at_30%_70%,rgba(59,130,246,0.28),transparent_30%)]" />
                    <div className="relative flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                      <span>Reference image</span><span>01</span>
                    </div>
                    <div className="relative mt-4 flex h-52 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                      <div className="absolute h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
                      <div className="relative h-36 w-28 rotate-[-7deg] rounded-[2rem] border border-white/20 bg-gradient-to-br from-amber-100 via-orange-300 to-rose-500 shadow-[0_30px_60px_-20px_rgba(251,146,60,0.75)] transition duration-500 group-hover:scale-105">
                        <div className="absolute left-4 top-5 h-8 w-16 rounded-full bg-white/60 blur-md" />
                        <div className="absolute bottom-5 right-4 h-8 w-8 rounded-full border border-white/30 bg-white/20" />
                      </div>
                    </div>
                    <div className="relative mt-3 flex items-center justify-between text-xs font-bold text-white"><span>See the visual</span><span className="text-blue-300">→</span></div>
                  </Link>

                  <div className="relative min-h-[290px] overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-white/[0.03] to-violet-500/10 p-4">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-slate-400"><span>Prompt decoded</span><span className="text-blue-300">02</span></div>
                    <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 shadow-inner shadow-black/30">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-blue-300"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Visual analysis complete</div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">A cinematic close-up with warm directional light, sculpted highlights, controlled depth of field, rich orange tones and a premium editorial finish…</p>
                      <div className="mt-4 flex flex-wrap gap-1.5 text-[9px] font-bold text-slate-400"><span className="rounded-full bg-white/[0.06] px-2 py-1">Composition</span><span className="rounded-full bg-white/[0.06] px-2 py-1">Lighting</span><span className="rounded-full bg-white/[0.06] px-2 py-1">Detail</span><span className="rounded-full bg-white/[0.06] px-2 py-1">Style</span></div>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[10px] font-bold text-slate-400 backdrop-blur-xl"><span className="text-emerald-300">✓</span> Ready to copy into your AI</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:gap-5">
                  <span>ChatGPT</span><span>Claude</span><span>Gemini</span><span>More AI</span>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold text-slate-300 shadow-xl backdrop-blur-xl sm:block">
              <span className="text-emerald-300">✦</span> Image → Prompt, made simple.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
