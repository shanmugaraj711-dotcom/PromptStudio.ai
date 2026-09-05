import { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview } from "@codesandbox/sandpack-react";

export default function StudioPreview({ files, changed = [], status = "ready" }) {
  if (!files) return <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-500">Generate an app to see the live preview.</div>;

  const totalBefore = changed.reduce((sum, item) => sum + Number(item.beforeChars || 0), 0);
  const totalChanged = changed.reduce((sum, item) => sum + Number(item.changedChars || 0), 0);
  const ratio = totalBefore ? Math.min(100, Math.round((totalChanged / totalBefore) * 100)) : 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div><p className="text-sm font-black text-slate-900">Live Preview</p><p className="text-xs text-slate-500">Interactive React app · Sandpack runtime</p></div>
        <div className="flex items-center gap-2">
          {status === "building" && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Building…</span>}
          {status === "editing" && <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">Applying targeted edit…</span>}
          {status === "ready" && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">● Live</span>}
        </div>
      </div>
      {changed.length > 0 && <div className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs"><strong className="text-indigo-900">Targeted edit:</strong> <span className="text-indigo-800">{changed.map((item) => item.path).join(", ")}</span><span className="ml-2 text-indigo-600">~{ratio}% of affected file characters changed</span></div>}
      <SandpackProvider
        template="react"
        files={files}
        options={{ activeFile: "/App.js", visibleFiles: Object.keys(files) }}
        customSetup={{
          entry: "/index.js",
          dependencies: { "lucide-react": "^0.468.0" },
        }}
      >
        <SandpackLayout>
          <SandpackCodeEditor showTabs showLineNumbers wrapContent style={{ height: 560 }} />
          <SandpackPreview showNavigator style={{ height: 560 }} />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
