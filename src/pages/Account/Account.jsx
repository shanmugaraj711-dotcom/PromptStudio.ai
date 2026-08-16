import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { PRICING_PLANS } from "../../constants/pricingPlans";

export const Account = () => {
  const { user, userProfile, logout, plan, promptsToday, lastPromptDate } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = async () => {
    setError("");
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      setError("Failed to log out. Please try again.");
      setIsLoggingOut(false);
    }
  };

  const displayName = userProfile?.name || user?.displayName || "User";
  const email = userProfile?.email || user?.email || "N/A";
  const photoURL =
    userProfile?.photoURL ||
    user?.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4F46E5&color=fff`;

  const currentPlan = plan;
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  const memberSince = formatDate(userProfile?.createdAt);

  return (
    <div className="min-h-[calc(100vh-4.75rem)] bg-gray-950 text-gray-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-7">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400">Account & billing</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Current Plan</h1>
          <p className="mt-2 text-sm text-gray-400">Manage your profile, usage and the options available to keep creating.</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/80 p-4 text-sm text-red-200">
            ⚠️ {error}
          </div>
        )}

        <div className="rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col items-center gap-4 border-b border-gray-800 pb-7 sm:flex-row sm:gap-6">
            <img src={photoURL} alt={displayName} className="h-20 w-20 rounded-full border-2 border-indigo-500/80 object-cover shadow-lg" />
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-bold text-white">{displayName}</h2>
              <p className="mt-1 text-sm font-mono text-gray-400">{email}</p>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-indigo-700/40 bg-indigo-950/30 p-5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Current Plan</span>
              <div className="mt-2 text-2xl font-black capitalize text-white">{currentPlan}</div>
              <p className="mt-1 text-xs text-gray-400">{currentPlan === "free" ? "3 prompts every day" : "Premium access"}</p>
            </div>
            <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Today's Usage</span>
              <div className="mt-2 text-2xl font-black text-white">
                {quota.remaining === null ? "Unlimited" : `${quota.remaining} / ${quota.dailyLimit}`}
              </div>
              <p className="mt-1 text-xs text-gray-400">prompts remaining</p>
            </div>
            <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Member Since</span>
              <div className="mt-2 text-base font-bold text-gray-200">{memberSince}</div>
              <p className="mt-1 text-xs text-gray-400">Your PromptStudio account</p>
            </div>
          </div>
        </div>

        <section id="plans" className="scroll-mt-24">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-400">Plans & pricing</p>
              <h2 className="mt-1 text-2xl font-black text-white">Choose how you want to create</h2>
            </div>
            <span className="text-xs text-gray-500">Simple pricing. No hidden plan tiers.</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PRICING_PLANS.map((item) => {
              const isCurrent = item.id === currentPlan || (item.id === "free" && currentPlan === "free");
              return (
                <article
                  key={item.id}
                  className={`relative rounded-2xl border p-6 shadow-xl ${item.highlighted ? "border-indigo-500/70 bg-gradient-to-b from-indigo-950/80 to-gray-900" : "border-gray-800 bg-gray-900"}`}
                >
                  {item.highlighted && <span className="absolute right-4 top-4 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">Best value</span>}
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.id === "free" ? "💳" : item.id === "pro" ? "⭐" : "⚡"}</span>
                    <h3 className="text-lg font-black text-white">{item.name}</h3>
                  </div>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">{item.price}</span>
                    <span className="text-xs text-gray-400">{item.period}</span>
                  </div>
                  {item.annualPrice && <p className="mt-1 text-xs font-bold text-indigo-300">or {item.annualPrice} {item.annualPeriod}</p>}
                  <p className="mt-3 min-h-10 text-sm text-gray-400">{item.description}</p>
                  <ul className="mt-5 space-y-2 text-xs text-gray-300">
                    {item.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-indigo-400">✓</span><span>{feature}</span></li>)}
                  </ul>
                  <div className={`mt-6 w-full rounded-xl px-4 py-3 text-center text-sm font-bold ${isCurrent ? "border border-gray-700 bg-gray-800 text-gray-400" : item.highlighted ? "bg-indigo-600 text-white" : "border border-indigo-500/30 bg-indigo-950/30 text-indigo-200"}`}>
                    {isCurrent ? "✓ Current Plan" : item.cta}
                  </div>
                </article>
              );
            })}
          </div>

          {quota.remaining === 0 && currentPlan === "free" && (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
              <strong>You've reached today's free limit.</strong> Upgrade to Pro for continued daily access, or choose the 25-credit pack for a one-time boost.
            </div>
          )}
        </section>

        <div className="flex justify-end border-t border-gray-800 pt-6">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-3 font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-900/40 disabled:opacity-50"
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Account;
