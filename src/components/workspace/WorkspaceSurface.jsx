import { lazy, Suspense, useMemo, useState } from 'react';
import LucideIcon from '../ui/LucideIcon';
import { usePromptBuilder } from '../../hooks/usePromptBuilder';
import StandardBuilder from '../builder/StandardBuilder';
import ImageBuilder from '../builder/ImageBuilder';
import ResultCard from '../../pages/Result/ResultCard';
import { AI_MODELS } from '../../constants/aiModels';
import { generateReferenceCoding, createRequestId } from '../../services/referenceCoding';
import { useAuth } from '../../context/AuthContext';

const Studio = lazy(() => import('../../pages/Studio/Studio'));
const ApkForge = lazy(() => import('../../pages/ApkForge/ApkForge'));
const ApkForgeBuilds = lazy(() => import('../../pages/ApkForge/ApkForgeBuilds'));

const MODES = [
  { id: 'prompt', label: 'Prompt Lab', icon: 'sparkles', description: 'Text & LLM prompts' },
  { id: 'image', label: 'Image Intel', icon: 'image', description: 'Reference → prompt' },
  { id: 'code', label: 'Code Lab', icon: 'code', description: 'Reference → code' },
  { id: 'studio', label: 'Studio', icon: 'layout', description: 'Website preview' },
  { id: 'apk', label: 'APK Forge', icon: 'smartphone', description: 'Android builds' },
];

const OUTPUT_FORMATS = [
  ['notsure', 'Let AI decide'],
  ['react', 'React (JSX)'],
  ['html', 'HTML + CSS'],
  ['vue', 'Vue'],
  ['fullstack', 'Full-stack'],
];

function PanelLoader({ label }) {
  return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-white/8 bg-white/[0.025] text-sm text-slate-500">Opening {label}…</div>;
}

