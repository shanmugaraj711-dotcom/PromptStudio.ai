import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { PRICING_PLANS } from "../../constants/pricingPlans";
import PRODUCT_CONFIG from "../../config/product.config";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";
import { buyCredits, buyCustomCredits, subscribeToPro } from "../../services/razorpay";
import AccountHeader from "../../components/layout/AccountHeader";

export const Account = () => {
  const { user, userProfile, logout, plan, promptsToday, lastPromptDate, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [customAmount, setCustomAmount] = useState("10");
  const [runtimeConfig, setRuntimeConfig] = useState(null);

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    fetchRuntimeProductConfig(user)
      .then((config) => { if (active && config) setRuntimeConfig(config); })
      .catch((err) => { console.error("Unable to load runtime product configuration:", err); });
    return () => { active = false; };
  }, [user]);

  const quota = createQuotaState(
    {
      plan,
      promptsToday,
      lastPromptDate,
      imageAnalysesToday: userProfile?.imageAnalysesToday,
      lastImageAnalysisDate: userProfile?.lastImageAnalysisDate,
      imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth,
      lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth,
    },
    new Date(),
    runtimeConfig,
  );
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const pricing = runtimeConfig?.pricing || PRODUCT_CONFIG.pricing;
  const customConfig = pricing.customCredits;
  const isPro = plan === "pro";
  const starterPack = pricing.creditPacks.starter;
  const creatorPack = pricing.creditPacks.creator;
  const referenceCoding = runtimeConfig?.creditCosts?.referenceCoding || PRODUCT_CONFIG.creditCosts.referenceCoding;

  if (!user) return (
    <div className="workspace-page flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
      <div className="workspace-panel w-full max-w-xl p-8 sm:p-10">
        <p className="workspace-eyebrow">PromptStudio account</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Your creative workspace, ready when you are</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">Sign in to generate prompts, keep a private history, manage your plan, and use credits across your workspace.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {['Generate securely', 'Save your history', 'Manage credits'].map((benefit) => <div key={benefit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm font-semibold text-slate-200">{benefit}</div>)}
        </div>
        <p className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">Generation currently requires sign-in. PromptStudio does not offer guest generations.</p>
        <a href="/login" className="workspace-primary-button mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold">Sign in to continue</a>
      </div>
    </div>
  );

  const runPayment = async (key, action) => {
    setBusy(key); setError(""); setMessage("");
    try {
      await action();
      setMessage("Payment verified successfully. Your credits and plan are being updated…");
      await refreshProfile();
      window.setTimeout(() => refreshProfile(), 1500);
      window.setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err?.message || "Payment could not be completed. Please try again.");
    } finally { setBusy(""); }
  };

  const handleCustomPurchase = () => {
    const amount = Number(customAmount);
    if (!Number.isInteger(amount) || amount < customConfig.minInr || amount > customConfig.maxInr) {
      setError(`Choose a whole-number amount between ₹${customConfig.minInr} and ₹${customConfig.maxInr}.`);
      return;
    }
    runPayment("custom", () => buyCustomCredits({ user, amountInr: amount }));
  };

  const handleLogout = async () => {
    setError(""); setIsLoggingOut(true);
    try { await logout(); navigate("/login"); }
    catch (err) { console.error("Logout error:", err); setError("Failed to log out. Please try again."); setIsLoggingOut(false); }
  };

  const displayName = userProfile?.name || user?.displayName || "User";
  const email = userProfile?.email || user?.email || "N/A";
  const photoURL = userProfile?.photoURL || user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4F46E5&color=fff`;

  return (
    <div className="min-h-[calc(100vh-4.75rem)] bg-gray-950 text-gray-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-7">
        <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400">Account & billing</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Current Plan</h1><p className="mt-2 text-sm text-gray-400">Manage your profile, usage and the options available to keep creating.</p></div>
        {error && <div className="rounded-xl border border-red-500/50 bg-red-950/80 p-4 text-sm text-red-200">⚠️ {error}</div>}
        {message && <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-4 text-sm text-emerald-200">✓ {message}</div>}

        <AccountHeader displayName={displayName} email={email} photoURL={photoURL} plan={plan} quota={quota} credits={credits} isPro={isPro} />

        <section id="plans" className="scroll-mt-24">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-400">Plans & pricing</p><h2 className="mt-1 text-2xl font-black text-white">Choose how you want to create</h2></div><span className="text-xs text-gray-500">Simple pricing. No hidden plan tiers.</span></div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PRICING_PLANS.map((item) => {
              const isCurrent = item.id === "free" && plan === "free" || item.id === "pro" && plan === "pro";
              return <article key={item.id} className={`relative rounded-2xl border p-6 shadow-xl ${item.highlighted ? "border-indigo-500/70 bg-gradient-to-b from-indigo-950/80 to-gray-900" : "border-gray-800 bg-gray-900"}`}>
                {item.highlighted && <span className="absolute right-4 top-4 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">Best value</span>}
                <div className="flex items-center gap-2"><span className="text-xl">{item.id === "free" ? "💳" : item.id === "pro" ? "⭐" : "🖼️"}</span><h3 className="text-lg font-black text-white">{item.name}</h3></div>
                <div className="mt-5 flex items-baseline gap-2"><span className="text-3xl font-black text-white">{item.price}</span><span className="text-xs text-gray-400">{item.period}</span></div>
                {item.id === "pro" && <p className="mt-1 text-xs font-bold text-indigo-300">or ₹{pricing.proAnnualInr} per year</p>}
                <p className="mt-3 min-h-10 text-sm text-gray-400">{item.description}</p>
                <ul className="mt-5 space-y-2 text-xs text-gray-300">{item.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-indigo-400">✓</span><span>{feature}</span></li>)}</ul>
                {isCurrent ? <div className="mt-6 w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-center text-sm font-bold text-gray-400">✓ Current Plan</div> : item.id === "pro" ? <div className="mt-6 space-y-2"><button type="button" disabled={busy !== ""} onClick={() => runPayment("monthly", () => subscribeToPro({ user, billing: "monthly" }))} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{busy === "monthly" ? "Opening secure checkout…" : `Upgrade Monthly · ₹${pricing.proMonthlyInr}/month`}</button><button type="button" disabled={busy !== ""} onClick={() => runPayment("annual", () => subscribeToPro({ user, billing: "annual" }))} className="w-full rounded-xl border border-indigo-400/40 bg-indigo-950/50 px-4 py-3 text-sm font-bold text-indigo-200 hover:bg-indigo-900/60 disabled:cursor-not-allowed disabled:opacity-50">{busy === "annual" ? "Opening secure checkout…" : `Best Value · ₹${pricing.proAnnualInr}/year`}</button></div> : <div className="mt-6 space-y-2"><button type="button" disabled={busy !== ""} onClick={() => runPayment("starter", () => buyCredits({ user, packId: "starter" }))} className="w-full rounded-xl border border-indigo-400/40 bg-indigo-950/50 px-4 py-3 text-sm font-bold text-indigo-200 hover:bg-indigo-900/60 disabled:cursor-not-allowed disabled:opacity-50">{busy === "starter" ? "Opening secure checkout…" : `₹${starterPack.priceInr} · ${starterPack.credits} Credits`}</button><button type="button" disabled={busy !== ""} onClick={() => runPayment("creator", () => buyCredits({ user, packId: "creator" }))} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{busy === "creator" ? "Opening secure checkout…" : `⭐ Best for Image Creators · ₹${creatorPack.priceInr} · ${creatorPack.credits} Credits`}</button></div>}
              </article>;
            })}
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-teal-500/35 bg-gradient-to-r from-teal-950/60 via-gray-900 to-indigo-950/60 p-6 shadow-xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-teal-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">New · Reference Coding</span><span className="text-sm font-bold text-gray-300">💻 Existing product → coding-ready prompt</span></div>
                <h3 className="mt-3 text-xl font-black text-white">Reference Coding is credit-based</h3>
                <p className="mt-2 text-sm leading-6 text-gray-400">{referenceCoding.creditCost} credits per generation. Add screenshots, source files or an existing application reference, then describe what you want changed. No separate subscription is required.</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-gray-300"><span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Up to {referenceCoding.maxReferences} references</span><span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Up to {referenceCoding.maxImages} screenshots</span><span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Credits never expire</span></div>
              </div>
              <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/20 p-4 sm:max-w-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">How far your packs go</p>
                <div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-900/80 p-3"><p className="text-xs text-gray-500">₹{starterPack.priceInr}</p><p className="mt-1 text-lg font-black text-white">{Math.floor(starterPack.credits / referenceCoding.creditCost)} runs</p><p className="text-[10px] text-gray-500">{starterPack.credits} credits</p></div><div className="rounded-xl bg-indigo-950/70 p-3"><p className="text-xs text-indigo-300">₹{creatorPack.priceInr}</p><p className="mt-1 text-lg font-black text-white">{Math.floor(creatorPack.credits / referenceCoding.creditCost)} runs</p><p className="text-[10px] text-indigo-300/70">{creatorPack.credits} credits</p></div></div>
                <button type="button" disabled={busy !== ""} onClick={() => runPayment("creator", () => buyCredits({ user, packId: "creator" }))} className="mt-4 w-full rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-gray-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50">{busy === "creator" ? "Opening secure checkout…" : `Get ${creatorPack.credits} Credits · ₹${creatorPack.priceInr}`}</button>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-950/50 via-gray-900 to-indigo-950/50 p-5 shadow-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-sm font-black text-white">💎 Custom Creator Credits</p><p className="mt-1 text-xs text-gray-400">Pay only what you need. ₹{customConfig.inrPerCredit} = 1 credit · minimum ₹{customConfig.minInr}. Credits never expire.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label className="sr-only" htmlFor="custom-credit-amount">Custom credit amount</label><div className="flex items-center rounded-xl border border-gray-700 bg-gray-950 px-3"><span className="text-sm font-bold text-gray-400">₹</span><input id="custom-credit-amount" type="number" min={customConfig.minInr} max={customConfig.maxInr} step="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} className="w-24 bg-transparent px-2 py-3 text-sm font-bold text-white outline-none" /></div><span className="text-xs font-bold text-violet-300">≈ {Math.floor((Number(customAmount) || 0) / customConfig.inrPerCredit)} credits</span><button type="button" disabled={busy !== ""} onClick={handleCustomPurchase} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{busy === "custom" ? "Opening secure checkout…" : "Buy Custom Credits"}</button></div>
            </div>
          </div>

          {quota.remaining === 0 && plan === "free" && <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100"><strong>You've reached today's free limit.</strong> Upgrade to Pro for continued daily access, or use Creator Credits for a one-time boost.</div>}
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6"><h2 className="text-lg font-extrabold text-white">Your included usage</h2><div className="mt-5 space-y-5"><div><div className="flex justify-between text-sm font-bold"><span>Prompts today</span><span>{quota.remaining} / {quota.dailyLimit} remaining</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (quota.dailyLimit - quota.remaining) / Math.max(1, quota.dailyLimit) * 100)}%` }} /></div></div><div><div className="flex justify-between text-sm font-bold"><span>🖼️ Reference images</span><span>{quota.imageUsed} / {quota.imageLimit} used this {quota.imagePeriod}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full bg-violet-500" style={{ width: `${Math.min(100, quota.imageUsed / Math.max(1, quota.imageLimit || 1) * 100)}%` }} /></div></div></div></div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6"><h2 className="text-lg font-extrabold text-white">Billing status</h2><div className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div className="rounded-xl bg-gray-800/60 p-4"><p className="text-gray-400">Subscription</p><p className="mt-1 font-bold text-white">{isPro ? userProfile?.subscriptionStatus || "Active" : "Free plan"}</p></div><div className="rounded-xl bg-gray-800/60 p-4"><p className="text-gray-400">Monthly</p><p className="mt-1 font-bold text-white">₹{pricing.proMonthlyInr}/month</p></div><div className="rounded-xl bg-gray-800/60 p-4"><p className="text-gray-400">Annual</p><p className="mt-1 font-bold text-white">₹{pricing.proAnnualInr}/year</p></div></div><p className="mt-4 text-xs text-gray-500">Payments are verified server-side before PromptStudio changes your plan or credits.</p></div>
        </section>
        <div className="flex justify-end border-t border-gray-800 pt-6"><button type="button" onClick={handleLogout} disabled={isLoggingOut} className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-3 font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-900/40 disabled:opacity-50">{isLoggingOut ? "Logging out..." : "Logout"}</button></div>
      </div>
    </div>
  );
};

export default Account;
