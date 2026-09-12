const TARGETS = [
  "../server/api/admin-bootstrap.js",
  "../server/api/admin.js",
  "../server/api/apk-forge.js",
  "../server/api/apk-forge-accept.js",
  "../server/api/apk-forge-order.js",
  "../server/api/apk-forge-verify.js",
  "../server/api/apk-forge-build-status.js",
  "../server/api/apk-forge-history.js",
  "../server/api/apk-forge-download.js",
  "../server/api/feedback.js",
  "../server/api/generate-prompt-credits.js",
  "../server/api/generate-prompt.js",
  "../server/api/razorpay-create-order.js",
  "../server/api/razorpay-verify.js",
  "../server/api/razorpay-webhook.js",
  "../server/api/reference-coding.js",
  "../server/api/share-prompt.js",
  "../server/api/studio-delivery.js",
  "../server/api/studio.js",
  "../server/api/studio-jobs.js",
  "../server/api/studio-build-order.js",
  "../server/api/studio-build-verify.js",
  "../server/api/support-message.js",
  "../server/api/v1/prompt.js",
  "../server/api/v1/support.js",
  "../server/api/v1/transactions.js",
  "../server/api/v1/plugin/image-to-prompt.js",
  "../server/api/webhooks/whatsapp.js",
  "../server/api/live-signal.js"
];
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const results = [];
  for (const target of TARGETS) {
    try { await import(target); results.push({ target, ok: true }); }
    catch (error) { results.push({ target, ok: false, name: error?.name || "Error", message: String(error?.message || error) }); }
  }
  return res.status(200).json({ ok: results.every((item) => item.ok), results });
}
