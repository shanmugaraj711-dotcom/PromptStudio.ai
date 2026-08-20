import { Link } from "react-router-dom";

export default function Refund() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">PromptStudio AI</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Refund & Cancellation Policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: August 20, 2026</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-300">
          <section><h2 className="text-lg font-black text-white">1. Digital credits</h2><p className="mt-2">PromptStudio AI credit packs are digital services. The price, number of credits, and purchase details are shown before you confirm payment.</p></section>
          <section><h2 className="text-lg font-black text-white">2. Payment charged, credits not received</h2><p className="mt-2">If your payment is successfully debited but the purchased credits are not added to your account, contact Support Chat with the payment date, amount, and transaction reference shown in your PromptStudio transaction history. We will verify the payment. If the credits can be safely reconciled, we will add the missing credits; if the purchase cannot be delivered, we will arrange the eligible refund through the payment provider.</p></section>
          <section><h2 className="text-lg font-black text-white">3. Duplicate or incorrect charges</h2><p className="mt-2">If you were charged twice for the same purchase or charged because of a technical/payment error, contact support promptly. We will check the transaction records and, when the charge is confirmed as erroneous or duplicate, arrange the appropriate refund.</p></section>
          <section><h2 className="text-lg font-black text-white">4. Cancellation</h2><p className="mt-2">A completed digital-credit purchase cannot normally be cancelled after delivery or use. If a purchase is still incomplete, duplicated, or affected by a technical payment problem, contact support immediately so we can stop or reverse the transaction where possible.</p></section>
          <section><h2 className="text-lg font-black text-white">5. Refund requests</h2><p className="mt-2">Refund requests are reviewed using our payment and usage records. Credits already consumed may not be refundable unless the charge was erroneous, the service was not delivered, or a refund is required by applicable law.</p></section>
          <section><h2 className="text-lg font-black text-white">6. Processing</h2><p className="mt-2">Approved refunds are sent through the payment provider used for the purchase. The time for the money to appear can depend on the provider and the customer's bank.</p></section>
          <section><h2 className="text-lg font-black text-white">7. How to contact us</h2><p className="mt-2">Use Help & Chat or the Contact page. Share only the information needed to identify the transaction. Never send card numbers, CVV, OTPs, passwords, or API secrets.</p></section>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("promptstudio:open-support", { detail: { message: "I need help with a payment/refund." } }))} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold hover:bg-indigo-500">Open Support Chat</button>
          <Link to="/transactions" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">View Transactions</Link>
          <Link to="/" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
