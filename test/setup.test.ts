import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '@/types/index.js';

describe('Project Setup', () => {
  it('should have basic test framework working', () => {
    expect(true).toBe(true);
  });

  it('should be able to import types', async () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.protectedPatterns).toContain('.git');
  });
});
