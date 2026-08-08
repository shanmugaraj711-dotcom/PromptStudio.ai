import { describe, it, expect } from 'vitest';
import { generatePrompt } from '../services/promptGenerator';

describe('generatePrompt', () => {
  it('returns a non-empty string containing role and objective', () => {
    const result = generatePrompt({ idea: 'Write a friendly email', aiModel: 'chatgpt', category: 'writing' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(10);
    expect(result).toMatch(/# ROLE/);
    expect(result).toMatch(/# OBJECTIVE/);
    expect(result).toMatch(/Write a friendly email/);
  });
});
