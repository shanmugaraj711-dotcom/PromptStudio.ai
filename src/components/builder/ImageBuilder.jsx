import React from 'react';
import TextArea from '../ui/TextArea';
import AIDiscoveryPanel from './AIDiscoveryPanel';

const IMAGE_IDEAS = [
  { label: 'Cinematic portrait', text: 'Create a cinematic portrait with dramatic but natural lighting and shallow depth of field.' },
  { label: 'Product hero', text: 'Create a premium commercial product hero image with clean composition and polished studio lighting.' },
  { label: '3D character', text: 'Create a polished 3D character render with expressive details, soft studio lighting, and a clean environment.' },
  { label: 'Editorial', text: 'Create a high-end editorial photograph with intentional composition, sophisticated styling, and natural texture.' },
  { label: 'Fantasy scene', text: 'Create an imaginative cinematic fantasy scene with atmospheric depth, rich environmental detail, and controlled lighting.' },
  { label: 'Kids illustration', text: 'Create a cheerful child-friendly illustration with expressive characters, clean shapes, and playful visual storytelling.' },
];

export default function ImageBuilder({
  aiModel,
  handleToolSelect,
  handleExample,
  idea,
  setIdea,
  error,
  isGenerating,
  isPreparingImage
}) {
  const useImageIdea = (text) => setIdea((current) => current.trim() ? `${current.trim()}\n\n${text}` : text);

  return (
    <>
      <AIDiscoveryPanel
        category="image"
        aiModel={aiModel}
        onToolSelect={handleToolSelect}
        onExample={handleExample}
      />

      <div className="mt-5">
        <TextArea
          id="idea"
          label="Your idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Describe the image you want, or upload a reference image below…"
          rows={6}
          error={error}
          disabled={isGenerating || isPreparingImage}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-violet-400/30 bg-gradient-to-r from-violet-400/10 via-white to-sky-400/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white">🎨 Creative image starters</p>
            <p className="mt-1 text-xs text-slate-400">Pick a direction and PromptStudio will add it to your idea.</p>
          </div>
          <span className="hidden rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-violet-200 shadow-sm sm:inline">IMAGE MODE</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {IMAGE_IDEAS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => useImageIdea(item.text)}
              disabled={isGenerating || isPreparingImage}
              className="rounded-full border border-violet-400/30 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400/30 hover:text-violet-200 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
