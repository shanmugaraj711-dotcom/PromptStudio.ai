import { useState } from 'react';
import { Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading';

const EXAMPLES = [
  {
    category: 'Image → Prompt',
    title: 'Cinematic product hero',
    reference: 'Studio product photo · reflective surface · dramatic rim light',
    prompt: 'Create a premium cinematic product hero image using the reference as composition guidance. Preserve the product proportions, use controlled studio lighting, a subtle reflective surface, crisp edge highlights, shallow depth of field, and a clean luxury advertising finish.',
    accent: 'blue',
  },
  {
    category: 'Image → Prompt',
    title: 'Editorial portrait',
    reference: 'Portrait reference · soft window light · natural skin texture',
    prompt: 'Create a high-end editorial portrait inspired by the reference composition. Keep natural skin texture, soft directional window light, restrained styling, realistic facial detail, subtle background separation, and an authentic magazine-photography finish.',
    accent: 'violet',
  },
  {
    category: 'Reference → Code',
    title: 'Improve dashboard UX',
    reference: 'Existing dashboard screenshot · confusing hierarchy · improve navigation and responsive behavior',
    prompt: 'Analyze the dashboard reference as an existing product. Preserve its core business purpose and important information while improving navigation hierarchy, task flow, spacing, responsive behavior, accessibility, loading and empty states, and component consistency. Produce a production-ready implementation plan and coding prompt without inventing unsupported business logic.',
    accent: 'indigo',
  },
  {
    category: 'Reference → Code',
    title: 'Recreate an app screen',
    reference: 'Mobile app screenshot · recreate the interface as a responsive web experience',
    prompt: 'Recreate the referenced application screen as a responsive web interface. Match the visible layout, hierarchy, spacing, typography, controls, visual states, and interaction intent. Use reusable components, accessible semantics, responsive breakpoints, and realistic loading, error, and empty states. Clearly separate observed details from assumptions.',
    accent: 'sky',
  },
  {
    category: 'Reference → Code',
    title: 'Modernize an existing app',
    reference: 'Existing application references · modern UI · preserve current functionality',
    prompt: 'Modernize the existing application shown in the supplied references while preserving its current functionality and user intent. Identify UX friction, improve visual hierarchy and consistency, define reusable components and responsive behavior, and provide a safe implementation sequence with regression considerations. Do not remove existing business-critical behavior unless explicitly requested.',
    accent: 'emerald',
  },
  {
    category: 'Coding',
    title: 'Production API task',
    reference: 'Rough request · add authenticated rate limiting',
    prompt: 'Act as a senior backend engineer. Design an authenticated API rate-limiting implementation with clear limits, atomic enforcement, safe failure behavior, observability, tests for boundary conditions, and a migration path that does not break existing clients.',
    accent: 'indigo',
  },
  {
    category: 'Writing',
    title: 'Professional email',
    reference: 'Rough idea · ask for a project deadline extension',
    prompt: 'Act as a professional workplace communication expert. Write a concise, respectful email requesting a realistic project deadline extension, explain the reason without over-sharing, propose a specific new date, and keep the tone accountable and collaborative.',
    accent: 'sky',
  },
  {
    category: 'Marketing',
    title: 'Product launch post',
    reference: 'New AI productivity product · early-access launch',
    prompt: 'Create a launch post for an AI productivity product entering early access. Lead with the user outcome, explain the differentiator in plain language, add one concrete use case, create a confident but non-hype CTA, and provide three short headline variations.',
    accent: 'emerald',
  },
  {
    category: 'Business',
    title: 'Decision brief',
    reference: 'Compare two vendors for a small SaaS launch',
    prompt: 'Act as a pragmatic SaaS operations advisor. Compare the two vendors across total cost, reliability, implementation effort, lock-in, support, and scalability. State assumptions, identify the highest-risk unknowns, and finish with a clear recommendation and next action.',
    accent: 'amber',
  },
];

const accentClasses = {
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  violet: 'border-violet-100 bg-violet-50 text-violet-700',
  sky: 'border-sky-100 bg-sky-50 text-sky-700',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
};

function ExampleCard({ example }) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(example.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const isReferenceCoding = example.category === 'Reference → Code';

  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${accentClasses[example.accent]}`}>
          {example.category}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Example</span>
      </div>
      <h3 className="mt-5 text-xl font-extrabold tracking-tight text-slate-950">{example.title}</h3>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Starting point</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{example.reference}</p>
      </div>
      <div className="mt-4 flex-1 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Production-ready prompt</p>
          <span className="text-blue-300">→</span>
        </div>
        <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-slate-700">{example.prompt}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={copyPrompt} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
        <Link to={isReferenceCoding ? '/reference-coding' : '/builder'} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500">
          {isReferenceCoding ? 'Try Reference Coding →' : 'Try in Builder →'}
        </Link>
      </div>
    </article>
  );
}

function ExampleGallery() {
  return (
    <section className="bg-slate-50/70 py-20 lg:py-28" id="examples">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Real examples"
          title="See what PromptStudio turns into a usable prompt"
          subtitle="Start with a visual reference or rough brief. PromptStudio turns what you show us and what you want into an instruction your AI can actually use."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {EXAMPLES.map((example) => <ExampleCard key={example.title} example={example} />)}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-6 text-center shadow-sm sm:flex-row sm:text-left">
          <div>
            <p className="text-sm font-black text-slate-950">Have a reference? Show us what you have.</p>
            <p className="mt-1 text-sm text-slate-600">Use Image → Prompt for visual creation or Reference → Code for existing UIs, apps, screenshots, and UX improvements.</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2 sm:justify-end">
            <Link to="/image-to-prompt" className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50">🖼️ Image → Prompt</Link>
            <Link to="/reference-coding" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500">💻 Reference → Code</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ExampleGallery;
