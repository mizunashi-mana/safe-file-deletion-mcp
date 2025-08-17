import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigProviderImpl, type Configuration } from '@/services/ConfigProvider.js';
import { ProtectionEngineImpl } from '@/services/ProtectionEngine.js';
import { ListProtectedHandler } from '@/services/tools/ListProtectedHandler.js';
import type { LoggingService } from '@/services/LoggingService.js';

// Helper function to safely parse and validate JSON response
function parseProtectedPatternsResponse(jsonText: string): { patterns: string[] } {
  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed === 'object' && parsed !== null && 'patterns' in parsed) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.patterns) && obj.patterns.every((item): item is string => typeof item === 'string')) {
      return { patterns: obj.patterns };
    }
  }
  throw new Error('Invalid response format: expected object with patterns array of strings');
}

describe('ListProtectedHandler', () => {
  let listProtectedHandler: ListProtectedHandler;
  let configProvider: ConfigProviderImpl;
  let protectionEngine: ProtectionEngineImpl;
  let mockLoggingService: LoggingService;

  beforeEach(() => {
    // Create real ConfigProvider with test configuration
    const testConfig: Configuration = {
      allowedDirectories: ['/tmp'],
      protectedPatterns: ['.git', 'node_modules', '*.log', '.env'],
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

    listProtectedHandler = new ListProtectedHandler(
      protectionEngine,
      mockLoggingService,
    );
  });

  afterEach(() => {
    protectionEngine.dispose();
  });

  describe('Successful Operations', () => {
    it('should successfully return protected patterns', async () => {
      const result = await listProtectedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
      expect(parsedContent.patterns).toHaveLength(4);
      expect(parsedContent.patterns).toContain('.git');
      expect(parsedContent.patterns).toContain('node_modules');
      expect(parsedContent.patterns).toContain('*.log');
      expect(parsedContent.patterns).toContain('.env');

      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('list_protected', 'success');
    });

    it('should handle empty protected patterns list', async () => {
      const emptyConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: [],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const emptyConfigProvider = new ConfigProviderImpl(emptyConfig);
      const emptyProtectionEngine = new ProtectionEngineImpl(emptyConfigProvider);
      const emptyHandler = new ListProtectedHandler(
        emptyProtectionEngine,
        mockLoggingService,
      );

      const result = await emptyHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
      expect(parsedContent.patterns).toHaveLength(0);
      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('list_protected', 'success');

      emptyProtectionEngine.dispose();
    });

    it('should handle single protected pattern', async () => {
      const singleConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['.git'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const singleConfigProvider = new ConfigProviderImpl(singleConfig);
      const singleProtectionEngine = new ProtectionEngineImpl(singleConfigProvider);
      const singleHandler = new ListProtectedHandler(
        singleProtectionEngine,
        mockLoggingService,
      );

      const result = await singleHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
      expect(parsedContent.patterns).toHaveLength(1);
      expect(parsedContent.patterns).toContain('.git');

      singleProtectionEngine.dispose();
    });

    it('should handle multiple protected patterns', async () => {
      const multiConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['.git', 'node_modules', '*.env', '*.key', 'secrets/*'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const multiConfigProvider = new ConfigProviderImpl(multiConfig);
      const multiProtectionEngine = new ProtectionEngineImpl(multiConfigProvider);
      const multiHandler = new ListProtectedHandler(
        multiProtectionEngine,
        mockLoggingService,
      );

      const result = await multiHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
      expect(parsedContent.patterns).toHaveLength(5);
      expect(parsedContent.patterns).toContain('.git');
      expect(parsedContent.patterns).toContain('node_modules');
      expect(parsedContent.patterns).toContain('*.env');
      expect(parsedContent.patterns).toContain('*.key');
      expect(parsedContent.patterns).toContain('secrets/*');

      multiProtectionEngine.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should handle logging service errors', async () => {
      const loggingError = new Error('Logging failed');
      vi.mocked(mockLoggingService.logOperation).mockRejectedValue(loggingError);

      await expect(listProtectedHandler.handle()).rejects.toThrow(McpError);
      expect(mockLoggingService.logError).toHaveBeenCalledWith(loggingError, 'list_protected tool');
    });

    it('should handle protection engine errors', async () => {
      // Spy on the getProtectedPatterns method to simulate an error
      const engineSpy = vi.spyOn(protectionEngine, 'getProtectedPatterns').mockImplementation(() => {
        throw new Error('Protection engine failed');
      });

      await expect(listProtectedHandler.handle()).rejects.toThrow(McpError);
      expect(mockLoggingService.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'list_protected tool',
      );

      engineSpy.mockRestore();
    });

    it('should handle logging failure during error handling gracefully', async () => {
      const loggingError = new Error('Logging failed');
      vi.mocked(mockLoggingService.logError).mockRejectedValue(new Error('Log error failed'));
      vi.mocked(mockLoggingService.logOperation).mockRejectedValue(loggingError);

      // When logError also fails, the original logError failure is thrown
      await expect(listProtectedHandler.handle()).rejects.toThrow('Log error failed');
    });

    it('should handle non-Error exceptions', async () => {
      vi.spyOn(protectionEngine, 'getProtectedPatterns').mockImplementation(() => {
        throw new Error('String error');
      });

      await expect(listProtectedHandler.handle()).rejects.toThrow(McpError);
      await expect(listProtectedHandler.handle()).rejects.toThrow('Failed to list protected patterns: String error');
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted response structure', async () => {
      const result = await listProtectedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
    });

    it('should format response with patterns array', async () => {
      const result = await listProtectedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent).toHaveProperty('patterns');
      expect(Array.isArray(parsedContent.patterns)).toBe(true);
      expect(parsedContent.patterns).toContain('.git');
      expect(parsedContent.patterns).toContain('node_modules');
      expect(parsedContent.patterns).toContain('*.log');
      expect(parsedContent.patterns).toContain('.env');
    });

    it('should return correct number of patterns', async () => {
      const result = await listProtectedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent.patterns).toHaveLength(4);
    });
  });

  describe('Service Integration', () => {
    it('should call logging service with correct parameters', async () => {
      await listProtectedHandler.handle();

      expect(mockLoggingService.logOperation).toHaveBeenCalledWith('list_protected', 'success');
      expect(mockLoggingService.logOperation).toHaveBeenCalledTimes(1);
    });

    it('should get patterns from protection engine', async () => {
      const engineSpy = vi.spyOn(protectionEngine, 'getProtectedPatterns');

      await listProtectedHandler.handle();

      expect(engineSpy).toHaveBeenCalled();
      expect(engineSpy).toHaveBeenCalledTimes(1);

      engineSpy.mockRestore();
    });

    it('should use actual configuration values', async () => {
      const result = await listProtectedHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      // Should reflect the actual configured patterns
      expect(parsedContent.patterns).toContain('.git');
      expect(parsedContent.patterns).toContain('node_modules');
      expect(parsedContent.patterns).toContain('*.log');
      expect(parsedContent.patterns).toContain('.env');
    });

    it('should reflect changes in configuration', async () => {
      // Create a different configuration
      const newConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['custom_pattern', '*.secret'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const newConfigProvider = new ConfigProviderImpl(newConfig);
      const newProtectionEngine = new ProtectionEngineImpl(newConfigProvider);
      const newHandler = new ListProtectedHandler(
        newProtectionEngine,
        mockLoggingService,
      );

      const result = await newHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent.patterns).toHaveLength(2);
      expect(parsedContent.patterns).toContain('custom_pattern');
      expect(parsedContent.patterns).toContain('*.secret');

      newProtectionEngine.dispose();
    });
  });

  describe('Pattern Types', () => {
    it('should handle glob patterns correctly', async () => {
      const globConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['*.txt', '*.log', '**/*.config'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const globConfigProvider = new ConfigProviderImpl(globConfig);
      const globProtectionEngine = new ProtectionEngineImpl(globConfigProvider);
      const globHandler = new ListProtectedHandler(
        globProtectionEngine,
        mockLoggingService,
      );

      const result = await globHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent.patterns).toContain('*.txt');
      expect(parsedContent.patterns).toContain('*.log');
      expect(parsedContent.patterns).toContain('**/*.config');

      globProtectionEngine.dispose();
    });

    it('should handle directory patterns correctly', async () => {
      const dirConfig: Configuration = {
        allowedDirectories: ['/tmp'],
        protectedPatterns: ['node_modules/', 'dist/', '.git/'],
        logLevel: 'info',
        logDirectory: '/tmp/logs',
        maxBatchSize: 100,
      };
      const dirConfigProvider = new ConfigProviderImpl(dirConfig);
      const dirProtectionEngine = new ProtectionEngineImpl(dirConfigProvider);
      const dirHandler = new ListProtectedHandler(
        dirProtectionEngine,
        mockLoggingService,
      );

      const result = await dirHandler.handle();

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = parseProtectedPatternsResponse(result.content[0]!.text);
      expect(parsedContent.patterns).toContain('node_modules/');
      expect(parsedContent.patterns).toContain('dist/');
      expect(parsedContent.patterns).toContain('.git/');

      dirProtectionEngine.dispose();
    });
  });
});
