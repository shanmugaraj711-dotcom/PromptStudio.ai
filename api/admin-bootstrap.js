import { adminAuth, json, requireUser } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });

  const founderEmail = String(process.env.PROMPTSTUDIO_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!founderEmail) return json(res, 503, { message: "Founder admin email is not configured on the server." });

  try {
    const decoded = await requireUser(req);
    const email = String(decoded.email || "").trim().toLowerCase();
    if (!decoded.email_verified || email !== founderEmail) {
      return json(res, 403, { message: "This account is not eligible for founder admin access." });
    }

    const auth = adminAuth();
    const user = await auth.getUser(decoded.uid);
    await auth.setCustomUserClaims(decoded.uid, { ...(user.customClaims || {}), admin: true });

    return json(res, 200, {
      ok: true,
      message: "Founder admin access enabled. Refresh your session to continue."
    });
  } catch (error) {
    console.error("Admin bootstrap failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { message: "Could not enable founder admin access." });
  }
}
