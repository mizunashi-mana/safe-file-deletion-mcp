import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComprehensiveErrorHandler } from '@/core/ComprehensiveErrorHandler.js';
import { ErrorHandler } from '@/core/ErrorHandler.js';
import { LoggingService } from '@/core/LoggingService.js';
import { SafeDeletionError, ErrorType, DEFAULT_CONFIG } from '@/types/index.js';

// Interface for filesystem errors with code property
interface FileSystemError extends Error {
  code: string;
}

// Mock fs module
vi.mock('fs/promises');

describe('ComprehensiveErrorHandler', () => {
  let comprehensiveErrorHandler: ComprehensiveErrorHandler;
  let mockLoggingService: LoggingService;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    mockLoggingService = new LoggingService(DEFAULT_CONFIG);
    errorHandler = new ErrorHandler();
    comprehensiveErrorHandler = new ComprehensiveErrorHandler(
      errorHandler,
      mockLoggingService,
    );

    // Mock logging methods
    vi.spyOn(mockLoggingService, 'logError').mockResolvedValue();
  });

  describe('File System Error Handling', () => {
    it('should handle ENOENT error gracefully', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('ENOENT: no such file or directory, unlink \'/nonexistent/file.txt\''),
        { code: 'ENOENT' },
      );

      const result = await comprehensiveErrorHandler.handleFileSystemError(
        fsError,
        '/nonexistent/file.txt',
        'delete',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.FILE_NOT_FOUND);
        expect(result.error.path).toBe('/nonexistent/file.txt');
      }

      expect(mockLoggingService.logError).toHaveBeenCalledWith(
        expect.any(SafeDeletionError),
        'File system error during delete operation',
      );
    });

    it('should handle EACCES error gracefully', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EACCES: permission denied, unlink \'/protected/file\''),
        { code: 'EACCES' },
      );

      const result = await comprehensiveErrorHandler.handleFileSystemError(
        fsError,
        '/protected/file',
        'delete',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.PERMISSION_DENIED);
        expect(result.error.path).toBe('/protected/file');
      }
    });

    it('should handle EPERM error gracefully', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EPERM: operation not permitted, rmdir \'/system/dir\''),
        { code: 'EPERM' },
      );

      const result = await comprehensiveErrorHandler.handleFileSystemError(
        fsError,
        '/system/dir',
        'rmdir',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.PERMISSION_DENIED);
      }
    });

    it('should handle EBUSY error gracefully', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EBUSY: resource busy or locked, unlink \'/locked/file\''),
        { code: 'EBUSY' },
      );

      const result = await comprehensiveErrorHandler.handleFileSystemError(
        fsError,
        '/locked/file',
        'delete',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.SYSTEM_ERROR);
        expect(result.error.message).toContain('resource busy');
      }
    });

    it('should handle unknown file system errors', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('Unknown file system error'),
        { code: 'EUNKNOWN' },
      );

      const result = await comprehensiveErrorHandler.handleFileSystemError(
        fsError,
        '/some/path',
        'delete',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.SYSTEM_ERROR);
      }
    });
  });

  describe('Permission Error Handling', () => {
    it('should detect and handle read-only file system errors', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EROFS: read-only file system, unlink \'/readonly/file\''),
        { code: 'EROFS' },
      );

      const result = await comprehensiveErrorHandler.handlePermissionError(
        fsError,
        '/readonly/file',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.PERMISSION_DENIED);
        expect(result.error.message).toContain('Read-only');
      }
    });

    it('should handle insufficient privileges errors', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EPERM: operation not permitted'),
        { code: 'EPERM' },
      );

      const result = await comprehensiveErrorHandler.handlePermissionError(
        fsError,
        '/admin/file',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SafeDeletionError);
      if (result.error instanceof SafeDeletionError) {
        expect(result.error.type).toBe(ErrorType.PERMISSION_DENIED);
        expect(result.error.message).toContain('Insufficient privileges');
      }
    });

    it('should provide recovery suggestions for permission errors', async () => {
      const fsError: FileSystemError = Object.assign(
        new Error('EACCES: permission denied'),
        { code: 'EACCES' },
      );

      const result = await comprehensiveErrorHandler.handlePermissionError(
        fsError,
        '/restricted/file',
      );

      expect(result.recoverySuggestion).toBeDefined();
      expect(result.recoverySuggestion).toContain('check file permissions');
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should attempt retry for transient errors', async () => {
      const transientError: FileSystemError = Object.assign(
        new Error('EBUSY: resource busy or locked'),
        { code: 'EBUSY' },
      );

      let callCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw transientError;
        }
        return { success: true };
      });

      const result = await comprehensiveErrorHandler.executeWithRetry(
        mockOperation,
        '/busy/file',
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(result.success).toBe(true);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-transient errors', async () => {
      const permanentError: FileSystemError = Object.assign(
        new Error('ENOENT: no such file or directory'),
        { code: 'ENOENT' },
      );

      const mockOperation = vi.fn().mockRejectedValue(permanentError);

      const result = await comprehensiveErrorHandler.executeWithRetry(
        mockOperation,
        '/nonexistent/file',
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(result.success).toBe(false);
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retry for ENOENT
    });

    it('should respect maximum retry attempts', async () => {
      const transientError: FileSystemError = Object.assign(
        new Error('EBUSY: resource busy or locked'),
        { code: 'EBUSY' },
      );

      const mockOperation = vi.fn().mockRejectedValue(transientError);

      const result = await comprehensiveErrorHandler.executeWithRetry(
        mockOperation,
        '/busy/file',
        { maxRetries: 2, retryDelay: 10 },
      );

      expect(result.success).toBe(false);
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Error Message Generation', () => {
    it('should generate context-aware error messages', () => {
      const error = new SafeDeletionError(
        ErrorType.PERMISSION_DENIED,
        'Permission denied',
        '/restricted/file.txt',
      );

      const message = comprehensiveErrorHandler.generateContextualMessage(
        error,
        'batch deletion',
      );

      expect(message).toContain('batch deletion');
      expect(message).toContain('/restricted/file.txt');
      expect(message).toContain('permission');
    });

    it('should generate actionable error messages', () => {
      const error = new SafeDeletionError(
        ErrorType.PROTECTION_VIOLATION,
        'Path matches protected pattern: .git',
        '/project/.git/config',
      );

      const message = comprehensiveErrorHandler.generateActionableMessage(error);

      expect(message).toContain('protected pattern');
      expect(message).toContain('cannot be deleted');
      expect(message).toContain('review the protected patterns');
    });

    it('should include recovery suggestions in error messages', () => {
      const error = new SafeDeletionError(
        ErrorType.FILE_NOT_FOUND,
        'File does not exist',
        '/missing/file.txt',
      );

      const message = comprehensiveErrorHandler.generateRecoveryMessage(error);

      expect(message).toContain('Verify the file path');
      expect(message).toContain('/missing/file.txt');
    });
  });

  describe('Error Logging Integration', () => {
    it('should log errors with appropriate context', async () => {
      const error = new SafeDeletionError(
        ErrorType.SYSTEM_ERROR,
        'System error occurred',
        '/system/file',
      );

      await comprehensiveErrorHandler.logErrorWithContext(
        error,
        'delete operation',
        { userId: 'test-user', operation: 'batch-delete' },
      );

      expect(mockLoggingService.logError).toHaveBeenCalledWith(
        error,
        expect.stringContaining('delete operation'),
      );
    });

    it('should log error recovery attempts', async () => {
      const transientError: FileSystemError = Object.assign(
        new Error('EBUSY: resource busy'),
        { code: 'EBUSY' },
      );

      const mockOperation = vi.fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ success: true });

      await comprehensiveErrorHandler.executeWithRetry(
        mockOperation,
        '/busy/file',
        { maxRetries: 1, retryDelay: 10 },
      );

      expect(mockLoggingService.logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.stringContaining('Retry attempt'),
      );
    });
  });

  describe('Graceful Error Recovery', () => {
    it('should provide graceful degradation for batch operations', async () => {
      const errors = [
        new SafeDeletionError(ErrorType.PERMISSION_DENIED, 'Access denied', '/file1'),
        new SafeDeletionError(ErrorType.FILE_NOT_FOUND, 'Not found', '/file2'),
        new SafeDeletionError(ErrorType.PROTECTION_VIOLATION, 'Protected', '/file3'),
      ];

      const result = comprehensiveErrorHandler.handleBatchErrors(errors);

      expect(result.partialSuccess).toBe(true);
      expect(result.successfulOperations).toBe(0);
      expect(result.failedOperations).toBe(3);
      expect(result.errorsByType).toHaveProperty(ErrorType.PERMISSION_DENIED);
      expect(result.errorsByType).toHaveProperty(ErrorType.FILE_NOT_FOUND);
      expect(result.errorsByType).toHaveProperty(ErrorType.PROTECTION_VIOLATION);
    });

    it('should suggest fallback operations for recoverable errors', () => {
      const error = new SafeDeletionError(
        ErrorType.PERMISSION_DENIED,
        'Permission denied',
        '/protected/file',
      );

      const suggestion = comprehensiveErrorHandler.suggestFallback(error);

      expect(suggestion).toBeDefined();
      expect(suggestion?.type).toBe('permission_fix');
      expect(suggestion?.description).toContain('Change file permissions');
    });

    it('should handle cascading errors gracefully', async () => {
      const primaryError = new SafeDeletionError(
        ErrorType.SYSTEM_ERROR,
        'Primary operation failed',
        '/primary/file',
      );

      const secondaryError = new Error('Cleanup failed');

      const result = await comprehensiveErrorHandler.handleCascadingError(
        primaryError,
        secondaryError,
        'cleanup operation',
      );

      expect(result.primaryError).toBe(primaryError);
      expect(result.secondaryErrors).toContain(secondaryError);
      expect(result.recoveryAction).toBeDefined();
    });
  });
});
