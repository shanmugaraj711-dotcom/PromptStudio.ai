import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { createQuotaState } from "../../constants/quota";
import { useAuth } from "../../context/AuthContext";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";

const baseNavItems = [
  { to: "/dashboard", label: "Home", icon: "⌂" },
  { to: "/builder", label: "Create", icon: "+" },
  { to: "/history", label: "History", icon: "↺", feature: "promptHistory" },
  { to: "/account", label: "Account", icon: "○" },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { user, plan, promptsToday, lastPromptDate, logout } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate }, new Date(), productConfig);
  const quotaLabel = quota.remaining === null ? "Unlimited" : `${quota.remaining} prompts left`;
  const navItems = baseNavItems.filter((item) => !item.feature || productConfig?.features?.[item.feature]?.enabled !== false);

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user)
      .then((config) => { if (active) setProductConfig(config); })
      .catch((error) => console.error("Unable to load runtime product config", error));
    return () => { active = false; };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="workspace-shell min-h-screen overflow-x-hidden text-slate-100">
      <header className="workspace-topbar sticky top-0 z-40">
        <div className="mx-auto flex min-h-[4.25rem] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="workspace-brand flex min-w-0 items-center gap-3" aria-label="PromptStudio AI dashboard">
            <span className="brand-mark grid size-9 shrink-0 place-items-center rounded-[0.9rem] text-lg font-black">P</span>
            <span className="min-w-0"><span className="block truncate text-[1.05rem] font-black tracking-[-0.04em] text-white">PromptStudio <em className="not-italic text-cyan-300">AI</em></span><span className="hidden text-[0.6rem] font-bold uppercase tracking-[0.24em] text-slate-500 sm:block">Creative intelligence</span></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `workspace-nav-link ${isActive ? "is-active" : ""}`}>{item.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => navigate("/account#plans")} className="usage-pill" aria-label={`View usage: ${quotaLabel}`}><span className="usage-dot" />{quotaLabel}</button>
            {user ? <button type="button" onClick={handleLogout} className="hidden rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 transition hover:border-white/20 hover:text-white xl:inline-flex">Log out</button> : <Link to="/login" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-300/10">Sign in</Link>}
          </div>
        </div>
      </header>
      <main className="workspace-content">{children}</main>
      <nav className="workspace-bottom-nav" aria-label="Mobile navigation">
        {navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}><span className="bottom-nav-icon">{item.icon}</span><span>{item.label}</span></NavLink>)}
      </nav>
    </div>
  );
}
