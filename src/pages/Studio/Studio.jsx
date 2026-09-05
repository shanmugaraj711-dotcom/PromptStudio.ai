import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/Button";
import StudioPreview from "../../components/studio/StudioPreview";
import { generatePrompt } from "../../services/promptGenerator";
import { generateStudioProject, editStudioProject } from "../../services/studioService";

export default function Studio() {
  const { user, loginWithGoogle } = useAuth();
  const [idea, setIdea] = useState("");
  const [files, setFiles] = useState(null);
  const [changed, setChanged] = useState([]);
  const [edit, setEdit] = useState("");
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");

  const getUser = async () => user || await loginWithGoogle();

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!idea.trim()) return;
    setError(""); setChanged([]); setStatus("building");
    try {
      const authenticatedUser = await getUser();
      const idToken = await authenticatedUser.getIdToken();
      const generated = await generatePrompt({ idea: idea.trim(), aiModel: "chatgpt", category: "coding", idToken, requestId: globalThis.crypto?.randomUUID?.() || `studio-${Date.now()}` });
      setLastPrompt(generated.prompt);
      const project = await generateStudioProject({ prompt: generated.prompt, idToken });
      setFiles(project.files);
    } catch (err) {
      setError(err.message || "Studio could not build the preview.");
    } finally { setStatus("ready"); }
  };

  const handleEdit = async (event) => {
    event.preventDefault();
    if (!files || !edit.trim()) return;
    setError(""); setStatus("editing");
    try {
      const authenticatedUser = await getUser();
      const idToken = await authenticatedUser.getIdToken();
      const result = await editStudioProject({ files, instruction: edit.trim(), idToken });
      setFiles(result.files);
      setChanged(result.changed || []);
      setEdit("");
    } catch (err) {
      setError(err.message || "Studio could not apply that edit.");
    } finally { setStatus("ready"); }
  };

  return (
    <section className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 text-white"><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">PromptStudio Studio · v0</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Describe it. See it. Change it.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">A thin working slice: your existing PromptStudio intelligence generates the build brief, Studio creates a React project, and the live preview updates from targeted edit commands.</p></div>
        <form onSubmit={handleGenerate} className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="Build a modern restaurant landing page with a hero, menu cards and a booking button…" className="min-h-[96px] flex-1 resize-y rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" /><Button type="submit" variant="primary" size="lg" disabled={!idea.trim() || status === "building"} className="sm:self-end">{status === "building" ? "Building…" : "Build Preview →"}</Button></div></form>
        {error && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {lastPrompt && <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300"><summary className="cursor-pointer font-bold text-white">View reused PromptStudio generation</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5">{lastPrompt}</pre></details>}
        <div className="mt-6"><StudioPreview files={files} changed={changed} status={status} /></div>
        {files && <form onSubmit={handleEdit} className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><input value={edit} onChange={(e) => setEdit(e.target.value)} placeholder='Try: “Make the header blue”' className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" /><Button type="submit" variant="primary" disabled={!edit.trim() || status === "editing"}>{status === "editing" ? "Editing…" : "Apply Change"}</Button></div><p className="mt-2 text-xs text-slate-400">Small edits are applied as exact replacements. Broad rewrites are rejected.</p></form>}
      </div>
    </section>
  );
}
