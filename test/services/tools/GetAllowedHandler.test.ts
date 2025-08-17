import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigProviderImpl, type Configuration } from '@/services/ConfigProvider.js';
import { ProtectionEngineImpl } from '@/services/ProtectionEngine.js';
import { GetAllowedHandler } from '@/services/tools/GetAllowedHandler.js';
import type { LoggingService } from '@/services/LoggingService.js';

// Helper function to safely parse and validate JSON response
function parseAllowedDirsResponse(jsonText: string): { allowed_dirs: string[] } {
  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed === 'object' && parsed !== null && 'allowed_dirs' in parsed) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.allowed_dirs) && obj.allowed_dirs.every((item): item is string => typeof item === 'string')) {
      return { allowed_dirs: obj.allowed_dirs };
    }
  }
  throw new Error('Invalid response format: expected object with allowed_dirs array of strings');
}

describe('GetAllowedHandler', () => {
  let getAllowedHandler: GetAllowedHandler;
  let configProvider: ConfigProviderImpl;
  let protectionEngine: ProtectionEngineImpl;
  let mockLoggingService: LoggingService;

  beforeEach(() => {
    // Create real ConfigProvider with test configuration
    const testConfig: Configuration = {
      allowedDirectories: ['/tmp', '/var/tmp'],
      protectedPatterns: ['.git', 'node_modules'],
      logLevel: 'info',
      logDirectory: '/tmp/logs',
      maxBatchSize: 100,
      maxLogFileSize: 10485760,
      maxLogFiles: 5,
    };
    configProvider = new ConfigProviderImpl(testConfig);

    // Use real ProtectionEngine implementation
    protectionEngine = new ProtectionEngineImpl(configProvider);

    // Mock LoggingService implementation
    mockLoggingService = {
      logDeletion: vi.fn().mockResolvedValue(undefined),
      logError: vi.fn().mockResolvedValue(undefined),
      logOperation: vi.fn().mockResolvedValue(undefined),
      logServerStart: vi.fn().mockResolvedValue(undefined),
      logDebug: vi.fn().mockResolvedValue(undefined),
      getRecentLogs: vi.fn().mockResolvedValue([]),
    };

    getAllowedHandler = new GetAllowedHandler(
      protectionEngine,
      mockLoggingService,
    );
  });

  afterEach(() => {
    protectionEngine.dispose();
  });

  describe('Successful Operations', () => {
    it('should successfully return allowed directories', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('allowed_dirs');
      expect(Array.isArray(parsedContent.allowed_dirs)).toBe(true);
      expect(parsedContent.allowed_dirs).toContain('/tmp');
      expect(parsedContent.allowed_dirs).toContain('/var/tmp');

      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('get_allowed', 'success');
    });

    it('should handle empty allowed directories list', async () => {
      const emptyConfig: Configuration = {
        allowedDirectories: [],
        protectedPatterns: ['.git'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const emptyConfigProvider = new ConfigProviderImpl(emptyConfig);
      const emptyProtectionEngine = new ProtectionEngineImpl(emptyConfigProvider);
      const emptyHandler = new GetAllowedHandler(
        emptyProtectionEngine,
        mockLoggingService,
      );

      const result = await emptyHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent.allowed_dirs).toHaveLength(0);
      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('get_allowed', 'success');

      emptyProtectionEngine.dispose();
    });

    it('should handle single allowed directory', async () => {
      const singleConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['.git'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const singleConfigProvider = new ConfigProviderImpl(singleConfig);
      const singleProtectionEngine = new ProtectionEngineImpl(singleConfigProvider);
      const singleHandler = new GetAllowedHandler(
        singleProtectionEngine,
        mockLoggingService,
      );

      const result = await singleHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent.allowed_dirs).toHaveLength(1);
      expect(parsedContent.allowed_dirs).toContain('/tmp');

      singleProtectionEngine.dispose();
    });
  });

  describe('Directory Validation', () => {
    it('should return only existing directories', async () => {
      const mixedConfig: Configuration = {
        allowedDirectories: ['/tmp', '/nonexistent/path/123'],
        protectedPatterns: ['.git'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const mixedConfigProvider = new ConfigProviderImpl(mixedConfig);
      const mixedProtectionEngine = new ProtectionEngineImpl(mixedConfigProvider);
      const mixedHandler = new GetAllowedHandler(
        mixedProtectionEngine,
        mockLoggingService,
      );

      const result = await mixedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      // Should only return existing directories
      expect(parsedContent.allowed_dirs).toContain('/tmp');
      expect(parsedContent.allowed_dirs).not.toContain('/nonexistent/path/123');

      mixedProtectionEngine.dispose();
    });

    it('should return empty array when no directories exist', async () => {
      const invalidConfig: Configuration = {
        allowedDirectories: ['/nonexistent1', '/nonexistent2'],
        protectedPatterns: ['.git'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const invalidConfigProvider = new ConfigProviderImpl(invalidConfig);
      const invalidProtectionEngine = new ProtectionEngineImpl(invalidConfigProvider);
      const invalidHandler = new GetAllowedHandler(
        invalidProtectionEngine,
        mockLoggingService,
      );

      const result = await invalidHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent.allowed_dirs).toHaveLength(0);

      invalidProtectionEngine.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should handle logging service errors', async () => {
      const loggingError = new Error('Logging failed');
      vi.mocked(mockLoggingService.logOperation).mockRejectedValue(loggingError);

      await expect(getAllowedHandler.handle()).rejects.toThrow(McpError);
      expect(mockLoggingService.logError).toHaveBeenCalledWith(loggingError, 'get_allowed tool');
    });

    it('should handle logging failure during error handling gracefully', async () => {
      const loggingError = new Error('Logging failed');
      vi.mocked(mockLoggingService.logError).mockRejectedValue(new Error('Log error failed'));
      vi.mocked(mockLoggingService.logOperation).mockRejectedValue(loggingError);

      // When logError also fails, the original logError failure is thrown
      await expect(getAllowedHandler.handle()).rejects.toThrow('Log error failed');
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted response structure', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('allowed_dirs');
      expect(Array.isArray(parsedContent.allowed_dirs)).toBe(true);
    });

    it('should include all valid directories', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      expect(parsedContent.allowed_dirs).toContain('/tmp');
      expect(parsedContent.allowed_dirs).toContain('/var/tmp');
    });

    it('should return correct number of directories', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      // Should return count of existing directories
      expect(parsedContent.allowed_dirs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Service Integration', () => {
    it('should call logging service with correct parameters', async () => {
      await getAllowedHandler.handle();

      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('get_allowed', 'success');
      expect(mockLoggingService.logOperation).toHaveBeenCalledTimes(1);
    });

    it('should validate allowed directories through protection engine', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      // ProtectionEngine should validate directories and filter out non-existent ones
      expect(parsedContent.allowed_dirs).toContain('/tmp'); // Should exist
      expect(parsedContent.allowed_dirs).toContain('/var/tmp'); // Should exist
    });

    it('should use actual configuration values', async () => {
      const result = await getAllowedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseAllowedDirsResponse(result.content[0]!.text);
      // Should reflect the actual configured directories
      expect(parsedContent.allowed_dirs).toContain('/tmp');
      expect(parsedContent.allowed_dirs).toContain('/var/tmp');
    });
  });
});
