import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";

export const Dashboard = () => {
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();

  const displayName = userProfile?.name || user?.displayName || "Creator";
  const userEmail = userProfile?.email || user?.email || "N/A";
  const currentPlan = plan;
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });

  return (
    <div className="min-h-[calc(100vh-4.75rem)] bg-gray-950 text-gray-100">
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* Welcome hero */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-indigo-900/60 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/70 p-7 shadow-2xl sm:p-9">
          <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-700/50 bg-indigo-950/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-300">
                ✨ Your PromptStudio workspace
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Welcome, {displayName}! 👋
              </h1>
              <p className="mt-2 text-sm text-gray-400">{userEmail}</p>
            </div>
            <Link
              to="/builder"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:bg-indigo-500"
            >
              🪄 Create New Prompt
            </Link>
          </div>
        </section>

        {/* Workspace overview */}
        <section className="mt-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-400">Workspace overview</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Your usage at a glance</h2>
            </div>
            <Link to="/account" className="text-xs font-bold text-indigo-400 transition hover:text-indigo-300">
              Manage plan →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl transition hover:border-indigo-900/70">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Current Plan</span>
                <span className="rounded-xl bg-indigo-950/70 p-2.5 text-lg text-indigo-300">💳</span>
              </div>
              <div className="mt-5 text-3xl font-black capitalize text-white">{currentPlan}</div>
              <p className="mt-1 text-xs text-gray-400">
                {currentPlan === "free" ? "Limited daily usage" : "Unlimited access unlocked"}
              </p>
            </div>

            <div className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl transition hover:border-indigo-900/70">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Today's Prompt Usage</span>
                <span className="rounded-xl bg-indigo-950/70 p-2.5 text-lg text-indigo-300">⚡</span>
              </div>
              <div className="mt-5 text-3xl font-black text-white">
                {quota.remaining === null ? "Unlimited" : `${quota.remaining} / ${quota.dailyLimit}`}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {quota.remaining === 0 ? "Daily free limit reached" : "Prompts remaining today"}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
