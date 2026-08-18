import { Link } from "react-router-dom";

const contactOptions = [
  { icon: "💬", title: "Support Chat", text: "Get help with setup, prompts, credits, payments, or anything you are stuck on.", action: "Open Support Chat", event: true },
  { icon: "📝", title: "Feedback", text: "Share a bug, idea, payment issue, or quick rating so we can improve PromptStudio AI.", action: "Send Feedback", to: "/feedback" },
  { icon: "❓", title: "Help Center", text: "Check the common questions first for instant answers about plans, credits, image prompts, and history.", action: "Open Help Center", to: "/help" },
];

export default function Contact() {
  const openChat = () => window.dispatchEvent(new CustomEvent("promptstudio:open-support"));

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">Contact PromptStudio AI</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Need help? We are here.</h1>
          <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">The quickest way to reach us is support chat. You can also send feedback or use the Help Center for instant answers.</p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {contactOptions.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="text-2xl">{item.icon}</div>
              <h2 className="mt-3 text-lg font-black">{item.title}</h2>
              <p className="mt-2 min-h-14 text-sm leading-6 text-slate-400">{item.text}</p>
              {item.event ? (
                <button type="button" onClick={openChat} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500">{item.action}</button>
              ) : (
                <Link to={item.to} className="mt-5 inline-flex rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800">{item.action}</Link>
              )}
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-5 text-center">
          <p className="text-sm text-slate-300">For payment issues, share the payment date and amount only. Never send card numbers, CVV, OTPs, passwords, or API secrets.</p>
        </div>

        <div className="mt-8 flex justify-center gap-4 text-sm text-slate-500">
          <a href="/" className="hover:text-white">Home</a>
          <Link to="/about" className="hover:text-white">About</Link>
          <Link to="/help" className="hover:text-white">Help</Link>
        </div>
      </section>
    </main>
  );
}
