import { useEffect, useState } from "react";
const labels = { QUEUED: "Payment received — queued", SUBMITTING: "Preparing your deployment", BUILDING: "Building your website", VERIFYING: "Checking your live website", READY: "Your website is live", FAILED: "Delivery needs attention" };

export default function StudioDeliveries({ user, refreshKey }) {
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) { setDeliveries([]); return undefined; }
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/studio-delivery", { headers: { Authorization: "Bearer " + token }, signal: controller.signal });
        if (!response.ok) throw new Error("We could not refresh delivery status. Your payment is safe; this page will retry.");
        const data = await response.json();
        if (!stopped) { setDeliveries(data.deliveries || []); setError(""); }
      } catch (err) { if (!stopped) setError(err.message); }
      finally { if (!stopped) timer = setTimeout(refresh, 15000); }
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [user, refreshKey]);
  if (!user || (!deliveries.length && !error)) return null;
  return <section aria-label="Your website deliveries" className="mt-6 rounded-3xl border border-indigo-300/20 bg-white/5 p-5 text-white">
    <h2 className="text-lg font-bold">Your websites</h2>
    <p className="mt-1 text-sm text-slate-300">Delivery continues if you close this page. Sign back in here to find your website.</p>
    {error && <p role="status" className="mt-3 text-sm text-amber-200">{error}</p>}
    <div className="mt-4 space-y-3">{deliveries.map((delivery) => <article key={delivery.deliveryId} className="rounded-xl border border-white/10 p-4">
      <p role="status" className="font-semibold">{labels[delivery.state] || "Preparing your website"}</p>
      <p className="mt-1 break-all text-xs text-slate-400">Reference: {delivery.deliveryId}</p>
      {delivery.message && <p className="mt-2 text-sm text-slate-300">{delivery.message}</p>}
      {delivery.state === "READY" && delivery.liveUrl && <a className="mt-3 inline-block break-all font-semibold text-emerald-300 underline" href={delivery.liveUrl} target="_blank" rel="noopener noreferrer">Open your website ↗</a>}
    </article>)}</div>
  </section>;
}
