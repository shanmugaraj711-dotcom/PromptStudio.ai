import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";

/* DevOps Kit zip download. Checks the buyer's entitlement first, then
   streams the kit file. The zip is stored as base64 text in
   server/downloads/ (the repo cannot hold binary files through the
   GitHub connector), bundled into the function with includeFiles. */
const FILES = {
  1: { b64: "devops-kit-phase1-v4.zip.b64", name: "devops-kit-phase1-v4.zip", field: "devopsPhase1" },
  2: { b64: "devops-kit-phase2-v4.zip.b64", name: "devops-kit-phase2-v4.zip", field: "devopsPhase2" },
};

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    const decoded = await requireUser(req);
    const phase = String(req.query?.phase || "");
    const file = FILES[phase];
    if (!file) return json(res, 400, { message: "Choose Phase 1 or Phase 2." });
    const userSnap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.[file.field] !== true) {
      return json(res, 403, { code: "not_owned", message: "This kit is yours after you buy the phase." });
    }
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const b64Path = path.join(dir, "..", "downloads", file.b64);
    let buf;
    try {
      const b64 = await fs.promises.readFile(b64Path, "utf8");
      buf = Buffer.from(b64.replace(/\s+/g, ""), "base64");
    } catch (e) {
      return json(res, 500, { code: "download_unavailable", message: "The kit file is not ready yet." });
    }
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return json(res, 500, { code: "download_unavailable", message: "The kit file is damaged." });
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    res.setHeader("Content-Length", String(buf.length));
    return res.end(buf);
  } catch (error) {
    console.error("DevOps download failed", { code: error?.code || "unknown" });
    return json(res, error.status || 500, { code: "download_failed", message: error.message || "Could not download the kit." });
  }
}
