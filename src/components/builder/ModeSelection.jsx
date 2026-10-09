import React from 'react';

const MODES = [
  { id: 'standard', label: 'Write Prompt', icon: '✍️' },
  { id: 'image', label: 'Image → Prompt', icon: '🎨' },
  { id: 'coding', label: 'Reference Coding', icon: '💻' }
];

export default function ModeSelection({ activeMode, onModeChange, disabled }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-2 p-1 sm:gap-4">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          disabled={disabled}
          onClick={() => onModeChange(mode.id)}
          className={`
            group relative flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200
            ${activeMode === mode.id
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2'
              : 'border border-white/10 bg-slate-900 text-slate-300 shadow-sm hover:bg-slate-950 hover:text-indigo-600'}
            disabled:cursor-not-allowed disabled:opacity-50
          `}
        >
          <span className={`text-lg transition-transform group-hover:scale-110 ${activeMode === mode.id ? 'scale-110' : ''}`}>
            {mode.icon}
          </span>
          {mode.label}
          {activeMode === mode.id && (
            <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-900 opacity-40" />
          )}
        </button>
      ))}
    </div>
  );
}
