import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";

const quickQuestions = [
  { label: "How do Image → Prompt credits work?", message: "How do Image → Prompt credits work?" },
  { label: "My payment succeeded but my plan did not change", message: "My payment succeeded but my plan did not change." },
  { label: "How do I get started?", message: "How do I get started with PromptStudio AI?" },
];

export default function SupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("promptstudio:open-support", onOpen);
    return () => window.removeEventListener("promptstudio:open-support", onOpen);
  }, []);

  const greeting = useMemo(() => user ? `Hi${user.displayName ? ` ${user.displayName.split(" ")[0]}` : ""}! Ask us anything about PromptStudio.` : "Sign in to send a support message.", [user]);

  const send = async (event) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setStatus("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/support-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, page: window.location.pathname }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not send your message.");
      setMessages((items) => [...items, { role: "user", text }, { role: "system", text: "Received ✅ We’ll review it from the PromptStudio support inbox." }]);
      setMessage("");
    } catch (error) {
      setStatus(error.message || "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-[60] w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl shadow-slate-950/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div><p className="text-sm font-black">PromptStudio Support</p><p className="mt-0.5 text-xs text-slate-500">Help, billing and product questions</p></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-900 hover:text-white" aria-label="Close support">✕</button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto px-5 py-4">
            <div className="rounded-2xl bg-slate-900 p-3 text-sm leading-6 text-slate-300">{greeting}</div>
            {!user && <Link to="/login?next=/help" className="block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-bold">Sign in to chat</Link>}
            {user && messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Quick questions</p>
                {quickQuestions.map((item) => <button key={item.label} type="button" onClick={() => setMessage(item.message)} className="block w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-xs font-semibold text-slate-300 hover:border-blue-500/40 hover:text-white">{item.label}</button>)}
              </div>
            )}
            {messages.map((item, index) => <div key={`${item.role}-${index}`} className={`rounded-2xl p-3 text-sm leading-6 ${item.role === "user" ? "ml-8 bg-blue-600/20 text-blue-100" : "mr-8 bg-slate-900 text-slate-300"}`}>{item.text}</div>)}
            {status && <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">{status}</p>}
          </div>
          {user && <form onSubmit={send} className="border-t border-slate-800 p-4"><div className="flex gap-2"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your question…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500" /><button disabled={sending || !message.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold disabled:opacity-40">{sending ? "…" : "Send"}</button></div><Link to="/feedback" className="mt-3 block text-center text-xs font-semibold text-slate-500 hover:text-slate-200">Send product feedback instead →</Link></form>}
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-500" aria-label="Open PromptStudio support">💬 Help & Chat</button>
    </>
  );
}
