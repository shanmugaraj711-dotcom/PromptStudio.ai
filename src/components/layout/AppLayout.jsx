import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { createQuotaState } from "../../constants/quota";
import { useAuth } from "../../context/AuthContext";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";

const baseNavItems = [
  { to: "/dashboard", label: "⌂ Workspace" },
  { to: "/builder", label: "✦ Prompt Lab" },
  { to: "/builder?mode=image", label: "◉ Image Intel" },
  { to: "/reference-coding", label: "⌘ Code Lab" },
  { to: "/studio", label: "▣ Studio" },
  { to: "/apk-forge", label: "▰ APK Forge" },
  { to: "/history", label: "◷ History", feature: "promptHistory" },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { user, plan, promptsToday, lastPromptDate, logout } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate }, new Date(), productConfig);
  const quotaLabel = quota.remaining === null ? "∞ left" : `${quota.remaining}/${quota.dailyLimit} left`;
  const navItems = baseNavItems.filter((item) => !item.feature || productConfig?.features?.[item.feature]?.enabled !== false);

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error("Unable to load runtime product config", error));
    return () => { active = false; };
  }, [user]);

  const handleLogout = async () => { await logout(); navigate("/", { replace: true }); };

  return <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#070b12]/95 shadow-[0_12px_40px_-20px_rgba(34,211,238,0.35)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[4.5rem] max-w-[1400px] items-center gap-3 px-3 sm:gap-4 sm:px-5 lg:px-7">
        <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5 rounded-xl py-1.5" aria-label="PromptStudio AI workspace"><span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.12)] transition group-hover:border-cyan-300/40">✦</span><div><div className="text-lg font-black tracking-[-0.04em] text-white sm:text-xl">PromptStudio <span className="text-cyan-300">AI</span></div><div className="hidden text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 sm:block">Master workspace</div></div></Link>
        <div className="hidden h-7 w-px bg-white/8 lg:block" />
        <nav className="hidden items-center gap-1 overflow-x-auto lg:flex" aria-label="Workspace navigation">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold transition ${isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/[0.05] hover:text-white"}`}>{item.label}</NavLink>)}</nav>
        <div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => navigate("/account#plans")} className="group inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-[11px] font-black text-white transition hover:border-cyan-300/40" title="View credits and plan"><span className="text-sm transition group-hover:scale-110">🤖</span><span className="text-cyan-300">{quotaLabel}</span></button><button type="button" onClick={handleLogout} className="hidden rounded-lg border border-white/8 px-3 py-2 text-[11px] font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white xl:inline-flex">Logout</button></div>
      </div>
      <div className="border-t border-white/5 lg:hidden"><div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-3 py-2 touch-pan-x sm:px-5">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition ${isActive ? "bg-white text-slate-950" : "text-slate-500 hover:bg-white/[0.05] hover:text-white"}`}>{item.label}</NavLink>)}<button type="button" onClick={() => navigate("/account#plans")} className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-cyan-300">💎 Credits</button><button type="button" onClick={handleLogout} className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-slate-500">Logout</button></div></div>
    </header>
    <main>{children}</main>
  </div>;
}
