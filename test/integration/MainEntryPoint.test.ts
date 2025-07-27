import { describe, it, expect, beforeEach } from 'vitest';
import { ServerStartup } from '@/core/ServerStartup.js';

describe('Main Entry Point Integration', () => {
  let serverStartup: ServerStartup;

  beforeEach(() => {
    serverStartup = new ServerStartup();
  });

  describe('CLI Argument Parsing', () => {
    it('should parse help flag correctly', () => {
      const args = ['--help'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.showHelp).toBe(true);
    });

    it('should parse version flag correctly', () => {
      const args = ['--version'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.showVersion).toBe(true);
    });

    it('should parse allowed directories correctly', () => {
      const args = ['--allowed-directories', '/tmp,/workspace'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.allowedDirectories).toEqual(['/tmp', '/workspace']);
    });

    it('should parse protected patterns correctly', () => {
      const args = ['--protected-patterns', '.git,node_modules,*.log'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.protectedPatterns).toEqual(['.git', 'node_modules', '*.log']);
    });

    it('should parse log level correctly', () => {
      const args = ['--log-level', 'debug'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.logLevel).toBe('debug');
    });

    it('should parse config path correctly', () => {
      const args = ['--config', '/path/to/config.json'];
      const result = serverStartup.parseCliArguments(args);
      expect(result.configPath).toBe('/path/to/config.json');
    });
  });

  describe('Help and Version Display', () => {
    it('should display help without throwing', () => {
      expect(() => {
        serverStartup.displayHelp();
      }).not.toThrow();
    });

    it('should display version without throwing', () => {
      expect(() => {
        serverStartup.displayVersion();
      }).not.toThrow();
    });
  });
});
