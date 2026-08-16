import { useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading';
import TextArea from '../../components/ui/TextArea';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import ResultCard from '../Result/ResultCard';
import AIDiscoveryPanel from '../../components/builder/AIDiscoveryPanel';
import { usePromptBuilder } from '../../hooks/usePromptBuilder';
import { AI_MODELS } from '../../constants/aiModels';
import { CATEGORIES } from '../../constants/categories';
import { createQuotaState } from '../../constants/quota';
import { useAuth } from '../../context/AuthContext';
import { evaluateFeatureAccess } from '../../config/features';
import { getWorkflowById } from '../../config/workflows';
import PRODUCT_CONFIG from '../../config/product.config';

const IMAGE_IDEAS = [
  { label: 'Cinematic portrait', text: 'Create a cinematic portrait with dramatic but natural lighting and shallow depth of field.' },
  { label: 'Product hero', text: 'Create a premium commercial product hero image with clean composition and polished studio lighting.' },
  { label: '3D character', text: 'Create a polished 3D character render with expressive details, soft studio lighting, and a clean environment.' },
  { label: 'Editorial', text: 'Create a high-end editorial photograph with intentional composition, sophisticated styling, and natural texture.' },
  { label: 'Fantasy scene', text: 'Create an imaginative cinematic fantasy scene with atmospheric depth, rich environmental detail, and controlled lighting.' },
  { label: 'Kids illustration', text: 'Create a cheerful child-friendly illustration with expressive characters, clean shapes, and playful visual storytelling.' },
];

function PromptBuilder() {
  const fileInputRef = useRef(null);
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get('workflow');
  const requestedModel = searchParams.get('model');
  const workflow = getWorkflowById(workflowId);
  const { idea, setIdea, aiModel, setAiModel, category, setCategory, image, selectImage, clearImage, generatedPrompt, perspectives, intelligence, error, isGenerating, isPreparingImage, generate } = usePromptBuilder();
  const { user, userProfile, loading: authLoading, plan, promptsToday, lastPromptDate } = useAuth();
  const workflowAccess = evaluateFeatureAccess('promptWorkflows', plan);
  const workflowActive = Boolean(workflow && workflowAccess.allowed);
  const imageMode = category === 'image';
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesToday: userProfile?.imageAnalysesToday, lastImageAnalysisDate: userProfile?.lastImageAnalysisDate, imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth, lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth });
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const generationCreditCost = image ? PRODUCT_CONFIG.creditCosts.referenceImageAnalysis : PRODUCT_CONFIG.creditCosts.standardGeneration;
  const quotaExhausted = quota.remaining === 0;
  const imageQuotaExhausted = Boolean(image && quota.imageLimit !== null && quota.imageRemaining <= 0);
  const creditBlocked = quotaExhausted && credits < generationCreditCost;
  const generationBlocked = imageQuotaExhausted || creditBlocked;

  useEffect(() => { if (requestedModel && AI_MODELS.some((model) => model.id === requestedModel)) setAiModel(requestedModel); }, [requestedModel, setAiModel]);
  useEffect(() => { if (workflowActive && workflow.category) setCategory(workflow.category); }, [workflowActive, workflow?.category, setCategory]);

  const handleSubmit = (event) => { event.preventDefault(); generate(); };
  const handleFileChange = (event) => { const [file] = event.target.files || []; if (file) selectImage(file); event.target.value = ''; };
  const useImageIdea = (text) => setIdea((current) => current.trim() ? `${current.trim()}\n\n${text}` : text);
  const applyDiscovery = (item) => { if (item.idea) setIdea(item.idea); if (item.modelId && AI_MODELS.some((model) => model.id === item.modelId)) setAiModel(item.modelId); };
  const stepLabels = { optimize: 'Optimize', perspectives: 'Perspectives', compare: 'Compare', variables: 'Variables', launch: 'Launch' };

  return (
    <section id="prompt-builder" className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/50 py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.14),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(167,139,250,0.12),transparent_42%)]" />
      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mb-5 flex justify-end"><Link to="/workflows" className="rounded-xl border border-indigo-200 bg-white/90 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50">⚡ Prompt Workflows</Link></div>
        <SectionHeading eyebrow={workflowActive ? `Workflow · ${workflow.name}` : 'Try it now'} title="Build your prompt" subtitle="Choose what you are creating, explore a recommended AI, try an example, then generate a prompt tailored to that workflow." />
        {!authLoading && !user && <div className="mt-8 rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">Generate first — sign in automatically</p><p className="mt-1 text-sm text-slate-600">Click Generate Better Prompt and Google sign-in will open automatically. Your idea stays here and generation continues after sign-in.</p></div><span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm">FREE</span></div></div>}
        {workflowActive && <div className="mt-8 rounded-3xl border border-indigo-200/80 bg-white/90 p-5 shadow-sm backdrop-blur"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-indigo-900">⚡ {workflow.name} workflow active</p><p className="mt-1 text-xs text-indigo-700">Follow the guided steps below. Your existing generation quota and AI services are unchanged.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">PRO</span></div><div className="mt-4 flex flex-wrap items-center gap-2">{workflow.steps.map((step, index) => <span key={step} className="flex items-center gap-2"><span className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800">{index + 1}. {stepLabels[step]}</span>{index < workflow.steps.length - 1 && <span className="text-indigo-300">→</span>}</span>)}</div></div>}

        <form className="mt-8 rounded-[2rem] border border-slate-200/80 bg-white/95 p-8 shadow-[0_24px_70px_-35px_rgba(37,99,235,0.35)] backdrop-blur" onSubmit={handleSubmit} aria-busy={isGenerating || isPreparingImage}>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4"><p className="text-sm font-black text-indigo-900">1. What are you creating?</p><p className="mt-1 text-xs text-indigo-700">Pick a category to see the right AI tools and real examples for that kind of work.</p><div className="mt-4"><Select id="category" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} disabled={isGenerating || isPreparingImage || workflowActive} /></div></div>
          <AIDiscoveryPanel category={category} aiModel={aiModel} onExample={applyDiscovery} />
          <div className="mt-6"><TextArea id="idea" label="Your idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={imageMode ? 'Describe the image you want, or upload a reference image below…' : 'What do you want AI to create? You can also attach a reference image below.'} rows={6} error={error} disabled={isGenerating || isPreparingImage} /></div>
          {imageMode && <div className="mt-5 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">🎨 Creative image starters</p><p className="mt-1 text-xs text-slate-500">Pick a direction and PromptStudio will add it to your idea.</p></div><span className="hidden rounded-full bg-white px-3 py-1 text-[11px] font-bold text-violet-700 shadow-sm sm:inline">IMAGE MODE</span></div><div className="mt-3 flex flex-wrap gap-2">{IMAGE_IDEAS.map((item) => <button key={item.label} type="button" onClick={() => useImageIdea(item.text)} disabled={isGenerating || isPreparingImage} className="rounded-full border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{item.label}</button>)}</div></div>}
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">Reference image <span className="font-normal text-slate-500">(optional)</span></p><p className="mt-1 text-xs text-slate-500">Upload a photo, screenshot, design, or other visual reference. Max 3 MB.</p></div><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} /><Button type="button" variant="secondary" size="sm" disabled={isGenerating || isPreparingImage} onClick={() => fileInputRef.current?.click()}>{isPreparingImage ? 'Preparing image…' : image ? 'Change image' : 'Upload image'}</Button></div>{image && <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><img src={`data:${image.mimeType};base64,${image.data}`} alt="Reference preview" className="h-20 w-20 rounded-lg object-cover ring-2 ring-white" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{image.name}</p><p className="mt-1 text-xs text-slate-500">Ready for visual analysis · {generationCreditCost} credits after free usage</p></div><Button type="button" variant="secondary" size="sm" onClick={clearImage} disabled={isGenerating}>Remove</Button></div>}</div>
          <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4"><p className="text-sm font-semibold text-blue-700">💡 PromptStudio Intelligence</p><p className="mt-2 text-sm text-slate-700">With an image, PromptStudio analyzes the visible details that matter to your goal and keeps facts separate from assumptions instead of blindly inventing details.</p></div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"><Select id="aiModel" label="2. Target AI" value={aiModel} onChange={(e) => setAiModel(e.target.value)} options={AI_MODELS} disabled={isGenerating || isPreparingImage} /><p className="mt-2 text-xs text-slate-500">Your prompt is written for this tool's style and workflow. Recommendations above are category-aware starting points.</p></div>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">⚡ Prompts</p><p className="mt-1 text-sm font-black text-slate-900">{quota.remaining} / {quota.dailyLimit} today</p></div><div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">🖼️ Images</p><p className="mt-1 text-sm font-black text-slate-900">{quota.imageRemaining} / {quota.imageLimit ?? '∞'} {quota.imagePeriod}</p></div><div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">💎 Credits</p><Link to="/account#plans" className="mt-1 block text-sm font-black text-indigo-700 hover:text-indigo-500">{credits} available →</Link></div></div></div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="primary" size="lg" type="submit" disabled={isGenerating || isPreparingImage || generationBlocked} className="w-full sm:w-auto">{isGenerating ? (user ? 'Building…' : 'Signing in & building…') : workflow ? `Run ${workflow.name}` : imageMode ? 'Create Image Prompt' : 'Generate Better Prompt'}</Button><div className="text-right text-sm font-semibold" aria-live="polite"><p className={quotaExhausted ? (credits >= generationCreditCost ? 'text-emerald-700' : 'text-red-600') : 'text-slate-600'}>{quotaExhausted ? (credits >= generationCreditCost ? `Using ${generationCreditCost} credits for this generation` : `Need ${generationCreditCost} credits to continue`) : `${quota.remaining} / ${quota.dailyLimit} prompts remaining today`}</p>{image && <p className="mt-1 text-xs text-slate-500">Image analysis: {generationCreditCost} credits after free prompt usage</p>}</div></div>
        </form>
        {quotaExhausted && plan === 'free' && <div className="mt-5 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-slate-900">You've used today's 3 free prompts.</p><p className="mt-1 text-xs text-slate-600">{credits > 0 ? `You have ${credits} credits available. Continue creating, or get more when you need them.` : 'Continue with Creator Credits or upgrade to Pro.'}</p></div><div className="flex flex-col gap-2 sm:flex-row"><Link to="/account#plans" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-center text-xs font-bold text-white hover:bg-indigo-500">⭐ Upgrade · ₹79/month</Link><Link to="/account#plans" className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-center text-xs font-bold text-indigo-700 hover:bg-indigo-50">💎 Creator Credits</Link></div></div></div>}
        {imageQuotaExhausted && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><strong>You've reached your reference-image allowance.</strong><p className="mt-1 text-xs">Credits do not bypass the image allowance. You can continue with text prompts or return when your image allowance resets.</p></div>}
        {generatedPrompt && <div className="mt-10"><ResultCard prompt={generatedPrompt} perspectives={perspectives} intelligence={intelligence} userPlan={plan} workflow={workflow} category={category} /></div>}
      </div>
    </section>
  );
}

export default PromptBuilder;
