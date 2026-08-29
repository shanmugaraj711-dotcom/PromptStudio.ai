import referenceCodingHandler from "../server/api/reference-coding.js";

const ROUTES = {
  "/api/admin-bootstrap": "../server/api/admin-bootstrap.js",
  "/api/admin": "../server/api/admin.js",
  "/api/feedback": "../server/api/feedback.js",
  "/api/generate-prompt-credits": "../server/api/generate-prompt-credits.js",
  "/api/generate-prompt": "../server/api/generate-prompt.js",
  "/api/product-config": "../server/api/product-config.js",
  "/api/razorpay-order": "../server/api/razorpay-order.js",
  "/api/razorpay-subscription": "../server/api/razorpay-subscription.js",
  "/api/razorpay-verify": "../server/api/razorpay-verify.js",
  "/api/razorpay-webhook": "../server/api/razorpay-webhook.js",
  "/api/share-prompt": "../server/api/share-prompt.js",
  "/api/support-message": "../server/api/support-message.js",
  "/api/v1/prompt": "../server/api/v1/prompt.js",
  "/api/v1/support": "../server/api/v1/support.js",
  "/api/v1/transactions": "../server/api/v1/transactions.js",
  "/api/v1/plugin/image-to-prompt": "../server/api/v1/plugin/image-to-prompt.js",
  "/api/webhooks/whatsapp": "../server/api/webhooks/whatsapp.js"
};

const STATIC_HANDLERS = {
  "/api/reference-coding": referenceCodingHandler,
};

const normalizePath = (value) => {
  const path = String(value || "").split("?")[0].replace(/\/+$/, "");
  return path || "/";
};

export default async function handler(req, res) {
  const requestedPath = normalizePath(req.url);
  const requestedRoute = String(req.query?.route || "").trim();
  const route = normalizePath(requestedRoute ? `/api/${requestedRoute.replace(/^\/api\//, "")}` : requestedPath);
  const staticHandler = STATIC_HANDLERS[route];

  if (staticHandler) return await staticHandler(req, res);

  const modulePath = ROUTES[route];
  if (!modulePath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "api_route_not_found" }));
  }

  try {
    const module = await import(new URL(modulePath, import.meta.url).href);
    const target = module.default;
    if (typeof target !== "function") throw new Error("API module does not export a default handler.");
    return await target(req, res);
  } catch (error) {
    console.error("PromptStudio API gateway failed", { route, code: error?.code || "unknown" });
    if (!res.headersSent) {
      res.statusCode = Number(error?.status) || 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "api_request_failed" }));
    }
    return undefined;
  }
}
