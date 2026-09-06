import React, { useMemo, useState } from "react";
import { usePromptHistory } from "../../hooks/usePromptHistory";
import { extractPromptVariables, fillPromptVariables, usePromptTemplates } from "../../hooks/usePromptTemplates";
import { useAuth } from "../../context/AuthContext";
import { evaluateFeatureAccess } from "../../config/features";
import { copyToClipboard } from "../../utils/copyToClipboard";

export default function PromptHistory() {
  const { history, loading, error, removePrompt, toggleFavorite } = usePromptHistory();
  const { templates, loading: templatesLoading, error: templatesError, removeTemplate } = usePromptTemplates();
  const { user, plan } = useAuth();
  const favoriteAccess = evaluateFeatureAccess("promptBookmarking", plan);
  const templateAccess = evaluateFeatureAccess("dynamicVariableFillers", plan);
  const [deletingId, setDeletingId] = useState("");
  const [favoriteId, setFavoriteId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState("prompts");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [variableValues, setVariableValues] = useState({});

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      if (filter === "favorites" && !item.favorite) return false;
      if (!query) return true;
      return `${item.prompt || ""} ${item.category || ""} ${item.aiModel || ""}`.toLowerCase().includes(query);
    });
  }, [history, filter, search]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((item) => !query || `${item.name || ""} ${item.template || ""} ${(item.variables || []).join(" ")}`.toLowerCase().includes(query));
  }, [templates, search]);

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

  const openTemplate = (template) => {
    const variables = template.variables?.length ? template.variables : extractPromptVariables(template.template);
    setActiveTemplate(template);
    setVariableValues(Object.fromEntries(variables.map((name) => [name, ""])));
  };

  const handleUseTemplate = async () => {
    if (!activeTemplate) return;
    const output = fillPromptVariables(activeTemplate.template, variableValues);
    const unresolved = extractPromptVariables(output);
    if (unresolved.length) {
      setActionError(`Fill all variables before using this template: ${unresolved.map((item) => `{{${item}}}`).join(", ")}`);
      return;
    }
    await handleCopy(output);
    setActionError("");
    setCopyStatus("✓ Filled prompt copied — ready to use");
    setTimeout(() => setCopyStatus(""), 2500);
  };

  if (!user) return (
    <div className="workspace-page flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
      <div className="workspace-panel w-full max-w-lg p-8 text-center sm:p-10">
        <p className="workspace-eyebrow">Your private library</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">History starts after you sign in</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">Explore PromptStudio freely. Sign in when you are ready to generate and your saved prompts will appear here securely.</p>
        <a href="/login" className="workspace-primary-button mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold">Sign in to unlock history</a>
      </div>
    </div>
  );

  if (loading || templatesLoading) return <div className="min-h-screen flex items-center justify-center"><p>Loading your prompt library...</p></div>;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">PromptStudio Library</p>
            <h1 className="text-3xl font-bold">Your Prompt Library</h1>
            <p className="mt-2 text-gray-500">Search, reuse, copy, favorite, and turn strong prompts into reusable workflows.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
            {section === "prompts" ? `${history.length} saved prompts` : `${templates.length} reusable templates`}
          </div>
        </div>

        {(error || templatesError || actionError) && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-600">{actionError || error || templatesError}</div>}
        {copyStatus && <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-700" role="status">{copyStatus}</div>}

        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSection("prompts")} className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${section === "prompts" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>📚 Prompts</button>
          <button type="button" disabled={!templateAccess.allowed} onClick={() => setSection("templates")} className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${section === "templates" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>🧩 Reusable Templates {!templateAccess.allowed && "· PRO"}</button>
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={section === "templates" ? "Search reusable templates…" : "Search your prompts…"} className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            {section === "prompts" && <div className="flex gap-2"><button type="button" onClick={() => setFilter("all")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>All</button><button type="button" onClick={() => setFilter("favorites")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === "favorites" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>⭐ Favorites</button></div>}
          </div>
          {section === "prompts" && !favoriteAccess.allowed && <p className="mt-3 text-xs font-semibold text-indigo-700">⭐ Favorites are a Pro feature. Upgrade to keep your best prompts permanently highlighted.</p>}
          {section === "templates" && templateAccess.allowed && <p className="mt-3 text-xs text-gray-500">Use <code className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{'{{variable}}'}</code> fields to reuse one strong prompt with different inputs.</p>}
        </div>

        {section === "prompts" ? (
          filteredHistory.length === 0 ? (
            <div className="rounded-xl border p-10 text-center"><h2 className="text-xl font-semibold">{history.length ? "No matching prompts" : "No prompts yet"}</h2><p className="mt-2 text-gray-500">{history.length ? "Try another search or switch back to All." : "Your generated prompts will appear here."}</p></div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((item) => (
                <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">{item.aiModel || "Gemini"}</span><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{item.category || "General"}</span>{item.favorite && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">⭐ Favorite</span>}</div>
                      <p className="whitespace-pre-wrap text-sm leading-6">{item.prompt}</p>
                    </div>
                    <button type="button" onClick={() => handleFavorite(item)} disabled={!favoriteAccess.allowed || favoriteId === item.id} title={favoriteAccess.allowed ? "Toggle favorite" : "Pro feature"} className={`rounded-xl px-3 py-2 text-lg ${item.favorite ? "bg-amber-50" : "bg-gray-50"} ${!favoriteAccess.allowed ? "opacity-50" : "hover:bg-amber-50"}`} aria-label={favoriteAccess.allowed ? "Toggle favorite" : "Favorites are a Pro feature"}>⭐</button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><button type="button" onClick={() => handleCopy(item.prompt)} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Copy</button><button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">{deletingId === item.id ? "Deleting…" : "Delete"}</button></div>
                </article>
              ))}
            </div>
          )
        ) : (
          filteredTemplates.length === 0 ? (
            <div className="rounded-xl border p-10 text-center"><h2 className="text-xl font-semibold">No reusable templates yet</h2><p className="mt-2 text-gray-500">Save a generated prompt as a template, then add fields such as {'{{name}}'} or {'{{location}}'}.</p></div>
          ) : (
            <div className="space-y-4">
              {filteredTemplates.map((template) => {
                const variables = template.variables?.length ? template.variables : extractPromptVariables(template.template);
                return <article key={template.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-gray-900">{template.name}</h2><div className="mt-2 flex flex-wrap gap-2">{variables.map((name) => <span key={name} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{'{{'}{name}{'}}'}</span>)}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{template.template}</p></div><button type="button" onClick={() => openTemplate(template)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Use Template</button></div><div className="mt-4 flex gap-2 border-t pt-4"><button type="button" onClick={() => handleCopy(template.template)} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">Copy Template</button><button type="button" onClick={async () => { setTemplateId(template.id); try { await removeTemplate(template.id); } catch (err) { setActionError("Unable to delete that template. Please try again."); } finally { setTemplateId(""); } }} disabled={templateId === template.id} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">{templateId === template.id ? "Deleting…" : "Delete"}</button></div></article>;
              })}
            </div>
          )
        )}

        {activeTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Fill reusable prompt variables">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Reusable Prompt</p><h2 className="mt-1 text-xl font-bold">{activeTemplate.name}</h2></div><button type="button" onClick={() => setActiveTemplate(null)} className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100">✕</button></div><div className="mt-5 space-y-4">{Object.keys(variableValues).map((name) => <label key={name} className="block"><span className="mb-1 block text-sm font-semibold text-gray-700">{name}</span><input value={variableValues[name]} onChange={(e) => setVariableValues((current) => ({ ...current, [name]: e.target.value }))} placeholder={`Enter ${name}`} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" /></label>)}</div><div className="mt-5 rounded-xl bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Template preview</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{fillPromptVariables(activeTemplate.template, variableValues)}</p></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setActiveTemplate(null)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button><button type="button" onClick={handleUseTemplate} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Fill & Copy Prompt</button></div></div>
          </div>
        )}
      </div>
    </div>
  );
}
