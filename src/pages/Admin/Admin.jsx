import { useCallback, useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";

const statusClass = (ok) => ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800";

function StatusCard({ label, ok, detail }) {
  return (
    <div className={`rounded-2xl border p-4 ${statusClass(ok)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs font-black">{ok ? "● OK" : "● CHECK"}</span>
      </div>
      <p className="mt-2 text-xs opacity-80">{detail}</p>
    </div>
  );
}

export default function Admin() {
  const { user, userProfile, loading } = useAuth();
  const [adminClaim, setAdminClaim] = useState(null);
  const [checkingClaim, setCheckingClaim] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");

  const refreshClaim = useCallback(async (forceRefresh = true) => {
    if (!auth.currentUser) return null;
    const tokenResult = await auth.currentUser.getIdTokenResult(forceRefresh);
    setAdminClaim(tokenResult.claims.admin === true);
    setCheckingClaim(false);
    return tokenResult;
  }, []);

  const bootstrapAdmin = async () => {
    setBootstrapping(true);
    setBootstrapMessage("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin-bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Unable to enable founder admin.");
      setBootstrapMessage(body.message || "Admin enabled.");
      await refreshClaim(true);
    } catch (error) {
      setBootstrapMessage(error.message || "Unable to enable founder admin.");
    } finally {
      setBootstrapping(false);
    }
  };

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin-health", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Health check failed.");
      setHealth(body);
    } catch (error) {
      setHealthError(error.message || "Health check failed.");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) refreshClaim(true).catch(() => setCheckingClaim(false));
  }, [loading, user, refreshClaim]);

  useEffect(() => {
    if (adminClaim === true) runHealthCheck();
  }, [adminClaim, runHealthCheck]);

  if (!loading && !user) return <Navigate to="/login?next=/admin" replace />;
  if (loading || checkingClaim) return <div className="min-h-screen bg-slate-950 p-10 text-white">Checking founder access…</div>;

  if (adminClaim !== true) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Founder Admin</p>
          <h1 className="mt-3 text-3xl font-black">Enable your admin access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">This one-time bootstrap only succeeds when your verified Firebase email exactly matches PROMPTSTUDIO_ADMIN_EMAIL on Vercel.</p>
          <p className="mt-4 rounded-xl bg-slate-800 p-3 text-xs text-slate-300">Signed in as: <strong className="text-white">{user.email}</strong></p>
          <button disabled={bootstrapping} onClick={bootstrapAdmin} className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500 disabled:opacity-50">{bootstrapping ? "Enabling…" : "Enable Founder Admin"}</button>
          {bootstrapMessage && <p className="mt-4 text-sm text-indigo-200">{bootstrapMessage}</p>}
          <Link to="/dashboard" className="mt-6 inline-block text-sm font-semibold text-slate-400 hover:text-white">← Back to Dashboard</Link>
        </div>
      </main>
    );
  }

  const allHealthy = health && health.firebaseAdmin && health.gemini && health.razorpay && health.razorpayPlans && health.razorpayWebhook;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">PromptStudio AI · Founder</p>
            <h1 className="mt-2 text-4xl font-black">Control Room</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Private operational view for backend health, payments configuration, product limits and your current founder account.</p>
          </div>
          <div className="flex gap-2"><Link to="/dashboard" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900">Dashboard</Link><button onClick={runHealthCheck} disabled={healthLoading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold hover:bg-indigo-500 disabled:opacity-50">{healthLoading ? "Checking…" : "Run Health Check"}</button></div>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-bold text-slate-200">System health</p><p className="mt-1 text-xs text-slate-500">Server-side checks only. Browser never receives secrets.</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${allHealthy ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{allHealthy ? "ALL SYSTEMS OK" : "ACTION REQUIRED"}</span>
          </div>
          {healthError && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{healthError}</p>}
          {health && <div className="mt-5 grid gap-3 md:grid-cols-3"><StatusCard label="Firebase Admin" ok={health.firebaseAdmin} detail="Admin SDK initializes successfully." /><StatusCard label="Gemini" ok={health.gemini} detail="Generation API key is present." /><StatusCard label="Razorpay" ok={health.razorpay} detail="Server payment credentials are present." /><StatusCard label="Razorpay Plans" ok={health.razorpayPlans} detail="Monthly and annual plan IDs are configured." /><StatusCard label="Webhook" ok={health.razorpayWebhook} detail="Webhook secret is configured." /><StatusCard label="Payment Mode" ok={health.paymentMode === "live"} detail={`Current configured mode: ${health.paymentMode}.`} /></div>}
          {health?.checkedAt && <p className="mt-4 text-xs text-slate-600">Last checked: {new Date(health.checkedAt).toLocaleString()}</p>}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><p className="text-sm font-bold text-slate-200">Founder account</p><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-slate-500">Email</span><span>{user.email}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Plan</span><span>{userProfile?.plan || "unknown"}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Credits</span><span>{Number(userProfile?.credits || 0)}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Admin claim</span><span className="text-emerald-300">admin = true</span></div></div></div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><p className="text-sm font-bold text-slate-200">Product configuration</p>{health?.plans && <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-800 p-4"><p className="text-xs text-slate-500">Free</p><p className="mt-1 text-lg font-black">{health.plans.free.dailyPromptLimit}/day</p><p className="text-xs text-slate-500">{health.plans.free.dailyImageLimit} image/day</p></div><div className="rounded-xl bg-slate-800 p-4"><p className="text-xs text-slate-500">Pro</p><p className="mt-1 text-lg font-black">{health.plans.pro.dailyPromptLimit}/day</p><p className="text-xs text-slate-500">{health.plans.pro.monthlyImageLimit} images/month</p></div></div>}</div>
        </section>
      </div>
    </main>
  );
}
