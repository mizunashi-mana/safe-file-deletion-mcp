import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '@/loader/loadConfig.js';
import { type CLIArguments, DEFAULT_CONFIG } from '@/types/index.js';

// Mock modules
vi.mock('fs');
vi.mock('fs/promises');

describe('loadConfig', () => {
  const mockExistsSync = vi.mocked(existsSync);
  const mockReadFile = vi.mocked(fs.readFile);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic configuration loading', () => {
    it('should load configuration from CLI arguments only', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/test/dir1', '/test/dir2'],
        protectedPatterns: ['*.git', 'node_modules'],
        logLevel: 'debug',
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/test/dir1', '/test/dir2']);
      expect(config.getProtectedPatterns()).toEqual(['*.git', 'node_modules']);
      expect(config.getLogLevel()).toBe('debug');
      expect(config.getLogDirectory()).toBe(DEFAULT_CONFIG.logDirectory);
    });

    it('should convert relative paths to absolute paths', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['./relative/dir', '../parent/dir'],
        protectedPatterns: [],
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);
      const dirs = config.getAllowedDirectories();

      expect(dirs[0]).toBe(path.resolve('/test/cwd', './relative/dir'));
      expect(dirs[1]).toBe(path.resolve('/test/cwd', '../parent/dir'));
    });

    it('should throw error when no allowed directories are specified', async () => {
      const args: CLIArguments = {
        allowedDirectories: [],
        protectedPatterns: [],
      };

      await expect(loadConfig(args)).rejects.toThrow('At least one allowed directory must be specified');
    });

    it('should throw error when allowed directory does not exist', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/non/existent/dir'],
        protectedPatterns: [],
      };

      mockExistsSync.mockReturnValue(false);

      await expect(loadConfig(args)).rejects.toThrow('Allowed directory does not exist: /non/existent/dir');
    });
  });

  describe('Configuration file loading', () => {
    it('should load configuration from file when CLI args are not provided', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const fileConfig = {
        allowedDirectories: ['/file/dir1', '/file/dir2'],
        protectedPatterns: ['*.env', '*.secret'],
        logLevel: 'info',
        maxBatchSize: 50,
        maxLogFileSize: 5000000,
        maxLogFiles: 3,
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/file/dir1', '/file/dir2']);
      expect(config.getProtectedPatterns()).toEqual(['*.env', '*.secret']);
      expect(config.getLogLevel()).toBe('info');
      expect(config.getMaxBatchSize()).toBe(50);
      expect(config.getMaxLogFileSize()).toBe(5000000);
      expect(config.getMaxLogFiles()).toBe(3);
    });

    it('should ignore non-existent config file and use defaults', async () => {
      const args: CLIArguments = {
        configFile: '/non/existent/config.json',
        allowedDirectories: ['/test/dir'],
        protectedPatterns: [],
      };

      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/test/dir']);
      expect(config.getProtectedPatterns()).toEqual(DEFAULT_CONFIG.protectedPatterns);
      expect(config.getLogLevel()).toBe(DEFAULT_CONFIG.logLevel);
    });

    it('should throw error for invalid JSON in config file', async () => {
      const args: CLIArguments = {
        configFile: '/test/invalid.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      mockReadFile.mockResolvedValue('{ invalid json }');

      await expect(loadConfig(args)).rejects.toThrow();
    });

    it('should throw error for invalid schema in config file', async () => {
      const args: CLIArguments = {
        configFile: '/test/invalid-schema.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const invalidConfig = {
        allowedDirectories: 'not-an-array', // Should be an array
        logLevel: 'invalid-level', // Invalid enum value
      };

      mockReadFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(loadConfig(args)).rejects.toThrow(z.ZodError);
    });

    it('should handle empty config file path', async () => {
      const args: CLIArguments = {
        configFile: '',
        allowedDirectories: ['/test/dir'],
        protectedPatterns: ['*.git'],
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/test/dir']);
      expect(config.getProtectedPatterns()).toEqual(['*.git']);
    });

    it('should handle undefined config file path', async () => {
      const args: CLIArguments = {
        configFile: undefined,
        allowedDirectories: ['/test/dir'],
        protectedPatterns: ['*.git'],
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/test/dir']);
      expect(config.getProtectedPatterns()).toEqual(['*.git']);
    });
  });

  describe('Configuration merging', () => {
    it('should prioritize CLI args over file config', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: ['/cli/dir'],
        protectedPatterns: ['cli-pattern'],
        logLevel: 'error',
      };

      const fileConfig = {
        allowedDirectories: ['/file/dir'],
        protectedPatterns: ['file-pattern'],
        logLevel: 'debug',
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/cli/dir']);
      expect(config.getProtectedPatterns()).toEqual(['cli-pattern']);
      expect(config.getLogLevel()).toBe('error');
    });

    it('should use file config when CLI args are empty arrays', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const fileConfig = {
        allowedDirectories: ['/file/dir'],
        protectedPatterns: ['file-pattern'],
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getAllowedDirectories()).toEqual(['/file/dir']);
      expect(config.getProtectedPatterns()).toEqual(['file-pattern']);
    });

    it('should use defaults when neither CLI nor file config is provided', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/test/dir'],
        protectedPatterns: [],
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getProtectedPatterns()).toEqual(DEFAULT_CONFIG.protectedPatterns);
      expect(config.getLogLevel()).toBe(DEFAULT_CONFIG.logLevel);
      expect(config.getMaxBatchSize()).toBe(DEFAULT_CONFIG.maxBatchSize);
    });

    it('should merge file-only configurations properly', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: ['/cli/dir'],
        protectedPatterns: [],
      };

      const fileConfig = {
        maxBatchSize: 200,
        maxLogFileSize: 10000000,
        maxLogFiles: 5,
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      expect(config.getMaxBatchSize()).toBe(200);
      expect(config.getMaxLogFileSize()).toBe(10000000);
      expect(config.getMaxLogFiles()).toBe(5);
    });
  });

  describe('ConfigProvider implementation', () => {
    it('should correctly implement all ConfigProvider methods', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const fileConfig = {
        allowedDirectories: ['/test/dir'],
        protectedPatterns: ['*.secret'],
        logLevel: 'warn',
        maxBatchSize: 75,
        maxLogFileSize: 7500000,
        maxLogFiles: 4,
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      // Test all getter methods
      expect(config.getAllowedDirectories()).toEqual(['/test/dir']);
      expect(config.getProtectedPatterns()).toEqual(['*.secret']);
      expect(config.getLogLevel()).toBe('warn');
      expect(config.getLogDirectory()).toBe(DEFAULT_CONFIG.logDirectory);
      expect(config.getMaxBatchSize()).toBe(75);
      expect(config.getMaxLogFileSize()).toBe(7500000);
      expect(config.getMaxLogFiles()).toBe(4);
    });

    it('should use default values for optional config when not set in file', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const fileConfig = {
        allowedDirectories: ['/test/dir'],
        // maxLogFileSize and maxLogFiles not provided
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);

      // Should use defaults from DEFAULT_CONFIG
      expect(config.getMaxLogFileSize()).toBe(DEFAULT_CONFIG.maxLogFileSize);
      expect(config.getMaxLogFiles()).toBe(DEFAULT_CONFIG.maxLogFiles);
    });
  });

  describe('Multiple allowed directories', () => {
    it('should validate all allowed directories exist', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/test/dir1', '/test/dir2', '/test/dir3'],
        protectedPatterns: [],
      };

      mockExistsSync
        .mockReturnValueOnce(true) // dir1 exists
        .mockReturnValueOnce(false) // dir2 does not exist
        .mockReturnValueOnce(true); // dir3 exists

      await expect(loadConfig(args)).rejects.toThrow('Allowed directory does not exist: /test/dir2');
    });

    it('should handle mixed absolute and relative paths', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/absolute/path', './relative', '../parent', 'child'],
        protectedPatterns: [],
      };

      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);
      const dirs = config.getAllowedDirectories();

      expect(dirs[0]).toBe('/absolute/path');
      expect(dirs[1]).toBe(path.resolve('/test/cwd', './relative'));
      expect(dirs[2]).toBe(path.resolve('/test/cwd', '../parent'));
      expect(dirs[3]).toBe(path.resolve('/test/cwd', 'child'));
    });
  });

  describe('Edge cases', () => {
    it('should handle file read errors other than ENOENT', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      await expect(loadConfig(args)).rejects.toThrow('Permission denied');
    });

    it('should handle all valid log levels', async () => {
      const logLevels: Array<'none' | 'debug' | 'info' | 'warn' | 'error'> = ['none', 'debug', 'info', 'warn', 'error'];

      for (const level of logLevels) {
        const args: CLIArguments = {
          allowedDirectories: ['/test/dir'],
          protectedPatterns: [],
          logLevel: level,
        };

        mockExistsSync.mockReturnValue(true);

        const config = await loadConfig(args);
        expect(config.getLogLevel()).toBe(level);
      }
    });

    it('should handle very large maxBatchSize values', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: ['/test/dir'],
        protectedPatterns: [],
      };

      const fileConfig = {
        maxBatchSize: 999999,
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      mockExistsSync.mockReturnValue(true);

      const config = await loadConfig(args);
      expect(config.getMaxBatchSize()).toBe(999999);
    });

    it('should reject negative values in file config', async () => {
      const args: CLIArguments = {
        configFile: '/test/config.json',
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const fileConfig = {
        allowedDirectories: ['/test/dir'],
        maxBatchSize: -10, // Negative value should be rejected
      };

      mockReadFile.mockResolvedValue(JSON.stringify(fileConfig));

      await expect(loadConfig(args)).rejects.toThrow(z.ZodError);
    });
  });
});
