import { describe, it, expect } from 'vitest';
import { loadPackageInfo } from '@/services/PackageInfoProvider.js';

describe('PackageInfoProvider', () => {
  describe('Real-world integration', () => {
    it('should successfully load actual project package.json', async () => {
      // This test uses the real loadPackageInfo without mocking
      // to verify it works with the actual project structure
      const provider = await loadPackageInfo();

      const name = provider.getName();
      const version = provider.getVersion();
      const description = provider.getDescription();

      // Verify we get actual project values
      expect(name).toBe('@mizunashi_mana/safe-file-deletion-mcp');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semver pattern
      expect(description).toContain('MCP Server');
      expect(description).toContain('file');
    });

    it('should provide consistent interface methods', async () => {
      const provider = await loadPackageInfo();

      // Verify all interface methods exist and return correct types
      expect(typeof provider.getName).toBe('function');
      expect(typeof provider.getVersion).toBe('function');
      expect(typeof provider.getDescription).toBe('function');

      expect(typeof provider.getName()).toBe('string');
      expect(typeof provider.getVersion()).toBe('string');
      expect(typeof provider.getDescription()).toBe('string');
    });

    it('should return same values on multiple calls', async () => {
      const provider = await loadPackageInfo();

      // Call methods multiple times
      const name1 = provider.getName();
      const name2 = provider.getName();
      const version1 = provider.getVersion();
      const version2 = provider.getVersion();
      const desc1 = provider.getDescription();
      const desc2 = provider.getDescription();

      expect(name1).toBe(name2);
      expect(version1).toBe(version2);
      expect(desc1).toBe(desc2);

      // Should be consistent with project values
      expect(name1).toBe('@mizunashi_mana/safe-file-deletion-mcp');
      expect(version1).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should handle missing description gracefully', async () => {
      const provider = await loadPackageInfo();

      // Description should be a string (empty or with content)
      const description = provider.getDescription();
      expect(typeof description).toBe('string');
    });
  });
});
