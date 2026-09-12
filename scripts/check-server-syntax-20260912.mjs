import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const roots = ["server/api", "server/studio"];
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); const stat = statSync(path); if (stat.isDirectory()) walk(path); else if (path.endsWith(".js")) files.push(path); } };
roots.forEach(walk);
for (const file of files) { try { execFileSync(process.execPath, ["--check", file], { stdio: "inherit" }); } catch (error) { console.error(`SERVER SYNTAX ERROR: ${file}`); process.exit(error.status || 1); } }
console.log(`Server syntax OK: ${files.length} files checked.`);
