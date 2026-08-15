import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_WORKFLOWS } from '../../config/workflows';
import { evaluateFeatureAccess } from '../../config/features';
import { useAuth } from '../../context/AuthContext';

const STEP_LABELS = {
  optimize: 'Optimize',
  perspectives: 'Perspectives',
  compare: 'Compare',
  variables: 'Variables',
  launch: 'Launch',
};

export default function WorkflowLibrary() {
  const { plan } = useAuth();
  const access = evaluateFeatureAccess('promptWorkflows', plan);
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">PromptStudio Pro</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">AI Prompt Workflows</h1>
            <p className="mt-2 max-w-2xl text-gray-600">Turn one idea into a repeatable path: optimize → compare → reuse → launch.</p>
          </div>
          <Link to="/dashboard" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">← Dashboard</Link>
        </div>

        {!access.allowed && (
          <div className="mt-8 rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-indigo-900">🔒 Workflows are a Pro feature</p>
                <p className="mt-1 text-sm text-indigo-700">Pro unlocks guided multi-step prompt creation without changing your normal generation quota.</p>
              </div>
              <Link to="/account" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">View Pro</Link>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {DEFAULT_WORKFLOWS.map((workflow) => (
            <article key={workflow.id} className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">PRO WORKFLOW</span>
                  <h2 className="mt-4 text-xl font-bold text-gray-900">{workflow.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{workflow.description}</p>
                </div>
                <span className="text-2xl">⚡</span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                {workflow.steps.map((step, index) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">{STEP_LABELS[step]}</span>
                    {index < workflow.steps.length - 1 && <span className="text-gray-300">→</span>}
                  </span>
                ))}
              </div>

              <div className="mt-7 rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">How it works</p>
                <p className="mt-2 text-sm text-gray-700">Start with your normal idea. PromptStudio keeps the selected workflow visible while you use the existing Intelligence, Perspectives, Variables and AI Launch features.</p>
              </div>

              <button
                type="button"
                disabled={!access.allowed}
                onClick={() => navigate(`/builder?workflow=${workflow.id}`)}
                className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold ${access.allowed ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'cursor-not-allowed bg-gray-100 text-gray-400'}`}
              >
                {access.allowed ? `Start ${workflow.name}` : '🔒 Pro Required'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
