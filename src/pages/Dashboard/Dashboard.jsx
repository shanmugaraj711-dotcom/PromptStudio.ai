import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createQuotaState } from '../../constants/quota';
import { fetchRuntimeProductConfig } from '../../services/runtimeProductConfig';
import LucideIcon from '../../components/ui/LucideIcon';
import WorkspaceSurface, { MODES } from '../../components/workspace/WorkspaceSurface';

const TRENDS = [
  { label: '80s retro', idea: 'Create an 80s retro-inspired visual with neon lighting, cinematic grain, bold typography and authentic period styling.' },
  { label: 'Premium SaaS', idea: 'Design a premium SaaS landing page with a focused hero, proof-driven sections, clean pricing and a strong conversion CTA.' },
  { label: 'Restaurant launch', idea: 'Build a modern restaurant landing page with an editorial hero, menu highlights, location details and a clear reservation CTA.' },
  { label: 'Mobile app UI', idea: 'Design a polished mobile app interface with compact navigation, strong hierarchy, accessible touch targets and refined empty states.' },
];

function CreditPill({ credits, onClick }) {
  return <button type="button" onClick={onClick} className="group inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white transition hover:border-cyan-300/40 hover:bg-white/[0.09]" aria-label={`${credits} credits available`}><span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-300/10 text-base transition group-hover:scale-105">🤖</span><span><span className="text-cyan-300">{credits}</span> credits</span><span className="hidden text-slate-500 sm:inline">·</span><span className="hidden text-slate-400 sm:inline">manage</span></button>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const [idea, setIdea] = useState('');
  const [workspace, setWorkspace] = useState('prompt');
  const [trendIndex, setTrendIndex] = useState(0);

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error('Unable to load runtime product config', error));
    return () => { active = false; };
  }, [user]);

  const displayName = userProfile?.name || user?.displayName || 'Creator';
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesToday: userProfile?.imageAnalysesToday, lastImageAnalysisDate: userProfile?.lastImageAnalysisDate, imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth, lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth }, new Date(), productConfig);
  const trend = useMemo(() => TRENDS[trendIndex % TRENDS.length], [trendIndex]);
  const activeMode = MODES.find((item) => item.id === workspace) || MODES[0];

  const injectTrend = () => setIdea(trend.idea);

  return <main className="min-h-[calc(100vh-4.5rem)] overflow-x-hidden bg-[#070b12] text-slate-100">
    <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.08),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(99,102,241,0.10),transparent_30%)]" />
    <div className="relative z-10 mx-auto w-full max-w-7xl px-3 pb-10 pt-3 sm:px-5 lg:px-7">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0a1019]/90 px-3 py-2.5 shadow-xl backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><LucideIcon name="sparkles" size={18} /></div><div className="min-w-0"><p className="truncate text-sm font-black text-white">PromptStudio <span className="text-cyan-300">AI</span></p><p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">Master workspace</p></div></div>
        <div className="flex items-center gap-2"><span className="hidden rounded-full border border-emerald-300/15 bg-emerald-300/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 sm:inline-flex">● Systems online</span><CreditPill credits={credits} onClick={() => navigate('/account#plans')} /></div>
      </header>

      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Workspace control</p><h1 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Good to see you, {displayName.split(' ')[0]}. <span className="text-slate-600">What are we making?</span></h1></div><div className="text-right text-[10px] font-semibold text-slate-600">{quota.remaining === null ? 'Unlimited generation' : `${quota.remaining} prompts remaining today`} · {credits} credits</div></div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Workspace modules">{MODES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={workspace === item.id} onClick={() => setWorkspace(item.id)} className={`group flex min-w-[132px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition duration-200 ${workspace === item.id ? 'border-cyan-300/35 bg-cyan-300/10 text-white shadow-[0_0_30px_rgba(34,211,238,0.08)]' : 'border-white/8 bg-black/10 text-slate-500 hover:border-white/15 hover:text-slate-200'}`}><span className={`grid h-7 w-7 place-items-center rounded-lg ${workspace === item.id ? 'bg-cyan-300 text-slate-950' : 'bg-white/[0.04] text-slate-500 group-hover:text-cyan-300'}`}><LucideIcon name={item.icon} size={15} /></span><span><span className="block text-[11px] font-black">{item.label}</span><span className="block text-[9px] text-slate-600">{item.description}</span></span></button>)}</div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-xl border border-white/8 bg-[#070b12] p-3"><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="master-idea" className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Shared brief</label><span className="text-[10px] text-slate-700">{idea.length}/6000</span></div><textarea id="master-idea" value={idea} onChange={(event) => setIdea(event.target.value)} rows={3} maxLength={6000} placeholder={workspace === 'studio' ? 'Describe the website you want to preview…' : workspace === 'apk' ? 'Describe the product you want to turn into Android…' : 'Tell PromptStudio what you want to create or change…'} className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-slate-700" /><div className="mt-1.5 flex items-center justify-between"><span className="text-[10px] text-slate-700">The brief follows you as you switch workspaces.</span>{idea&&<button type="button" onClick={() => setIdea('')} className="text-[10px] font-bold text-slate-500 hover:text-white">Clear</button>}</div></div>
          <div className="flex min-w-[190px] flex-col justify-between rounded-xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.07] to-indigo-400/[0.04] p-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Live signal</p><p className="mt-1 text-xs font-bold text-white">#{trend.label}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{trend.idea}</p></div><div className="mt-2 flex gap-1.5"><button type="button" onClick={injectTrend} className="flex-1 rounded-lg bg-white px-2.5 py-2 text-[10px] font-black text-slate-950 transition hover:bg-cyan-50">Use trend</button><button type="button" aria-label="Next trend" onClick={() => setTrendIndex((value) => (value + 1) % TRENDS.length)} className="rounded-lg border border-white/10 px-2.5 py-2 text-[10px] font-bold text-slate-500 hover:text-white">↻</button></div></div>
        </div>
      </section>

      <div className="mt-3 flex items-center justify-between gap-3 px-1"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Active module</p><p className="mt-0.5 text-xs font-bold text-slate-300">{activeMode.label} <span className="font-normal text-slate-600">· {activeMode.description}</span></p></div><span className="rounded-full border border-white/8 bg-white/[0.02] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">No navigation</span></div>
      <WorkspaceSurface workspace={workspace} idea={idea} setIdea={setIdea} />
    </div>
  </main>;
}
