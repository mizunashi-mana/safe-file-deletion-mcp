import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeleteToolHandler } from '@/services/tools/DeleteToolHandler.js';
import type { LoggingService } from '@/services/LoggingService.js';
import type { SafeDeletionService } from '@/services/SafeDeletionService.js';

describe('DeleteToolHandler', () => {
  let deleteToolHandler: DeleteToolHandler;
  let mockSafeDeletionService: SafeDeletionService;
  let mockLoggingService: LoggingService;

  beforeEach(() => {
    // Mock SafeDeletionService implementation
    mockSafeDeletionService = {
      deleteFile: vi.fn(),
      deleteDirectory: vi.fn(),
      deleteBatch: vi.fn(),
      validatePath: vi.fn(),
      validateBatch: vi.fn(),
    };

    // Mock LoggingService implementation
    mockLoggingService = {
      logDeletion: vi.fn().mockResolvedValue(undefined),
      logError: vi.fn().mockResolvedValue(undefined),
      logOperation: vi.fn().mockResolvedValue(undefined),
      logServerStart: vi.fn().mockResolvedValue(undefined),
      logDebug: vi.fn().mockResolvedValue(undefined),
      getRecentLogs: vi.fn().mockResolvedValue([]),
    };

    deleteToolHandler = new DeleteToolHandler(
      mockSafeDeletionService,
      mockLoggingService,
    );
  });

  describe('Single File Operations', () => {
    it('should successfully delete single file', async () => {
      const paths = ['/tmp/test-file.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockResolvedValue({
        success: true,
        path: '/tmp/test-file.txt',
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('Successfully deleted: /tmp/test-file.txt');

      expect(mockSafeDeletionService.deleteFile).toHaveBeenCalledWith('/tmp/test-file.txt');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/test-file.txt', 'success');
    });

    it('should handle single file deletion failure', async () => {
      const paths = ['/tmp/protected.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockResolvedValue({
        success: false,
        path: '/tmp/protected.txt',
        error: 'File is protected',
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Failed to delete /tmp/protected.txt: File is protected');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/protected.txt', 'failed', 'File is protected');
    });

    it('should handle single file rejection', async () => {
      const paths = ['/tmp/protected.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockResolvedValue({
        success: false,
        path: '/tmp/protected.txt',
        reason: 'Protected by policy',
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Failed to delete /tmp/protected.txt: Protected by policy');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/protected.txt', 'rejected', 'Protected by policy');
    });
  });

  describe('Batch Operations', () => {
    it('should successfully handle batch deletion', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt', '/tmp/file3.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt', '/tmp/file3.txt'],
        failed: [{ path: '/tmp/file2.txt', error: 'Permission denied' }],
        rejected: [],
        cancelled: false,
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Batch deletion completed:');
      expect(result.content[0]?.text).toContain('Successfully deleted: 2 files');
      expect(result.content[0]?.text).toContain('Failed: 1 files');
      expect(result.content[0]?.text).toContain('Rejected: 0 files');
      expect(result.content[0]?.text).toContain('Failed files:');
      expect(result.content[0]?.text).toContain('/tmp/file2.txt: Permission denied');

      expect(mockSafeDeletionService.deleteBatch).toHaveBeenCalledWith(paths);
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file1.txt', 'success');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file3.txt', 'success');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file2.txt', 'failed', 'Permission denied');
    });

    it('should handle batch with rejections', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/protected.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt'],
        failed: [],
        rejected: [{ path: '/tmp/protected.txt', reason: 'Protected file' }],
        cancelled: false,
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Successfully deleted: 1 files');
      expect(result.content[0]?.text).toContain('Rejected: 1 files');
      expect(result.content[0]?.text).toContain('Rejected files:');
      expect(result.content[0]?.text).toContain('/tmp/protected.txt: Protected file');

      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/protected.txt', 'rejected', 'Protected file');
    });

    it('should handle cancelled batch operation', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt'],
        failed: [],
        rejected: [],
        cancelled: true,
        reason: 'User cancelled',
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Operation cancelled: User cancelled');
    });

    it('should handle empty batch results', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: [],
        failed: [],
        rejected: [],
        cancelled: false,
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Successfully deleted: 0 files');
      expect(result.content[0]?.text).toContain('Failed: 0 files');
      expect(result.content[0]?.text).toContain('Rejected: 0 files');
    });
  });

  describe('Error Handling', () => {
    it('should handle service exceptions in single file mode', async () => {
      const paths = ['/tmp/file.txt'];
      const serviceError = new Error('Service unavailable');
      vi.mocked(mockSafeDeletionService.deleteFile).mockRejectedValue(serviceError);

      await expect(deleteToolHandler.handle({ paths })).rejects.toThrow(McpError);
      expect(mockLoggingService.logError).toHaveBeenCalledWith(serviceError, 'delete tool');
    });

    it('should handle service exceptions in batch mode', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      const serviceError = new Error('Service unavailable');
      vi.mocked(mockSafeDeletionService.deleteBatch).mockRejectedValue(serviceError);

      await expect(deleteToolHandler.handle({ paths })).rejects.toThrow(McpError);
      expect(mockLoggingService.logError).toHaveBeenCalledWith(serviceError, 'delete tool');
    });

    it('should handle non-Error exceptions', async () => {
      const paths = ['/tmp/file.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockRejectedValue('String error');

      await expect(deleteToolHandler.handle({ paths })).rejects.toThrow(McpError);
    });

    it('should handle logging failures by throwing McpError', async () => {
      const paths = ['/tmp/file.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockResolvedValue({
        success: true,
        path: '/tmp/file.txt',
      });
      vi.mocked(mockLoggingService.logDeletion).mockRejectedValue(new Error('Logging failed'));

      // Should throw McpError when logging fails
      await expect(deleteToolHandler.handle({ paths })).rejects.toThrow(McpError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paths array', async () => {
      const paths: string[] = [];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: [],
        failed: [],
        rejected: [],
        cancelled: false,
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Successfully deleted: 0 files');
      expect(mockSafeDeletionService.deleteBatch).toHaveBeenCalledWith([]);
    });

    it('should handle batch operation with logging errors', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt'],
        failed: [{ path: '/tmp/file2.txt', error: 'Error' }],
        rejected: [],
        cancelled: false,
      });
      vi.mocked(mockLoggingService.logDeletion).mockRejectedValueOnce(new Error('Log failed'));

      // Should throw McpError when logging fails
      await expect(deleteToolHandler.handle({ paths })).rejects.toThrow(McpError);
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted success response', async () => {
      const paths = ['/tmp/file.txt'];
      vi.mocked(mockSafeDeletionService.deleteFile).mockResolvedValue({
        success: true,
        path: '/tmp/file.txt',
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0]?.text).toBe('string');
    });

    it('should return properly formatted batch response', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt'],
        failed: [{ path: '/tmp/file2.txt', error: 'Error' }],
        rejected: [],
        cancelled: false,
      });

      const result = await deleteToolHandler.handle({ paths });

      expect(result.content[0]?.text).toContain('Batch deletion completed:');
      expect(result.content[0]?.text).toContain('- Successfully deleted: 1 files');
      expect(result.content[0]?.text).toContain('- Failed: 1 files');
      expect(result.content[0]?.text).toContain('- Rejected: 0 files');
    });
  });

  describe('Logging Integration', () => {
    it('should log all successful operations in batch', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: ['/tmp/file1.txt', '/tmp/file2.txt'],
        failed: [],
        rejected: [],
        cancelled: false,
      });

      await deleteToolHandler.handle({ paths });

      expect(mockLoggingService.logDeletion).toHaveBeenCalledTimes(2);
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file1.txt', 'success');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file2.txt', 'success');
    });

    it('should log all failed operations in batch', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: [],
        failed: [
          { path: '/tmp/file1.txt', error: 'Error 1' },
          { path: '/tmp/file2.txt', error: 'Error 2' },
        ],
        rejected: [],
        cancelled: false,
      });

      await deleteToolHandler.handle({ paths });

      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file1.txt', 'failed', 'Error 1');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file2.txt', 'failed', 'Error 2');
    });

    it('should log all rejected operations in batch', async () => {
      const paths = ['/tmp/file1.txt', '/tmp/file2.txt'];
      vi.mocked(mockSafeDeletionService.deleteBatch).mockResolvedValue({
        deleted: [],
        failed: [],
        rejected: [
          { path: '/tmp/file1.txt', reason: 'Reason 1' },
          { path: '/tmp/file2.txt', reason: 'Reason 2' },
        ],
        cancelled: false,
      });

      await deleteToolHandler.handle({ paths });

      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file1.txt', 'rejected', 'Reason 1');
      expect(mockLoggingService.logDeletion).toHaveBeenCalledWith('/tmp/file2.txt', 'rejected', 'Reason 2');
    });
  });
});
