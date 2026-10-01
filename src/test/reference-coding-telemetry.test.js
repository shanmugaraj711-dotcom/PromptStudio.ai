import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  generatePromptHandler: vi.fn(),
  adminDb: vi.fn(),
  requireUser: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
    increment: (n) => ({ __increment: n }),
  },
}));
vi.mock('../../server/api/_firebaseAdmin.js', () => ({
  adminDb: mocks.adminDb,
  requireUser: mocks.requireUser,
  json: (res, status, payload) => { res.statusCode = status; res.body = payload; return res; },
}));
vi.mock('../../server/api/generate-prompt-credits.js', () => ({
  default: mocks.generatePromptHandler,
}));

import handler from '../../server/api/reference-coding.js';

describe('reference-coding telemetry', () => {
  let telemetryRows;
  let promptRows;
  let userDocs;
  let ledgerDocs;
  let db;

  const makeUserRef = (uid) => ({
    __type: 'userRef',
    uid,
    collection: vi.fn((subName) => {
      if (subName === 'creditLedger') {
        return { doc: vi.fn((id) => ({ __type: 'ledgerRef', uid, requestId: id })) };
      }
      if (subName === 'prompts') {
        return {
          doc: vi.fn((id) => ({
            set: vi.fn(async (value) => promptRows.set(`${uid}_${id}`, value)),
          })),
        };
      }
      throw new Error(`Unexpected subcollection: ${subName}`);
    }),
  });

  beforeEach(() => {
    telemetryRows = new Map();
    promptRows = new Map();
    userDocs = new Map([['test-user', { credits: 100 }]]);
    ledgerDocs = new Map();

    db = {
      collection: vi.fn((name) => {
        if (name === 'referenceCodingEvents') {
          return {
            doc: vi.fn((id) => ({
              set: vi.fn(async (value) => telemetryRows.set(id, value)),
            })),
          };
        }
        if (name === 'users') {
          return { doc: vi.fn((uid) => makeUserRef(uid)) };
        }
        throw new Error(`Unexpected collection: ${name}`);
      }),
      runTransaction: vi.fn(async (callback) => {
        const transaction = {
          get: vi.fn(async (ref) => {
            if (ref.__type === 'userRef') {
              const data = userDocs.get(ref.uid);
              return { exists: !!data, data: () => data };
            }
            if (ref.__type === 'ledgerRef') {
              const data = ledgerDocs.get(`${ref.uid}_${ref.requestId}`);
              return { exists: !!data, data: () => data };
            }
            throw new Error('Unknown ref in transaction.get');
          }),
          set: vi.fn((ref, value, options) => {
            if (ref.__type === 'userRef') {
              const existing = userDocs.get(ref.uid) || {};
              userDocs.set(ref.uid, options?.merge ? { ...existing, ...value } : value);
            } else if (ref.__type === 'ledgerRef') {
              const key = `${ref.uid}_${ref.requestId}`;
              const existing = ledgerDocs.get(key) || {};
              ledgerDocs.set(key, options?.merge ? { ...existing, ...value } : value);
            }
          }),
        };
        return callback(transaction);
      }),
    };
    mocks.adminDb.mockReturnValue(db);
    mocks.requireUser.mockResolvedValue({ uid: 'test-user' });
    mocks.generatePromptHandler.mockReset();
  });

  it('does not add telemetry when the underlying AI generation fails', async () => {
    const before = telemetryRows.size;
    mocks.generatePromptHandler.mockImplementation(async (_req, res) => {
      res.statusCode = 502;
      return res;
    });

    const req = {
      method: 'POST',
      body: {
        idea: 'make this UI better',
        requestId: 'failure-12345678',
        images: [],
        referenceFiles: [],
      },
      headers: { authorization: 'Bearer test-token' },
    };
    const res = {
      statusCode: 200,
      status: vi.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function (payload) {
        this.payload = payload;
        return this;
      }),
    };

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(telemetryRows.size).toBe(before);
    expect(promptRows.size).toBe(0);
    expect(db.collection).not.toHaveBeenCalledWith('referenceCodingEvents');
  });

  it('adds one telemetry row only after a successful generation', async () => {
    mocks.generatePromptHandler.mockImplementation(async (_req, res) => {
      res.statusCode = 200;
      return res;
    });

    const req = {
      method: 'POST',
      body: {
        idea: 'improve the existing UI',
        requestId: 'success-12345678',
        images: [{ mimeType: 'image/jpeg', data: 'x' }],
        referenceFiles: [{ name: 'notes.txt', detectedType: 'text/plain' }],
      },
      headers: { authorization: 'Bearer test-token' },
    };
    const res = {
      statusCode: 200,
      status: vi.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function (payload) {
        this.payload = payload;
        return this;
      }),
    };

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(telemetryRows.size).toBe(1);
    expect([...telemetryRows.values()][0]).toMatchObject({
      event: 'reference_coding_generation',
      uid: 'test-user',
      requestId: 'success-12345678',
      referenceCount: 2,
      imageReferenceCount: 1,
      fileReferenceCount: 1,
    });
    expect(promptRows.size).toBe(1);
    // Credits are charged inside generate-prompt-credits (mocked here); this route only delegates.
    expect(mocks.generatePromptHandler).toHaveBeenCalledTimes(1);
  });
});