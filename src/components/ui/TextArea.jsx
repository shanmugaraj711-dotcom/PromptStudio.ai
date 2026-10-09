function TextArea({
  label,
  value,
  onChange,
  placeholder,
  id,
  rows = 6,
  readOnly = false,
  disabled = false,
  error,
  className = '',
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-slate-200">
          {label}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        readOnly={readOnly}
        disabled={disabled}
        className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-white shadow-sm transition-colors focus:ring-2 ${
          error
            ? 'border-red-400/30 focus:border-red-400 focus:ring-red-100'
            : 'border-white/10 focus:border-blue-500 focus:ring-blue-100'
        } ${readOnly ? 'bg-slate-950' : 'bg-slate-900'} disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export default TextArea;
