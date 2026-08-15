import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import PRODUCT_CONFIG from "../../config/product.config";
import { buyCredits, subscribeToPro } from "../../services/razorpay";

const Feature = ({ children }) => <li className="flex gap-2 text-sm text-slate-600"><span className="text-emerald-600 font-bold">✓</span><span>{children}</span></li>;

export default function PlanDashboard() {
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth, lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth });
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const pro = PRODUCT_CONFIG.plans.pro;
  const pricing = PRODUCT_CONFIG.pricing;
  const isPro = plan === "pro";

  const runPayment = async (key, action) => {
    setBusy(key); setError(""); setMessage("");
    try {
      await action();
      setMessage("Payment verified successfully. Your account will refresh automatically.");
    } catch (err) {
      setError(err.message || "Payment could not be completed.");
    } finally { setBusy(""); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link to="/dashboard" className="text-xl font-extrabold tracking-tight text-indigo-600">PromptStudio AI</Link>
        <div className="flex items-center gap-4"><Link to="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-indigo-600">Dashboard</Link><Link to="/account" className="text-sm font-semibold text-slate-600 hover:text-indigo-600">Account</Link></div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-7">
        <section>
          <p className="text-xs font-bold tracking-[0.18em] text-indigo-600 uppercase">Current Plan</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">Your PromptStudio plan</h1>
          <p className="mt-2 text-slate-500">See exactly what is included, what you have used, and how to continue.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`lg:col-span-2 rounded-3xl p-7 shadow-sm border ${isPro ? "bg-indigo-600 text-white border-indigo-500" : "bg-white text-slate-900 border-slate-200"}`}>
            <div className="flex items-start justify-between gap-4">
              <div><p className={`text-xs font-bold uppercase tracking-wider ${isPro ? "text-indigo-100" : "text-slate-500"}`}>Current plan</p><h2 className="mt-2 text-4xl font-extrabold">{isPro ? "Pro" : "Free"}</h2><p className={`mt-2 text-sm ${isPro ? "text-indigo-100" : "text-slate-500"}`}>{isPro ? "Active subscription access" : "Start free, then upgrade when you need more."}</p></div>
              <span className={`text-3xl ${isPro ? "" : "bg-indigo-50 p-3 rounded-2xl"}`}>{isPro ? "⭐" : "🆓"}</span>
            </div>
            {!isPro && <div className="mt-6 flex flex-col sm:flex-row gap-3"><button disabled={busy !== ""} onClick={() => runPayment("monthly", () => subscribeToPro({ user, billing: "monthly" }))} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50">{busy === "monthly" ? "Opening secure checkout…" : `Upgrade — ₹${pricing.proMonthlyInr}/month`}</button><button disabled={busy !== ""} onClick={() => runPayment("annual", () => subscribeToPro({ user, billing: "annual" }))} className="px-5 py-3 rounded-xl border border-indigo-200 text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">{busy === "annual" ? "Opening secure checkout…" : `Save with annual — ₹${pricing.proAnnualInr}/year`}</button></div>}
            {isPro && <p className="mt-6 text-sm font-semibold text-indigo-100">Your Pro status is synchronized from the verified payment record and Razorpay subscription webhooks.</p>}
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchased credits</p>
            <div className="mt-3 text-4xl font-extrabold">{credits}</div>
            <p className="mt-1 text-sm text-slate-500">Credits never expire.</p>
            <button disabled={busy !== ""} onClick={() => runPayment("credits", () => buyCredits({ user }))} className="mt-5 w-full px-4 py-3 rounded-xl border border-indigo-200 text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">{busy === "credits" ? "Opening secure checkout…" : `Buy ${pricing.creditPackSize} credits — ₹${pricing.creditPackInr}`}</button>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
            <h2 className="text-lg font-extrabold">Your included usage</h2>
            <div className="mt-5 space-y-4">
              <div><div className="flex justify-between text-sm font-bold"><span>Prompts today</span><span>{quota.remaining} / {quota.dailyLimit} remaining</span></div><div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: `${Math.min(100, quota.remaining / Math.max(1, quota.dailyLimit) * 100)}%` }} /></div></div>
              <div><div className="flex justify-between text-sm font-bold"><span>Reference images</span><span>{quota.imageRemaining} / {quota.monthlyImageLimit} remaining</span></div><div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${Math.min(100, quota.imageRemaining / Math.max(1, quota.monthlyImageLimit) * 100)}%` }} /></div></div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm"><h2 className="text-lg font-extrabold">Pro includes</h2><ul className="mt-4 space-y-3"><Feature>{pro.dailyPromptLimit} prompt generations per day</Feature><Feature>{pro.monthlyImageLimit} reference-image analyses per month</Feature><Feature>Dynamic variables & reusable templates</Feature><Feature>One-click AI launch</Feature><Feature>Prompt workflows, sharing and favorites</Feature><Feature>Purchased credits can be used after included allowances</Feature></ul></div>
        </section>

        <section id="credits" className="bg-slate-900 text-white rounded-3xl p-7 shadow-sm"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Pay as you go</p><h2 className="mt-2 text-2xl font-extrabold">Need more after your included allowance?</h2><p className="mt-2 text-sm text-slate-300">Buy a credit pack without changing your subscription. Image analysis uses 3 credits; standard generation uses 1.</p></div><button disabled={busy !== ""} onClick={() => runPayment("credits2", () => buyCredits({ user }))} className="shrink-0 px-5 py-3 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 disabled:opacity-50">Buy {pricing.creditPackSize} credits · ₹{pricing.creditPackInr}</button></div></section>

        <section className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm"><h2 className="text-lg font-extrabold">Billing status</h2><div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-slate-500">Subscription</p><p className="mt-1 font-bold">{isPro ? `${userProfile?.subscriptionStatus || "Active"}` : "Free plan"}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-slate-500">Monthly</p><p className="mt-1 font-bold">₹{pricing.proMonthlyInr}/month</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-slate-500">Annual</p><p className="mt-1 font-bold">₹{pricing.proAnnualInr}/year</p></div></div><p className="mt-5 text-xs text-slate-400">Payments are verified server-side before PromptStudio changes your plan or credits.</p></section>
      </main>
    </div>
  );
}
