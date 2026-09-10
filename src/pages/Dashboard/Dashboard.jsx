import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";
import LucideIcon from "../../components/ui/LucideIcon";

const FEATURES = [
  { id: "prompt", label: "Prompt Lab", title: "Text & LLM prompts", copy: "Turn rough ideas into precise prompts for the AI you choose.", icon: "sparkles", href: "/builder?mode=standard", tag: "CORE" },
  { id: "image", label: "Image Intel", title: "Image → Prompt", copy: "Upload a visual reference and extract the details that matter.", icon: "image", href: "/builder?mode=image", tag: "VISUAL" },
  { id: "code", label: "Code Lab", title: "Reference → Code", copy: "Give AI screenshots or files and get implementation-ready direction.", icon: "code", href: "/reference-coding", tag: "5 CREDITS" },
  { id: "studio", label: "Studio", title: "Build a website", copy: "Describe a product, inspect the generated preview, edit it, then ship.", icon: "layout", href: "/studio", tag: "PREVIEW" },
  { id: "apk", label: "APK Forge", title: "Website → Android", copy: "Package an existing product into a reviewed, isolated Android build.", icon: "smartphone", href: "/apk-forge", tag: "₹500" },
];

const TRENDS = [
  { label: "80s retro", idea: "Create an 80s retro-inspired visual with neon lighting, cinematic grain, bold typography and authentic period styling." },
  { label: "Premium SaaS", idea: "Design a premium SaaS landing page with a focused hero, proof-driven sections, clean pricing and a strong conversion CTA." },
  { label: "Restaurant launch", idea: "Build a modern restaurant landing page with an editorial hero, menu highlights, location details and a clear reservation CTA." },
  { label: "Mobile app UI", idea: "Design a polished mobile app interface with a compact navigation system, strong hierarchy, accessible touch targets and refined empty states." },
  { label: "Cinematic product", idea: "Create a cinematic product presentation with dramatic lighting, realistic materials, controlled reflections and a premium commercial finish." },
];

function CreditPill({ credits, onClick }) {
  return <button type="button" onClick={onClick} className="group inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[0.06] px-3 py-2 text-xs font-black text-white shadow-[0_0_30px_rgba(34,211,238,0.08)] transition hover:border-cyan-300/40 hover:bg-white/[0.09]" aria-label={`${credits} credits available`}><span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-300/10 text-base transition group-hover:scale-105">🤖</span><span><span className="text-cyan-300">{credits}</span> credits</span><span className="hidden text-slate-500 sm:inline">·</span><span className="hidden text-slate-400 sm:inline">add more</span></button>;
}

