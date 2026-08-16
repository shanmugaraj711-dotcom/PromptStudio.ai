import { Link, NavLink, useNavigate } from "react-router-dom";
import { createQuotaState } from "../../constants/quota";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { to: "/builder", label: "🪄 Builder" },
  { to: "/history", label: "📜 History" },
  { to: "/account", label: "⚙️ Account" },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { plan, promptsToday, lastPromptDate, logout } = useAuth();
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });
  const quotaLabel = quota.remaining === null ? "∞ left" : `${quota.remaining}/${quota.dailyLimit} left`;

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="shrink-0 text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">
            PromptStudio <span className="text-indigo-600">AI</span>
          </Link>
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => navigate("/account")} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-100 sm:text-sm" title="View your plan and usage" aria-label={`View usage: ${quotaLabel}`}>
              ⚡ {quotaLabel}
            </button>
            <button type="button" onClick={handleLogout} className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 sm:inline-flex">
              Logout
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={handleLogout} className="ml-auto whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Logout</button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