function PromptWorkspace({ mode, idea, setIdea }) {
  const [aiModel, setAiModel] = useState('chatgpt');
  const [category, setCategory] = useState(mode === 'image' ? 'image' : 'writing');
  const { user, loginWithGoogle } = useAuth();
  const builder = usePromptBuilder();
  const activeMode = mode === 'image' ? 'image' : 'standard';

  const effectiveIdea = builder.idea || idea;
  const setEffectiveIdea = (value) => {
    setIdea(value);
    builder.setIdea(value);
  };

  const generate = async (event) => {
    event.preventDefault();
    if (!builder.idea && idea) builder.setIdea(idea);
    await builder.generate();
  };

  const selectModel = (item) => {
    if (item.modelId && AI_MODELS.some((model) => model.id === item.modelId)) setAiModel(item.modelId);
    builder.setAiModel(item.modelId || aiModel);
  };

  return <form onSubmit={generate} className="rounded-2xl border border-white/8 bg-[#0b111b] p-4 sm:p-5" aria-busy={builder.isGenerating || builder.isPreparingImage}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{activeMode === 'image' ? 'Visual intelligence' : 'Prompt intelligence'}</p><h3 className="mt-1 text-base font-black text-white">{activeMode === 'image' ? 'Turn a reference into a usable prompt' : 'Turn your idea into a precise prompt'}</h3></div>
      <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-slate-500">{builder.isGenerating ? 'AI working' : 'Ready'}</span>
    </div>
    {activeMode === 'standard' ? <StandardBuilder category={category} setCategory={setCategory} aiModel={aiModel} handleToolSelect={selectModel} handleExample={(item) => setEffectiveIdea(item.idea || '')} idea={effectiveIdea} setIdea={setEffectiveIdea} error={builder.error} isGenerating={builder.isGenerating} isPreparingImage={builder.isPreparingImage} workflowActive={false} /> : <ImageBuilder aiModel={aiModel} handleToolSelect={selectModel} handleExample={(item) => setEffectiveIdea(item.idea || '')} idea={effectiveIdea} setIdea={setEffectiveIdea} error={builder.error} isGenerating={builder.isGenerating} isPreparingImage={builder.isPreparingImage} />}
    {activeMode === 'image' && <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/10 p-3 text-xs text-slate-500">Use the existing Image Intel upload control in the workspace when you need a visual reference.</div>}
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-[11px] text-slate-500">No page change. Your result appears directly below.</span><button type="submit" disabled={!effectiveIdea.trim() || builder.isGenerating || builder.isPreparingImage} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-35">{builder.isGenerating ? 'Generating…' : activeMode === 'image' ? 'Analyze reference' : 'Generate prompt'} <LucideIcon name="arrow" size={14} /></button></div>
    {builder.generatedPrompt && <div className="mt-5"><ResultCard prompt={builder.generatedPrompt} perspectives={builder.perspectives} intelligence={builder.intelligence} userPlan="free" category={category} /></div>}
  </form>;
}

function CodeWorkspace({ idea, setIdea }) {
  const { user, loginWithGoogle, updateQuotaState } = useAuth();
  const [outputFormat, setOutputFormat] = useState('notsure');
  const [targetAI, setTargetAI] = useState('any');
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const readImage = (file) => new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Choose an image reference.'));
    if (file.size > 3 * 1024 * 1024) return reject(new Error('Image must be smaller than 3 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => resolve({ mimeType: file.type, data: String(reader.result).split(',')[1] || '', name: file.name });
    reader.readAsDataURL(file);
  });

  const generate = async () => {
    if (!idea.trim() && !image) return setError('Describe the change or add a screenshot first.');
    setBusy(true); setError(''); setResult(null);
    try {
      let authenticatedUser = user;
      if (!authenticatedUser) authenticatedUser = await loginWithGoogle();
      if (!authenticatedUser) return;
      const token = await authenticatedUser.getIdToken();
      const response = await generateReferenceCoding({ idea: idea.trim(), idToken: token, requestId: createRequestId(), images: image ? [image] : [], referenceFiles: [], outputFormat, targetAI });
      setResult(response);
      if (response.quota) updateQuotaState(response.quota, response.creditsRemaining);
    } catch (cause) {
      setError(cause.message || 'Unable to generate coding intelligence.');
    } finally { setBusy(false); }
  };

  return <div className="rounded-2xl border border-white/8 bg-[#0b111b] p-4 sm:p-5">
    <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-300">Reference intelligence</p><h3 className="mt-1 text-base font-black text-white">Describe the change. Keep the existing product.</h3></div>
    <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} disabled={busy} placeholder="Improve this dashboard for mobile, preserve the current business logic, and add a compact search interaction…" className="w-full resize-none rounded-xl border border-white/8 bg-[#070b12] p-3.5 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-teal-300/40" />
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-400">Output<select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#070b12] p-2.5 text-xs text-white">{OUTPUT_FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold text-slate-400">Target AI<select value={targetAI} onChange={(e) => setTargetAI(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#070b12] p-2.5 text-xs text-white"><option value="any">Any AI</option><option value="chatgpt">ChatGPT</option><option value="claude-code">Claude Code</option><option value="cursor">Cursor</option><option value="gemini">Gemini</option><option value="copilot">GitHub Copilot</option></select></label></div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-white"><LucideIcon name="image" size={15} className="text-teal-300" />{image ? image.name : 'Add screenshot'}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { try { setImage(await readImage(e.target.files?.[0])); setError(''); } catch (cause) { setError(cause.message); } e.target.value = ''; }} /></label><button type="button" onClick={generate} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-teal-400 disabled:opacity-40">{busy ? 'Reading reference…' : 'Generate code prompt'} <LucideIcon name="arrow" size={14} /></button></div>
    {error && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200" role="alert">{error}</p>}
    {result && <div className="mt-5"><ResultCard prompt={result.prompt} perspectives={result.perspectives} intelligence={result.intelligence} category="coding" userPlan="free" targetAI={targetAI} /></div>}
  </div>;
}

export default function WorkspaceSurface({ workspace, idea, setIdea }) {
  const mode = useMemo(() => MODES.find((item) => item.id === workspace) || MODES[0], [workspace]);
  return <section className="mt-4" aria-label="Active workspace" aria-live="polite"><div className="mb-2 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/5 text-cyan-300"><LucideIcon name={mode.icon} size={16} /></span><div className="min-w-0"><p className="truncate text-xs font-black text-white">{mode.label}</p><p className="truncate text-[10px] text-slate-600">{mode.description}</p></div></div><span className="hidden rounded-full border border-white/8 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 sm:inline-flex">In place</span></div><div key={workspace} className="workspace-panel-enter"><Suspense fallback={<PanelLoader label={mode.label} />}>{workspace === 'prompt' || workspace === 'image' ? <PromptWorkspace mode={workspace} idea={idea} setIdea={setIdea} /> : workspace === 'code' ? <CodeWorkspace idea={idea} setIdea={setIdea} /> : workspace === 'studio' ? <Studio initialIdea={idea} /> : workspace === 'apk' ? <ApkForge initialDescription={idea} /> : <ApkForgeBuilds />}</Suspense></div></section>;
}

export { MODES };