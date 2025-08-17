import { z } from 'zod';

// Configuration schemas and types
export const ConfigurationSchema = z.object({
  allowedDirectories: z.array(z.string()),
  protectedPatterns: z.array(z.string()),
  logLevel: z.enum(['none', 'debug', 'info', 'warn', 'error']),
  maxBatchSize: z.number().min(1).max(1000),
  maxLogFileSize: z.number().min(1024).optional(), // Min 1KB
  maxLogFiles: z.number().min(1).max(100).optional(), // Max 100 files
});

export type Configuration = z.infer<typeof ConfigurationSchema>;

// CLI Arguments type
export interface CLIArguments {
  allowedDirectories?: string[];
  protectedPatterns?: string[];
  logLevel?: 'none' | 'debug' | 'info' | 'warn' | 'error';
  maxBatchSize?: number;
  maxLogFileSize?: number;
  maxLogFiles?: number;
  configFile?: string;
  help?: boolean;
  version?: boolean;
}

// File configuration type
export interface FileConfig {
  allowedDirectories?: string[];
  protectedPatterns?: string[];
  logLevel?: 'none' | 'debug' | 'info' | 'warn' | 'error';
  maxBatchSize?: number;
  maxLogFileSize?: number;
  maxLogFiles?: number;
  logDirectory?: string;
}

// Default configuration
export const DEFAULT_CONFIG: Configuration & { logDirectory: string } = {
  allowedDirectories: [],
  protectedPatterns: ['.git', 'node_modules', '.env*'],
  logLevel: 'info',
  maxBatchSize: 100,
  maxLogFileSize: 10485760, // 10MB
  maxLogFiles: 10,
  logDirectory: 'logs',
};

// Deletion request schemas and types
export const DeletionRequestSchema = z.object({
  paths: z.array(z.string().refine(path => path.startsWith('/'), {
    message: 'Only absolute paths are accepted',
  })).min(1),
  requestId: z.string(),
  timestamp: z.date(),
  validated: z.boolean(),
});

export type DeletionRequest = z.infer<typeof DeletionRequestSchema>;

// Audit log schemas and types
export const AuditLogSchema = z.object({
  timestamp: z.date(),
  operation: z.enum(['delete', 'list_protected', 'get_allowed']),
  paths: z.array(z.string()).optional(),
  result: z.enum(['success', 'failed', 'rejected']),
  reason: z.string().optional(),
  requestId: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// Deletion result types
export interface DeletionResult {
  success: boolean;
  path?: string;
  error?: string;
  reason?: string;
}

export interface BatchDeletionResult {
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
  rejected: Array<{ path: string; reason: string }>;
  cancelled?: boolean;
  reason?: string;
}

// Validation result types
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  matchedDirectory?: string;
}

export interface BatchValidationResult {
  valid: boolean;
  validPaths: string[];
  invalidPaths: Array<{ path: string; reason: string }>;
  protectedPaths: Array<{ path: string; reason: string }>;
}

// Protection rule types
export interface ProtectionRule {
  pattern: string;
  type: 'glob' | 'exact';
  description: string;
}

// Error types
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PROTECTION_VIOLATION = 'PROTECTION_VIOLATION',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

export class SafeDeletionError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public path?: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'SafeDeletionError';
  }
}
