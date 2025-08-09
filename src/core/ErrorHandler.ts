import { z } from 'zod';
import { SafeDeletionError, ErrorType } from '@/types/index.js';

// Input validation schemas
const DeleteInputSchema = z.object({
  paths: z.array(z.string()).min(1, 'At least one path is required'),
}).strict();

const ListProtectedInputSchema = z.object({}).strict();

const GetAllowedInputSchema = z.object({}).strict();

// MCP Response interface
interface MCPErrorResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError: true;
}

export class ErrorHandler {
  /**
   * Validate delete tool input using Zod schema
   */
  validateDeleteInput(input: unknown): z.ZodSafeParseResult<{ paths: string[] }> {
    return DeleteInputSchema.safeParse(input);
  }

  /**
   * Validate list_protected tool input using Zod schema
   */
  validateListProtectedInput(input: unknown): z.ZodSafeParseResult<Record<string, never>> {
    return ListProtectedInputSchema.safeParse(input);
  }

  /**
   * Validate get_allowed tool input using Zod schema
   */
  validateGetAllowedInput(input: unknown): z.ZodSafeParseResult<Record<string, never>> {
    return GetAllowedInputSchema.safeParse(input);
  }

  /**
   * Convert error to MCP error response format
   */
  toMCPErrorResponse(error: Error): MCPErrorResponse {
    if (error instanceof SafeDeletionError) {
      const pathInfo = (error.path !== undefined && error.path !== '') ? ` (Path: ${error.path})` : '';
      const causeInfo = error.cause ? `\\nUnderlying cause: ${error.cause.message}` : '';

      return {
        content: [
          {
            type: 'text',
            text: `Error [${error.type}]: ${error.message}${pathInfo}${causeInfo}`,
          },
        ],
        isError: true,
      };
    }

    // Handle generic errors
    return {
      content: [
        {
          type: 'text',
          text: `Error [${ErrorType.SYSTEM_ERROR}]: ${error.message}`,
        },
      ],
      isError: true,
    };
  }

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

  /**
   * Generate technical error message for logging
   */
  generateTechnicalMessage(error: SafeDeletionError): string {
    const parts = [
      `[${error.type}]`,
      error.message,
    ];

    if (error.path !== undefined) {
      parts.push(`Path: ${error.path}`);
    }

    if (error.cause) {
      parts.push(`Cause: ${error.cause.message}`);

      // Include stack trace if available
      if (error.cause.stack !== undefined) {
        parts.push(`Stack: ${error.cause.stack}`);
      }
    }

    return parts.join(' | ');
  }

  /**
   * Create validation error from Zod error
   */
  createValidationError(zodError: z.ZodError, context?: string): SafeDeletionError {
    const issues = zodError.issues.map((issue) => {
      const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      return `${issue.message}${path}`;
    });

    const message = context !== undefined
      ? `${context}: ${issues.join(', ')}`
      : `Validation failed: ${issues.join(', ')}`;

    return new SafeDeletionError(
      ErrorType.VALIDATION_ERROR,
      message,
    );
  }

  /**
   * Create protection violation error
   */
  createProtectionViolationError(path: string, pattern: string): SafeDeletionError {
    return new SafeDeletionError(
      ErrorType.PROTECTION_VIOLATION,
      `Path matches protected pattern: ${pattern}`,
      path,
    );
  }

  /**
   * Create file not found error
   */
  createFileNotFoundError(path: string): SafeDeletionError {
    return new SafeDeletionError(
      ErrorType.FILE_NOT_FOUND,
      'File does not exist',
      path,
    );
  }

  /**
   * Create permission denied error
   */
  createPermissionDeniedError(path: string, reason?: string): SafeDeletionError {
    const message = reason ?? 'Access denied';
    return new SafeDeletionError(
      ErrorType.PERMISSION_DENIED,
      message,
      path,
    );
  }
}
