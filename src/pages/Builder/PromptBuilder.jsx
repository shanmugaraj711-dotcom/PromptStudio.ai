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

function PromptBuilder() {
  const {
    idea,
    setIdea,
    aiModel,
    setAiModel,
    category,
    setCategory,
    generatedPrompt,
    perspectives,
    intelligence,
    error,
    isGenerating,
    generate,
  } = usePromptBuilder();
  const { plan, promptsToday, lastPromptDate } = useAuth();
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate });
  const quotaExhausted = quota.remaining === 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    generate();
  };

  return (
    <section id="prompt-builder" className="bg-gray-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Try it now"
          title="Build your prompt"
          subtitle="Describe your idea and let PromptStudio understand the goal, improve it, and give you multiple strong approaches."
        />

        <form className="mt-14 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm sm:p-10" onSubmit={handleSubmit} aria-busy={isGenerating}>
          <TextArea
            id="idea"
            label="Your idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="What do you want AI to create?"
            rows={6}
            error={error}
            disabled={isGenerating}
          />

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-700">💡 PromptStudio Intelligence</p>
            <p className="mt-2 text-sm text-gray-700">
              Give us the rough idea. We’ll identify the goal, avoid inventing missing facts, and choose useful prompt approaches for you.
            </p>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Select id="aiModel" label="AI Model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} options={AI_MODELS} disabled={isGenerating} />
            <Select id="category" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} disabled={isGenerating} />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="primary" size="lg" type="submit" disabled={isGenerating || quotaExhausted} className="w-full sm:w-auto">
              {isGenerating ? 'Understanding & building…' : 'Generate Better Prompt'}
            </Button>
            <p className={`text-sm font-semibold ${quotaExhausted ? 'text-red-600' : 'text-gray-600'}`} aria-live="polite">
              {quota.remaining === null ? 'Unlimited prompts available' : `${quota.remaining} / ${quota.dailyLimit} prompts remaining today`}
            </p>
          </div>
        </form>

        {generatedPrompt && (
          <div className="mt-10">
            <ResultCard prompt={generatedPrompt} perspectives={perspectives} intelligence={intelligence} />
          </div>
        )}
      </div>
    </section>
  );
}

export default PromptBuilder;
