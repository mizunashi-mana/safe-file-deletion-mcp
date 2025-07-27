import { type ErrorHandler } from '@/core/ErrorHandler.js';
import { type LoggingService } from '@/core/LoggingService.js';
import { SafeDeletionError, ErrorType } from '@/types/index.js';

// Error handling result interfaces
interface ErrorHandlingResult {
  success: boolean;
  error?: SafeDeletionError;
  recoverySuggestion?: string;
}

interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
}

interface BatchErrorSummary {
  partialSuccess: boolean;
  successfulOperations: number;
  failedOperations: number;
  errorsByType: Record<ErrorType, SafeDeletionError[]>;
}

interface FallbackSuggestion {
  type: string;
  description: string;
  action?: string;
}

interface CascadingErrorResult {
  primaryError: SafeDeletionError;
  secondaryErrors: Error[];
  recoveryAction?: string;
}

export class ComprehensiveErrorHandler {
  // List of transient error codes that may be retryable
  private readonly transientErrorCodes = ['EBUSY', 'EAGAIN', 'EWOULDBLOCK', 'ETIMEDOUT'];

  constructor(
    private readonly errorHandler: ErrorHandler,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Handle file system errors with appropriate classification and recovery
   */
  async handleFileSystemError(
    error: Error,
    path: string,
    operation: string,
  ): Promise<ErrorHandlingResult> {
    const classifiedError = this.errorHandler.classifySystemError(error, path);

    // Log the error with context
    await this.loggingService.logError(
      classifiedError,
      `File system error during ${operation} operation`,
    );

    return {
      success: false,
      error: classifiedError,
      recoverySuggestion: this.generateRecoverySuggestion(classifiedError),
    };
  }

  /**
   * Handle permission-related errors with specific guidance
   */
  async handlePermissionError(
    error: Error,
    path: string,
  ): Promise<ErrorHandlingResult> {
    let message: string;
    let recoverySuggestion: string;

    const errorCode = (error as Error & { code?: string }).code;

    switch (errorCode) {
      case 'EACCES':
        message = `Access denied: Insufficient permissions to access ${path}`;
        recoverySuggestion = 'Please check file permissions and ensure you have the necessary access rights.';
        break;
      case 'EPERM':
        message = `Operation not permitted: Insufficient privileges to modify ${path}`;
        recoverySuggestion = 'This operation requires elevated privileges or file ownership.';
        break;
      case 'EROFS':
        message = `Read-only file system: Cannot modify files on ${path}`;
        recoverySuggestion = 'The file system is mounted as read-only. Check mount options.';
        break;
      default:
        message = `Permission error: Cannot access ${path}`;
        recoverySuggestion = 'Please check file permissions and system access controls.';
    }

    const classifiedError = new SafeDeletionError(
      ErrorType.PERMISSION_DENIED,
      message,
      path,
      error,
    );

    await this.loggingService.logError(classifiedError, 'Permission error encountered');

    return {
      success: false,
      error: classifiedError,
      recoverySuggestion,
    };
  }

  /**
   * Execute operation with retry logic for transient errors
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    path: string,
    options: RetryOptions,
  ): Promise<{ success: boolean; result?: T; error?: SafeDeletionError }> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= options.maxRetries) {
      try {
        const result = await operation();
        return { success: true, result };
      }
      catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

        // Check if this is a transient error worth retrying
        if ((errorCode !== undefined && !this.isTransientError(errorCode)) || attempt >= options.maxRetries) {
          break;
        }

        attempt++;
        await this.loggingService.logError(
          lastError,
          `Retry attempt ${attempt}/${options.maxRetries} for ${path}`,
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, options.retryDelay));
      }
    }

    // All retries exhausted or non-transient error
    const classifiedError = this.errorHandler.classifySystemError(lastError ?? new Error('Unknown error'), path);
    return { success: false, error: classifiedError };
  }

  /**
   * Generate contextual error messages based on operation context
   */
  generateContextualMessage(error: SafeDeletionError, context: string): string {
    const baseMessage = this.errorHandler.generateUserMessage(error);
    return `During ${context}: ${baseMessage}`;
  }

  /**
   * Generate actionable error messages with specific guidance
   */
  generateActionableMessage(error: SafeDeletionError): string {
    switch (error.type) {
      case ErrorType.PROTECTION_VIOLATION:
        return `${this.errorHandler.generateUserMessage(error)} To resolve this, please review the protected patterns configuration or exclude this path from the operation.`;

      case ErrorType.PERMISSION_DENIED:
        return `${this.errorHandler.generateUserMessage(error)} Try running with appropriate permissions or check file ownership.`;

      case ErrorType.FILE_NOT_FOUND:
        return `${this.errorHandler.generateUserMessage(error)} Verify that the file exists and the path is correct.`;

      case ErrorType.VALIDATION_ERROR:
        return `${this.errorHandler.generateUserMessage(error)} Please check the input format and try again.`;

      default:
        return this.errorHandler.generateUserMessage(error);
    }
  }

  /**
   * Generate recovery-focused error messages
   */
  generateRecoveryMessage(error: SafeDeletionError): string {
    const baseMessage = this.errorHandler.generateUserMessage(error);
    const recoverySuggestion = this.generateRecoverySuggestion(error);

    return `${baseMessage} Recovery suggestion: ${recoverySuggestion}`;
  }

  /**
   * Log error with additional context information
   */
  async logErrorWithContext(
    error: SafeDeletionError,
    operation: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const contextString = Object.entries(context)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');

    const message = `${operation} (${contextString})`;
    await this.loggingService.logError(error, message);
  }

  /**
   * Handle batch operation errors with summary
   */
  handleBatchErrors(errors: SafeDeletionError[]): BatchErrorSummary {
    const errorsByType: Record<ErrorType, SafeDeletionError[]> = {
      [ErrorType.VALIDATION_ERROR]: [],
      [ErrorType.PERMISSION_DENIED]: [],
      [ErrorType.FILE_NOT_FOUND]: [],
      [ErrorType.PROTECTION_VIOLATION]: [],
      [ErrorType.SYSTEM_ERROR]: [],
    };

    // Group errors by type
    for (const error of errors) {
      errorsByType[error.type].push(error);
    }

    return {
      partialSuccess: errors.length > 0, // Assuming some operations failed
      successfulOperations: 0, // This would be calculated by the caller
      failedOperations: errors.length,
      errorsByType,
    };
  }

  /**
   * Suggest fallback operations for recoverable errors
   */
  suggestFallback(error: SafeDeletionError): FallbackSuggestion | null {
    switch (error.type) {
      case ErrorType.PERMISSION_DENIED:
        return {
          type: 'permission_fix',
          description: 'Change file permissions or run with elevated privileges',
          action: `chmod +w "${error.path}" or sudo`,
        };

      case ErrorType.FILE_NOT_FOUND:
        return {
          type: 'path_verification',
          description: 'Verify the file path exists',
          action: `ls -la "${error.path}"`,
        };

      case ErrorType.PROTECTION_VIOLATION:
        return {
          type: 'configuration_review',
          description: 'Review protected patterns configuration',
          action: 'Update configuration to exclude this pattern',
        };

      default:
        return null;
    }
  }

  /**
   * Handle cascading errors that occur during error recovery
   */
  async handleCascadingError(
    primaryError: SafeDeletionError,
    secondaryError: Error,
    recoveryOperation: string,
  ): Promise<CascadingErrorResult> {
    await this.loggingService.logError(
      secondaryError,
      `Secondary error during ${recoveryOperation} while handling: ${primaryError.message}`,
    );

    return {
      primaryError,
      secondaryErrors: [secondaryError],
      recoveryAction: 'Manual intervention may be required to resolve both primary and secondary errors',
    };
  }

  /**
   * Check if an error is transient and worth retrying
   */
  private isTransientError(errorCode: string): boolean {
    return this.transientErrorCodes.includes(errorCode);
  }

  /**
   * Generate recovery suggestions based on error type
   */
  private generateRecoverySuggestion(error: SafeDeletionError): string {
    switch (error.type) {
      case ErrorType.PERMISSION_DENIED:
        return 'Check file permissions and ensure you have necessary access rights.';

      case ErrorType.FILE_NOT_FOUND:
        return 'Verify the file path is correct and the file exists.';

      case ErrorType.PROTECTION_VIOLATION:
        return 'Review the protected patterns configuration or modify the request to exclude protected files.';

      case ErrorType.VALIDATION_ERROR:
        return 'Check the input format and ensure all required parameters are provided correctly.';

      case ErrorType.SYSTEM_ERROR:
        return 'Check system resources and try the operation again. If the problem persists, check system logs.';
    }
  }
}
