import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorHandler } from '@/core/ErrorHandler.js';
import { SafeDeletionError, ErrorType } from '@/types/index.js';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
  });

  describe('SafeDeletionError Classification', () => {
    it('should create validation error with proper classification', () => {
      const error = new SafeDeletionError(
        ErrorType.VALIDATION_ERROR,
        'Invalid path format',
        '/invalid/path',
      );

      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid path format');
      expect(error.path).toBe('/invalid/path');
      expect(error.name).toBe('SafeDeletionError');
    });

    it('should create permission denied error with proper classification', () => {
      const error = new SafeDeletionError(
        ErrorType.PERMISSION_DENIED,
        'Access denied to protected file',
        '/home/user/.ssh/id_rsa',
      );

      expect(error.type).toBe(ErrorType.PERMISSION_DENIED);
      expect(error.message).toBe('Access denied to protected file');
      expect(error.path).toBe('/home/user/.ssh/id_rsa');
    });

    it('should create file not found error with proper classification', () => {
      const error = new SafeDeletionError(
        ErrorType.FILE_NOT_FOUND,
        'File does not exist',
        '/nonexistent/file.txt',
      );

      expect(error.type).toBe(ErrorType.FILE_NOT_FOUND);
      expect(error.message).toBe('File does not exist');
      expect(error.path).toBe('/nonexistent/file.txt');
    });

    it('should create protection violation error with proper classification', () => {
      const error = new SafeDeletionError(
        ErrorType.PROTECTION_VIOLATION,
        'Path matches protected pattern: .git',
        '/project/.git/config',
      );

      expect(error.type).toBe(ErrorType.PROTECTION_VIOLATION);
      expect(error.message).toBe('Path matches protected pattern: .git');
      expect(error.path).toBe('/project/.git/config');
    });

    it('should create system error with proper classification and cause', () => {
      const cause = new Error('EACCES: permission denied');
      const error = new SafeDeletionError(
        ErrorType.SYSTEM_ERROR,
        'File system operation failed',
        '/system/file',
        cause,
      );

      expect(error.type).toBe(ErrorType.SYSTEM_ERROR);
      expect(error.message).toBe('File system operation failed');
      expect(error.path).toBe('/system/file');
      expect(error.cause).toBe(cause);
    });
  });

  describe('Input Validation with Zod', () => {
    it('should validate delete tool arguments', () => {
      const validInput = { paths: ['/tmp/test.txt', '/tmp/test2.txt'] };
      const result = errorHandler.validateDeleteInput(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paths).toEqual(['/tmp/test.txt', '/tmp/test2.txt']);
      }
    });

    it('should reject delete tool arguments with empty paths', () => {
      const invalidInput = { paths: [] };
      const result = errorHandler.validateDeleteInput(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('At least one path is required');
      }
    });

    it('should reject delete tool arguments with non-string paths', () => {
      const invalidInput = { paths: [123, 'valid-path'] };
      const result = errorHandler.validateDeleteInput(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Expected string');
      }
    });

    it('should reject delete tool arguments without paths property', () => {
      const invalidInput = { notPaths: ['some-path'] };
      const result = errorHandler.validateDeleteInput(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('paths');
      }
    });

    it('should validate list_protected tool arguments', () => {
      const validInput = {};
      const result = errorHandler.validateListProtectedInput(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate get_allowed tool arguments', () => {
      const validInput = {};
      const result = errorHandler.validateGetAllowedInput(validInput);

      expect(result.success).toBe(true);
    });

    it('should reject extra properties in tool arguments', () => {
      const invalidInput = { paths: ['/tmp/test.txt'], extraProp: 'invalid' };
      const result = errorHandler.validateDeleteInput(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Unrecognized key');
      }
    });
  });

  describe('MCP Error Response Format', () => {
    it('should convert SafeDeletionError to MCP error response', () => {
      const error = new SafeDeletionError(
        ErrorType.PROTECTION_VIOLATION,
        'Protected file cannot be deleted',
        '/project/.git/HEAD',
      );

      const mcpResponse = errorHandler.toMCPErrorResponse(error);

      expect(mcpResponse.isError).toBe(true);
      expect(mcpResponse.content).toHaveLength(1);
      expect(mcpResponse.content[0]?.type).toBe('text');
      expect(mcpResponse.content[0]?.text).toContain('Protected file cannot be deleted');
      expect(mcpResponse.content[0]?.text).toContain('/project/.git/HEAD');
      expect(mcpResponse.content[0]?.text).toContain('PROTECTION_VIOLATION');
    });

    it('should convert validation error to MCP error response', () => {
      const error = new SafeDeletionError(
        ErrorType.VALIDATION_ERROR,
        'Invalid path format',
        'invalid-relative-path',
      );

      const mcpResponse = errorHandler.toMCPErrorResponse(error);

      expect(mcpResponse.isError).toBe(true);
      expect(mcpResponse.content[0]?.text).toContain('Invalid path format');
      expect(mcpResponse.content[0]?.text).toContain('VALIDATION_ERROR');
    });

    it('should convert system error with cause to MCP error response', () => {
      const cause = new Error('ENOENT: no such file or directory');
      const error = new SafeDeletionError(
        ErrorType.SYSTEM_ERROR,
        'File operation failed',
        '/nonexistent/file.txt',
        cause,
      );

      const mcpResponse = errorHandler.toMCPErrorResponse(error);

      expect(mcpResponse.isError).toBe(true);
      expect(mcpResponse.content[0]?.text).toContain('File operation failed');
      expect(mcpResponse.content[0]?.text).toContain('SYSTEM_ERROR');
      expect(mcpResponse.content[0]?.text).toContain('ENOENT: no such file or directory');
    });

    it('should convert generic Error to MCP error response', () => {
      const error = new Error('Generic error message');
      const mcpResponse = errorHandler.toMCPErrorResponse(error);

      expect(mcpResponse.isError).toBe(true);
      expect(mcpResponse.content[0]?.text).toContain('Generic error message');
      expect(mcpResponse.content[0]?.text).toContain('SYSTEM_ERROR');
    });

    it('should handle error without message', () => {
      const error = new SafeDeletionError(
        ErrorType.FILE_NOT_FOUND,
        '',
        '/some/path',
      );

      const mcpResponse = errorHandler.toMCPErrorResponse(error);

      expect(mcpResponse.isError).toBe(true);
      expect(mcpResponse.content[0]?.text).toContain('FILE_NOT_FOUND');
      expect(mcpResponse.content[0]?.text).toContain('/some/path');
    });
  });

  describe('Error Classification from Standard Errors', () => {
    it('should classify ENOENT error as FILE_NOT_FOUND', () => {
      const systemError = new Error('ENOENT: no such file or directory, unlink \'/path/file.txt\'');
      systemError.name = 'ENOENT';

      const classifiedError = errorHandler.classifySystemError(systemError, '/path/file.txt');

      expect(classifiedError.type).toBe(ErrorType.FILE_NOT_FOUND);
      expect(classifiedError.path).toBe('/path/file.txt');
      expect(classifiedError.message).toContain('File not found');
    });

    it('should classify EACCES error as PERMISSION_DENIED', () => {
      const systemError = new Error('EACCES: permission denied, unlink \'/protected/file\'');
      systemError.name = 'EACCES';

      const classifiedError = errorHandler.classifySystemError(systemError, '/protected/file');

      expect(classifiedError.type).toBe(ErrorType.PERMISSION_DENIED);
      expect(classifiedError.path).toBe('/protected/file');
      expect(classifiedError.message).toContain('Permission denied');
    });

    it('should classify EPERM error as PERMISSION_DENIED', () => {
      const systemError = new Error('EPERM: operation not permitted, rmdir \'/system/dir\'');
      systemError.name = 'EPERM';

      const classifiedError = errorHandler.classifySystemError(systemError, '/system/dir');

      expect(classifiedError.type).toBe(ErrorType.PERMISSION_DENIED);
      expect(classifiedError.path).toBe('/system/dir');
      expect(classifiedError.message).toContain('Operation not permitted');
    });

    it('should classify unknown error as SYSTEM_ERROR', () => {
      const systemError = new Error('Unknown file system error');

      const classifiedError = errorHandler.classifySystemError(systemError, '/some/path');

      expect(classifiedError.type).toBe(ErrorType.SYSTEM_ERROR);
      expect(classifiedError.path).toBe('/some/path');
      expect(classifiedError.cause).toBe(systemError);
    });
  });

  describe('Error Message Generation', () => {
    it('should generate user-friendly error messages', () => {
      const error = new SafeDeletionError(
        ErrorType.PROTECTION_VIOLATION,
        'Path matches protected pattern: .git',
        '/project/.git/config',
      );

      const userMessage = errorHandler.generateUserMessage(error);

      expect(userMessage).toContain('cannot be deleted');
      expect(userMessage).toContain('protected');
      expect(userMessage).toContain('/project/.git/config');
    });

    it('should generate technical error messages for logging', () => {
      const cause = new Error('EACCES: permission denied');
      const error = new SafeDeletionError(
        ErrorType.SYSTEM_ERROR,
        'File system operation failed',
        '/system/file',
        cause,
      );

      const techMessage = errorHandler.generateTechnicalMessage(error);

      expect(techMessage).toContain('SYSTEM_ERROR');
      expect(techMessage).toContain('/system/file');
      expect(techMessage).toContain('EACCES: permission denied');
    });
  });
});
