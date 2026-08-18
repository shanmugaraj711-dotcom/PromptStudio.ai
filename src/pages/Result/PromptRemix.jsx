import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { copyToClipboard } from "../../utils/copyToClipboard";

export default function PromptRemix() {
  const [searchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const initialPrompt = searchParams.get("prompt") || "";
  const [prompt, setPrompt] = useState(initialPrompt);
  const [status, setStatus] = useState("");

  const wordCount = useMemo(() => prompt.trim() ? prompt.trim().split(/\s+/).length : 0, [prompt]);
  const credits = Math.max(Number(userProfile?.credits || 0), 0);

  const flash = (message) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(prompt);
    flash(ok ? "Prompt copied" : "Copy failed");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ prompt, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "promptstudio-remix.json";
    anchor.click();
    URL.revokeObjectURL(url);
    flash("Prompt exported");
  };

  const builderUrl = `/builder?remix=${encodeURIComponent(prompt)}`;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Retention Engine</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Remix a saved prompt</h1>
            <p className="mt-2 text-sm text-slate-500">Edit the prompt, copy it, export it, or take it back into the Builder. Remixing itself never spends credits.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">💎 {credits} credits available</div>
        </div>

        {status && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-50 p-3 text-sm font-semibold text-green-700" role="status">{status}</div>}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="remix-prompt" className="text-sm font-bold text-slate-900">Prompt</label>
          <textarea id="remix-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={18} className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Your saved prompt will appear here…" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{wordCount} words · {prompt.length} characters</span><span>Generation credits are only consumed when you run a new generation.</span></div>
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
            <button type="button" onClick={handleCopy} disabled={!prompt.trim()} className="rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-50">Copy</button>
            <button type="button" onClick={handleExport} disabled={!prompt.trim()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Export JSON</button>
            <Link to={builderUrl} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${prompt.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700" : "pointer-events-none bg-slate-100 text-slate-400"}`}>↗ Open in Builder</Link>
            <Link to="/history" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Back to Library</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