function FeatureCard({ item, onOpen }) {
  return <button type="button" onClick={() => onOpen(item.href)} className="group min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.055] focus:outline-none focus:ring-2 focus:ring-cyan-300/40"><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-slate-950/80 text-cyan-300"><LucideIcon name={item.icon} size={18} /></span><span className="rounded-full border border-white/8 px-2 py-1 text-[9px] font-black tracking-[0.14em] text-slate-500">{item.tag}</span></div><p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</p><h3 className="mt-1 text-sm font-black text-white">{item.title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-400">{item.copy}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-cyan-300">Open <LucideIcon name="arrow" size={14} /></span></button>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const [idea, setIdea] = useState("");
  const [workspace, setWorkspace] = useState("prompt");
  const [trendIndex, setTrendIndex] = useState(0);

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error("Unable to load runtime product config", error));
    return () => { active = false; };
  }, [user]);

  const displayName = userProfile?.name || user?.displayName || "Creator";
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesToday: userProfile?.imageAnalysesToday, lastImageAnalysisDate: userProfile?.lastImageAnalysisDate, imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth, lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth }, new Date(), productConfig);
  const quotaPercent = quota.remaining === null ? 100 : Math.min(100, (quota.remaining / Math.max(1, quota.dailyLimit)) * 100);
  const trend = TRENDS[trendIndex % TRENDS.length];
  const selected = useMemo(() => FEATURES.find((item) => item.id === workspace) || FEATURES[0], [workspace]);

  const openWorkspace = (href = selected.href) => navigate(href);
  const injectTrend = () => setIdea(trend.idea);
  const start = (event) => { event.preventDefault(); if (!idea.trim()) return; const query = `&idea=${encodeURIComponent(idea.trim())}`; if (workspace === "studio") navigate(`/studio?idea=${encodeURIComponent(idea.trim())}`); else if (workspace === "image") navigate(`/builder?mode=image${query}`); else if (workspace === "code") navigate(`/reference-coding?idea=${encodeURIComponent(idea.trim())}`); else navigate(`/builder?mode=standard${query}`); };

  return <main className="min-h-[calc(100vh-4.5rem)] overflow-x-hidden bg-[#070b12] text-slate-100">
    <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.09),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(99,102,241,0.10),transparent_30%)]" />
    <div className="relative z-10 mx-auto w-full max-w-7xl px-3 pb-10 pt-4 sm:px-5 lg:px-7">
      <section className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">PromptStudio · Master Workspace</p><h1 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Good to see you, {displayName.split(" ")[0]}. <span className="text-slate-500">What are we making?</span></h1></div>
        <CreditPill credits={credits} onClick={() => navigate("/account#plans")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(270px,.75fr)]">
        <div className="rounded-2xl border border-white/10 bg-[#0b111b]/95 p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Create</p><h2 className="mt-1 text-lg font-black text-white">One workspace. Every AI workflow.</h2></div><span className="hidden rounded-full border border-emerald-300/15 bg-emerald-300/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 sm:inline-flex">Systems online</span></div>
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Workspace type">{FEATURES.slice(0, 4).map((item) => <button key={item.id} type="button" role="tab" aria-selected={workspace === item.id} onClick={() => setWorkspace(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${workspace === item.id ? "bg-cyan-300 text-slate-950" : "border border-white/8 bg-white/[0.025] text-slate-400 hover:text-white"}`}>{item.label}</button>)}</div>
          <form onSubmit={start} className="mt-3"><textarea value={idea} onChange={(event) => setIdea(event.target.value)} rows={4} maxLength={6000} placeholder={workspace === "studio" ? "Describe the website you want to preview…" : workspace === "image" ? "Describe the image you want to understand or transform into a prompt…" : workspace === "code" ? "Describe the product or UI you want AI to implement…" : "Tell PromptStudio what you want to create…"} className="w-full resize-none rounded-xl border border-white/8 bg-[#070b12] p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-4 focus:ring-cyan-300/5" />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="submit" disabled={!idea.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-35">Open {selected.label} <LucideIcon name="arrow" size={16} /></button><div className="flex items-center justify-between gap-3 text-[11px] text-slate-500"><span>{idea.length}/6000</span><button type="button" onClick={() => setIdea("")} disabled={!idea} className="font-bold hover:text-white disabled:opacity-30">Clear</button></div></div>
          </form>
        </div>

        <aside className="rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.07] to-indigo-400/[0.04] p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Usage signal</p><h2 className="mt-1 text-lg font-black text-white">{quota.remaining === null ? "Unlimited" : `${quota.remaining} left`}</h2></div><span className="text-xl">⚡</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: `${quotaPercent}%` }} /></div><div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-500"><span>{quota.remaining === null ? "Pro flow" : `${Math.max(0, quota.dailyLimit - quota.remaining)} used`}</span><span>{quota.dailyLimit} daily</span></div><button type="button" onClick={() => navigate("/account#plans")} className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:border-cyan-300/20 hover:text-white"><span><span className="mr-1.5">💎</span>{credits} credits</span><LucideIcon name="arrow" size={14} /></button></aside>
      </section>

      <section className="mt-4"><div className="mb-2.5 flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Capabilities</p><h2 className="mt-1 text-sm font-black text-white">Everything stays one click away</h2></div><button type="button" onClick={() => navigate("/history")} className="text-xs font-bold text-slate-500 hover:text-cyan-300">History <span>→</span></button></div><div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">{FEATURES.map((item) => <FeatureCard key={item.id} item={item} onOpen={openWorkspace} />)}</div></section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Trending prompts</p><h2 className="mt-1 text-sm font-black text-white">Borrow the signal. Make it yours.</h2></div><button type="button" onClick={() => setTrendIndex((value) => (value + 1) % TRENDS.length)} className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white">Next trend ↻</button></div><div className="mt-3 rounded-xl border border-white/8 bg-[#070b12] p-3.5"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black text-cyan-300">#{trend.label}</span><span className="text-[10px] text-slate-600">live feed</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{trend.idea}</p><button type="button" onClick={injectTrend} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-50">Inject into composer <LucideIcon name="arrow" size={13} /></button></div></div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Quick routes</p><div className="mt-3 grid grid-cols-2 gap-2">{[["History","/history","clock"],["Account","/account","wallet"],["Studio","/studio","layout"],["APK builds","/apk-forge/my-builds","smartphone"]].map(([label, href, icon]) => <button type="button" key={href} onClick={() => navigate(href)} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 py-3 text-left text-xs font-bold text-slate-400 transition hover:border-cyan-300/20 hover:text-white"><LucideIcon name={icon} size={15} className="text-cyan-300" />{label}</button>)}</div><p className="mt-4 text-[10px] leading-5 text-slate-600">No hidden workspace routes. Studio, coding, visual intelligence and Forge remain reachable from this hub.</p></div>
      </section>
    </div>
  </main>;
}
