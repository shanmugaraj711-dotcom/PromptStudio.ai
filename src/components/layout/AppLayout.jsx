import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { createQuotaState } from "../../constants/quota";
import { useAuth } from "../../context/AuthContext";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";

const CORE_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/prompts", label: "Prompt Library" },
  { to: "/account#plans", label: "Manage Plan" },
  { to: "/help", label: "Help" },
  { to: "/history", label: "History", feature: "promptHistory" },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { user, plan, promptsToday, lastPromptDate, logout } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate }, new Date(), productConfig);
  const quotaLabel = quota.remaining === null ? "∞" : String(quota.remaining);
  const navItems = CORE_NAV.filter((item) => !item.feature || productConfig?.features?.[item.feature]?.enabled !== false);

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error("Unable to load current product configuration", error));
    return () => { active = false; };
  }, [user]);

  const handleLogout = async () => { await logout(); navigate("/", { replace: true }); };

  return <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-50 border-b border-white/8 bg-slate-950/90 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[4.25rem] max-w-[1400px] items-center gap-3 px-3 sm:px-5 lg:px-7">
        <Link to="/dashboard" className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl py-1.5" aria-label="PromptStudio AI Dashboard">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400 transition group-hover:scale-[1.03]">✦</span>
          <span className="min-w-0"><span className="block truncate text-[15px] font-black tracking-[-0.03em] text-white sm:text-lg">PromptStudio <span className="text-brand-400">AI</span></span><span className="hidden text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 sm:block">Prompts, sites and apps</span></span>
        </Link>
        <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Primary">
          {navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-lg px-2.5 py-2 text-xs font-black transition sm:px-3 sm:text-sm ${isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/[0.05] hover:text-white"}`}>{item.label}</NavLink>)}
          <button type="button" onClick={handleLogout} className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-black text-slate-500 transition hover:bg-white/[0.05] hover:text-white sm:px-3 sm:text-sm">Logout</button>
        </nav>
        <button type="button" onClick={() => navigate("/account#plans")} className="hidden shrink-0 items-center gap-1.5 rounded-full border border-brand-400/20 bg-brand-400/[0.06] px-2.5 py-1.5 text-xs font-black text-white transition hover:border-brand-400/40 sm:inline-flex" title="Manage plan and credits" aria-label={`${quotaLabel} credits. Manage plan`}><span className="text-brand-400">✦</span><span>{quotaLabel}</span></button>
      </div>
    </header>
    <main>{children}</main>
  </div>;
}
