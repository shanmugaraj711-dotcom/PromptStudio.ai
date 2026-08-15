import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import PRODUCT_CONFIG from "../../config/product.config";

export const Dashboard = () => {
  const { user, userProfile, logout, plan, promptsToday, lastPromptDate } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const displayName = userProfile?.name || user?.displayName || "Creator";
  const userEmail = userProfile?.email || user?.email || "N/A";
  const quota = createQuotaState({
    plan,
    promptsToday,
    lastPromptDate,
    imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth,
    lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth,
  });
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const isPro = plan === "pro";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-xl font-extrabold tracking-tight text-indigo-600">PromptStudio AI</Link>
          <span className="hidden sm:inline-flex px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">{plan} Plan</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/plan" className="text-sm font-semibold text-slate-600 hover:text-indigo-600">Plan & Billing</Link>
          <Link to="/account" className="text-sm font-semibold text-slate-600 hover:text-indigo-600">Account</Link>
          <button onClick={handleLogout} className="text-sm font-semibold text-slate-500 hover:text-red-600">Logout</button>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 bg-indigo-100 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-indigo-600 uppercase">PromptStudio workspace</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Welcome, {displayName}! 👋</h1>
              <p className="mt-2 text-sm text-slate-500">{userEmail}</p>
            </div>
            <Link to="/builder" className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200">+ Create New Prompt</Link>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Link to="/plan" className="group bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:-translate-y-0.5 hover:border-indigo-200 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Plan</span>
              <span className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">💳</span>
            </div>
            <div className="mt-5 text-3xl font-extrabold capitalize text-slate-900">{plan}</div>
            <p className="mt-1 text-sm text-slate-500">{isPro ? "Your Pro benefits and usage" : "See Pro and credit options"}</p>
            <span className="mt-4 inline-flex text-sm font-bold text-indigo-600 group-hover:underline">View plan & billing →</span>
          </Link>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Prompt Usage</span>
              <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">⚡</span>
            </div>
            <div className="mt-5 text-3xl font-extrabold text-slate-900">{quota.remaining} / {quota.dailyLimit}</div>
            <p className="mt-1 text-sm text-slate-500">prompts remaining today</p>
            <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, (quota.remaining / Math.max(quota.dailyLimit, 1)) * 100)}%` }} /></div>
            <div className="mt-4 space-y-2 text-sm">
              <Link to="/plan" className="block font-bold text-indigo-600 hover:text-indigo-700">⭐ {isPro ? "Manage Pro" : `Unlock Pro — ₹${PRODUCT_CONFIG.pricing.proMonthlyInr}/month`}</Link>
              <Link to="/plan#credits" className="block font-bold text-slate-700 hover:text-indigo-600">⚡ Buy 25 credits — ₹{PRODUCT_CONFIG.pricing.creditPackInr}</Link>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference Image Usage</span>
              <span className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-xl">🖼️</span>
            </div>
            <div className="mt-5 text-3xl font-extrabold text-slate-900">{quota.imageRemaining} / {quota.monthlyImageLimit}</div>
            <p className="mt-1 text-sm text-slate-500">image analyses remaining this month</p>
            <p className="mt-4 text-xs text-slate-400">Your image allowance is separate from daily prompt usage.</p>
            {credits > 0 && <p className="mt-2 text-sm font-semibold text-violet-700">⚡ {credits} credits available</p>}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Link to="/builder" className="group bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl p-6 shadow-sm transition-all">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl mb-4">🪄</div>
            <h3 className="font-bold text-slate-900">Generate Prompt</h3>
            <p className="mt-1 text-sm text-slate-500">Turn an idea or reference image into a ready-to-use prompt.</p>
            <span className="mt-4 inline-flex text-sm font-bold text-indigo-600">Launch Builder →</span>
          </Link>
          <Link to="/history" className="group bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl p-6 shadow-sm transition-all">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl mb-4">📜</div>
            <h3 className="font-bold text-slate-900">History</h3>
            <p className="mt-1 text-sm text-slate-500">View and manage previously generated prompts.</p>
            <span className="mt-4 inline-flex text-sm font-bold text-indigo-600">View history →</span>
          </Link>
          <Link to="/account" className="group bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl p-6 shadow-sm transition-all">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-xl mb-4">⚙️</div>
            <h3 className="font-bold text-slate-900">Account Settings</h3>
            <p className="mt-1 text-sm text-slate-500">Manage your profile and security settings.</p>
            <span className="mt-4 inline-flex text-sm font-bold text-indigo-600">View account →</span>
          </Link>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
