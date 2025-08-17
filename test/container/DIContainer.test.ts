import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type DIContainer, buildContainer } from '@/container/DIContainer.js';
import { ConfigProviderImpl, type Configuration } from '@/services/ConfigProvider.js';
import { loadPackageInfo } from '@/services/PackageInfoProvider.js';
import { MockLoggingService } from '@~test/mocks/MockLoggingService.js';
import { MockSafeDeletionService } from '@~test/mocks/MockSafeDeletionService.js';
import type { PackageInfoProvider } from '@/services/PackageInfoProvider.js';

describe('DIContainer', () => {
  let diContainer: DIContainer;
  let packageInfoProvider: PackageInfoProvider;
  let mockLoggingService: MockLoggingService;
  let mockSafeDeletionService: MockSafeDeletionService;

  beforeEach(async () => {
    // Load package info
    packageInfoProvider = await loadPackageInfo();

    // Create mock services
    mockLoggingService = new MockLoggingService();
    mockSafeDeletionService = new MockSafeDeletionService(['/tmp']);

    // Create test configuration
    const testConfig: Configuration = {
      allowedDirectories: ['/tmp'],
      protectedPatterns: ['.git', 'node_modules'],
      logLevel: 'info',
      logDirectory: '/tmp/logs',
      maxBatchSize: 100,
      maxLogFileSize: 10485760,
      maxLogFiles: 5,
    };
    const configProvider = new ConfigProviderImpl(testConfig);

    // Build container with mock services
    diContainer = buildContainer({
      packageInfoProvider,
      configProvider,
      loggingService: mockLoggingService,
      safeDeletionService: mockSafeDeletionService,
    });
  });

  afterEach(() => {
    // Clean up any resources if needed
  });

  describe('Service Resolution', () => {
    it('should successfully resolve MCP Server without errors', () => {
      expect(() => {
        const mcpServer = diContainer.getMCPServer();
        expect(mcpServer).toBeDefined();
      }).not.toThrow();
    });

    it('should successfully resolve injected LoggingService', () => {
      const loggingService = diContainer.getLoggingService();
      expect(loggingService).toBeDefined();
      expect(loggingService).toBe(mockLoggingService);
    });

    it('should successfully resolve PackageInfoProvider without errors', () => {
      expect(() => {
        const packageInfo = diContainer.getPackageInfoProvider();
        expect(packageInfo).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Container Build', () => {
    it('should build container with injected services without errors', () => {
      expect(() => {
        const testConfig: Configuration = {
          allowedDirectories: ['/tmp'],
          protectedPatterns: ['.git'],
          logLevel: 'info',
          logDirectory: '/tmp/logs',
          maxBatchSize: 100,
        };
        const configProvider = new ConfigProviderImpl(testConfig);

        buildContainer({
          packageInfoProvider,
          configProvider,
          loggingService: mockLoggingService,
          safeDeletionService: mockSafeDeletionService,
        });
      }).not.toThrow();
    });

    it('should build container without optional services', () => {
      expect(() => {
        const testConfig: Configuration = {
          allowedDirectories: ['/tmp'],
          protectedPatterns: ['.git'],
          logLevel: 'info',
          logDirectory: '/tmp/logs',
          maxBatchSize: 100,
        };
        const configProvider = new ConfigProviderImpl(testConfig);

        buildContainer({
          packageInfoProvider,
          configProvider,
        });
      }).not.toThrow();
    });
  });

  describe('Mock Service Integration', () => {
    it('should use injected mock logging service', async () => {
      const loggingService = diContainer.getLoggingService();
      await loggingService.logDeletion('/test/file.txt', 'success');

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.paths).toContain('/test/file.txt');
      expect(logs[0]?.result).toBe('success');
    });
  });
});
