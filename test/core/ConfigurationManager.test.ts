import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigurationManager, type CLIArguments } from '@/core/ConfigurationManager.js';

vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('ConfigurationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  describe('initialization', () => {
    it('can initialize configuration from CLI arguments', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/Users/test/project'],
        protectedPatterns: ['.git', '*.env'],
      };

      const configManager = new ConfigurationManager(args);
      const config = await configManager.initialize();

      expect(config.allowedDirectories).toEqual(['/Users/test/project']);
      expect(config.protectedPatterns).toEqual(['.git', '*.env']);
    });

    it('throws error when allowed directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const args: CLIArguments = {
        allowedDirectories: ['/non/existent/path'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);

      await expect(configManager.initialize()).rejects.toThrow(
        'Allowed directory does not exist: /non/existent/path',
      );
    });

    it('sets .git as default when protection patterns are not specified', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/Users/test/project'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);
      const config = await configManager.initialize();

      expect(config.protectedPatterns).toEqual(['.git']);
    });

    it('normalizes relative paths to absolute paths', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['./relative/path'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);
      const config = await configManager.initialize();

      expect(config.allowedDirectories[0]).toBe(
        path.resolve(process.cwd(), './relative/path'),
      );
    });

    it('throws error when allowed directories are not specified', async () => {
      const args: CLIArguments = {
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);

      await expect(configManager.initialize()).rejects.toThrow(
        'At least one allowed directory must be specified',
      );
    });
  });

  describe('設定ファイルとの統合', () => {
    it('can load configuration from config file', async () => {
      const configFileContent = {
        allowedDirectories: ['/Users/test/from-config'],
        protectedPatterns: ['node_modules', '*.key'],
        logLevel: 'info',
        maxBatchSize: 50,
      };

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify(configFileContent),
      );

      const args: CLIArguments = {
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args, '/path/to/config.json');
      const config = await configManager.initialize();

      expect(config.allowedDirectories).toEqual(['/Users/test/from-config']);
      expect(config.protectedPatterns).toEqual(['node_modules', '*.key']);
      expect(config.logLevel).toBe('info');
      expect(config.maxBatchSize).toBe(50);
    });

    it('CLI引数が設定ファイルより優先される', async () => {
      const configFileContent = {
        allowedDirectories: ['/Users/test/from-config'],
        protectedPatterns: ['node_modules'],
        logLevel: 'debug',
      };

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify(configFileContent),
      );

      const args: CLIArguments = {
        allowedDirectories: ['/Users/test/from-cli'],
        protectedPatterns: ['.git', '*.env'],
      };

      const configManager = new ConfigurationManager(args, '/path/to/config.json');
      const config = await configManager.initialize();

      expect(config.allowedDirectories).toEqual(['/Users/test/from-cli']);
      expect(config.protectedPatterns).toEqual(['.git', '*.env']);
      expect(config.logLevel).toBe('debug'); // 設定ファイルから
    });

    it('uses default configuration when config file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: no such file or directory'),
      );

      const args: CLIArguments = {
        allowedDirectories: ['/Users/test/project'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args, '/non/existent/config.json');
      const config = await configManager.initialize();

      expect(config.protectedPatterns).toEqual(['.git']);
      expect(config.logLevel).toBe('none');
      expect(config.maxBatchSize).toBe(100);
    });
  });

  describe('アクセサメソッド', () => {
    it('getAllowedDirectories()で許可ディレクトリ一覧を取得できる', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/dir1', '/dir2'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);
      await configManager.initialize();

      expect(configManager.getAllowedDirectories()).toEqual(['/dir1', '/dir2']);
    });

    it('getProtectedPatterns()で保護パターン一覧を取得できる', async () => {
      const args: CLIArguments = {
        allowedDirectories: ['/test'],
        protectedPatterns: ['.git', '*.env', 'node_modules'],
      };

      const configManager = new ConfigurationManager(args);
      await configManager.initialize();

      expect(configManager.getProtectedPatterns()).toEqual(['.git', '*.env', 'node_modules']);
    });

    it('throws error when calling accessor before initialization', () => {
      const args: CLIArguments = {
        allowedDirectories: ['/test'],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args);

      expect(() => configManager.getAllowedDirectories()).toThrow(
        'Configuration not initialized',
      );
      expect(() => configManager.getProtectedPatterns()).toThrow(
        'Configuration not initialized',
      );
    });
  });

  describe('設定ファイルの相対パス処理', () => {
    it('converts relative paths in config file to absolute paths', async () => {
      const configFileContent = {
        allowedDirectories: ['./relative/dir1', '../relative/dir2'],
        protectedPatterns: ['.git'],
      };

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify(configFileContent),
      );

      const args: CLIArguments = {
        allowedDirectories: [],
        protectedPatterns: [],
      };

      const configManager = new ConfigurationManager(args, '/path/to/config.json');
      const config = await configManager.initialize();

      expect(config.allowedDirectories).toEqual([
        path.resolve(process.cwd(), './relative/dir1'),
        path.resolve(process.cwd(), '../relative/dir2'),
      ]);
    });
  });
});
