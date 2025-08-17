import type { LoggingService } from '@/services/LoggingService.js';
import type { AuditLog, Configuration } from '@/types/index.js';

export class MockLoggingService implements LoggingService {
  private readonly logs: AuditLog[] = [];

  async logDeletion(
    filePath: string,
    result: 'success' | 'failed' | 'rejected',
    reason?: string,
  ): Promise<void> {
    this.logs.push({
      timestamp: new Date(),
      operation: 'delete',
      paths: [filePath],
      result,
      reason,
      requestId: `mock-${Date.now()}`,
    });
  }

  async logOperation(
    operation: 'delete' | 'list_protected' | 'get_allowed',
    result: 'success' | 'failed' | 'rejected',
    paths?: string[],
    reason?: string,
  ): Promise<void> {
    this.logs.push({
      timestamp: new Date(),
      operation,
      paths,
      result,
      reason,
      requestId: `mock-${Date.now()}`,
    });
  }

  async logError(error: Error, context: string): Promise<void> {
    this.logs.push({
      timestamp: new Date(),
      operation: 'delete',
      result: 'failed',
      reason: `${context}: ${error.message}`,
      requestId: `mock-${Date.now()}`,
    });
  }

  async logServerStart(config: Configuration): Promise<void> {
    this.logs.push({
      timestamp: new Date(),
      operation: 'delete',
      result: 'success',
      reason: `Server started with config: ${JSON.stringify(config)}`,
      requestId: `mock-${Date.now()}`,
    });
  }

  async logDebug(message: string): Promise<void> {
    this.logs.push({
      timestamp: new Date(),
      operation: 'delete',
      result: 'success',
      reason: message,
      requestId: `mock-${Date.now()}`,
    });
  }

  async getRecentLogs(limit?: number): Promise<AuditLog[]> {
    return this.logs.slice(-(limit ?? 10));
  }

  getLogCount(): number {
    return this.logs.length;
  }

  getAllLogs(): AuditLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs.length = 0;
  }
}
