import React, { useMemo, useState } from "react";
import { usePromptHistory } from "../../hooks/usePromptHistory";
import { useAuth } from "../../context/AuthContext";
import { evaluateFeatureAccess } from "../../config/features";
import { copyToClipboard } from "../../utils/copyToClipboard";

export default function PromptHistory() {
  const { history, loading, error, removePrompt, toggleFavorite } = usePromptHistory();
  const { plan } = useAuth();
  const favoriteAccess = evaluateFeatureAccess("promptBookmarking", plan);
  const [deletingId, setDeletingId] = useState("");
  const [favoriteId, setFavoriteId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      if (filter === "favorites" && !item.favorite) return false;
      if (!query) return true;
      return `${item.prompt || ""} ${item.category || ""} ${item.aiModel || ""}`.toLowerCase().includes(query);
    });
  }, [history, filter, search]);

  const handleDelete = async (id) => {
    setActionError(""); setDeletingId(id);
    try { await removePrompt(id); }
    catch (err) { console.error(err); setActionError("Unable to delete that prompt. Please try again."); }
    finally { setDeletingId(""); }
  };

  const handleFavorite = async (item) => {
    if (!favoriteAccess.allowed) return;
    setActionError(""); setFavoriteId(item.id);
    try { await toggleFavorite(item.id, !item.favorite); }
    catch (err) { console.error(err); setActionError("Unable to update that favorite. Please try again."); }
    finally { setFavoriteId(""); }
  };

  const handleCopy = async (prompt) => {
    const ok = await copyToClipboard(prompt || "");
    setCopyStatus(ok ? "Copied to clipboard" : "Copy failed");
    setTimeout(() => setCopyStatus(""), 2000);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Loading your prompt library...</p></div>;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">PromptStudio Library</p>
            <h1 className="text-3xl font-bold">Your Prompt Library</h1>
            <p className="mt-2 text-gray-500">Search, reuse, copy, and keep your best prompts close.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
            {history.length} saved prompts
          </div>
        </div>

        {(error || actionError) && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-600">{actionError || error}</div>}
        {copyStatus && <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-700" role="status">{copyStatus}</div>}

        <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your prompts…" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setFilter("all")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>All</button>
              <button type="button" onClick={() => setFilter("favorites")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === "favorites" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>⭐ Favorites</button>
            </div>
          </div>
          {!favoriteAccess.allowed && <p className="mt-3 text-xs font-semibold text-indigo-700">⭐ Favorites are a Pro feature. Upgrade to keep your best prompts permanently highlighted.</p>}
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-xl border p-10 text-center"><h2 className="text-xl font-semibold">{history.length ? "No matching prompts" : "No prompts yet"}</h2><p className="mt-2 text-gray-500">{history.length ? "Try another search or switch back to All." : "Your generated prompts will appear here."}</p></div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((item) => (
              <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">{item.aiModel || "Gemini"}</span>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{item.category || "General"}</span>
                      {item.favorite && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">⭐ Favorite</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{item.prompt}</p>
                  </div>
                  <button type="button" onClick={() => handleFavorite(item)} disabled={!favoriteAccess.allowed || favoriteId === item.id} title={favoriteAccess.allowed ? "Toggle favorite" : "Pro feature"} className={`rounded-xl px-3 py-2 text-lg ${item.favorite ? "bg-amber-50" : "bg-gray-50"} ${!favoriteAccess.allowed ? "opacity-50" : "hover:bg-amber-50"}`} aria-label={favoriteAccess.allowed ? "Toggle favorite" : "Favorites are a Pro feature"}>⭐</button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <button type="button" onClick={() => handleCopy(item.prompt)} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Copy</button>
                  <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">{deletingId === item.id ? "Deleting…" : "Delete"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
