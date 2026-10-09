const EXAMPLES = [
  { category: "Games", title: "2D Snake", prompt: "Create a 2D Snake game with score, high score, restart, pause, swipe and Arrow/WASD controls, plus selectable themes." },
  { category: "Games", title: "Tic-Tac-Toe", prompt: "Create a 2D Tic-Tac-Toe game for two players with win detection, draw state and restart." },
  { category: "Mini apps", title: "Expense tracker", prompt: "Create an expense tracker with add expense, category, amount, date, totals and a simple monthly summary." },
  { category: "Mini apps", title: "To-do app", prompt: "Create a to-do app with add, edit, complete, delete and active/completed filters." },
  { category: "Business", title: "Sales dashboard", prompt: "Create a sales dashboard with revenue, orders, top products, recent activity and simple date filtering." },
  { category: "Business", title: "Inventory tracker", prompt: "Create an inventory tracker with products, stock counts, low-stock indicators and add/edit stock actions." },
  { category: "Business", title: "Product catalog", prompt: "Create a product catalog with categories, search, product details and a simple enquiry action." },
  { category: "Website", title: "Website → Android", prompt: "Turn my existing website into a modern Android app while preserving its important customer flows." },
];

const CAPABILITIES = [
  { tone: "green", label: "Great fit", text: "Simple games, calculators, trackers, dashboards, forms, lists, catalogs, simple business apps, portfolio apps and website-to-Android packaging." },
  { tone: "amber", label: "May need review", text: "Login systems, databases, API integrations, advanced dashboards, notifications, complex workflows or several external services." },
  { tone: "red", label: "Not supported yet", text: "Full-scale multiplayer games, heavy 3D games, advanced editors, banking-grade systems, large enterprise workloads and complicated native hardware or background-service requirements." },
];

const toneClasses = {
  green: "border-emerald-300/15 bg-emerald-300/5 text-emerald-300",
  amber: "border-amber-300/15 bg-amber-300/5 text-amber-300",
  red: "border-red-300/15 bg-red-300/5 text-red-300",
};

export default function ForgeCapabilityGuide({ onUseExample }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4" aria-label="What can I build">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">What can I build?</p>
        <h2 className="text-base font-black text-white">Try something we know Forge is good at.</h2>
        <p className="text-[11px] leading-5 text-slate-500">These are starting points, not hard templates. Your request is analyzed before payment. If an idea is outside the current build capability, we will tell you before you pay.</p>
      </div>

      <div className="mt-3 grid gap-2">
        {CAPABILITIES.map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${toneClasses[item.tone]}`}>
            <p className="text-xs font-black uppercase tracking-wider">{item.label}</p>
            <p className="mt-1 text-xs leading-4 text-slate-400">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Try an example</p>
          <p className="text-xs text-slate-600">Tap one to use it as your brief</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <button
              key={`${example.category}-${example.title}`}
              type="button"
              onClick={() => onUseExample?.(example.prompt)}
              className="rounded-xl border border-white/8 bg-black/15 p-3 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/5 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
              aria-label={`Try ${example.title}`}
            >
              <span className="text-xs font-black uppercase tracking-wider text-cyan-300">{example.category}</span>
              <span className="mt-1 block text-xs font-bold text-white">{example.title}</span>
              <span className="mt-1 block text-xs leading-4 text-slate-500">Use this example →</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
