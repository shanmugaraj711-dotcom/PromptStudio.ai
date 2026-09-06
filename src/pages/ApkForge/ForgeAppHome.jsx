import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Icon({ children }) {
  return <span aria-hidden="true" className="text-lg leading-none">{children}</span>;
}

export default function ForgeAppHome() {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.backgroundColor = "#0b0b0f";
    document.body.style.backgroundColor = "#0b0b0f";
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, []);

  const open = (path) => navigate(path);

  return (
    <div className="min-h-[100svh] bg-[#0b0b0f] text-white selection:bg-indigo-500/30">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-2xl flex-col bg-[#0b0b0f]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-[#0b0b0f]/90 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur-xl">
          <button type="button" onClick={() => open("/")} className="flex items-center gap-3" aria-label="PromptStudio home">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-blue-600 text-lg font-black shadow-lg shadow-indigo-900/30">P</span>
            <div className="text-left">
              <div className="text-[17px] font-extrabold tracking-[-0.03em]">PromptStudio</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">AI workspace</div>
            </div>
          </button>
          <button type="button" onClick={() => open("/login")} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition active:scale-95" aria-label="Account">◉</button>
        </header>

        <main className="flex-1 px-5 pb-28 pt-7">
          <section className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
              Visual intelligence
            </div>
            <h1 className="max-w-[13ch] text-[42px] font-black leading-[0.98] tracking-[-0.055em] sm:text-5xl">
              See it. Understand it. <span className="bg-gradient-to-r from-sky-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">Prompt it.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-white/55">Turn screenshots, references and ideas into prompts built for your AI workflow.</p>
          </section>

          <section className="grid gap-3">
            <button type="button" onClick={() => open("/image-to-prompt")} className="group relative overflow-hidden rounded-[24px] border border-indigo-400/20 bg-gradient-to-br from-indigo-600 to-blue-600 p-5 text-left shadow-2xl shadow-indigo-950/40 transition active:scale-[0.985]">
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Icon>✦</Icon></div>
                  <div className="text-xl font-extrabold tracking-tight">Image → Prompt</div>
                  <div className="mt-1 text-sm text-white/65">Show AI what you want to create.</div>
                </div>
                <span className="mt-1 text-2xl transition group-active:translate-x-1">→</span>
              </div>
            </button>

            <button type="button" onClick={() => open("/reference-coding")} className="group rounded-[24px] border border-white/10 bg-white/[0.055] p-5 text-left shadow-xl shadow-black/20 transition active:scale-[0.985]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]"><Icon>⌘</Icon></div>
                  <div className="text-xl font-extrabold tracking-tight">Reference → Code Prompt</div>
                  <div className="mt-1 text-sm text-white/45">Turn an existing UI into an implementation-ready prompt.</div>
                </div>
                <span className="mt-1 text-2xl text-white/60 transition group-active:translate-x-1">→</span>
              </div>
            </button>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white/80">Your workspace</h2>
              <button type="button" onClick={() => open("/login")} className="text-xs font-bold text-indigo-300">Sign in</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => open("/history")} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition active:scale-[0.98]">
                <div className="mb-3 text-lg">◷</div><div className="text-sm font-bold">History</div><div className="mt-1 text-xs text-white/40">Your prompts</div>
              </button>
              <button type="button" onClick={() => open("/workflows")} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition active:scale-[0.98]">
                <div className="mb-3 text-lg">▦</div><div className="text-sm font-bold">Workflows</div><div className="mt-1 text-xs text-white/40">Saved systems</div>
              </button>
            </div>
          </section>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto w-full max-w-2xl border-t border-white/[0.08] bg-[#0b0b0f]/95 px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur-2xl" aria-label="App navigation">
          <div className="grid grid-cols-4 gap-1">
            <button type="button" onClick={() => open("/bubblewrap-test/")} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-indigo-300"><span className="text-lg">⌂</span><span className="text-[10px] font-bold">Home</span></button>
            <button type="button" onClick={() => open("/image-to-prompt")} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-white/45"><span className="text-lg">✦</span><span className="text-[10px] font-bold">Create</span></button>
            <button type="button" onClick={() => open("/history")} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-white/45"><span className="text-lg">◷</span><span className="text-[10px] font-bold">History</span></button>
            <button type="button" onClick={() => open("/account")} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-white/45"><span className="text-lg">◉</span><span className="text-[10px] font-bold">Account</span></button>
          </div>
        </nav>
      </div>
    </div>
  );
}
