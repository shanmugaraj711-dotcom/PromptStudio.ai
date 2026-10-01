import { useMemo, useState } from 'react';
import { extractPlaceholders, fillPlaceholders, splitPlaceholders } from '../../utils/placeholders';

export function usePlaceholderFill(text) {
  const [values, setValues] = useState({});
  const placeholders = useMemo(() => extractPlaceholders(text), [text]);
  const filledText = useMemo(() => fillPlaceholders(text, values), [text, values]);
  const filledCount = placeholders.filter((label) => values[label]?.trim()).length;
  return {
    placeholders,
    values,
    filledText,
    filledCount,
    setValue: (label, value) => setValues((current) => ({ ...current, [label]: value })),
    clear: () => setValues({}),
  };
}

/** Prompt text with blanks in amber and filled-in values in green. */
export function PromptPreview({ text, values = {} }) {
  return <>{splitPlaceholders(text).map((segment, index) => {
    if (segment.type === 'text') return <span key={index}>{segment.value}</span>;
    const value = values[segment.label]?.trim();
    return value
      ? <mark key={index} className="rounded bg-emerald-300/15 px-1 text-emerald-200" title={segment.raw}>{value}</mark>
      : <mark key={index} className="rounded bg-amber-300/15 px-1 text-amber-200">{segment.raw}</mark>;
  })}</>;
}

const toFieldId = (prefix, label) => `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export function PlaceholderFields({ idPrefix, placeholders, values, onChange, onClear, filledCount }) {
  if (!placeholders.length) return null;
  return (
    <div className="rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-amber-100">Fill in the blanks <span className="font-normal text-amber-100/60">· {filledCount}/{placeholders.length} done</span></p>
        {filledCount > 0 && <button type="button" onClick={onClear} className="text-[11px] font-bold text-slate-500 hover:text-white">Clear</button>}
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {placeholders.map((label) => {
          const id = toFieldId(idPrefix, label);
          return (
            <label key={label} htmlFor={id} className="block">
              <span className="mb-1 block truncate text-[11px] font-semibold text-slate-400 first-letter:uppercase">{label}</span>
              <input id={id} value={values[label] || ''} onChange={(event) => onChange(label, event.target.value)} maxLength={300} placeholder={label} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-emerald-300/40" />
            </label>
          );
        })}
      </div>
    </div>
  );
}
