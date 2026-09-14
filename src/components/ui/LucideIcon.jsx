const PATHS = {
  sparkles: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z", "M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"],
  image: ["M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z", "m7 16 3.5-4 2.5 3 2-2 2.5 3", "M8.5 8.5h.01"],
  code: ["m8 9-3 3 3 3", "m16 9 3 3-3 3", "m14 6-4 12"],
  smartphone: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z", "M11 18h2"],
  clock: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  plus: ["M12 5v14", "M5 12h14"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  wallet: ["M4 7h16v12H4z", "M4 7l2-3h11l2 3", "M16 13h4"],
  layout: ["M4 4h16v16H4z", "M4 10h16", "M10 10v10"],
};

export default function LucideIcon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  const paths = PATHS[name] || PATHS.sparkles;
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>{paths.map((path, index) => <path key={`${name}-${index}`} d={path} />)}</svg>;
}
