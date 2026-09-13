import { useCallback, useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";

const Metric = ({ icon, label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-3 text-sm font-bold text-slate-500"><span className="text-xl">{icon}</span>{label}</div>
    <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">{value ?? "—"}</p>
    <p className="mt-2 text-xs font-semibold text-slate-400">Today</p>
  </div>
);

const Status = ({ label, ok }) => (
  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
    <span className="text-sm font-bold text-slate-800">{label}</span>
    <span className={`inline-flex items-center gap-2 text-sm font-black ${ok ? "text-emerald-600" : "text-red-600"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {ok ? "Operational" : "Down"}
    </span>
  </div>
);

export default function AdminMvp() {
  const { user, loading } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/admin-public-metrics", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not load admin metrics.");
      setMetrics(body);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load admin metrics.");
    }
  }, []);

  useEffect(() => {
    if (!loading && user) load();
  }, [loading, user, load]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [user, load]);

  if (!loading && !user) return <Navigate to="/login?next=/admin" replace />;
  if (loading) return <div className="min-h-screen bg-slate-950 p-8 text-white">Checking founder access…</div>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">PromptStudio · Founder</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Today</h1>
            </div>
            <Link to="/dashboard" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-900">Dashboard</Link>
          </div>
        </header>

        {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Metric icon="👀" label="Visitors today" value={metrics?.visitorsToday} />
          <Metric icon="⚡" label="Optimizations today" value={metrics?.optimizationsToday} />
          <Metric icon="👤" label="Signups today" value={metrics?.signupsToday} />
          <Metric icon="🚫" label="Hit 5/day limit" value={metrics?.hitLimitToday} />
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-100 p-5">
          <h2 className="px-1 text-lg font-black text-slate-950">System Status</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Status label="Public Optimizer" ok={metrics?.publicOptimizer === true} />
            <Status label="Gemini" ok={metrics?.gemini === true} />
          </div>
        </section>
      </div>
    </main>
  );
}
