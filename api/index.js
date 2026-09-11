import adminBootstrapHandler from "../server/api/admin-bootstrap.js";
import adminHandler from "../server/api/admin.js";
import feedbackHandler from "../server/api/feedback.js";
import generatePromptCreditsHandler from "../server/api/generate-prompt-credits.js";
import generatePromptHandler from "../server/api/generate-prompt.js";
import productConfigHandler from "../server/api/product-config.js";
import razorpayOrderHandler from "../server/api/razorpay-order.js";
import razorpaySubscriptionHandler from "../server/api/razorpay-subscription.js";
import razorpayVerifyHandler from "../server/api/razorpay-verify.js";
import razorpayWebhookHandler from "../server/api/razorpay-webhook.js";
import referenceCodingHandler from "../server/api/reference-coding.js";
import sharePromptHandler from "../server/api/share-prompt.js";
import studioHandler from "../server/api/studio.js";
import studioJobsHandler from "../server/api/studio-jobs.js";
import studioBuildOrderHandler from "../server/api/studio-build-order.js";
import studioBuildVerifyHandler from "../server/api/studio-build-verify.js";
import supportMessageHandler from "../server/api/support-message.js";
import v1PromptHandler from "../server/api/v1/prompt.js";
import v1SupportHandler from "../server/api/v1/support.js";
import v1TransactionsHandler from "../server/api/v1/transactions.js";
import v1ImageToPromptHandler from "../server/api/v1/plugin/image-to-prompt.js";
import whatsappWebhookHandler from "../server/api/webhooks/whatsapp.js";
import liveSignalHandler from "../server/api/live-signal.js";

import studioDeliveryHandler from "../server/api/studio-delivery.js";

const STATIC_HANDLERS = {
  "/api/admin-bootstrap": adminBootstrapHandler,
  "/api/admin": adminHandler,
  "/api/feedback": feedbackHandler,
  "/api/generate-prompt-credits": generatePromptCreditsHandler,
  "/api/generate-prompt": generatePromptHandler,
  "/api/product-config": productConfigHandler,
  "/api/razorpay-order": razorpayOrderHandler,
  "/api/razorpay-subscription": razorpaySubscriptionHandler,
  "/api/razorpay-verify": razorpayVerifyHandler,
  "/api/razorpay-webhook": razorpayWebhookHandler,
  "/api/reference-coding": referenceCodingHandler,
  "/api/share-prompt": sharePromptHandler,
  "/api/studio-delivery": studioDeliveryHandler,
  "/api/studio": studioHandler,
  "/api/studio-jobs": studioJobsHandler,
  "/api/studio-build-order": studioBuildOrderHandler,
  "/api/studio-build-verify": studioBuildVerifyHandler,
  "/api/support-message": supportMessageHandler,
  "/api/v1/prompt": v1PromptHandler,
  "/api/v1/support": v1SupportHandler,
  "/api/v1/transactions": v1TransactionsHandler,
  "/api/v1/plugin/image-to-prompt": v1ImageToPromptHandler,
  "/api/webhooks/whatsapp": whatsappWebhookHandler,
  "/api/live-signal": liveSignalHandler,
};

const normalizePath = (value) => {
  const path = String(value || "").split("?")[0].replace(/\/+$/, "");
  return path || "/";
};

export default async function handler(req, res) {
  const requestedPath = normalizePath(req.url);
  const requestedRoute = String(req.query?.route || "").trim();
  const route = normalizePath(requestedRoute ? `/api/${requestedRoute.replace(/^\/api\//, "")}` : requestedPath);
  const target = STATIC_HANDLERS[route];

  if (!target) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "api_route_not_found" }));
  }

  try {
    return await target(req, res);
  } catch (error) {
    console.error("PromptStudio API gateway failed", { route, code: error?.code || "unknown", message: error?.message, stack: error?.stack });
    if (!res.headersSent) {
      res.statusCode = Number(error?.status) || 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "api_request_failed" }));
    }
    return undefined;
  }
}