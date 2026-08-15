import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PRODUCT_CONFIG from "../../config/product.config";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadClaims = async () => {
      if (!user) { if (active) setChecking(false); return; }
      try {
        const token = await user.getIdTokenResult();
        if (active) setIsAdmin(token.claims.admin === true);
      } catch (err) {
        console.error("Unable to read admin claims", err);
      } finally {
        if (active) setChecking(false);
      }
    };
    loadClaims();
    return () => { active = false; };
  }, [user]);

  const runHealthCheck = async () => {
    setError(""); setHealth(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin-health", { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Health check failed.");
      setHealth(data);
    } catch (err) {
      setError(err.message || "Health check failed.");
    }
  };

  if (checking) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Checking admin access…</div>;
  if (!user || !isAdmin) return <Navigate to="/dashboard" replace />;

  const status = health?.ok ? "Healthy" : "Not checked";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div><p className="text-xs font-bold tracking-[0.18em] text-indigo-300 uppercase">PromptStudio</p><h1 className="text-xl font-extrabold">Founder Admin</h1></div>
        <Link to="/dashboard" className="text-sm font-semibold text-slate-300 hover:text-white">Back to app →</Link>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="rounded-3xl bg-slate-900 border border-slate-800 p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-300">System control room</p><h2 className="mt-2 text-3xl font-extrabold">Know what is running.</h2><p className="mt-2 text-sm text-slate-400">Read-only health information for your founder account. No customer data is exposed here.</p></div>
            <button onClick={runHealthCheck} className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold">Run health check</button>
          </div>
          {error && <div className="mt-5 p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-200 text-sm">{error}</div>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><p className="text-xs uppercase tracking-wider text-slate-500">Generation engine</p><p className="mt-3 text-2xl font-extrabold">{status}</p><p className="mt-1 text-sm text-slate-400">Firebase auth + generation API check</p></div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><p className="text-xs uppercase tracking-wider text-slate-500">Product config</p><p className="mt-3 text-2xl font-extrabold">Loaded</p><p className="mt-1 text-sm text-slate-400">Free / Pro / Credits rules active</p></div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><p className="text-xs uppercase tracking-wider text-slate-500">Payment gateway</p><p className="mt-3 text-2xl font-extrabold">{PRODUCT_CONFIG.features.paymentGateway.enabled ? "Enabled" : "Pending"}</p><p className="mt-1 text-sm text-slate-400">Razorpay is deliberately not live yet</p></div>
        </section>

        {health && <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><h3 className="font-extrabold">Latest health check</h3><div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm"><div className="bg-slate-800 rounded-xl p-4"><span className="text-slate-400">Overall</span><p className="mt-1 font-bold text-emerald-400">{health.ok ? "Healthy" : "Degraded"}</p></div><div className="bg-slate-800 rounded-xl p-4"><span className="text-slate-400">Firebase Admin</span><p className="mt-1 font-bold">{health.firebase ? "Ready" : "Unavailable"}</p></div><div className="bg-slate-800 rounded-xl p-4"><span className="text-slate-400">Gemini key</span><p className="mt-1 font-bold">{health.geminiConfigured ? "Configured" : "Missing"}</p></div><div className="bg-slate-800 rounded-xl p-4"><span className="text-slate-400">Checked</span><p className="mt-1 font-bold">{new Date(health.checkedAt).toLocaleTimeString()}</p></div></div></section>}
      </main>
    </div>
  );
}
