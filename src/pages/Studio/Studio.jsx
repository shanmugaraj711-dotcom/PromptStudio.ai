import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/Button";
import StudioPreview from "../../components/studio/StudioPreview";
import { generatePrompt } from "../../services/promptGenerator";
import { createStudioJob, getStudioJob, processStudioJob, editStudioProject } from "../../services/studioService";
import { payForStudioBuild } from "../../services/studioPayment";

const STAGE_ORDER = ["spec", "render", "validation", "ready"];
const stageIndex = (stage) => Math.max(0, STAGE_ORDER.indexOf(stage));

function GenerationProgress({ stage, message }) {
  const current = stageIndex(stage);
  const steps = [["spec", "Designing the Studio Spec"], ["render", "Rendering from templates"], ["validation", "Validating preview"], ["ready", "Preview ready"]];
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-8"><div className="flex items-center gap-3 text-white"><span className="h-3 w-3 animate-pulse rounded-full bg-indigo-400" /><h2 className="text-xl font-black">Building your website</h2></div><p className="mt-2 text-sm text-slate-400">{message || "Studio is turning your idea into a structured design, then rendering it with PromptStudio templates."}</p><div className="mt-6 space-y-3">{steps.map(([key, label], index) => { const done = current > index || (key === "ready" && stage === "ready"); const active = current === index && stage !== "ready"; return <div key={key} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/30 px-4 py-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${done ? "bg-emerald-400/20 text-emerald-300" : active ? "bg-indigo-400/20 text-indigo-300" : "bg-white/5 text-slate-600"}`}>{done ? "✓" : active ? "•" : "○"}</span><span className={done || active ? "font-semibold text-white" : "text-slate-500"}>{label}</span>{active && <span className="ml-auto text-xs font-bold text-indigo-300">In progress</span>}</div>; })}</div></div>;
}

