import type { SafeDeletionService } from '@/services/SafeDeletionService.js';
import type {
  DeletionResult,
  BatchDeletionResult,
  ValidationResult,
  BatchValidationResult,
} from '@/types/index.js';

export class MockSafeDeletionService implements SafeDeletionService {
  private readonly allowedDirectories: string[];

  constructor(allowedDirectories: string[]) {
    this.allowedDirectories = allowedDirectories;
  }

  async deleteFile(filePath: string): Promise<DeletionResult> {
    if (filePath.includes('.git')) {
      return {
        success: false,
        path: filePath,
        reason: 'Protected file',
      };
    }

    if (!this.isInAllowedDirectory(filePath)) {
      return {
        success: false,
        path: filePath,
        reason: 'Outside allowed directories',
      };
    }

    // Mock successful deletion without actual filesystem operations
    return {
      success: true,
      path: filePath,
    };
  }

  async deleteDirectory(dirPath: string): Promise<DeletionResult> {
    if (dirPath.includes('.git')) {
      return {
        success: false,
        path: dirPath,
        reason: 'Protected directory',
      };
    }

    if (!this.isInAllowedDirectory(dirPath)) {
      return {
        success: false,
        path: dirPath,
        reason: 'Outside allowed directories',
      };
    }

    // Mock successful deletion without actual filesystem operations
    return {
      success: true,
      path: dirPath,
    };
  }

  async deleteBatch(paths: string[]): Promise<BatchDeletionResult> {
    const deleted: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];
    const rejected: Array<{ path: string; reason: string }> = [];

    for (const path of paths) {
      if (path.includes('.git')) {
        rejected.push({ path, reason: 'Protected path' });
        continue;
      }

      if (!this.isInAllowedDirectory(path)) {
        rejected.push({ path, reason: 'Outside allowed directories' });
        continue;
      }

      // Mock successful deletion without actual filesystem operations
      deleted.push(path);
    }

    return {
      deleted,
      failed,
      rejected,
    };
  }

  validatePath(filePath: string): ValidationResult {
    if (filePath.includes('.git')) {
      return {
        valid: false,
        reason: 'Protected path',
      };
    }

    if (!this.isInAllowedDirectory(filePath)) {
      return {
        valid: false,
        reason: 'Outside allowed directories',
      };
    }

    return {
      valid: true,
      matchedDirectory: this.allowedDirectories.find(dir => filePath.startsWith(dir)),
    };
  }

  validateBatch(paths: string[]): BatchValidationResult {
    const validPaths: string[] = [];
    const invalidPaths: Array<{ path: string; reason: string }> = [];
    const protectedPaths: Array<{ path: string; reason: string }> = [];

    for (const path of paths) {
      if (path.includes('.git')) {
        protectedPaths.push({ path, reason: 'Protected path' });
      }
      else if (!this.isInAllowedDirectory(path)) {
        invalidPaths.push({ path, reason: 'Outside allowed directories' });
      }
      else {
        validPaths.push(path);
      }
    }

    return {
      valid: protectedPaths.length === 0 && invalidPaths.length === 0,
      validPaths,
      invalidPaths,
      protectedPaths,
    };
  }

  private isInAllowedDirectory(filePath: string): boolean {
    return this.allowedDirectories.some(dir => filePath.startsWith(dir));
  }

  getAllowedDirectories(): string[] {
    return [...this.allowedDirectories];
  }
}
