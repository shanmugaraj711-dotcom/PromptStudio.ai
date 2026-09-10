import { getAICatalog } from '../../config/aiCatalog';

const MODEL_MARKS = { chatgpt: '✦', claude: 'C', gemini: 'G', grok: '𝕏', midjourney: 'M' };

function AIDiscoveryPanel({ category, aiModel, onToolSelect, onExample }) {
  const catalog = getAICatalog(category);
  const selectedTool = catalog.tools.find((tool) => tool.modelId === aiModel);

  return <div className="builder-ai-panel mt-4 rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-[0_16px_45px_-35px_rgba(15,23,42,0.35)] backdrop-blur sm:p-3.5">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">AI model</p><p className="mt-0.5 truncate text-xs font-bold text-slate-700">{selectedTool ? `${selectedTool.name} · recommended for ${catalog.title}` : 'Choose the engine for this prompt'}</p></div>
      <span className="shrink-0 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[9px] font-black text-indigo-700">{selectedTool ? 'Selected' : 'Choose'}</span>
    </div>
    <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="listbox" aria-label="AI model">
      {catalog.tools.map((tool) => <button key={tool.id} type="button" onClick={() => onToolSelect?.({ modelId: tool.modelId })} aria-pressed={aiModel === tool.modelId} title={tool.reason} className={`group flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition duration-200 ${aiModel === tool.modelId ? 'border-indigo-300 bg-indigo-50 shadow-[0_6px_20px_-12px_rgba(79,70,229,0.6)]' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm'}`}>
        <span className={`grid h-6 w-6 place-items-center rounded-lg text-[10px] font-black ${aiModel === tool.modelId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{MODEL_MARKS[tool.modelId] || tool.name?.[0] || 'AI'}</span>
        <span className="text-[11px] font-black text-slate-800">{tool.name}</span>
        {tool.badge && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-black text-amber-700">{tool.badge}</span>}
        {aiModel === tool.modelId && <span className="text-[10px] font-black text-indigo-600">✓</span>}
      </button>)}
    </div>
    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Quick starts</span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {catalog.examples.map((example) => <button key={example.title} type="button" onClick={() => onExample?.(example)} className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">{example.title} →</button>)}
      </div>
    </div>
  </div>;
}

export default AIDiscoveryPanel;
