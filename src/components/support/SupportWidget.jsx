import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";

const quickQuestions = [
  { label: "How do Image → Prompt credits work?", message: "How do Image → Prompt credits work?" },
  { label: "My payment succeeded but my plan did not change", message: "My payment succeeded but my plan did not change." },
  { label: "How do I get started?", message: "How do I get started with PromptStudio AI?" },
];

const loadSupport = async () => {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch("/api/support-message", { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Could not load support messages.");
  return body.messages || [];
};

export default function SupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [status, setStatus] = useState("");
  const [transactionId, setTransactionId] = useState(() => new URLSearchParams(window.location.search).get("transactionId") || "");

  const refresh = async () => {
    if (!user) return;
    setLoadingMessages(true);
    try { setMessages(await loadSupport()); } catch (error) { setStatus(error.message || "Could not load support messages."); } finally { setLoadingMessages(false); }
  };

  useEffect(() => {
    const onOpen = (event) => {
      setOpen(true);
      if (event.detail?.message) setMessage(event.detail.message);
      if (event.detail?.transactionId) setTransactionId(String(event.detail.transactionId));
    };
    window.addEventListener("promptstudio:open-support", onOpen);
    return () => window.removeEventListener("promptstudio:open-support", onOpen);
  }, []);

  useEffect(() => { if (open && user) refresh(); }, [open, user]);

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
        body: JSON.stringify({ message: text, page: window.location.pathname, transactionId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not send your message.");
      setMessage("");
      await refresh();
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
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><p className="text-sm font-black">PromptStudio Support</p><p className="mt-0.5 text-xs text-slate-500">Help, billing and product questions</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-900 hover:text-white" aria-label="Close support">✕</button></div>
          <div className="max-h-80 space-y-3 overflow-y-auto px-5 py-4">
            <div className="rounded-2xl bg-slate-900 p-3 text-sm leading-6 text-slate-300">{greeting}</div>
            {transactionId && <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs font-bold text-blue-200">Transaction linked: {transactionId}</div>}
            {!user && <Link to="/login?next=/help" className="block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-bold">Sign in to chat</Link>}
            {user && loadingMessages && <p className="text-xs text-slate-500">Loading your support history…</p>}
            {user && !loadingMessages && messages.length === 0 && <div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Quick questions</p>{quickQuestions.map((item) => <button key={item.label} type="button" onClick={() => setMessage(item.message)} className="block w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-xs font-semibold text-slate-300 hover:border-blue-500/40 hover:text-white">{item.label}</button>)}</div>}
            {messages.map((item) => <div key={item.id} className="space-y-2"><div className="rounded-2xl bg-blue-600/20 p-3 text-sm leading-6 text-blue-100"><p className="text-[10px] font-black uppercase text-blue-300">You</p>{item.message}</div>{item.adminReply && <div className="mr-8 rounded-2xl bg-slate-900 p-3 text-sm leading-6 text-slate-300"><p className="text-[10px] font-black uppercase text-emerald-300">PromptStudio Support</p>{item.adminReply}</div>}</div>)}
            {status && <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">{status}</p>}
          </div>
          {user && <form onSubmit={send} className="border-t border-slate-800 p-4"><div className="flex gap-2"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your question…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500" /><button disabled={sending || !message.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold disabled:opacity-40">{sending ? "…" : "Send"}</button></div><Link to="/transactions" className="mt-3 block text-center text-xs font-semibold text-slate-500 hover:text-slate-200">View transactions →</Link><Link to="/feedback" className="mt-2 block text-center text-xs font-semibold text-slate-500 hover:text-slate-200">Send product feedback instead →</Link></form>}
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className={`support-fab fixed bottom-5 right-5 z-[60] ${open ? "support-fab-is-open" : ""}`} aria-label={open ? "Close PromptStudio support" : "Open PromptStudio support"} aria-expanded={open}>
        <span className="support-robot" aria-hidden="true"><span className="support-robot-antenna" /><span className="support-robot-face"><span className="support-robot-eye" /><span className="support-robot-eye" /><span className="support-robot-mouth" /></span></span>
        <span className="support-fab-label">{open ? "Close" : "Help & Chat"}</span>
        {!open && <span className="support-fab-ping" aria-hidden="true" />}
      </button>
    </>
  );
}
