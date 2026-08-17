import { requireUser } from "./_firebaseAdmin.js";

export const requireFounderAdmin = async (req, { write = false } = {}) => {
  const decoded = await requireUser(req);
  const expectedUid = String(process.env.PROMPTSTUDIO_ADMIN_UID || "").trim();
  const expectedEmail = String(process.env.PROMPTSTUDIO_ADMIN_EMAIL || "").trim().toLowerCase();
  const email = String(decoded.email || "").trim().toLowerCase();

  if (!decoded.email_verified || decoded.admin !== true) {
    const error = new Error("Founder admin access required.");
    error.status = 403;
    throw error;
  }
  if (expectedUid && decoded.uid !== expectedUid) {
    const error = new Error("Founder account is not authorized.");
    error.status = 403;
    throw error;
  }
  if (expectedEmail && email !== expectedEmail) {
    const error = new Error("Founder account is not authorized.");
    error.status = 403;
    throw error;
  }

  // Configuration writes require a recently authenticated Firebase session.
  if (write) {
    const authTime = Number(decoded.auth_time || 0) * 1000;
    if (!authTime || Date.now() - authTime > 10 * 60 * 1000) {
      const error = new Error("Recent sign-in required before changing business configuration.");
      error.status = 401;
      throw error;
    }
  }
  return decoded;
};
