import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { type ProtectionEngine } from '@/core/ProtectionEngine.js';
import {
  type Configuration,
  type DeletionResult,
  type BatchDeletionResult,
  type ValidationResult,
  type BatchValidationResult,
} from '@/types/index.js';

export interface Logger {
  logDeletion: (path: string, result: 'success' | 'failed' | 'rejected') => void;
  logError: (error: Error, context: string) => void;
}

export class SafeDeletionService {
  constructor(
    private readonly config: Configuration,
    private readonly protectionEngine: ProtectionEngine,
    private readonly logger: Logger,
  ) {}

  async deleteFile(filePath: string): Promise<DeletionResult> {
    try {
      // パス検証
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        this.logger.logDeletion(filePath, 'rejected');
        return {
          success: false,
          path: filePath,
          reason: validation.reason,
        };
      }

      // ファイル存在確認
      if (!existsSync(filePath)) {
        this.logger.logDeletion(filePath, 'failed');
        return {
          success: false,
          path: filePath,
          error: 'File not found',
        };
      }

      // ファイル削除実行
      await fs.unlink(filePath);

      this.logger.logDeletion(filePath, 'success');
      return {
        success: true,
        path: filePath,
      };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error) {
        this.logger.logError(error, `deleteFile: ${filePath}`);
      }

      return {
        success: false,
        path: filePath,
        error: errorMessage,
      };
    }
  }

  async deleteDirectory(dirPath: string): Promise<DeletionResult> {
    try {
      // パス検証
      const validation = this.validatePath(dirPath);
      if (!validation.valid) {
        this.logger.logDeletion(dirPath, 'rejected');
        return {
          success: false,
          path: dirPath,
          reason: validation.reason,
        };
      }

      // ディレクトリ存在確認
      if (!existsSync(dirPath)) {
        this.logger.logDeletion(dirPath, 'failed');
        return {
          success: false,
          path: dirPath,
          error: 'Directory not found',
        };
      }

      // ディレクトリ削除実行（空のディレクトリのみ）
      await fs.rmdir(dirPath);

      this.logger.logDeletion(dirPath, 'success');
      return {
        success: true,
        path: dirPath,
      };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error) {
        this.logger.logError(error, `deleteDirectory: ${dirPath}`);
      }

      return {
        success: false,
        path: dirPath,
        error: errorMessage,
      };
    }
  }

  validatePath(filePath: string): ValidationResult {
    // 絶対パスチェック
    if (!path.isAbsolute(filePath)) {
      return {
        valid: false,
        reason: 'Only absolute paths are accepted',
      };
    }

    // 許可ディレクトリ内チェック
    const matchingDirectory = this.protectionEngine.getMatchingAllowedDirectory(filePath);
    if (matchingDirectory === null) {
      return {
        valid: false,
        reason: 'Path is outside allowed directories',
      };
    }

    // Protection pattern check
    if (this.protectionEngine.isProtected(filePath)) {
      return {
        valid: false,
        reason: 'Path matches protected pattern',
      };
    }

    return {
      valid: true,
      matchedDirectory: matchingDirectory,
    };
  }

  async deleteBatch(paths: string[]): Promise<BatchDeletionResult> {
    // バッチサイズ制限チェック
    if (paths.length > this.config.maxBatchSize) {
      return {
        deleted: [],
        failed: [],
        rejected: paths.map(path => ({
          path,
          reason: `Batch size exceeds limit (${this.config.maxBatchSize})`,
        })),
        cancelled: true,
        reason: 'Batch size limit exceeded',
      };
    }

    // 事前検証
    const validation = this.validateBatch(paths);
    if (!validation.valid) {
      return {
        deleted: [],
        failed: [],
        rejected: [
          ...validation.invalidPaths,
          ...validation.protectedPaths,
        ],
        cancelled: true,
        reason: 'Batch contains protected or invalid paths',
      };
    }

    // アトミック削除実行
    const results = await Promise.allSettled(
      validation.validPaths.map(async (filePath) => {
        const result = await this.deleteFile(filePath);
        return { path: filePath, result };
      }),
    );

    // 結果の分類
    const deleted: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    results.forEach((result, index) => {
      const filePath = validation.validPaths[index];
      if (filePath === undefined) {
        return;
      }

      if (result.status === 'fulfilled') {
        const deletionResult = result.value.result;
        if (deletionResult.success) {
          deleted.push(filePath);
        }
        else {
          failed.push({
            path: filePath,
            error: deletionResult.error ?? deletionResult.reason ?? 'Unknown error',
          });
        }
      }
      else {
        failed.push({
          path: filePath,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        });
      }
    });

    return {
      deleted,
      failed,
      rejected: [],
    };
  }

  validateBatch(paths: string[]): BatchValidationResult {
    const validPaths: string[] = [];
    const invalidPaths: Array<{ path: string; reason: string }> = [];
    const protectedPaths: Array<{ path: string; reason: string }> = [];

    for (const filePath of paths) {
      const validation = this.validatePath(filePath);

      if (validation.valid) {
        validPaths.push(filePath);
      }
      else {
        if (validation.reason?.includes('protected') === true) {
          protectedPaths.push({
            path: filePath,
            reason: validation.reason,
          });
        }
        else {
          invalidPaths.push({
            path: filePath,
            reason: validation.reason ?? 'Invalid path',
          });
        }
      }
    }

    // Invalidate the entire batch if any protected patterns are included
    const valid = protectedPaths.length === 0 && invalidPaths.length === 0;

    return {
      valid,
      validPaths,
      invalidPaths,
      protectedPaths,
    };
  }
}
