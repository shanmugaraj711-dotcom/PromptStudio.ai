import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { PRICING_PLANS } from "../../constants/pricingPlans";
import PRODUCT_CONFIG from "../../config/product.config";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";
import { buyCredits, subscribeToPro } from "../../services/razorpay";

const rowClass = "flex min-h-[68px] items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3";

export default function Account() {
  const { user, userProfile, logout, plan, promptsToday, lastPromptDate, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user)
      .then((config) => { if (active && config) setRuntimeConfig(config); })
      .catch((err) => console.error("Unable to load runtime product configuration:", err));
    return () => { active = false; };
  }, [user]);

  const quota = createQuotaState({ plan, promptsToday, lastPromptDate }, new Date(), runtimeConfig);
  const pricing = runtimeConfig?.pricing || PRODUCT_CONFIG.pricing;
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const displayName = userProfile?.name || user?.displayName || "PromptStudio creator";
  const email = userProfile?.email || user?.email || "";
  const photoURL = userProfile?.photoURL || user?.photoURL || "";
  const isPro = plan === "pro";

  const runPayment = async (key, action) => {
    setBusy(key); setError(""); setMessage("");
    try {
      await action();
      setMessage("Payment verified. Your account is being updated…");
      await refreshProfile();
      window.setTimeout(() => refreshProfile(), 1500);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err?.message || "Payment could not be completed. Please try again.");
    } finally { setBusy(""); }
  };

  const handleLogout = async () => {
    setBusy("logout"); setError("");
    try { await logout(); navigate("/", { replace: true }); }
    catch (err) { console.error("Logout error:", err); setError("Failed to log out. Please try again."); setBusy(""); }
  };

  const starterPack = pricing.creditPacks.starter;
  const creatorPack = pricing.creditPacks.creator;

  return (
    <div className="forge-screen min-h-[calc(100vh-4.25rem)] px-4 pb-28 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Account</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Your account</h1>
          <p className="mt-1 text-sm text-slate-400">Profile, usage, plan, billing and referrals.</p>
        </div>

        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}

        <section className="space-y-3" aria-label="Account settings">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="flex items-center gap-4">
              {photoURL ? <img src={photoURL} alt="" className="size-14 rounded-2xl object-cover ring-1 ring-white/10" /> : <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-xl font-black text-slate-950">{displayName.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><p className="truncate text-base font-black text-white">{displayName}</p>{email && <p className="truncate text-sm text-slate-400">{email}</p>}<p className="mt-1 text-xs font-semibold text-slate-500">{user ? (isPro ? "Pro plan" : "Free plan") : "Guest"}</p></div>
              {!user && <Link to="/login" className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950">Sign in</Link>}
            </div>
          </div>

          <div className={rowClass}>
            <div><p className="text-sm font-bold text-white">Usage</p><p className="mt-0.5 text-xs text-slate-500">{quota.remaining === null ? "Unlimited prompts" : `${quota.remaining} prompts left today`}</p></div>
            <div className="text-right"><p className="text-sm font-black text-cyan-300">{credits}</p><p className="text-[11px] text-slate-500">credits</p></div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-black text-white">Manage plan</p><p className="mt-0.5 text-xs text-slate-500">Upgrade your creation limits or add credits.</p></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">{isPro ? "Pro" : "Free"}</span></div>
            {isPro ? <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4"><p className="text-sm font-bold text-white">You’re on Pro</p><p className="mt-1 text-xs leading-5 text-slate-400">Keep creating with your current plan. Credits can still be added when you need them.</p></div> : <div className="space-y-2"><button type="button" disabled={busy !== ""} onClick={() => runPayment("monthly", () => subscribeToPro({ user, billing: "monthly" }))} className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy === "monthly" ? "Opening secure checkout…" : `Upgrade to Pro · ₹${pricing.proMonthlyInr}/month`}</button><button type="button" disabled={busy !== ""} onClick={() => runPayment("annual", () => subscribeToPro({ user, billing: "annual" }))} className="w-full rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-sm font-bold text-cyan-100 disabled:opacity-50">{busy === "annual" ? "Opening secure checkout…" : `Best value · ₹${pricing.proAnnualInr}/year`}</button></div>}
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy !== "" || !user} onClick={() => runPayment("starter", () => buyCredits({ user, packId: "starter" }))} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left disabled:opacity-50"><span className="block text-xs font-bold text-slate-400">Starter</span><span className="mt-1 block text-sm font-black text-white">₹{starterPack.priceInr} · {starterPack.credits} credits</span></button><button type="button" disabled={busy !== "" || !user} onClick={() => runPayment("creator", () => buyCredits({ user, packId: "creator" }))} className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-3 text-left disabled:opacity-50"><span className="block text-xs font-bold text-cyan-200">Creator</span><span className="mt-1 block text-sm font-black text-white">₹{creatorPack.priceInr} · {creatorPack.credits} credits</span></button></div>
          </div>

          <Link to="/transactions" className={rowClass}><div><p className="text-sm font-bold text-white">Billing & transactions</p><p className="mt-0.5 text-xs text-slate-500">View payments, purchases and billing history.</p></div><span className="text-lg text-slate-500">›</span></Link>
          <Link to="/referral" className={rowClass}><div><p className="text-sm font-bold text-white">Referral</p><p className="mt-0.5 text-xs text-slate-500">Invite others and view your referral rewards.</p></div><span className="text-lg text-slate-500">›</span></Link>

          {user ? <button type="button" onClick={handleLogout} disabled={busy !== ""} className="mt-2 flex min-h-[60px] w-full items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 text-sm font-bold text-red-200 disabled:opacity-50">{busy === "logout" ? "Signing out…" : "Sign out"}</button> : <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-center text-xs text-slate-500">Sign in to manage your plan, billing, referrals and account data.</div>}
        </section>
      </div>
    </div>
  );
}
