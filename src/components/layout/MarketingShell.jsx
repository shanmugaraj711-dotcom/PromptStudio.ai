import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_LINKS = [
  { href: '/#doctor', label: 'Prompt Doctor' },
  { to: '/prompts', label: 'Prompt Library' },
  { href: '/#products', label: 'Products' },
  { href: '/#pricing', label: 'Pricing' },
];

function NavItem({ item, onNavigate }) {
  const className = 'rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/[.04] hover:text-white';
  if (item.to) return <NavLink to={item.to} onClick={onNavigate} className={({ isActive }) => `${className} ${isActive ? 'text-white' : ''}`}>{item.label}</NavLink>;
  return <Link to={item.href} onClick={onNavigate} className={className}>{item.label}</Link>;
}

export function MarketingHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-2xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8" aria-label="Main">
        <Link to="/" className="flex items-center gap-2.5" aria-label="PromptStudio home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400 text-lg font-black text-slate-950">✦</span>
          <span className="text-base font-black tracking-tight text-white sm:text-lg">PromptStudio<span className="text-brand-400">.ai</span></span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">{NAV_LINKS.map((item) => <NavItem key={item.label} item={item} />)}</div>
        <div className="flex items-center gap-2">
          {user
            ? <Link to="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/[.06]">Dashboard</Link>
            : <><Link to="/login" className="hidden px-3 py-2 text-xs font-bold text-slate-300 hover:text-white sm:block">Sign in</Link><Link to="/signup" className="rounded-xl bg-brand-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-brand-300">Start free</Link></>}
          <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 md:hidden" aria-expanded={open} aria-label="Toggle menu">{open ? '✕' : '☰'}</button>
        </div>
      </nav>
      {open && <div className="border-t border-white/10 px-4 py-3 md:hidden"><div className="flex flex-col">{NAV_LINKS.map((item) => <NavItem key={item.label} item={item} onNavigate={() => setOpen(false)} />)}</div></div>}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-5 py-10 sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="font-black text-white">PromptStudio<span className="text-brand-400">.ai</span></Link>
          <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">Score, fix and reuse prompts for ChatGPT, Claude, Gemini, Grok, Midjourney and video models. Made in India for the world.</p>
        </div>
        <div className="flex flex-col gap-2 text-xs text-slate-500"><span className="font-black uppercase tracking-widest text-slate-400">Free tools</span><Link to="/#doctor" className="hover:text-white">Prompt Doctor</Link><Link to="/prompts" className="hover:text-white">Prompt Library</Link><Link to="/builder?mode=image" className="hover:text-white">Image → Prompt</Link></div>
        <div className="flex flex-col gap-2 text-xs text-slate-500"><span className="font-black uppercase tracking-widest text-slate-400">Product</span><Link to="/reference-coding" className="hover:text-white">Reference Coding</Link><Link to="/studio" className="hover:text-white">Studio</Link><Link to="/apk-forge" className="hover:text-white">App Forge</Link><Link to="/#pricing" className="hover:text-white">Pricing</Link></div>
        <div className="flex flex-col gap-2 text-xs text-slate-500"><span className="font-black uppercase tracking-widest text-slate-400">Company</span><Link to="/about" className="hover:text-white">About</Link><Link to="/help" className="hover:text-white">Help</Link><Link to="/contact" className="hover:text-white">Contact</Link><Link to="/privacy" className="hover:text-white">Privacy</Link><Link to="/terms" className="hover:text-white">Terms</Link><Link to="/refund" className="hover:text-white">Refunds</Link></div>
      </div>
      <div className="mx-auto mt-8 flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-6 text-xs text-slate-500">
        <span className="font-black uppercase tracking-widest text-slate-400">Listed on</span>
        <a href="https://www.toolpilot.ai" target="_blank" rel="noopener noreferrer" className="hover:text-white">ToolPilot</a>
        <a href="https://showmebest.ai" target="_blank" rel="noopener noreferrer" className="hover:text-white">ShowMeBestAI</a>
        <a href="https://twelve.tools" target="_blank" rel="noopener noreferrer" className="hover:text-white">Twelve Tools</a>
      </div>
    </footer>
  );
}
