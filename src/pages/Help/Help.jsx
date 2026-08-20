import { useState } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../../components/layout/PublicHeader";

const faqs = [
  { q: "What does PromptStudio AI do?", a: "It turns rough ideas and reference images into clearer, structured prompts that are easier to use with AI tools." },
  { q: "How does Image → Prompt work?", a: "Choose Image, add a reference image, select the relevant category or target, and generate. Your current plan and account limits are shown in the product." },
  { q: "How do credits work?", a: "Standard generations use 2 credits and reference-image analysis uses 5 credits. Purchased credits do not expire unless a purchase-specific term says otherwise." },
  { q: "Can I use prompts with different AI tools?", a: "Yes. PromptStudio is designed to create prompts you can copy into the AI tool or workflow you choose." },
  { q: "Where are my previous prompts?", a: "After signing in, use History from the top navigation when Prompt History is available for your account." },
  { q: "I paid but my credits or plan did not update. What should I do?", a: "First check Transactions and refresh once. If the payment is shown as successful but the credits or plan are still missing, open Support Chat and include the payment date, amount, and transaction reference. We will verify it and either reconcile the missing entitlement or arrange the eligible refund if the purchase cannot be delivered." },
  { q: "I was charged twice. What should I do?", a: "Open Support Chat or Contact and share the payment date, amount, and transaction references. Never send card numbers, CVV, OTPs, passwords, or API secrets." },
  { q: "Can I cancel a credit purchase?", a: "Completed digital-credit purchases normally cannot be cancelled after delivery or use. If the payment is incomplete, duplicated, or affected by a technical error, contact support immediately so we can investigate and reverse it where possible." },
  { q: "How do refunds work?", a: "Refund requests are checked against payment and usage records. If a payment was debited but the purchased service cannot be delivered, we will resolve the transaction through credit reconciliation or an eligible refund. See the Refund & Cancellation Policy for details." },
];

export default function Help() {
  const [open, setOpen] = useState(0);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicHeader />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">Help Center</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Quick answers, less scrolling.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">Find an answer or open support chat without leaving the page.</p>
        </div>

        <div className="mt-8 grid gap-3">
          {faqs.map((faq, index) => {
            const isOpen = open === index;
            return (
              <article key={faq.q} className="rounded-2xl border border-slate-800 bg-slate-900">
                <button type="button" onClick={() => setOpen(isOpen ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="text-sm font-bold text-slate-100">{faq.q}</span>
                  <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-indigo-300">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <div className="border-t border-slate-800 px-5 py-4 text-sm leading-6 text-slate-400">{faq.a}</div>}
              </article>
            );
          })}
        </div>

        <section className="mt-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-5 text-center">
          <h2 className="text-lg font-black">Payment problem?</h2>
          <p className="mt-2 text-sm text-slate-300">Check your transaction first, then send the payment details through Support Chat. We can link the conversation to the transaction.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("promptstudio:open-support", { detail: { message: "My payment was debited but my credits or plan did not update." } }))} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold hover:bg-indigo-500">Open Payment Support</button>
            <Link to="/transactions" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">View Transactions</Link>
            <Link to="/refund" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Refund Policy</Link>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
          <h2 className="text-lg font-black">Need a human answer?</h2>
          <p className="mt-2 text-sm text-slate-400">Open support chat for setup, product questions, billing, refunds, or technical issues.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("promptstudio:open-support"))} className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800">Open Support Chat</button>
            <Link to="/contact" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800">Contact us</Link>
            <Link to="/feedback" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800">Send feedback</Link>
          </div>
        </section>

        <div className="mt-7 flex justify-center gap-4 text-sm text-slate-500">
          <Link to="/" className="hover:text-white">⌂ Home</Link>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <Link to="/terms" className="hover:text-white">Terms</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
        </div>
      </section>
    </main>
  );
}
