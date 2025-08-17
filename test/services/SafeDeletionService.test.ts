import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigProviderImpl } from '@/services/ConfigProvider.js';
import { LoggingServiceImpl } from '@/services/LoggingService.js';
import { ProtectionEngineImpl } from '@/services/ProtectionEngine.js';
import { SafeDeletionServiceImpl } from '@/services/SafeDeletionService.js';
import { ErrorType, SafeDeletionError, DEFAULT_CONFIG } from '@/types/index.js';

vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

describe('SafeDeletionService', () => {
  let service: SafeDeletionServiceImpl;
  let protectionEngine: ProtectionEngineImpl;
  let configProvider: ConfigProviderImpl;
  let loggingService: LoggingServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();

    configProvider = new ConfigProviderImpl({
      ...DEFAULT_CONFIG,
      allowedDirectories: ['/Users/test/project'],
      protectedPatterns: ['.git', '*.env', '.env*'],
      logLevel: 'info',
      maxBatchSize: 50,
    });

    protectionEngine = new ProtectionEngineImpl(configProvider);
    loggingService = new LoggingServiceImpl(configProvider);

    vi.spyOn(loggingService, 'logDeletion').mockResolvedValue();
    vi.spyOn(loggingService, 'logError').mockResolvedValue();

    service = new SafeDeletionServiceImpl(protectionEngine, configProvider, loggingService);

    // By default, assume files exist
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    protectionEngine.dispose();
  });

  describe('単一ファイル削除', () => {
    it('can delete non-protected files within allowed directories', async () => {
      const filePath = '/Users/test/project/README.md';
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(filePath);
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'success');
    });

    it('rejects deletion of protected files', async () => {
      const filePath = '/Users/test/project/.env';

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('protected');
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'rejected');
    });

    it('rejects deletion of files outside allowed directories', async () => {
      const filePath = '/etc/passwd';

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'rejected');
    });

    it('returns error when deleting non-existent file', async () => {
      const filePath = '/Users/test/project/nonexistent.txt';
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'failed');
    });

    it('properly handles filesystem errors', async () => {
      const filePath = '/Users/test/project/locked.txt';
      const fsError = new Error('EPERM: operation not permitted');
      vi.mocked(fs.unlink).mockRejectedValue(fsError);

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('EPERM');
      expect(loggingService.logError).toHaveBeenCalled();
    });

    it('rejects relative paths', async () => {
      const filePath = 'relative/path.txt';

      const result = await service.deleteFile(filePath);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('absolute path');
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('ディレクトリ削除', () => {
    it('can delete empty directories', async () => {
      const dirPath = '/Users/test/project/empty-dir';
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      const result = await service.deleteDirectory(dirPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(dirPath);
      expect(fs.rmdir).toHaveBeenCalledWith(dirPath);
      expect(loggingService.logDeletion).toHaveBeenCalledWith(dirPath, 'success');
    });

    it('rejects deletion of protected directories', async () => {
      const dirPath = '/Users/test/project/.git';

      const result = await service.deleteDirectory(dirPath);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('protected');
      expect(fs.rmdir).not.toHaveBeenCalled();
    });

    it('returns error when deleting non-empty directory', async () => {
      const dirPath = '/Users/test/project/not-empty';
      const fsError = new Error('ENOTEMPTY: directory not empty');
      vi.mocked(fs.rmdir).mockRejectedValue(fsError);

      const result = await service.deleteDirectory(dirPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOTEMPTY');
    });
  });

  describe('パス検証', () => {
    it('succeeds validation of valid paths', () => {
      const validPath = '/Users/test/project/valid.txt';

      const result = service.validatePath(validPath);

      expect(result.valid).toBe(true);
      expect(result.matchedDirectory).toBe('/Users/test/project');
    });

    it('fails validation of invalid paths', () => {
      const invalidPath = '/invalid/path.txt';

      const result = service.validatePath(invalidPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
    });

    it('fails validation of protected paths', () => {
      const protectedPath = '/Users/test/project/.env';

      const result = service.validatePath(protectedPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('protected');
    });

    it('fails validation of relative paths', () => {
      const relativePath = 'relative/path.txt';

      const result = service.validatePath(relativePath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('absolute path');
    });
  });

  describe('SafeDeletionError', () => {
    it('custom error class works correctly', () => {
      const error = new SafeDeletionError(
        ErrorType.PROTECTION_VIOLATION,
        'File is protected',
        '/path/to/file.txt',
      );

      expect(error.type).toBe(ErrorType.PROTECTION_VIOLATION);
      expect(error.message).toBe('File is protected');
      expect(error.path).toBe('/path/to/file.txt');
      expect(error.name).toBe('SafeDeletionError');
    });
  });

  describe('ログ統合', () => {
    it('logs successful deletions', async () => {
      const filePath = '/Users/test/project/test.txt';
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await service.deleteFile(filePath);

      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'success');
    });

    it('logs rejected deletions', async () => {
      const filePath = '/Users/test/project/.env';

      await service.deleteFile(filePath);

      expect(loggingService.logDeletion).toHaveBeenCalledWith(filePath, 'rejected');
    });

    it('logs failed deletions', async () => {
      const filePath = '/Users/test/project/test.txt';
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Test error'));

      await service.deleteFile(filePath);

      expect(loggingService.logError).toHaveBeenCalled();
    });
  });

  describe('バッチ削除とアトミック処理', () => {
    beforeEach(() => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
    });

    it('successful batch deletion of valid files', async () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/Users/test/project/file2.txt',
        '/Users/test/project/file3.txt',
      ];

      const result = await service.deleteBatch(paths);

      expect(result.deleted).toEqual(paths);
      expect(result.failed).toEqual([]);
      expect(result.rejected).toEqual([]);
      expect(result.cancelled).toBeUndefined();
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });

    it('cancels entire batch when protected files are included', async () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/Users/test/project/.env', // 保護されたファイル
        '/Users/test/project/file3.txt',
      ];

      const result = await service.deleteBatch(paths);

      expect(result.deleted).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.rejected.length).toBeGreaterThan(0);
      expect(result.cancelled).toBe(true);
      expect(result.reason).toContain('protected or invalid paths');
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('cancels entire batch when files outside allowed directories are included', async () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/etc/passwd', // 許可ディレクトリ外
        '/Users/test/project/file3.txt',
      ];

      const result = await service.deleteBatch(paths);

      expect(result.deleted).toEqual([]);
      expect(result.cancelled).toBe(true);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('rejects processing when batch size limit is exceeded', async () => {
      const paths = Array.from({ length: 51 }, (_, i) =>
        `/Users/test/project/file${i}.txt`,
      );

      const result = await service.deleteBatch(paths);

      expect(result.deleted).toEqual([]);
      expect(result.cancelled).toBe(true);
      expect(result.reason).toContain('Batch size limit exceeded');
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('properly classifies failures when some file deletions fail', async () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/Users/test/project/file2.txt',
        '/Users/test/project/file3.txt',
      ];

      // file2.txtだけ削除に失敗するように設定
      vi.mocked(fs.unlink).mockImplementation(async (path) => {
        if (path === '/Users/test/project/file2.txt') {
          await Promise.reject(new Error('Permission denied'));
          return;
        }
        await Promise.resolve(undefined);
      });

      const result = await service.deleteBatch(paths);

      expect(result.deleted).toEqual([
        '/Users/test/project/file1.txt',
        '/Users/test/project/file3.txt',
      ]);
      expect(result.failed).toEqual([{
        path: '/Users/test/project/file2.txt',
        error: 'Permission denied',
      }]);
      expect(result.rejected).toEqual([]);
    });

    it('can process empty batches', async () => {
      const result = await service.deleteBatch([]);

      expect(result.deleted).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.rejected).toEqual([]);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('バッチ検証', () => {
    it('correctly validates batches with only valid paths', () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/Users/test/project/file2.txt',
      ];

      const result = service.validateBatch(paths);

      expect(result.valid).toBe(true);
      expect(result.validPaths).toEqual(paths);
      expect(result.invalidPaths).toEqual([]);
      expect(result.protectedPaths).toEqual([]);
    });

    it('invalidates batches containing protected paths', () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/Users/test/project/.env',
      ];

      const result = service.validateBatch(paths);

      expect(result.valid).toBe(false);
      expect(result.protectedPaths.length).toBe(1);
      expect(result.protectedPaths[0]!.path).toBe('/Users/test/project/.env');
    });

    it('invalidates batches containing invalid paths', () => {
      const paths = [
        '/Users/test/project/file1.txt',
        '/invalid/path.txt',
      ];

      const result = service.validateBatch(paths);

      expect(result.valid).toBe(false);
      expect(result.invalidPaths.length).toBe(1);
      expect(result.invalidPaths[0]!.path).toBe('/invalid/path.txt');
    });

    it('properly classifies mixed path types', () => {
      const paths = [
        '/Users/test/project/valid.txt', // 有効
        '/Users/test/project/.env', // 保護
        '/invalid/path.txt', // 無効
        'relative/path.txt', // 相対パス（無効）
      ];

      const result = service.validateBatch(paths);

      expect(result.valid).toBe(false);
      expect(result.validPaths).toEqual(['/Users/test/project/valid.txt']);
      expect(result.protectedPaths.length).toBe(1);
      expect(result.invalidPaths.length).toBe(2);
    });
  });
});
