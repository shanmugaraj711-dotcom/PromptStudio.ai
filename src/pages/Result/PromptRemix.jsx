import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePromptHistory } from "../../hooks/usePromptHistory";
import { copyToClipboard } from "../../utils/copyToClipboard";

export default function PromptRemix() {
  const [searchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const { history, loading, error } = usePromptHistory();
  const requestedPrompt = searchParams.get("prompt") || "";
  const [prompt, setPrompt] = useState(requestedPrompt);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("");
  const credits = Math.max(Number(userProfile?.credits || 0), 0);

  useEffect(() => {
    if (!requestedPrompt && history.length && !prompt) {
      setPrompt(history[0].prompt || "");
      setSelectedId(history[0].id);
    }
  }, [history, requestedPrompt, prompt]);

  const selected = useMemo(() => history.find((item) => item.id === selectedId), [history, selectedId]);
  const wordCount = useMemo(() => prompt.trim() ? prompt.trim().split(/\s+/).length : 0, [prompt]);

  const choosePrompt = (item) => {
    setSelectedId(item.id);
    setPrompt(item.prompt || "");
    setStatus("");
  };

  const flash = (message) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(prompt);
    flash(ok ? "Prompt copied" : "Copy failed");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ prompt, sourceId: selectedId || null, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "promptstudio-remix.json";
    anchor.click();
    URL.revokeObjectURL(url);
    flash("Prompt exported");
  };

  const builderUrl = `/builder?remix=${encodeURIComponent(prompt)}`;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Loading your saved prompts...</p></div>;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Retention Engine</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Remix a saved prompt</h1>
            <p className="mt-2 text-sm text-slate-500">Pick any saved prompt, improve it without losing the original, then take the remix back into the Builder.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">💎 {credits} credits available</div>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {status && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-50 p-3 text-sm font-semibold text-green-700" role="status">{status}</div>}

        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">Saved prompts</h2><span className="text-xs font-semibold text-slate-400">{history.length}</span></div>
            {history.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No saved prompts yet. Generate a prompt first and it will appear here.</p> : <div className="max-h-[32rem] space-y-2 overflow-y-auto">{history.map((item) => <button key={item.id} type="button" onClick={() => choosePrompt(item)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-white"}`}><div className="flex gap-2"><span className="text-xs font-bold text-indigo-600">{item.aiModel || "Gemini"}</span>{item.favorite && <span className="text-xs">⭐</span>}</div><p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-700">{item.prompt}</p></button>)}</div>}
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><label htmlFor="remix-prompt" className="text-sm font-bold text-slate-900">Editable remix</label>{selected && <p className="mt-1 text-xs text-slate-500">Original remains safely in your Library.</p>}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">No credits spent while editing</span></div>
            <textarea id="remix-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={18} className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Select a saved prompt to start remixing…" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{wordCount} words · {prompt.length} characters</span><span>Generation credits are only consumed when you run a new generation.</span></div>
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
              <button type="button" onClick={handleCopy} disabled={!prompt.trim()} className="rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-50">Copy</button>
              <button type="button" onClick={handleExport} disabled={!prompt.trim()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Export JSON</button>
              <Link to={builderUrl} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${prompt.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700" : "pointer-events-none bg-slate-100 text-slate-400"}`}>↗ Open in Builder</Link>
              <Link to="/history" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Back to Library</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
