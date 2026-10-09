function SectionHeading({ eyebrow, title, subtitle, align = 'center' }) {
  const alignment = align === 'center' ? 'mx-auto text-center' : 'text-left';

  return (
    <div className={`max-w-2xl ${alignment}`}>
      {eyebrow && (
        <span className="inline-block rounded-full bg-blue-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base leading-relaxed text-slate-300">{subtitle}</p>
      )}
    </div>
  );
}

export default SectionHeading;
