import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function PaymentSuccessToast() {
  const [purchase, setPurchase] = useState(null);

  useEffect(() => {
    const onSuccess = (event) => setPurchase(event.detail || null);
    window.addEventListener("promptstudio:payment-success", onSuccess);
    return () => window.removeEventListener("promptstudio:payment-success", onSuccess);
  }, []);

  if (!purchase) return null;

  return (
    <div className="fixed inset-x-4 bottom-5 z-[80] mx-auto max-w-lg rounded-3xl border border-emerald-400/30 bg-slate-900 p-5 text-white shadow-2xl shadow-emerald-900/15 sm:inset-x-auto sm:right-6 sm:mx-0">
      <div className="flex gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-xl">✓</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3"><div><p className="text-base font-black">Payment successful</p><p className="mt-0.5 text-sm text-slate-300">₹{purchase.amountInr} paid · {purchase.creditsAdded} credits added</p></div><button type="button" onClick={() => setPurchase(null)} className="text-slate-400 hover:text-slate-200" aria-label="Close purchase confirmation">✕</button></div>
          <p className="mt-3 text-xs text-slate-400">{purchase.paymentId ? `Payment ID: ${purchase.paymentId}` : "Your payment has been verified securely."}</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link to="/transactions" onClick={() => setPurchase(null)} className="rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-black text-white hover:bg-blue-500">View transaction</Link><Link to="/builder" onClick={() => setPurchase(null)} className="rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-950">Start creating</Link></div>
        </div>
      </div>
    </div>
  );
}
