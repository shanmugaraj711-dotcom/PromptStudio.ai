// Build the frozen source, never regenerate it from the original job/spec.
export function deliveryFiles(revision) {
  if (!/^[a-f0-9]{64}$/.test(revision.revisionId)) throw new Error("Invalid frozen revision identity.");
  const source = {
    "App.js": revision.files["/App.js"],
    "styles.css": revision.files["/styles.css"],
    "entry.jsx": 'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./App.js"; import "./styles.css"; createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);',
    "package.json": JSON.stringify({ private: true, type: "module", scripts: { build: "node build.mjs" }, dependencies: { react: "18.3.1", "react-dom": "18.3.1", "lucide-react": "0.468.0", esbuild: "0.25.12" } }),
    "build.mjs": `import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("dist", {recursive:true});
await build({entryPoints:["entry.jsx"],bundle:true,outdir:"dist",entryNames:"app",loader:{".js":"jsx"},platform:"browser",format:"esm",minify:true,define:{"process.env.NODE_ENV":'"production"'}});
await writeFile("dist/index.html", ${JSON.stringify('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="studio-revision" content="' + revision.revisionId + '"><title>Studio website</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')});
await writeFile("dist/studio-revision.json", ${JSON.stringify(JSON.stringify({ revisionId: revision.revisionId }))});
`,
    "vercel.json": JSON.stringify({ version: 2, buildCommand: "npm run build", installCommand: "npm install --ignore-scripts --no-audit --no-fund", outputDirectory: "dist", framework: null }),
  };
  return Object.entries(source).map(([file, data]) => ({ file, data, encoding: "utf-8" }));
}
