import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading';
import TextArea from '../../components/ui/TextArea';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import ResultCard from '../Result/ResultCard';
import { usePromptBuilder } from '../../hooks/usePromptBuilder';
import { AI_MODELS } from '../../constants/aiModels';
import { CATEGORIES } from '../../constants/categories';
import { createQuotaState } from '../../constants/quota';
import { useAuth } from '../../context/AuthContext';
import { evaluateFeatureAccess } from '../../config/features';
import { getWorkflowById } from '../../config/workflows';

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
  const workflow = getWorkflowById(workflowId);
  const {
    idea,
    setIdea,
    aiModel,
    setAiModel,
    category,
    setCategory,
    image,
    selectImage,
    clearImage,
    generatedPrompt,
    perspectives,
    intelligence,
    error,
    isGenerating,
    isPreparingImage,
    generate,
  } = usePromptBuilder();
  const { plan, promptsToday, lastPromptDate } = useAuth();
  const workflowAccess = evaluateFeatureAccess('promptWorkflows', plan);
  const workflowActive = Boolean(workflow && workflowAccess.allowed);
  const imageMode = category === 'image';
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });
  const quotaExhausted = quota.remaining === 0;

  useEffect(() => {
    if (workflowActive && workflow.category) setCategory(workflow.category);
  }, [workflowActive, workflow?.category, setCategory]);

  const handleSubmit = (event) => {
    event.preventDefault();
    generate();
  };

  const handleFileChange = (event) => {
    const [file] = event.target.files || [];
    if (file) selectImage(file);
    event.target.value = '';
  };

  const useImageIdea = (text) => {
    setIdea((current) => current.trim() ? `${current.trim()}\n\n${text}` : text);
  };

  const stepLabels = { optimize: 'Optimize', perspectives: 'Perspectives', compare: 'Compare', variables: 'Variables', launch: 'Launch' };

  return (
    <section id="prompt-builder" className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/50 py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.14),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(167,139,250,0.12),transparent_42%)]" />
      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mb-5 flex justify-end">
          <Link to="/workflows" className="rounded-xl border border-indigo-200 bg-white/90 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50">⚡ Prompt Workflows</Link>
        </div>

        <SectionHeading
          eyebrow={workflowActive ? `Workflow · ${workflow.name}` : 'Try it now'}
          title="Build your prompt"
          subtitle="Describe your idea, or show PromptStudio a reference image. It will understand the intent and build a reference-aware prompt."
        />

        {workflowActive && (
          <div className="mt-8 rounded-3xl border border-indigo-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-indigo-900">⚡ {workflow.name} workflow active</p>
                <p className="mt-1 text-xs text-indigo-700">Follow the guided steps below. Your existing generation quota and AI services are unchanged.</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">PRO</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {workflow.steps.map((step, index) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800">{index + 1}. {stepLabels[step]}</span>
                  {index < workflow.steps.length - 1 && <span className="text-indigo-300">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <form className="mt-8 rounded-[2rem] border border-slate-200/80 bg-white/95 p-8 shadow-[0_24px_70px_-35px_rgba(37,99,235,0.35)] backdrop-blur sm:p-10" onSubmit={handleSubmit} aria-busy={isGenerating || isPreparingImage}>
          <TextArea
            id="idea"
            label="Your idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={imageMode ? 'Describe the image you want, or start with a visual idea below…' : 'What do you want AI to create? You can also attach a reference image below.'}
            rows={6}
            error={error}
            disabled={isGenerating || isPreparingImage}
          />

          {imageMode && (
            <div className="mt-5 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">🎨 Creative image starters</p>
                  <p className="mt-1 text-xs text-slate-500">Pick a direction and PromptStudio will add it to your idea.</p>
                </div>
                <span className="hidden rounded-full bg-white px-3 py-1 text-[11px] font-bold text-violet-700 shadow-sm sm:inline">IMAGE MODE</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {IMAGE_IDEAS.map((item) => (
                  <button key={item.label} type="button" onClick={() => useImageIdea(item.text)} disabled={isGenerating || isPreparingImage} className="rounded-full border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{item.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Reference image <span className="font-normal text-slate-500">(optional)</span></p>
                <p className="mt-1 text-xs text-slate-500">Upload a photo, screenshot, design, or other visual reference. Max 3 MB.</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <Button type="button" variant="secondary" size="sm" disabled={isGenerating || isPreparingImage} onClick={() => fileInputRef.current?.click()}>
                {isPreparingImage ? 'Preparing image…' : image ? 'Change image' : 'Upload image'}
              </Button>
            </div>

            {image && (
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <img src={`data:${image.mimeType};base64,${image.data}`} alt="Reference preview" className="h-20 w-20 rounded-lg object-cover ring-2 ring-white" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{image.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Ready for visual analysis</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={clearImage} disabled={isGenerating}>Remove</Button>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
            <p className="text-sm font-semibold text-blue-700">💡 PromptStudio Intelligence</p>
            <p className="mt-2 text-sm text-slate-700">With an image, PromptStudio analyzes the visible details that matter to your goal and keeps facts separate from assumptions instead of blindly inventing details.</p>
          </div>

          <div className={`mt-6 grid gap-6 ${workflowActive ? '' : 'sm:grid-cols-2'}`}>
            <Select id="aiModel" label="AI Model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} options={AI_MODELS} disabled={isGenerating || isPreparingImage} />
            {!workflowActive && (
              <Select id="category" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} disabled={isGenerating || isPreparingImage} />
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="primary" size="lg" type="submit" disabled={isGenerating || isPreparingImage || quotaExhausted} className="w-full sm:w-auto">
              {isGenerating ? 'Analyzing & building…' : workflow ? `Run ${workflow.name}` : imageMode ? 'Create Image Prompt' : 'Generate Better Prompt'}
            </Button>
            <p className={`text-sm font-semibold ${quotaExhausted ? 'text-red-600' : 'text-slate-600'}`} aria-live="polite">
              {quota.remaining === null ? 'Unlimited prompts available' : `${quota.remaining} / ${quota.dailyLimit} prompts remaining today`}
            </p>
          </div>
        </form>

        {generatedPrompt && (
          <div className="mt-10">
            <ResultCard prompt={generatedPrompt} perspectives={perspectives} intelligence={intelligence} userPlan={plan} workflow={workflow} category={category} />
          </div>
        )}
      </div>
    </section>
  );
}

export default PromptBuilder;
