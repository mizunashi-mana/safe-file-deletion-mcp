import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type DIContainer, buildContainer } from '@/container/DIContainer.js';
import { ConfigProviderImpl } from '@/services/ConfigProvider.js';
import { loadPackageInfo } from '@/services/PackageInfoProvider.js';
import { SafeFileDeletionMCPServer } from '@/services/SafeFileDeletionMCPServer.js';
import { DEFAULT_CONFIG } from '@/types/index.js';
import { MockLoggingService } from '@~test/mocks/MockLoggingService.js';
import { MockSafeDeletionService } from '@~test/mocks/MockSafeDeletionService.js';
import type { PackageInfoProvider } from '@/services/PackageInfoProvider.js';

describe('MCPServer Integration', () => {
  let mcpServer: SafeFileDeletionMCPServer;
  let diContainer: DIContainer;
  let configProvider: ConfigProviderImpl;
  let packageInfoProvider: PackageInfoProvider;
  let mockLoggingService: MockLoggingService;
  let mockSafeDeletionService: MockSafeDeletionService;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join('/tmp', `mcp-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Load real package info
    packageInfoProvider = await loadPackageInfo();

    // Create mock services
    mockLoggingService = new MockLoggingService();
    mockSafeDeletionService = new MockSafeDeletionService([testDir]);

    // Create dependencies with mock implementations
    configProvider = new ConfigProviderImpl({
      ...DEFAULT_CONFIG,
      allowedDirectories: [testDir],
      logDirectory: path.join(testDir, 'logs'),
    });

    // Build container with mock services
    diContainer = buildContainer({
      packageInfoProvider,
      configProvider,
      loggingService: mockLoggingService,
      safeDeletionService: mockSafeDeletionService,
    });

    // Get MCP server from container
    mcpServer = diContainer.getMCPServer();
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
    it('should create MCP server with dependencies from container', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(SafeFileDeletionMCPServer);
    });

    it('should support dependency injection with mock services', () => {
      const loggingService = diContainer.getLoggingService();
      expect(loggingService).toBe(mockLoggingService);

      expect(configProvider).toBeDefined();
      expect(configProvider.getAllowedDirectories()).toContain(testDir);
    });
  });

  describe('Mock Services Integration', () => {
    it('should use mock logging service for operations', async () => {
      const initialLogCount = mockLoggingService.getLogCount();

      await mockLoggingService.logDeletion('/test/file.txt', 'success');

      expect(mockLoggingService.getLogCount()).toBe(initialLogCount + 1);

      const logs = await mockLoggingService.getRecentLogs(1);
      expect(logs[0]?.paths).toContain('/test/file.txt');
      expect(logs[0]?.result).toBe('success');
    });
  });

  describe('Server Lifecycle', () => {
    it('should handle graceful shutdown', async () => {
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await mcpServer.stop();
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    it('should create independent server instances from different containers', async () => {
      const server1 = diContainer.getMCPServer();

      const container2 = buildContainer({
        packageInfoProvider,
        configProvider,
        loggingService: new MockLoggingService(),
        safeDeletionService: new MockSafeDeletionService([testDir]),
      });

      const server2 = container2.getMCPServer();

      expect(server1).not.toBe(server2);
      expect(server1).toBeInstanceOf(SafeFileDeletionMCPServer);
      expect(server2).toBeInstanceOf(SafeFileDeletionMCPServer);
    });
  });
});
