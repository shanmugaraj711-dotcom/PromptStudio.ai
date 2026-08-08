import { describe, it, expect } from 'vitest';

describe('firebase initialization', () => {
  it('imports firebase module safely and exposes isFirebaseConfigured', async () => {
    // Import dynamically to allow Vitest to provide import.meta.env
    const mod = await import('../firebase');
    expect(mod).toHaveProperty('isFirebaseConfigured');
    expect(typeof mod.isFirebaseConfigured).toBe('boolean');
  });
});
