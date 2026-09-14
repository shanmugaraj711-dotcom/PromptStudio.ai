import { useState } from "react";
import { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview } from "@codesandbox/sandpack-react";

const CANONICAL_INDEX = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`;

const normalizeStudioFiles = (files) => {
  if (!files || typeof files !== "object") return null;
  const pick = (...paths) => paths.map((path) => files[path]).find((value) => typeof value === "string" && value.trim());
  const app = pick("/App.js", "/App.jsx", "/src/App.js", "/src/App.jsx");
  const styles = pick("/styles.css", "/src/styles.css", "/App.css", "/src/App.css") || "";
  if (!app) return files;
  return { "/App.js": app, "/index.js": CANONICAL_INDEX, "/styles.css": styles };
};

export default function StudioPreview({ files, changed = [], status = "ready" }) {
  const [showSource, setShowSource] = useState(false);
  const normalizedFiles = normalizeStudioFiles(files);
  if (!normalizedFiles) return <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-500">Generate an app to see the live preview.</div>;
  const totalBefore = changed.reduce((sum, item) => sum + Number(item.beforeChars || 0), 0);
  const totalChanged = changed.reduce((sum, item) => sum + Number(item.changedChars || 0), 0);
  const ratio = totalBefore ? Math.min(100, Math.round((totalChanged / totalBefore) * 100)) : 0;
  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><p className="text-sm font-black text-slate-900">Live Preview</p><p className="text-xs text-slate-500">Interactive preview is shown first. Payment is separate.</p></div><div className="flex items-center gap-2">{status === "building" && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Building…</span>}{status === "editing" && <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">Applying targeted edit…</span>}{status === "ready" && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">● Live</span>}<button type="button" onClick={() => setShowSource((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50" aria-expanded={showSource}>{showSource ? "Hide source" : "View source"}</button></div></div>
    {changed.length > 0 && <div className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs"><strong className="text-indigo-900">Targeted edit:</strong> <span className="text-indigo-800">{changed.map((item) => item.path).join(", ")}</span><span className="ml-2 text-indigo-600">~{ratio}% of affected file characters changed</span></div>}
    <SandpackProvider template="react" files={normalizedFiles} options={{ activeFile: "/App.js", visibleFiles: Object.keys(normalizedFiles), autorun: true, recompileMode: "delayed" }} customSetup={{ entry: "/index.js", dependencies: { "lucide-react": "^0.468.0" } }}>
      <SandpackLayout className="!block">
        {showSource && <div className="border-b border-slate-200"><SandpackCodeEditor showTabs showLineNumbers wrapContent style={{ height: 360 }} /></div>}
        <SandpackPreview showNavigator style={{ height: 620, width: "100%" }} />
      </SandpackLayout>
    </SandpackProvider>
  </div>;
}
