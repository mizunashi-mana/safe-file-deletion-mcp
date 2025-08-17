import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigProviderImpl } from '@/services/ConfigProvider.js';
import { LoggingServiceImpl } from '@/services/LoggingService.js';
import { type Configuration, DEFAULT_CONFIG } from '@/types/index.js';

describe('LoggingService', () => {
  let loggingService: LoggingServiceImpl;
  let tempLogDir: string;
  let configProvider: ConfigProviderImpl;

  beforeEach(async () => {
    // Create temporary directory for test logs
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-service-test-'));

    configProvider = new ConfigProviderImpl({
      ...DEFAULT_CONFIG,
      logLevel: 'info',
      logDirectory: tempLogDir,
    });

    loggingService = new LoggingServiceImpl(configProvider);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  describe('Operation Logging', () => {
    it('should log successful deletion operations', async () => {
      const filePath = '/test/file.txt';

      await loggingService.logDeletion(filePath, 'success');

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'delete',
        paths: [filePath],
        result: 'success',
      });
      expect(logs[0]!.timestamp).toBeInstanceOf(Date);
      expect(logs[0]!.requestId).toBeDefined();
    });

    it('should log failed deletion operations with error details', async () => {
      const filePath = '/test/nonexistent.txt';
      const errorMessage = 'File not found';

      await loggingService.logDeletion(filePath, 'failed', errorMessage);

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'delete',
        paths: [filePath],
        result: 'failed',
        reason: errorMessage,
      });
    });

    it('should log rejected deletion operations with rejection reason', async () => {
      const filePath = '/test/.git/config';
      const rejectionReason = 'Path matches protected pattern: .git';

      await loggingService.logDeletion(filePath, 'rejected', rejectionReason);

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'delete',
        paths: [filePath],
        result: 'rejected',
        reason: rejectionReason,
      });
    });

    it('should log list_protected operations', async () => {
      await loggingService.logOperation('list_protected', 'success');

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'list_protected',
        result: 'success',
      });
      expect(logs[0]!.paths).toBeUndefined();
    });

    it('should log get_allowed operations', async () => {
      await loggingService.logOperation('get_allowed', 'success');

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'get_allowed',
        result: 'success',
      });
    });
  });

  describe('Error Logging', () => {
    it('should log system errors with detailed context', async () => {
      const error = new Error('System failure');
      const context = 'File deletion operation';

      await loggingService.logError(error, context);

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'delete',
        result: 'failed',
        reason: `${context}: ${error.message}`,
      });
    });

    it('should log errors with stack trace in debug mode', async () => {
      const debugConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'debug' as const,
        logDirectory: tempLogDir,
      });
      const debugLoggingService = new LoggingServiceImpl(debugConfigProvider);

      const error = new Error('Debug error');
      error.stack = 'Error: Debug error\\n    at test';

      await debugLoggingService.logError(error, 'Debug context');

      const logs = await debugLoggingService.getRecentLogs(1);
      expect(logs[0]!.reason).toContain(error.stack);
    });
  });

  describe('Server Start Logging', () => {
    it('should log server startup with configuration details', async () => {
      const startupConfig: Configuration = {
        allowedDirectories: ['/home/user/projects'],
        protectedPatterns: ['.git', '*.env'],
        logLevel: 'info',
        maxBatchSize: 50,
      };

      await loggingService.logServerStart(startupConfig);

      const logs = await loggingService.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        operation: 'get_allowed',
        result: 'success',
        reason: expect.stringContaining('Server started') as unknown,
      });
      expect(logs[0]!.reason).toContain('/home/user/projects');
      expect(logs[0]!.reason).toContain('.git');
      expect(logs[0]!.reason).toContain('*.env');
    });
  });

  describe('Structured Logging (JSON Format)', () => {
    it('should write logs in JSON format to file', async () => {
      // Create a fresh temp directory and service for this test
      const freshTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-service-fresh-'));
      const freshConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        logDirectory: freshTempDir,
      });
      const freshService = new LoggingServiceImpl(freshConfigProvider);

      await freshService.logDeletion('/test/file.txt', 'success');

      // Force flush to ensure log is written

      const logFiles = await fs.readdir(freshTempDir);
      expect(logFiles).toHaveLength(1);

      const logContent = await fs.readFile(path.join(freshTempDir, logFiles[0]!), 'utf-8');
      const logLines = logContent.trim().split('\n').filter(line => line.length > 0);

      expect(logLines).toHaveLength(1);
      const logEntry = JSON.parse(logLines[0]!) as unknown;

      expect(logEntry).toMatchObject({
        timestamp: expect.any(String) as unknown,
        operation: 'delete',
        paths: ['/test/file.txt'],
        result: 'success',
        requestId: expect.any(String) as unknown,
      });

      // Clean up
      await fs.rm(freshTempDir, { recursive: true, force: true });
    });

    it('should append multiple log entries to the same file', async () => {
      // Create a fresh temp directory and service for this test
      const freshTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-service-fresh2-'));
      const freshConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        logDirectory: freshTempDir,
      });
      const freshService = new LoggingServiceImpl(freshConfigProvider);

      await freshService.logDeletion('/test/file1.txt', 'success');
      await freshService.logDeletion('/test/file2.txt', 'failed', 'Permission denied');

      const logFiles = await fs.readdir(freshTempDir);
      const logContent = await fs.readFile(path.join(freshTempDir, logFiles[0]!), 'utf-8');
      const logLines = logContent.trim().split('\n').filter(line => line.length > 0);

      expect(logLines).toHaveLength(2);

      const firstEntryData = JSON.parse(logLines[0]!) as unknown;
      const secondEntryData = JSON.parse(logLines[1]!) as unknown;

      // Type guard for log entry structure
      const isLogEntry = (obj: unknown): obj is { paths: string[]; result: string; reason?: string } => {
        if (typeof obj !== 'object' || obj === null) return false;
        return 'paths' in obj && Array.isArray((obj as { paths?: unknown }).paths)
          && 'result' in obj && typeof (obj as { result?: unknown }).result === 'string';
      };

      expect(isLogEntry(firstEntryData)).toBe(true);
      expect(isLogEntry(secondEntryData)).toBe(true);

      if (!isLogEntry(firstEntryData) || !isLogEntry(secondEntryData)) {
        throw new Error('Invalid log entry format');
      }

      const firstEntry = firstEntryData;
      const secondEntry = secondEntryData;

      expect(firstEntry.paths[0]).toBe('/test/file1.txt');
      expect(firstEntry.result).toBe('success');

      expect(secondEntry.paths[0]).toBe('/test/file2.txt');
      expect(secondEntry.result).toBe('failed');
      expect(secondEntry.reason).toBe('Permission denied');

      // Clean up
      await fs.rm(freshTempDir, { recursive: true, force: true });
    });
  });

  describe('Log Level Control', () => {
    it('should respect debug log level and include all logs', async () => {
      const debugConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'debug' as const,
        logDirectory: tempLogDir,
      });
      const debugService = new LoggingServiceImpl(debugConfigProvider);

      await debugService.logDeletion('/test/file.txt', 'success');
      await debugService.logError(new Error('Debug error'), 'Debug context');

      const logs = await debugService.getRecentLogs(10);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter out debug logs when log level is info', async () => {
      const infoConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info' as const,
        logDirectory: tempLogDir,
      });
      const infoService = new LoggingServiceImpl(infoConfigProvider);

      // This should be included (info level)
      await infoService.logDeletion('/test/file.txt', 'success');

      // This should be filtered out if it's debug level
      await infoService.logDebug('Debug message that should be filtered');

      const logs = await infoService.getRecentLogs(10);
      expect(logs.every(log => log.reason?.includes('Debug message') !== true)).toBe(true);
    });

    it('should include error logs at all log levels', async () => {
      const errorConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'error' as const,
        logDirectory: tempLogDir,
      });
      const errorService = new LoggingServiceImpl(errorConfigProvider);

      await errorService.logError(new Error('Critical error'), 'Error context');

      const logs = await errorService.getRecentLogs(10);
      expect(logs.some(log => log.result === 'failed')).toBe(true);
    });

    it('should include warn logs when log level is warn or lower', async () => {
      const warnConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'warn' as const,
        logDirectory: tempLogDir,
      });
      const warnService = new LoggingServiceImpl(warnConfigProvider);

      await warnService.logDeletion('/test/.git/config', 'rejected', 'Protected pattern');

      const logs = await warnService.getRecentLogs(10);
      expect(logs.some(log => log.result === 'rejected')).toBe(true);
    });
  });

  describe('Timestamp and Request ID Generation', () => {
    it('should generate unique request IDs for each log entry', async () => {
      await loggingService.logDeletion('/test/file1.txt', 'success');
      await loggingService.logDeletion('/test/file2.txt', 'success');

      const logs = await loggingService.getRecentLogs(2);
      expect(logs).toHaveLength(2);
      expect(logs[0]!.requestId).not.toBe(logs[1]!.requestId);
    });

    it('should include accurate timestamps', async () => {
      const beforeLog = new Date();
      await loggingService.logDeletion('/test/file.txt', 'success');
      const afterLog = new Date();

      const logs = await loggingService.getRecentLogs(1);
      const logTimestamp = logs[0]!.timestamp;

      expect(logTimestamp.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(logTimestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });
  });

  describe('Log Retrieval', () => {
    it('should retrieve recent logs in reverse chronological order', async () => {
      await loggingService.logDeletion('/test/file1.txt', 'success');
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
      await loggingService.logDeletion('/test/file2.txt', 'success');

      const logs = await loggingService.getRecentLogs(2);
      expect(logs).toHaveLength(2);
      expect(logs[0]!.paths![0]).toBe('/test/file2.txt'); // Most recent first
      expect(logs[1]!.paths![0]).toBe('/test/file1.txt');
    });

    it('should limit the number of retrieved logs', async () => {
      for (let i = 0; i < 5; i++) {
        await loggingService.logDeletion(`/test/file${i}.txt`, 'success');
      }

      const logs = await loggingService.getRecentLogs(3);
      expect(logs).toHaveLength(3);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate log files when they exceed size limit', async () => {
      // Create a service with a very small size limit for testing
      const rotationTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-rotation-'));
      const rotationConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        maxLogFileSize: 200, // 200 bytes
        logDirectory: rotationTempDir,
      });
      const rotationService = new LoggingServiceImpl(rotationConfigProvider);

      // Log enough entries to exceed the size limit
      for (let i = 0; i < 5; i++) {
        await rotationService.logDeletion(`/test/file${i}.txt`, 'success');
      }

      const logFiles = await fs.readdir(rotationTempDir);
      expect(logFiles.length).toBeGreaterThan(1); // Should have created multiple log files

      // Clean up
      await fs.rm(rotationTempDir, { recursive: true, force: true });
    });

    it('should keep only the specified number of rotated log files', async () => {
      const rotationTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-rotation2-'));
      const rotationConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        maxLogFileSize: 100, // Very small to force rotation
        maxLogFiles: 3,
        logDirectory: rotationTempDir,
      });
      const rotationService = new LoggingServiceImpl(rotationConfigProvider);

      // Generate enough logs to create more than 3 files
      for (let i = 0; i < 10; i++) {
        await rotationService.logDeletion(`/test/file${i}.txt`, 'success');
        // Small delay to ensure different timestamps for file names
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Wait a bit for all async cleanup operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const logFiles = await fs.readdir(rotationTempDir);

      // Should have no more than maxLogFiles (3), but we allow 1 extra because
      // the current active file might push it over temporarily
      expect(logFiles.length).toBeLessThanOrEqual(4);

      // Clean up
      await fs.rm(rotationTempDir, { recursive: true, force: true });
    });

    it('should preserve log content during rotation', async () => {
      const rotationTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-rotation3-'));
      const rotationConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        maxLogFileSize: 300,
        logDirectory: rotationTempDir,
      });
      const rotationService = new LoggingServiceImpl(rotationConfigProvider);

      const logMessages = ['/test/file1.txt', '/test/file2.txt', '/test/file3.txt'];

      for (const message of logMessages) {
        await rotationService.logDeletion(message, 'success');
      }

      const logFiles = await fs.readdir(rotationTempDir);
      const allLoggedPaths: string[] = [];

      // Read all log files and collect all logged paths
      for (const fileName of logFiles) {
        const content = await fs.readFile(path.join(rotationTempDir, fileName), 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        for (const line of lines) {
          const entryData = JSON.parse(line) as unknown;

          // Type guard for log entry with paths
          const hasPathsArray = (obj: unknown): obj is { paths: string[] } => {
            if (typeof obj !== 'object' || obj === null) return false;
            return 'paths' in obj && Array.isArray((obj as { paths?: unknown }).paths);
          };

          if (hasPathsArray(entryData) && entryData.paths[0] !== undefined) {
            allLoggedPaths.push(entryData.paths[0]);
          }
        }
      }

      // Verify all messages were logged
      for (const expectedPath of logMessages) {
        expect(allLoggedPaths).toContain(expectedPath);
      }

      // Clean up
      await fs.rm(rotationTempDir, { recursive: true, force: true });
    });
  });

  describe('Error Handling and Security', () => {
    it('should handle file system errors gracefully', async () => {
      // Try to create a service with a non-writable directory
      const readOnlyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'readonly-'));
      await fs.chmod(readOnlyDir, 0o444); // Read-only

      const errorConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        logDirectory: readOnlyDir,
      });
      const errorService = new LoggingServiceImpl(errorConfigProvider);

      // This should not throw an error, but should handle it gracefully
      await expect(errorService.logDeletion('/test/file.txt', 'success')).resolves.not.toThrow();

      // Clean up
      await fs.chmod(readOnlyDir, 0o755); // Restore permissions for cleanup
      await fs.rm(readOnlyDir, { recursive: true, force: true });
    });

    it('should not log sensitive information', async () => {
      const securityTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-security-'));
      const securityConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        logDirectory: securityTempDir,
      });
      const securityService = new LoggingServiceImpl(securityConfigProvider);

      // Log a path that might contain sensitive information
      const sensitivePath = '/home/user/.ssh/id_rsa';
      await securityService.logDeletion(sensitivePath, 'rejected', 'Protected pattern');

      const logFiles = await fs.readdir(securityTempDir);
      const logContent = await fs.readFile(path.join(securityTempDir, logFiles[0]!), 'utf-8');

      // The path should be logged as it's part of the operation audit
      // but ensure no additional sensitive details are leaked
      expect(logContent).toContain(sensitivePath);
      expect(logContent).not.toContain('password');
      expect(logContent).not.toContain('secret');
      expect(logContent).not.toContain('token');

      // Clean up
      await fs.rm(securityTempDir, { recursive: true, force: true });
    });

    it('should handle corrupted log files during rotation', async () => {
      const corruptionTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-corruption-'));
      const corruptionConfigProvider = new ConfigProviderImpl({
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        logDirectory: corruptionTempDir,
      });
      const corruptionService = new LoggingServiceImpl(corruptionConfigProvider);

      // Create a corrupted log file
      const corruptedFile = path.join(corruptionTempDir, 'corrupted.log');
      await fs.writeFile(corruptedFile, 'This is not valid JSON\\n');

      // This should not crash the service
      await expect(corruptionService.logDeletion('/test/file.txt', 'success')).resolves.not.toThrow();

      // Clean up
      await fs.rm(corruptionTempDir, { recursive: true, force: true });
    });
  });
});