export default function Studio() {
  const { user, loginWithGoogle } = useAuth();
  const [idea, setIdea] = useState("");
  const [files, setFiles] = useState(null);
  const [changed, setChanged] = useState([]);
  const [edit, setEdit] = useState("");
  const [status, setStatus] = useState("ready");
  const [jobStage, setJobStage] = useState("spec");
  const [jobMessage, setJobMessage] = useState("");
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [studioJobId, setStudioJobId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("idle");

  const getUser = async () => user || await loginWithGoogle();

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!idea.trim()) return;
    setError(""); setChanged([]); setFiles(null); setStudioJobId(""); setPaymentStatus("idle"); setStatus("building"); setJobStage("spec"); setJobMessage("Preparing your Studio preview…");
    try {
      const authenticatedUser = await getUser();
      const idToken = await authenticatedUser.getIdToken();
      const generated = await generatePrompt({ idea: idea.trim(), aiModel: "chatgpt", category: "coding", idToken, requestId: globalThis.crypto?.randomUUID?.() || `studio-${Date.now()}` });
      setLastPrompt(generated.prompt);
      setJobMessage("Creating your free preview…");
      const created = await createStudioJob({ prompt: generated.prompt, idToken });
      setStudioJobId(created.jobId);
      let job = created;
      setJobStage(job.stage || "spec"); setJobMessage(job.message || "Preparing the structured Studio Spec.");

      for (let i = 0; i < 20 && job.status !== "ready"; i += 1) {
        if (job.status === "failed") throw Object.assign(new Error(job.error || "Studio could not build the preview."), { code: "studio_job_failed" });
        setJobStage(job.stage || "spec"); setJobMessage(job.message || "Studio is working on your preview…");
        await processStudioJob({ jobId: created.jobId, idToken });
        job = await getStudioJob({ jobId: created.jobId, idToken });
        setJobStage(job.stage || "spec"); setJobMessage(job.message || "Studio is working on your preview…");
        if (job.status === "ready") { setFiles(job.files); setStudioJobId(job.jobId); break; }
        if (job.status === "failed") throw Object.assign(new Error(job.error || "Studio could not build the preview."), { code: "studio_job_failed" });
        await new Promise((resolve) => setTimeout(resolve, job.retryAt ? Math.max(500, Math.min(5000, Number(job.retryAt) - Date.now())) : 600));
      }
      if (job.status !== "ready") throw new Error("Studio could not finish the preview in the available build attempts. Please try again.");
      setJobMessage("Preview ready. Review it, then continue when you are happy with it.");
    } catch (err) {
      setError(err.message || "Studio could not build the preview.");
    } finally { setStatus("ready"); }
  };

  const handleAcceptPreview = async () => {
    if (!files || !studioJobId || paymentStatus === "paying" || paymentStatus === "paid") return;
    setError(""); setPaymentStatus("paying"); setJobMessage("Opening secure checkout…");
    try {
      const authenticatedUser = await getUser();
      const idToken = await authenticatedUser.getIdToken();
      const result = await payForStudioBuild({ user: authenticatedUser, idToken, studioBuildRequestId: studioJobId, onSuccess: () => setJobMessage("Payment verified. Your Studio build is confirmed.") });
      setPaymentStatus(result.status === "PAID" || result.alreadyPaid ? "paid" : "idle");
      if (result.status === "PAID" || result.alreadyPaid) setJobMessage("Payment verified. Your Studio build is confirmed.");
    } catch (err) {
      setPaymentStatus("idle");
      setError(err.message || "Studio payment failed.");
      setJobMessage("Preview is still available. You can try checkout again.");
    }
  };

  const handleEdit = async (event) => {
    event.preventDefault();
    if (!files || !edit.trim()) return;
    setError(""); setStatus("editing");
    try {
      const authenticatedUser = await getUser();
      const idToken = await authenticatedUser.getIdToken();
      const result = await editStudioProject({ files, instruction: edit.trim(), idToken });
      setFiles(result.files); setChanged(result.changed || []); setEdit("");
    } catch (err) {
      setError(err.message || "Studio could not apply that edit.");
    } finally { setStatus("ready"); }
  };

  return <section className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-7 text-white"><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">PromptStudio Studio · v0</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Describe it. See it. Change it.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">PromptStudio intelligence turns your brief into a small structured design spec. Our deterministic template engine then builds the React + CSS preview — so source-code generation is no longer the weak point.</p></div><form onSubmit={handleGenerate} className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="Build a modern restaurant landing page with a hero, menu cards and a booking button…" className="min-h-[96px] flex-1 resize-y rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" /><Button type="submit" variant="primary" size="lg" disabled={!idea.trim() || status === "building" || paymentStatus === "paying"} className="sm:self-end">{status === "building" ? "Building Preview…" : "Build Preview →"}</Button></div><p className="mt-2 text-xs text-slate-400">Preview first. Pay only after you accept the result.</p></form>{error && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}{lastPrompt && <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300"><summary className="cursor-pointer font-bold text-white">View reused PromptStudio generation</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5">{lastPrompt}</pre></details>}<div className="mt-6">{status === "building" ? <GenerationProgress stage={jobStage} message={jobMessage} /> : files ? <><StudioPreview files={files} changed={changed} status={status} /><div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5 shadow-xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-white">Preview ready</p><p className="mt-1 text-sm text-slate-300">Review the live preview above. If you like it, continue to secure checkout.</p>{paymentStatus === "paid" && <p className="mt-2 text-sm font-bold text-emerald-300">✓ Payment verified — build confirmed.</p>}</div><Button type="button" variant="primary" size="lg" disabled={!studioJobId || paymentStatus === "paying" || paymentStatus === "paid"} onClick={handleAcceptPreview}>{paymentStatus === "paying" ? "Opening Checkout…" : paymentStatus === "paid" ? "Build Confirmed ✓" : "Accept Preview & Continue →"}</Button></div></div></> : null}</div>{files && <form onSubmit={handleEdit} className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><input value={edit} onChange={(e) => setEdit(e.target.value)} placeholder='Try: “Make the header blue”' className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" /><Button type="submit" variant="primary" disabled={!edit.trim() || status === "editing" || paymentStatus === "paying"}>{status === "editing" ? "Editing…" : "Apply Change"}</Button></div><p className="mt-2 text-xs text-slate-400">Small edits are applied as exact replacements. Broad rewrites are rejected.</p></form>}</div></section>;
}
