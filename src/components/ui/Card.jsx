function Card({ children, className = '', hoverEffect = true }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-sm ${
        hoverEffect ? 'hover:shadow-lg transition-shadow duration-200' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default Card;
