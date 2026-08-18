import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";

export const Dashboard = () => {
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error("Unable to load runtime product config", error));
    return () => { active = false; };
  }, [user]);
  const displayName = userProfile?.name || user?.displayName || "Creator";
  const userEmail = userProfile?.email || user?.email || "N/A";
  const currentPlan = plan;
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate }, new Date(), productConfig);
  const quotaExhausted = quota.remaining === 0;
  const freeDailyLimit = productConfig?.plans?.free?.dailyPromptLimit ?? quota.dailyLimit;
  return (
    <div className="min-h-[calc(100vh-4.75rem)] bg-gray-950 text-gray-100">
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-blue-900/60 bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950/70 p-7 shadow-2xl sm:p-9">
          <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-700/50 bg-blue-950/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">✨ Your PromptStudio workspace</div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Welcome, {displayName}! 👋</h1><p className="mt-2 text-sm text-gray-400">{userEmail}</p></div><Link to="/builder" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-500">🪄 Create New Prompt</Link></div>
        </section>
        <section className="mt-7" aria-labelledby="workspace-overview">
          <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Workspace overview</p><h2 id="workspace-overview" className="mt-1 text-xl font-extrabold text-white">Your usage at a glance</h2></div><Link to="/account#plans" className="text-xs font-bold text-blue-400 transition hover:text-blue-300">Manage plan →</Link></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Link to="/account#plans" className="group rounded-2xl border border-blue-700/40 bg-gradient-to-br from-gray-900 to-blue-950/50 p-6 shadow-xl transition hover:-translate-y-0.5 hover:border-blue-500/70 hover:shadow-blue-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/60" aria-label="Open plan details and pricing"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Current Plan</span><span className="rounded-xl bg-blue-950/80 p-2.5 text-lg text-blue-300 transition group-hover:scale-105">💳</span></div><div className="mt-5 flex items-end justify-between gap-4"><div><div className="text-3xl font-black capitalize text-white">{currentPlan}</div><p className="mt-1 text-xs text-gray-400">{currentPlan === "free" ? "Limited daily usage" : "Premium access unlocked"}</p></div><span className="text-xs font-bold text-blue-300 opacity-0 transition group-hover:opacity-100">View plans →</span></div></Link>
            <div className={`group rounded-2xl border p-6 shadow-xl transition ${quotaExhausted ? "border-amber-500/40 bg-gradient-to-br from-gray-900 to-amber-950/20" : "border-gray-800 bg-gray-900 hover:border-blue-900/70"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Today's Prompt Usage</span><span className="rounded-xl bg-blue-950/70 p-2.5 text-lg text-blue-300">⚡</span></div><div className="mt-5 text-3xl font-black text-white">{quota.remaining === null ? "Unlimited" : `${quota.remaining} / ${quota.dailyLimit}`}</div><p className={`mt-1 text-xs font-semibold ${quotaExhausted ? "text-amber-300" : "text-gray-400"}`}>{quotaExhausted ? "Daily free limit reached" : "Prompts remaining today"}</p></div>
          </div>
          {quotaExhausted && currentPlan === "free" && <div className="mt-5 overflow-hidden rounded-2xl border border-blue-700/40 bg-gradient-to-r from-blue-950/80 via-gray-900 to-blue-900/70 p-5 shadow-xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-white">You've used today's {freeDailyLimit} free prompts.</p><p className="mt-1 text-xs text-gray-400">Keep creating now with Pro or a one-time credit pack.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Link to="/account#plans" className="rounded-xl bg-blue-600 px-4 py-2.5 text-center text-xs font-bold text-white transition hover:bg-blue-500">⭐ Pro · ₹79/month</Link><Link to="/account#plans" className="rounded-xl border border-blue-500/40 bg-gray-900 px-4 py-2.5 text-center text-xs font-bold text-blue-200 transition hover:border-blue-400 hover:bg-blue-950/50">⚡ Credits</Link></div></div></div>}
        </section>
      </main>
    </div>
  );
};
export default Dashboard;
