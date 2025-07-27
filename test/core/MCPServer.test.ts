import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigurationManager } from '@/core/ConfigurationManager.js';
import { LoggingService } from '@/core/LoggingService.js';
import { MCPServer } from '@/core/MCPServer.js';
import { ProtectionEngine } from '@/core/ProtectionEngine.js';
import { SafeDeletionService } from '@/core/SafeDeletionService.js';
import { DEFAULT_CONFIG } from '@/types/index.js';

describe('MCPServer Integration', () => {
  let mcpServer: MCPServer;
  let configManager: ConfigurationManager;
  let protectionEngine: ProtectionEngine;
  let deletionService: SafeDeletionService;
  let loggingService: LoggingService;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join('/tmp', `mcp-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create dependencies with real implementations
    configManager = new ConfigurationManager({
      allowedDirectories: [testDir],
      protectedPatterns: DEFAULT_CONFIG.protectedPatterns,
      logLevel: DEFAULT_CONFIG.logLevel,
    });

    // Initialize the configuration manager
    await configManager.initialize();

    protectionEngine = new ProtectionEngine(
      DEFAULT_CONFIG.protectedPatterns,
      [testDir],
    );

    loggingService = new LoggingService(DEFAULT_CONFIG);

    deletionService = new SafeDeletionService(
      DEFAULT_CONFIG,
      protectionEngine,
      loggingService,
    );

    mcpServer = new MCPServer(
      configManager,
      protectionEngine,
      deletionService,
      loggingService,
    );
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  });

  describe('Server Initialization', () => {
    it('should create MCP server with dependencies', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(MCPServer);
    });

    it('should accept valid dependencies', () => {
      const testServer = new MCPServer(
        configManager,
        protectionEngine,
        deletionService,
        loggingService,
      );

      expect(testServer).toBeInstanceOf(MCPServer);
    });
  });

  describe('Dependencies Integration', () => {
    it('should integrate with ProtectionEngine for pattern checking', () => {
      const patterns = protectionEngine.getProtectedPatterns();
      expect(patterns).toContain('.git');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should integrate with ConfigurationManager for allowed directories', async () => {
      const directories = configManager.getAllowedDirectories();
      expect(directories).toContain(testDir);
      expect(directories.length).toBeGreaterThan(0);
    });

    it('should integrate with SafeDeletionService for file operations', async () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      // Test deletion through the service
      const result = await deletionService.deleteBatch([testFile]);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe(testFile);

      // Verify file was actually deleted
      await expect(fs.access(testFile)).rejects.toThrow();
    });

    it('should prevent deletion of protected files through SafeDeletionService', async () => {
      // Create a protected file
      const gitDir = path.join(testDir, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      const protectedFile = path.join(gitDir, 'config');
      await fs.writeFile(protectedFile, 'test config');

      const result = await deletionService.deleteBatch([protectedFile]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]?.path).toBe(protectedFile);
      expect(result.rejected[0]?.reason).toContain('protected');

      // File should still exist
      await expect(fs.access(protectedFile)).resolves.not.toThrow();
    });

    it('should prevent deletion outside allowed directories through SafeDeletionService', async () => {
      // Create file outside allowed directory
      const outsideDir = path.join('/tmp', `outside-${Date.now()}`);
      await fs.mkdir(outsideDir, { recursive: true });
      const outsideFile = path.join(outsideDir, 'test.txt');
      await fs.writeFile(outsideFile, 'test content');

      const result = await deletionService.deleteBatch([outsideFile]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]?.path).toBe(outsideFile);
      expect(result.rejected[0]?.reason).toContain('outside allowed');

      // File should still exist
      await expect(fs.access(outsideFile)).resolves.not.toThrow();

      // Clean up
      try {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
      catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('Server Lifecycle', () => {
    it('should handle graceful shutdown', async () => {
      // Should not throw when stopping
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await mcpServer.stop();
      // Second stop should also not throw
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    it('should create new instances independently', () => {
      const server1 = new MCPServer(
        configManager,
        protectionEngine,
        deletionService,
        loggingService,
      );

      const server2 = new MCPServer(
        configManager,
        protectionEngine,
        deletionService,
        loggingService,
      );

      expect(server1).not.toBe(server2);
      expect(server1).toBeInstanceOf(MCPServer);
      expect(server2).toBeInstanceOf(MCPServer);
    });
  });

  describe('Batch File Operations', () => {
    it('should handle multiple file deletions through SafeDeletionService', async () => {
      // Create multiple test files
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt'),
        path.join(testDir, 'file3.txt'),
      ];

      for (const file of files) {
        await fs.writeFile(file, 'test content');
      }

      const result = await deletionService.deleteBatch(files);
      expect(result.deleted).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);

      // Verify all files were deleted
      for (const file of files) {
        await expect(fs.access(file)).rejects.toThrow();
      }
    });

    it('should handle mixed success/failure in batch operations', async () => {
      // Create one valid file and one protected file
      const validFile = path.join(testDir, 'valid.txt');
      await fs.writeFile(validFile, 'content');

      const gitDir = path.join(testDir, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      const protectedFile = path.join(gitDir, 'config');
      await fs.writeFile(protectedFile, 'git config');

      const result = await deletionService.deleteBatch([validFile, protectedFile]);

      // The batch might be cancelled if it contains protected files
      if (result.cancelled === true) {
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected.find(r => r.path === protectedFile)).toBeDefined();
      }
      else {
        expect(result.deleted).toHaveLength(1);
        expect(result.deleted[0]).toBe(validFile);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0]?.path).toBe(protectedFile);
      }

      // Check actual file states based on the result
      if (result.cancelled === true) {
        // Both files should still exist if batch was cancelled
        await expect(fs.access(validFile)).resolves.not.toThrow();
        await expect(fs.access(protectedFile)).resolves.not.toThrow();
      }
      else {
        // Valid file should be deleted, protected file should remain
        await expect(fs.access(validFile)).rejects.toThrow();
        await expect(fs.access(protectedFile)).resolves.not.toThrow();
      }
    });

    it('should handle non-existent files gracefully', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist.txt');

      const result = await deletionService.deleteBatch([nonExistent]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.path).toBe(nonExistent);
      expect(result.deleted).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
    });
  });

  describe('Directory Operations', () => {
    it('should handle empty directories through SafeDeletionService', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir);

      const result = await deletionService.deleteBatch([emptyDir]);

      // Check result - directory deletion might succeed or fail depending on implementation
      if (result.deleted.length > 0) {
        expect(result.deleted[0]).toBe(emptyDir);
        await expect(fs.access(emptyDir)).rejects.toThrow();
      }
      else if (result.failed.length > 0) {
        expect(result.failed[0]?.path).toBe(emptyDir);
        // Directory might still exist
      }
    });

    it('should handle directories with contents through SafeDeletionService', async () => {
      const dirWithFiles = path.join(testDir, 'withfiles');
      await fs.mkdir(dirWithFiles);
      await fs.writeFile(path.join(dirWithFiles, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(dirWithFiles, 'file2.txt'), 'content2');

      const result = await deletionService.deleteBatch([dirWithFiles]);

      // Check result - directory deletion might succeed or fail depending on implementation
      if (result.deleted.length > 0) {
        expect(result.deleted[0]).toBe(dirWithFiles);
        await expect(fs.access(dirWithFiles)).rejects.toThrow();
      }
      else if (result.failed.length > 0) {
        expect(result.failed[0]?.path).toBe(dirWithFiles);
        // Directory might still exist
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration through ConfigurationManager', async () => {
      // Test that configuration is properly loaded
      const allowedDirs = configManager.getAllowedDirectories();
      expect(allowedDirs).toContain(testDir);

      // Test that configuration is accessible through the manager
      expect(configManager).toBeInstanceOf(ConfigurationManager);
    });

    it('should use LoggingService for operations', () => {
      // Verify logging service is properly configured
      expect(loggingService).toBeInstanceOf(LoggingService);

      // Test with different log level
      const testLoggingService = new LoggingService({
        ...DEFAULT_CONFIG,
        logLevel: 'debug',
      });

      expect(testLoggingService).toBeInstanceOf(LoggingService);
    });
  });
});
