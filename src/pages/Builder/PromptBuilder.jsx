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

  const stepLabels = { optimize: 'Optimize', perspectives: 'Perspectives', compare: 'Compare', variables: 'Variables', launch: 'Launch' };

  return (
    <section id="prompt-builder" className="bg-gray-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mb-5 flex justify-end">
          <Link to="/workflows" className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">⚡ Prompt Workflows</Link>
        </div>

        <SectionHeading
          eyebrow={workflowActive ? `Workflow · ${workflow.name}` : 'Try it now'}
          title="Build your prompt"
          subtitle="Describe your idea, or show PromptStudio a reference image. It will understand the intent and build a reference-aware prompt."
        />

        {workflowActive && (
          <div className="mt-8 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-indigo-900">⚡ {workflow.name} workflow active</p>
                <p className="mt-1 text-xs text-indigo-700">Follow the guided steps below. Your existing generation quota and AI services are unchanged.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700">PRO</span>
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

        <form className="mt-8 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm sm:p-10" onSubmit={handleSubmit} aria-busy={isGenerating || isPreparingImage}>
          <TextArea
            id="idea"
            label="Your idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="What do you want AI to create? You can also attach a reference image below."
            rows={6}
            error={error}
            disabled={isGenerating || isPreparingImage}
          />

          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Reference image <span className="font-normal text-gray-500">(optional)</span></p>
                <p className="mt-1 text-xs text-gray-500">Upload a photo, screenshot, design, or other visual reference. Max 3 MB.</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <Button type="button" variant="secondary" size="sm" disabled={isGenerating || isPreparingImage} onClick={() => fileInputRef.current?.click()}>
                {isPreparingImage ? 'Preparing image…' : image ? 'Change image' : 'Upload image'}
              </Button>
            </div>

            {image && (
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-3">
                <img src={`data:${image.mimeType};base64,${image.data}`} alt="Reference preview" className="h-20 w-20 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{image.name}</p>
                  <p className="mt-1 text-xs text-gray-500">Ready for visual analysis</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={clearImage} disabled={isGenerating}>Remove</Button>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-700">💡 PromptStudio Intelligence</p>
            <p className="mt-2 text-sm text-gray-700">With an image, PromptStudio analyzes the visible details that matter to your goal and keeps facts separate from assumptions instead of blindly inventing details.</p>
          </div>

          <div className={`mt-6 grid gap-6 ${workflowActive ? '' : 'sm:grid-cols-2'}`}>
            <Select id="aiModel" label="AI Model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} options={AI_MODELS} disabled={isGenerating || isPreparingImage} />
            {!workflowActive && (
              <Select id="category" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} disabled={isGenerating || isPreparingImage} />
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="primary" size="lg" type="submit" disabled={isGenerating || isPreparingImage || quotaExhausted} className="w-full sm:w-auto">
              {isGenerating ? 'Analyzing & building…' : workflow ? `Run ${workflow.name}` : 'Generate Better Prompt'}
            </Button>
            <p className={`text-sm font-semibold ${quotaExhausted ? 'text-red-600' : 'text-gray-600'}`} aria-live="polite">
              {quota.remaining === null ? 'Unlimited prompts available' : `${quota.remaining} / ${quota.dailyLimit} prompts remaining today`}
            </p>
          </div>
        </form>

        {generatedPrompt && (
          <div className="mt-10">
            <ResultCard prompt={generatedPrompt} perspectives={perspectives} intelligence={intelligence} userPlan={plan} workflow={workflow} />
          </div>
        )}
      </div>
    </section>
  );
}

export default PromptBuilder;
