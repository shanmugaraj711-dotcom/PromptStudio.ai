import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";

function AppIcon({ small = false }) {
  return <img src="/bubblewrap-test/icon.svg" alt="" className={`shrink-0 rounded-xl object-cover shadow-lg shadow-blue-600/20 ${small ? "h-9 w-9" : "h-12 w-12"}`} aria-hidden="true" />;
}

function ToolTile({ to, icon, title, detail }) {
  return (
    <Link to={to} className="group flex min-h-[92px] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 transition hover:border-blue-500/60 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-sm font-black text-blue-300" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-100">{title}</span><span className="mt-1 block text-xs leading-4 text-slate-400">{detail}</span></span>
      <span className="text-lg text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-400" aria-hidden="true">→</span>
    </Link>
  );
}

function Usage({ quota, plan }) {
  const used = Math.max(quota.dailyLimit - quota.remaining, 0);
  const progress = quota.dailyLimit ? Math.min((used / quota.dailyLimit) * 100, 100) : 0;
  return <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Usage and upgrade status"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Today&apos;s usage</p><p className="mt-1 text-sm font-semibold text-slate-200">{quota.remaining} prompts left</p></div><Link to="/account#plans" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500">{plan === "pro" ? "Manage" : "Upgrade"}</Link></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{used} of {quota.dailyLimit} used · Resets tomorrow</p></section>;
}

export default function Landing() {
  const navigate = useNavigate();
  const { userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [idea, setIdea] = useState("");
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });

  const createPrompt = (event) => {
    event.preventDefault();
    navigate(idea.trim() ? `/builder?idea=${encodeURIComponent(idea.trim())}` : "/builder");
  };

  return <main className="min-h-screen overflow-x-hidden bg-slate-950 pb-24 text-slate-100"><header className="border-b border-slate-800/80 bg-slate-950/95"><div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4"><Link to="/" className="flex items-center gap-2.5" aria-label="PromptStudio AI home"><AppIcon small /><span className="text-base font-bold tracking-[-0.03em]">PromptStudio <span className="text-blue-400">AI</span></span></Link><Link to="/account" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-900 hover:text-white" aria-label="Open account"><span className="flex w-5 flex-col gap-1"><span className="h-0.5 w-full rounded bg-current" /><span className="h-0.5 w-3/4 self-end rounded bg-current" /><span className="h-0.5 w-full rounded bg-current" /></span></Link></div></header><div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6"><section><p className="text-xs font-semibold text-blue-400">{userProfile?.displayName ? `Welcome back, ${userProfile.displayName.split(" ")[0]}` : "Your creative workspace"}</p><h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-[-0.055em] text-white sm:text-4xl">What are you creating today?</h1></section><form onSubmit={createPrompt} className="rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/20"><label htmlFor="home-idea" className="sr-only">Describe what you want to create</label><textarea id="home-idea" value={idea} onChange={(event) => setIdea(event.target.value)} rows={4} placeholder="Describe what you want to create..." className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-slate-100 outline-none placeholder:text-slate-500" /><div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3"><span className="text-xs text-slate-500">Start with an idea, goal, or question</span><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98]">Generate <span aria-hidden="true">→</span></button></div></form><section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-200">Workspace</h2><Link to="/builder" className="text-xs font-semibold text-blue-400 hover:text-blue-300">Open builder</Link></div><div className="grid gap-2.5 sm:grid-cols-2"><ToolTile to="/builder?mode=image" icon="▧" title="Image → Prompt" detail="Try: a photo of your product → get a ready-to-use prompt" /><ToolTile to="/reference-coding" icon="&lt;/&gt;" title="Reference → Code" detail="Try: a UI screenshot → get a ready-to-use code prompt" /></div></section><section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-200">Recent</h2><Link to="/history" className="text-xs font-semibold text-blue-400 hover:text-blue-300">View all</Link></div><div className="rounded-2xl border border-slate-800 bg-slate-900/45 px-4 py-3 text-sm text-slate-500">Your generated prompts will appear here.</div></section><Usage quota={quota} plan={plan} /></div><nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur" aria-label="Primary navigation"><div className="mx-auto flex h-[68px] max-w-2xl items-center justify-around px-3"><Link to="/" className="flex min-w-16 flex-col items-center gap-1 text-blue-400"><span className="text-lg" aria-hidden="true">⌂</span><span className="text-[10px] font-bold">Home</span></Link><Link to="/builder" className="flex min-w-16 flex-col items-center gap-1 text-slate-500 transition hover:text-slate-200"><span className="text-lg" aria-hidden="true">＋</span><span className="text-[10px] font-semibold">Create</span></Link><Link to="/history" className="flex min-w-16 flex-col items-center gap-1 text-slate-500 transition hover:text-slate-200"><span className="text-lg" aria-hidden="true">◷</span><span className="text-[10px] font-semibold">History</span></Link><Link to="/account" className="flex min-w-16 flex-col items-center gap-1 text-slate-500 transition hover:text-slate-200"><span className="text-lg" aria-hidden="true">○</span><span className="text-[10px] font-semibold">Account</span></Link></div></nav></main>;
}
