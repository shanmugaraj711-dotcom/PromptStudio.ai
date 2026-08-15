import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const SHARE_TTL_MS = 10 * 60 * 1000;
const SHARE_ID_PATTERN = /^[a-f0-9]{48}$/;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sendJson = (response, status, payload) => response.status(status).json(payload);

const getAdminCredential = () => {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        });
      }
    } catch {
      throw new ApiError(503, 'server_configuration_error', 'Sharing is temporarily unavailable.');
    }
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(503, 'server_configuration_error', 'Sharing is temporarily unavailable.');
  }
  return cert({ projectId, clientEmail, privateKey });
};

const getServices = () => {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: getAdminCredential() });
  return { auth: getAuth(app), db: getFirestore(app) };
};

const getBearerToken = (request) => {
  const header = request.headers?.authorization || request.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw new ApiError(400, 'invalid_request', 'Invalid request.'); }
  }
  return body;
};

const sanitizePrompt = (value) => typeof value === 'string' ? value.trim().slice(0, 12000) : '';

export default async function handler(request, response) {
  try {
    const { auth, db } = getServices();

    if (request.method === 'POST') {
      const token = getBearerToken(request);
      if (!token) throw new ApiError(401, 'unauthenticated', 'Please sign in to share a prompt.');

      let decoded;
      try { decoded = await auth.verifyIdToken(token); }
      catch { throw new ApiError(401, 'unauthenticated', 'Please sign in to share a prompt.'); }

      const profile = await db.collection('users').doc(decoded.uid).get();
      const plan = profile.exists ? profile.data()?.plan : 'free';
      if (plan !== 'pro') throw new ApiError(403, 'pro_required', 'Shareable prompt links are a Pro feature.');

      const body = parseBody(request.body);
      const prompt = sanitizePrompt(body.prompt);
      if (prompt.length < 3) throw new ApiError(400, 'invalid_prompt', 'The prompt is too short to share.');

      const shareId = crypto.randomBytes(24).toString('hex');
      const expiresAtMs = Date.now() + SHARE_TTL_MS;
      await db.collection('publicPromptShares').doc(shareId).set({
        prompt,
        ownerUid: decoded.uid,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(expiresAtMs),
      });

      return sendJson(response, 201, {
        status: 'success',
        shareId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresInSeconds: SHARE_TTL_MS / 1000,
      });
    }

    if (request.method === 'GET') {
      const shareId = String(request.query?.id || '').trim();
      if (!SHARE_ID_PATTERN.test(shareId)) throw new ApiError(404, 'share_not_found', 'This share link is invalid or expired.');

      const snapshot = await db.collection('publicPromptShares').doc(shareId).get();
      if (!snapshot.exists) throw new ApiError(404, 'share_not_found', 'This share link is invalid or expired.');

      const data = snapshot.data();
      const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
      if (!expiresAtMs || Date.now() >= expiresAtMs) {
        await snapshot.ref.delete().catch(() => {});
        throw new ApiError(410, 'share_expired', 'This share link has expired.');
      }

      // Intentionally return only the public prompt payload. Never expose ownerUid,
      // email, profile data, history, favorites, quota, or uploaded images.
      response.setHeader?.('Cache-Control', 'no-store, private');
      return sendJson(response, 200, {
        status: 'success',
        prompt: sanitizePrompt(data.prompt),
        expiresAt: new Date(expiresAtMs).toISOString(),
      });
    }

    response.setHeader?.('Allow', 'GET, POST');
    return sendJson(response, 405, { code: 'method_not_allowed', message: 'Method not allowed.' });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'share_unavailable';
    const message = error instanceof ApiError ? error.message : 'Unable to create or open the share link right now.';
    return sendJson(response, status, { code, message });
  }
}
