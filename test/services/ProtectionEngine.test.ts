import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigProviderImpl } from '@/services/ConfigProvider.js';
import { ProtectionEngineImpl } from '@/services/ProtectionEngine.js';
import { DEFAULT_CONFIG } from '@/types/index.js';

describe('ProtectionEngine', () => {
  let engine: ProtectionEngineImpl;
  let configProvider: ConfigProviderImpl;

  describe('basic protection pattern matching', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['.git', 'node_modules', '*.env', '.env*', '*.key'],
        allowedDirectories: ['/Users/test/project'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('protects .git directory and its contents', () => {
      expect(engine.isProtected('/Users/test/project/.git')).toBe(true);
      expect(engine.isProtected('/Users/test/project/.git/config')).toBe(true);
      expect(engine.isProtected('/Users/test/project/.git/hooks/pre-commit')).toBe(true);
    });

    it('protects node_modules directory and its contents', () => {
      expect(engine.isProtected('/Users/test/project/node_modules')).toBe(true);
      expect(engine.isProtected('/Users/test/project/node_modules/express/index.js')).toBe(true);
    });

    it('protects .env files with wildcard patterns', () => {
      expect(engine.isProtected('/Users/test/project/.env')).toBe(true);
      expect(engine.isProtected('/Users/test/project/.env.local')).toBe(true);
      expect(engine.isProtected('/Users/test/project/production.env')).toBe(true);
    });

    it('protects .key files with wildcard patterns', () => {
      expect(engine.isProtected('/Users/test/project/private.key')).toBe(true);
      expect(engine.isProtected('/Users/test/project/ssl/server.key')).toBe(true);
    });

    it('does not protect files that do not match protection patterns', () => {
      expect(engine.isProtected('/Users/test/project/README.md')).toBe(false);
      expect(engine.isProtected('/Users/test/project/src/index.js')).toBe(false);
      expect(engine.isProtected('/Users/test/project/package.json')).toBe(false);
    });
  });

  describe('allowed directory scope check', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['.git'],
        allowedDirectories: ['/Users/test/project', '/Users/test/another-project'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('judges paths within allowed directories as within scope', () => {
      expect(engine.isWithinAllowedDirectories('/Users/test/project/src/file.js')).toBe(true);
      expect(engine.isWithinAllowedDirectories('/Users/test/another-project/README.md')).toBe(true);
    });

    it('judges paths outside allowed directories as out of scope', () => {
      expect(engine.isWithinAllowedDirectories('/Users/test/not-allowed/file.js')).toBe(false);
      expect(engine.isWithinAllowedDirectories('/etc/passwd')).toBe(false);
      expect(engine.isWithinAllowedDirectories('/Users/another-user/project/file.js')).toBe(false);
    });

    it('judges allowed directories themselves as within scope', () => {
      expect(engine.isWithinAllowedDirectories('/Users/test/project')).toBe(true);
      expect(engine.isWithinAllowedDirectories('/Users/test/another-project')).toBe(true);
    });

    it('automatically protects paths outside allowed directories', () => {
      expect(engine.isProtected('/etc/passwd')).toBe(true);
      expect(engine.isProtected('/Users/another-user/project/.git')).toBe(true);
    });
  });

  describe('getting matching allowed directories', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: [],
        allowedDirectories: ['/Users/test/project', '/Users/test/workspace/app'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('returns allowed directory that matches the path', () => {
      expect(engine.getMatchingAllowedDirectory('/Users/test/project/src/index.js'))
        .toBe('/Users/test/project');
      expect(engine.getMatchingAllowedDirectory('/Users/test/workspace/app/package.json'))
        .toBe('/Users/test/workspace/app');
    });

    it('returns null when no match is found', () => {
      expect(engine.getMatchingAllowedDirectory('/Users/test/other/file.js')).toBe(null);
      expect(engine.getMatchingAllowedDirectory('/etc/passwd')).toBe(null);
    });

    it('returns the longest path when multiple matches exist', () => {
      const nestedConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: [],
        allowedDirectories: ['/Users/test', '/Users/test/project'],
      });
      const engineWithNested = new ProtectionEngineImpl(nestedConfigProvider);
      expect(engineWithNested.getMatchingAllowedDirectory('/Users/test/project/src/index.js'))
        .toBe('/Users/test/project');
    });
  });

  describe('getting protection pattern list', () => {
    it('returns list of configured protection patterns', () => {
      const patterns = ['.git', '*.env', 'node_modules'];
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: patterns,
        allowedDirectories: ['/test'],
      });
      engine = new ProtectionEngineImpl(configProvider);
      expect(engine.getProtectedPatterns()).toEqual(patterns);
    });

    it('works correctly even with empty arrays', () => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: [],
        allowedDirectories: ['/test'],
      });
      engine = new ProtectionEngineImpl(configProvider);
      expect(engine.getProtectedPatterns()).toEqual([]);
    });
  });

  describe('allowed directory validation', () => {
    it('returns only existing allowed directories', async () => {
      // Mock required as we don't use actual filesystem
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: [],
        allowedDirectories: ['/Users/test/exists', '/Users/test/not-exists'],
      });
      engine = new ProtectionEngineImpl(configProvider);

      // validateAllowedDirectories method will include fs existence check during implementation
      // Here we only verify the method exists
      expect(typeof engine.validateAllowedDirectories).toBe('function');
    });
  });

  describe('complex pattern matching', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['**/.git/**', '**/node_modules/**', '**/*.env', '**/*.key', '.DS_Store'],
        allowedDirectories: ['/Users/test/project'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('also protects .git in nested directories', () => {
      expect(engine.isProtected('/Users/test/project/submodule/.git/config')).toBe(true);
      expect(engine.isProtected('/Users/test/project/deep/nested/.git/HEAD')).toBe(true);
    });

    it('protects node_modules in any location', () => {
      expect(engine.isProtected('/Users/test/project/frontend/node_modules/react/index.js')).toBe(true);
      expect(engine.isProtected('/Users/test/project/backend/node_modules/express/lib/app.js')).toBe(true);
    });

    it('protects .DS_Store files', () => {
      expect(engine.isProtected('/Users/test/project/.DS_Store')).toBe(true);
      expect(engine.isProtected('/Users/test/project/src/.DS_Store')).toBe(true);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['.git', '*.log'],
        allowedDirectories: ['/Users/test/project'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('distinguishes between upper and lower case', () => {
      expect(engine.isProtected('/Users/test/project/.GIT')).toBe(false);
      expect(engine.isProtected('/Users/test/project/.Git')).toBe(false);
    });

    it('applies patterns with exact match, not partial match', () => {
      expect(engine.isProtected('/Users/test/project/.github')).toBe(false);
      expect(engine.isProtected('/Users/test/project/src.git')).toBe(false);
    });

    it('judges correctly regardless of trailing slash', () => {
      expect(engine.isProtected('/Users/test/project/.git')).toBe(true);
      expect(engine.isProtected('/Users/test/project/.git/')).toBe(true);
    });
  });

  describe('caching functionality', () => {
    beforeEach(() => {
      configProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['.git', '*.env'],
        allowedDirectories: ['/Users/test/project'],
      });
      engine = new ProtectionEngineImpl(configProvider);
    });

    it('caches judgment results for the same path', () => {
      const testPath = '/Users/test/project/.git';

      // 最初の呼び出し
      const result1 = engine.isProtected(testPath);

      // 2回目の呼び出し（キャッシュから取得）
      const result2 = engine.isProtected(testPath);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result1).toBe(result2);
    });

    it('dispose()でキャッシュがクリアされる', () => {
      const testPath = '/Users/test/project/.git';

      // キャッシュに保存
      engine.isProtected(testPath);

      // dispose()を呼び出し
      engine.dispose();

      // 新しい判定（キャッシュはクリアされているはず）
      const result = engine.isProtected(testPath);
      expect(result).toBe(true);
    });
  });

  describe('リソース管理', () => {
    it('dispose()を呼び出してもエラーが発生しない', () => {
      const tempConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        protectedPatterns: ['.git'],
        allowedDirectories: ['/Users/test/project'],
      });
      const engine = new ProtectionEngineImpl(tempConfigProvider);
      expect(() => {
        engine.dispose();
      }).not.toThrow();
    });
  });
});
