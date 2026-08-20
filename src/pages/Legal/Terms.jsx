import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">PromptStudio AI</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: August 20, 2026</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-300">
          <section><h2 className="text-lg font-black text-white">1. The service</h2><p className="mt-2">PromptStudio AI provides AI-assisted prompt creation, reference image-to-prompt tools, prompt history, and related productivity features. Features, limits, models, and pricing may change as the service evolves.</p></section>
          <section><h2 className="text-lg font-black text-white">2. Accounts and security</h2><p className="mt-2">You are responsible for your account and activity performed through it. Keep your password and authentication information private. Never send passwords, OTPs, payment credentials, or API secrets through support.</p></section>
          <section><h2 className="text-lg font-black text-white">3. Credits and purchases</h2><p className="mt-2">Paid credit packs and paid features are shown before purchase. Credits are associated with the purchasing account and are not transferable. We keep transaction records needed to deliver credits, reconcile payments, prevent fraud, and provide support.</p></section>
          <section><h2 className="text-lg font-black text-white">4. Refunds and cancellations</h2><p className="mt-2">Refunds and cancellations are handled under the current Refund & Cancellation Policy. If a payment is debited but a purchased digital service is not delivered, contact support so we can verify and resolve the transaction.</p></section>
          <section><h2 className="text-lg font-black text-white">5. Acceptable use</h2><p className="mt-2">Do not use PromptStudio AI for unlawful activity, fraud, abuse, attempts to bypass access controls, automated misuse that harms the service, or activity that infringes the rights of others.</p></section>
          <section><h2 className="text-lg font-black text-white">6. AI-generated output</h2><p className="mt-2">AI output may be inaccurate, incomplete, or unsuitable for a particular purpose. You are responsible for reviewing generated prompts and deciding how and where to use them. PromptStudio AI does not guarantee a particular result from another AI model.</p></section>
          <section><h2 className="text-lg font-black text-white">7. Service availability and suspension</h2><p className="mt-2">We aim to keep the service available but cannot guarantee uninterrupted operation. We may restrict or suspend access when reasonably necessary for security, abuse prevention, maintenance, payment risk, or violation of these terms.</p></section>
          <section><h2 className="text-lg font-black text-white">8. Changes</h2><p className="mt-2">We may update these terms when the service or applicable requirements change. The latest version will be published on this page. Continued use after an update means you accept the updated terms.</p></section>
          <section><h2 className="text-lg font-black text-white">9. Contact</h2><p className="mt-2">For account, payment, privacy, or service questions, use Help & Chat, Help Center, or Contact. Do not send sensitive payment or authentication secrets.</p></section>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/help" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold hover:bg-indigo-500">Help Center</Link>
          <Link to="/refund" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Refund Policy</Link>
          <Link to="/" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
