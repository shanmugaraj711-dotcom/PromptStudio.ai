import { Link, NavLink } from "react-router-dom";

const links = [
  { to: "/about", label: "About" },
  { to: "/help", label: "Help" },
  { to: "/contact", label: "Contact" },
  { to: "/feedback", label: "Feedback" },
];

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-900" aria-label="PromptStudio AI home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-base shadow-lg shadow-indigo-600/20">⌂</span>
          <span className="font-black tracking-tight">PromptStudio <span className="text-indigo-400">AI</span></span>
        </a>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto" aria-label="Public navigation">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>
              {link.label}
            </NavLink>
          ))}
          <Link to="/login" className="ml-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
