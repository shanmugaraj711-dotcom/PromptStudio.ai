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
    isQuestion,
    inferredAiModel,
    inferredCategory,
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
          subtitle="Describe your idea and let PromptStudio do the rest."
        />

        <form
          className="mt-14 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm sm:p-10 relative"
          onSubmit={handleSubmit}
          aria-busy={isGenerating}
        >
          {isGenerating && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-3xl">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 font-semibold text-gray-700">AI is analyzing your idea...</p>
                <p className="text-sm text-gray-500">Crafting the perfect prompt for you.</p>
              </div>
            </div>
          )}

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

          {!generatedPrompt && (
            <div className="mt-6 rounded-xl bg-blue-50 p-4 border border-blue-100">
              <p className="text-sm font-semibold text-blue-700">💡 Prompt Tip</p>
              <p className="mt-2 text-sm text-gray-700">
                Mention your audience, preferred tone and expected output for even better AI
                results.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="primary"
              size="lg"
              type="submit"
              disabled={isGenerating || quotaExhausted || !idea.trim()}
              className="w-full sm:w-auto"
            >
              {isGenerating ? 'Generating...' : generatedPrompt ? 'Update & Improve' : 'Generate Better Prompt'}
            </Button>
            <p
              className={`text-sm font-semibold ${
                quotaExhausted ? 'text-red-600' : 'text-gray-600'
              }`}
              aria-live="polite"
            >
              {quota.remaining === null
                ? 'Unlimited prompts available'
                : `${quota.remaining} / ${quota.dailyLimit} prompts remaining today`}
            </p>
          </div>
        </form>

        {generatedPrompt && !isQuestion && (
          <div className="mt-10">
            <ResultCard
              prompt={generatedPrompt}
              originalIdea={idea}
              aiModel={inferredAiModel || aiModel}
              category={inferredCategory || category}
              onImprove={() => generate()}
            />
          </div>
        )}

        {isQuestion && generatedPrompt && (
          <div className="mt-10 p-6 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="font-semibold text-blue-900 mb-2">Can you clarify?</p>
            <p className="text-gray-800">{generatedPrompt}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default PromptBuilder;
