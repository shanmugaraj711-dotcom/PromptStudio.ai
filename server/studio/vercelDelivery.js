import { deliveryFiles } from "./deliveryBundle.js";

export function createVercelDeliveryProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const projectId = env.STUDIO_CUSTOMER_VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID;
  const token = env.STUDIO_CUSTOMER_VERCEL_TOKEN;
  const teamId = env.STUDIO_CUSTOMER_VERCEL_TEAM_ID;
  if (!projectId || !token) throw new Error("Configure the existing Vercel project ID and customer deployment token.");
  const request = async (path, options = {}) => {
    const url = new URL(path, "https://api.vercel.com");
    if (teamId) url.searchParams.set("teamId", teamId);
    const response = await fetchImpl(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Vercel request failed (${response.status}).`);
    return response.json();
  };
  const check = (deployment, job) => {
    if (deployment.projectId !== projectId || deployment.meta?.studioDeliveryId !== job.deliveryId || deployment.meta?.studioRevisionId !== job.acceptedRevisionId) throw new Error("Deployment does not match the saved customer revision/project.");
    return deployment;
  };
  return {
    projectId,
    async submit(job, revision) {
      const deployment = await request("/v13/deployments", { method: "POST", body: JSON.stringify({
        name: "studio-customer-sites", project: projectId,
        files: deliveryFiles(revision),
        meta: { studioDeliveryId: job.deliveryId, studioRevisionId: revision.revisionId },
        projectSettings: { framework: null, buildCommand: "npm run build", installCommand: "npm install --ignore-scripts --no-audit --no-fund", outputDirectory: "dist", rootDirectory: null, nodeVersion: "24.x" },
        // Unique deployment URLs; never promote a shared production alias.
      }) });
      if (!deployment.id) throw new Error("Vercel did not return a deployment ID.");
      return { id: deployment.id };
    },
    async recover(job) {
      // Reconcile an uncertain POST; never blindly submit a second deployment.
      let until;
      for (let page = 0; page < 5; page += 1) {
        const query = new URLSearchParams({ projectId, limit: "100", since: String(job.submittedAt - 60000) });
        if (until) query.set("until", String(until));
        const result = await request("/v7/deployments?" + query);
        const matches = (result.deployments || []).filter((d) => d.meta?.studioDeliveryId === job.deliveryId && d.meta?.studioRevisionId === job.acceptedRevisionId);
        if (matches.length > 1) throw new Error("Multiple matching deployments require operator review.");
        if (matches.length === 1) return { id: matches[0].uid || matches[0].id };
        until = result.pagination?.next;
        if (!until) return null;
      }
      throw new Error("Deployment reconciliation exceeded its page budget; operator review required.");
    },
    async inspect(job) {
      const d = check(await request("/v13/deployments/" + encodeURIComponent(job.deploymentId)), job);
      return { state: d.readyState || d.status, url: d.url };
    },
    async verify(job, hostname) {
      if (!/^[a-z0-9-]+\.vercel\.app$/.test(hostname || "")) throw new Error("Unexpected customer deployment hostname.");
      const origin = "https://" + hostname;
      const read = async (path) => {
        // No auth/bypass header: this must work for the customer publicly.
        const response = await fetchImpl(origin + path, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "Cache-Control": "no-cache" } });
        if (!response.ok) throw new Error("The customer website is not publicly reachable yet.");
        return response;
      };
      const marker = await (await read("/studio-revision.json")).json();
      const html = await (await read("/")).text();
      if (marker.revisionId !== job.acceptedRevisionId || !html.includes(`content="${job.acceptedRevisionId}"`) || !html.includes('id="root"') || !html.includes('src="/app.js"')) throw new Error("Live website revision verification failed.");
      const script = await (await read("/app.js")).text();
      const css = await (await read("/app.css")).text();
      if (!script.trim() || !css.trim() || /^\s*</.test(script)) throw new Error("Customer website assets are unavailable.");
      return origin;
    },
  };
}
