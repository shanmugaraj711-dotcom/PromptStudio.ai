import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">PromptStudio AI</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: August 20, 2026</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-300">
          <section><h2 className="text-lg font-black text-white">1. Information we handle</h2><p className="mt-2">We may process account information such as your email address and authentication identifiers, usage and credit information, transaction references, prompts you choose to save, reference images you submit for processing, and support or feedback messages you send.</p></section>
          <section><h2 className="text-lg font-black text-white">2. How we use information</h2><p className="mt-2">We use information to provide and secure PromptStudio AI, authenticate accounts, calculate usage and credits, process purchases, maintain transaction records, respond to support requests, prevent abuse, troubleshoot problems, and improve the service.</p></section>
          <section><h2 className="text-lg font-black text-white">3. Payments</h2><p className="mt-2">Payments are processed by our payment provider. PromptStudio AI does not ask you to send card numbers, CVV, OTPs, or payment passwords through support chat. We retain appropriate transaction references needed to deliver credits, reconcile purchases, and handle support.</p></section>
          <section><h2 className="text-lg font-black text-white">4. AI and third-party services</h2><p className="mt-2">PromptStudio AI may use third-party infrastructure and AI providers to deliver requested features. Information needed to perform the requested operation may be sent to those providers. We apply reasonable safeguards to service credentials and limit data to what the requested feature needs.</p></section>
          <section><h2 className="text-lg font-black text-white">5. Cookies and technical data</h2><p className="mt-2">The service may use browser storage, authentication tokens, cookies, and basic technical information required for login, security, preferences, and normal operation. We do not ask for unnecessary sensitive information through the product.</p></section>
          <section><h2 className="text-lg font-black text-white">6. Retention and security</h2><p className="mt-2">We retain information for as long as reasonably necessary for account operation, transactions, support, security, and applicable obligations. No online service can guarantee absolute security, but we use access controls and server-side protections appropriate to the service.</p></section>
          <section><h2 className="text-lg font-black text-white">7. Your choices</h2><p className="mt-2">You may contact us through Help/Contact for account or privacy questions, including requests about your information. We may need to verify account ownership before making account-related changes or responding to a data request.</p></section>
          <section><h2 className="text-lg font-black text-white">8. Children</h2><p className="mt-2">PromptStudio AI is intended for general users of AI productivity tools and is not designed to knowingly collect personal information from children in violation of applicable law.</p></section>
          <section><h2 className="text-lg font-black text-white">9. Policy updates</h2><p className="mt-2">We may update this policy as our service or requirements change. The latest version will always be published on this page.</p></section>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/contact" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold hover:bg-indigo-500">Contact Support</Link>
          <Link to="/terms" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Terms of Service</Link>
          <Link to="/" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
