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
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="group shrink-0 rounded-2xl px-2 py-1.5 transition hover:bg-slate-50"
            aria-label="PromptStudio AI dashboard"
          >
            <div className="text-xl font-black tracking-[-0.04em] text-slate-950 sm:text-2xl">
              PromptStudio <span className="text-indigo-600 transition group-hover:text-violet-600">AI</span>
            </div>
            <div className="mt-0.5 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
              Creative Intelligence
            </div>
          </Link>

          <div className="hidden h-8 w-px bg-slate-200 md:block" />

          <nav className="hidden items-center gap-1.5 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/account")}
              className="group rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-3.5 py-2 text-xs font-extrabold text-indigo-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md sm:px-4 sm:text-sm"
              title="View your plan and usage"
              aria-label={`View usage: ${quotaLabel}`}
            >
              <span className="mr-1">⚡</span>{quotaLabel}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 sm:inline-flex"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2.5 sm:px-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${
                    isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="ml-auto whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
