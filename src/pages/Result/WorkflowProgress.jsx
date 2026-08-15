const STEP_LABELS = {
  optimize: 'Optimize',
  perspectives: 'Perspectives',
  compare: 'Compare',
  variables: 'Variables',
  launch: 'Launch',
};

export default function WorkflowProgress({ workflow, perspectives = [], selectedId = 'main' }) {
  if (!workflow) return null;

  const complete = (step) => {
    if (step === 'optimize') return true;
    if (step === 'perspectives') return perspectives.length > 0;
    if (step === 'compare') return selectedId !== 'main';
    return false;
  };

  return (
    <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-900">⚡ {workflow.name} workflow</p>
          <p className="mt-1 text-xs text-indigo-700">Use the existing PromptStudio features in this guided sequence.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700">PRO</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {workflow.steps.map((step, index) => (
          <span key={step} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${complete(step) ? 'border-green-200 bg-green-50 text-green-700' : 'border-indigo-200 bg-white text-indigo-700'}`}>
            {complete(step) ? '✓' : index + 1} {STEP_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}
