import { useState } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../../components/layout/PublicHeader";

const faqs = [
  { q: "What does PromptStudio AI do?", a: "It turns rough ideas and reference images into clearer, structured prompts that are easier to use with AI tools." },
  { q: "How does Image → Prompt work?", a: "Choose Image, add a reference image, select the relevant category or target, and generate. Free accounts include 1 image analysis per day." },
  { q: "What is included in Free?", a: "Free includes 3 prompt generations per day and 1 reference-image analysis per day." },
  { q: "How do credits work?", a: "Standard generations use 2 credits and reference-image analysis uses 5 credits. Purchased credits do not expire." },
  { q: "What does Pro include?", a: "Pro includes up to 25 prompt generations per day and 20 image analyses per month, plus premium workflow features." },
  { q: "Can I use prompts with different AI tools?", a: "Yes. Select the category or target workflow and PromptStudio can show examples and recommended AI tools for that use case." },
  { q: "Where are my previous prompts?", a: "After signing in, use History from the top navigation." },
  { q: "I paid but my credits or plan did not update. What should I do?", a: "Refresh once after a short wait. If it is still unchanged, use Support Chat or Feedback and share the payment date and amount. Never send card details, OTPs, or API secrets." },
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
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">Open one question at a time. Need us? Start support chat without leaving the page.</p>
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
          <h2 className="text-lg font-black">Need a human answer?</h2>
          <p className="mt-2 text-sm text-slate-300">Open support chat and send the details. We receive the message in our support inbox.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("promptstudio:open-support"))} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold hover:bg-indigo-500">Open Support Chat</button>
            <Link to="/contact" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Contact us</Link>
            <Link to="/feedback" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-900">Send feedback</Link>
          </div>
        </section>

        <div className="mt-7 flex justify-center gap-4 text-sm text-slate-500">
          <a href="/" className="hover:text-white">⌂ Home</a>
          <Link to="/about" className="hover:text-white">About</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
        </div>
      </section>
    </main>
  );
}
