import React, { useMemo, useState } from 'react';

const LABELS = {
  bestFit: 'Best Fit',
  creative: 'Creative',
  minimalist: 'Minimalist',
};

export default function PromptComparison({ perspectives = [], onCopy, onLaunch }) {
  const [selected, setSelected] = useState(0);

  const items = useMemo(() => perspectives.filter((item) => item?.optimizedPrompt || item?.prompt).slice(0, 3), [perspectives]);
  if (!items.length) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Prompt comparison">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Compare approaches</h3>
        <p className="text-sm text-slate-500">Choose the version that best fits your goal.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item, index) => {
          const title = item.title || item.name || LABELS[Object.keys(LABELS)[index]] || `Approach ${index + 1}`;
          const text = item.optimizedPrompt || item.prompt || '';
          const active = index === selected;
          return (
            <button key={`${title}-${index}`} type="button" onClick={() => setSelected(index)} className={`rounded-xl border p-4 text-left transition ${active ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{title}</span>
                {index === 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Best fit</span>}
              </div>
              <p className="line-clamp-5 whitespace-pre-wrap text-sm text-slate-600">{text}</p>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl bg-slate-50 p-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Selected approach</div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{items[selected]?.optimizedPrompt || items[selected]?.prompt}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {onCopy && <button type="button" onClick={() => onCopy(items[selected])} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Copy Prompt</button>}
          {onLaunch && <button type="button" onClick={() => onLaunch(items[selected])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Launch with AI</button>}
        </div>
      </div>
    </section>
  );
}
