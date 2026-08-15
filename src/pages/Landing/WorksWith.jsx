import SectionHeading from '../../components/common/SectionHeading';
import { AI_MODELS } from '../../constants/aiModels';

const modelMeta = {
  chatgpt: { description: 'General reasoning & writing', badge: 'GPT' },
  claude: { description: 'Writing & thoughtful analysis', badge: 'C' },
  gemini: { description: 'Multimodal & image-aware work', badge: 'G' },
  grok: { description: 'Fast, current & conversational', badge: 'X' },
};

function WorksWith() {
  return (
    <section id="models" className="py-20 lg:py-28 bg-gradient-to-b from-white to-slate-50/70">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Compatibility"
          title="Choose the AI you already use"
          subtitle="Pick a model to open PromptStudio's builder with that AI selected."
        />

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AI_MODELS.map((model) => {
            const meta = modelMeta[model.id] || { description: 'AI model', badge: model.label.charAt(0) };
            return (
              <a
                key={model.id}
                href={`/?model=${model.id}#prompt-builder`}
                className="group flex min-h-[190px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label={`Use ${model.label} with PromptStudio`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-extrabold text-white shadow-md">
                    {meta.badge}
                  </div>
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition group-hover:bg-blue-50 group-hover:text-blue-700">
                    Select
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-bold text-slate-900">{model.label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{meta.description}</p>
                <span className="mt-auto pt-5 text-sm font-bold text-blue-700">Build for {model.label} →</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default WorksWith;
