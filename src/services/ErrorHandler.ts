import { injectable } from 'inversify';
import { SafeDeletionError, ErrorType } from '@/types/index.js';

export const ErrorHandlerTag = Symbol.for('ErrorHandler');

export interface ErrorHandler {
  classifySystemError: (error: Error, path: string) => SafeDeletionError;
  generateUserMessage: (error: SafeDeletionError) => string;
}

@injectable()
export class ErrorHandlerImpl implements ErrorHandler {
  /**
   * Classify system errors into SafeDeletionError types
   */
  classifySystemError(error: Error, path: string): SafeDeletionError {
    // Check error code/name for common file system errors
    if (error.message.includes('ENOENT') || error.name === 'ENOENT') {
      return new SafeDeletionError(
        ErrorType.FILE_NOT_FOUND,
        `File not found: ${path}`,
        path,
        error,
      );
    }

    if (error.message.includes('EACCES') || error.name === 'EACCES') {
      return new SafeDeletionError(
        ErrorType.PERMISSION_DENIED,
        `Permission denied: Cannot access ${path}`,
        path,
        error,
      );
    }

    if (error.message.includes('EPERM') || error.name === 'EPERM') {
      return new SafeDeletionError(
        ErrorType.PERMISSION_DENIED,
        `Operation not permitted: Cannot modify ${path}`,
        path,
        error,
      );
    }

    // Default to system error for unknown cases
    return new SafeDeletionError(
      ErrorType.SYSTEM_ERROR,
      `System error during operation on ${path}: ${error.message}`,
      path,
      error,
    );
  }

  /**
   * Generate user-friendly error message
   */
  generateUserMessage(error: SafeDeletionError): string {
    switch (error.type) {
      case ErrorType.VALIDATION_ERROR:
        return `Invalid request: ${error.message}${(error.path !== undefined && error.path !== '') ? ` (${error.path})` : ''}`;

      case ErrorType.PERMISSION_DENIED:
        return `Access denied: ${error.path ?? 'Unknown path'} cannot be accessed due to insufficient permissions.`;

      case ErrorType.FILE_NOT_FOUND:
        return `File not found: ${error.path ?? 'Unknown path'} does not exist or cannot be located.`;

      case ErrorType.PROTECTION_VIOLATION:
        return `Protected file: ${error.path ?? 'Unknown path'} cannot be deleted because it matches a protected pattern.`;

      case ErrorType.SYSTEM_ERROR:
        return `System error: Operation failed${(error.path !== undefined && error.path !== '') ? ` on ${error.path}` : ''}. ${error.message}`;
    }
  }
}
