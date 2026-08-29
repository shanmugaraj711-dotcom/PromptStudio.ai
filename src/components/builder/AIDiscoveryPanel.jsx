import { Link } from 'react-router-dom';
import { getAICatalog } from '../../config/aiCatalog';

const CODING_EXAMPLES = [
  { title: 'Improve dashboard UX', description: 'Upload a dashboard screenshot and turn your UX goal into a coding-ready improvement prompt.' },
  { title: 'Recreate an existing UI', description: 'Show a web or app screen and generate a structured implementation prompt.' },
  { title: 'Modernize an old app', description: 'Combine screenshots, product context, and requirements into a focused modernization prompt.' },
];

function AIDiscoveryPanel({ category, aiModel, onToolSelect, onExample }) {
  const catalog = getAICatalog(category);
  const selectedTool = catalog.tools.find((tool) => tool.modelId === aiModel);

  return (
    <div className="builder-ai-panel mt-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/60 p-4 shadow-sm sm:p-5">
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-violet-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">🧠 Reference → Prompt</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Have a reference? Choose the workflow that matches what you want AI to create.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-600 px-3 py-1.5 text-[10px] font-black text-white">🖼️ Image → Prompt</span>
            <Link to="/reference-coding" className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[10px] font-black text-indigo-700 transition hover:bg-indigo-50">💻 Reference → Code Prompt →</Link>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {CODING_EXAMPLES.map((example) => (
            <Link key={example.title} to="/reference-coding" className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm">
              <p className="text-xs font-black text-indigo-700">{example.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{example.description}</p>
              <span className="mt-2 inline-flex text-[10px] font-bold text-slate-500">Try this →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">2. Choose your AI</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Recommended tools for {catalog.title}. Choosing an example never changes this selection.</p>
        </div>
        <span className="w-fit rounded-full border border-indigo-100 bg-white px-3 py-1 text-[11px] font-bold text-indigo-700 shadow-sm">
          {selectedTool ? `✓ ${selectedTool.name} selected` : 'Choose one'}
        </span>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
        {catalog.tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onToolSelect?.({ modelId: tool.modelId })}
            aria-pressed={aiModel === tool.modelId}
            className={`min-w-[205px] snap-start rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-0 ${aiModel === tool.modelId ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-900">{tool.name}</span>
              {tool.badge && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-black text-white">{tool.badge}</span>}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{tool.reason}</p>
            {aiModel === tool.modelId && <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-700">Selected AI · locked</p>}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-indigo-100 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">3. Start with an example <span className="font-normal text-slate-400">(optional)</span></p>
            <p className="mt-1 text-xs text-slate-500">Examples only fill your idea. Your {selectedTool?.name || 'selected AI'} stays selected.</p>
          </div>
          <span className="hidden rounded-full bg-white px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm sm:inline">CONTENT ONLY</span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
          {catalog.examples.map((example) => (
            <button
              key={example.title}
              type="button"
              onClick={() => onExample?.(example)}
              className="min-w-[215px] snap-start rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md md:min-w-0"
            >
              <p className="text-xs font-black text-indigo-700">{example.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{example.description}</p>
              <span className="mt-2 inline-flex rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700">Use example →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AIDiscoveryPanel;
