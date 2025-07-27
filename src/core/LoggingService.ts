import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { type AuditLog, type Configuration } from '@/types/index.js';

export class LoggingService {
  private readonly logDirectory: string;
  private readonly config: Configuration;
  private readonly inMemoryLogs: AuditLog[] = [];
  private logFileHandle: fs.FileHandle | null = null;
  private currentLogFile = '';
  private currentLogFileSize = 0;

  constructor(config: Configuration, logDirectory?: string) {
    this.config = config;
    this.logDirectory = logDirectory ?? path.join(process.cwd(), 'logs');

    // Only initialize log directory if logging is enabled (not 'none')
    if (this.config.logLevel !== 'none') {
      void this.initializeLogDirectory();
    }
  }

  private async initializeLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      // Use timestamp and random number to ensure unique log files for testing
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const random = Math.random().toString(36).substring(2, 8);
      this.currentLogFile = path.join(
        this.logDirectory,
        `safe-deletion-${timestamp}-${random}.log`,
      );

      // Initialize current file size
      try {
        const stats = await fs.stat(this.currentLogFile);
        this.currentLogFileSize = stats.size;
      }
      catch {
        // File doesn't exist yet, start with size 0
        this.currentLogFileSize = 0;
      }
    }
    catch (error) {
      console.error('Failed to initialize log directory:', error);
    }
  }

  /**
   * Log a deletion operation with result and optional reason
   */
  async logDeletion(
    filePath: string,
    result: 'success' | 'failed' | 'rejected',
    reason?: string,
  ): Promise<void> {
    const logEntry: AuditLog = {
      timestamp: new Date(),
      operation: 'delete',
      paths: [filePath],
      result,
      reason,
      requestId: uuidv4(),
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log a general operation (list_protected, get_allowed)
   */
  async logOperation(
    operation: 'delete' | 'list_protected' | 'get_allowed',
    result: 'success' | 'failed' | 'rejected',
    paths?: string[],
    reason?: string,
  ): Promise<void> {
    const logEntry: AuditLog = {
      timestamp: new Date(),
      operation,
      paths,
      result,
      reason,
      requestId: uuidv4(),
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log an error with context information
   */
  async logError(error: Error, context: string): Promise<void> {
    const includeStack = this.config.logLevel === 'debug';
    const reason = includeStack && (error.stack !== undefined && error.stack !== '')
      ? `${context}: ${error.message}\n${error.stack}`
      : `${context}: ${error.message}`;

    const logEntry: AuditLog = {
      timestamp: new Date(),
      operation: 'delete', // Assume most errors are related to delete operations
      result: 'failed',
      reason,
      requestId: uuidv4(),
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log server startup with configuration details
   */
  async logServerStart(config: Configuration): Promise<void> {
    const configDetails = [
      `Server started with configuration:`,
      `- Allowed directories: ${config.allowedDirectories.join(', ')}`,
      `- Protected patterns: ${config.protectedPatterns.join(', ')}`,
      `- Log level: ${config.logLevel}`,
      `- Max batch size: ${config.maxBatchSize}`,
    ].join('\n');

    const logEntry: AuditLog = {
      timestamp: new Date(),
      operation: 'get_allowed', // Use get_allowed as a proxy for server configuration
      result: 'success',
      reason: configDetails,
      requestId: uuidv4(),
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log debug messages (only when log level is debug)
   */
  async logDebug(message: string): Promise<void> {
    if (this.config.logLevel !== 'debug') {
      return;
    }

    const logEntry: AuditLog = {
      timestamp: new Date(),
      operation: 'get_allowed', // Use a neutral operation for debug logs
      result: 'success',
      reason: `DEBUG: ${message}`,
      requestId: uuidv4(),
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Write a log entry to both memory and file
   */
  private async writeLogEntry(logEntry: AuditLog): Promise<void> {
    // Skip all logging if log level is 'none'
    if (this.config.logLevel === 'none') {
      return;
    }

    // Check if log should be written based on log level
    if (!this.shouldLog(logEntry)) {
      return;
    }

    // Add to in-memory logs
    this.inMemoryLogs.push(logEntry);

    // Keep only the last 1000 logs in memory
    if (this.inMemoryLogs.length > 1000) {
      this.inMemoryLogs.splice(0, this.inMemoryLogs.length - 1000);
    }

    // Write to file
    await this.writeToFile(logEntry);
  }

  /**
   * Determine if a log entry should be written based on log level
   */
  private shouldLog(logEntry: AuditLog): boolean {
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = logLevels.indexOf(this.config.logLevel);

    // Determine log level for this entry
    let entryLevelIndex: number;

    if (logEntry.result === 'failed') {
      entryLevelIndex = 3; // error
    }
    else if (logEntry.result === 'rejected') {
      entryLevelIndex = 2; // warn
    }
    else if (logEntry.reason?.startsWith('DEBUG:') === true) {
      entryLevelIndex = 0; // debug
    }
    else {
      entryLevelIndex = 1; // info
    }

    return entryLevelIndex >= configLevelIndex;
  }

  /**
   * Write log entry to file in JSON format
   */
  private async writeToFile(logEntry: AuditLog): Promise<void> {
    try {
      // Ensure log directory and file exist
      if (this.currentLogFile === '') {
        await this.initializeLogDirectory();
      }

      // Convert to JSON string with date serialization
      const jsonEntry = JSON.stringify({
        ...logEntry,
        timestamp: logEntry.timestamp.toISOString(),
      });

      const entryWithNewline = jsonEntry + '\n';
      const entrySize = Buffer.byteLength(entryWithNewline, 'utf-8');

      // Check if rotation is needed
      if (this.shouldRotateLog(entrySize)) {
        await this.rotateLogFile();
      }

      // Append to log file
      await fs.appendFile(this.currentLogFile, entryWithNewline, 'utf-8');
      this.currentLogFileSize += entrySize;
    }
    catch (error) {
      console.error('Failed to write log entry to file:', error);
    }
  }

  /**
   * Check if log rotation is needed
   */
  private shouldRotateLog(entrySize: number): boolean {
    const maxSize = this.config.maxLogFileSize ?? 10 * 1024 * 1024; // Default 10MB
    return this.currentLogFileSize + entrySize > maxSize;
  }

  /**
   * Rotate the current log file
   */
  private async rotateLogFile(): Promise<void> {
    try {
      if (this.currentLogFile === '') {
        return;
      }

      // Close current file handle
      if (this.logFileHandle) {
        await this.logFileHandle.close();
        this.logFileHandle = null;
      }

      // Generate new log file name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const random = Math.random().toString(36).substring(2, 8);
      const newLogFile = path.join(
        this.logDirectory,
        `safe-deletion-${timestamp}-${random}.log`,
      );

      // Update current log file
      this.currentLogFile = newLogFile;
      this.currentLogFileSize = 0;

      // Clean up old log files if needed
      await this.cleanupOldLogFiles();
    }
    catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Remove old log files beyond the retention limit
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const maxFiles = this.config.maxLogFiles ?? 5;
      const files = await fs.readdir(this.logDirectory);

      // Filter and sort log files by modification time
      const logFiles = files
        .filter(file => file.startsWith('safe-deletion-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDirectory, file),
        }));

      if (logFiles.length <= maxFiles) {
        return;
      }

      // Get file stats and sort by modification time (oldest first)
      const fileStats = await Promise.all(
        logFiles.map(async file => ({
          ...file,
          stats: await fs.stat(file.path),
        })),
      );

      fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());

      // Remove oldest files beyond the limit (keep newest maxFiles)
      const filesToRemove = fileStats.slice(0, fileStats.length - maxFiles);

      for (const file of filesToRemove) {
        try {
          await fs.unlink(file.path);
        }
        catch (error) {
          console.error(`Failed to remove old log file ${file.name}:`, error);
        }
      }
    }
    catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  /**
   * Get recent log entries from memory
   */
  async getRecentLogs(limit = 100): Promise<AuditLog[]> {
    return this.inMemoryLogs
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Force flush any pending log operations
   */
  async flush(): Promise<void> {
    // Since we're using appendFile which is atomic,
    // this is mainly for testing purposes to ensure writes are complete
    // In a real implementation, you might have buffered writes to flush
    try {
      if (this.logFileHandle) {
        await this.logFileHandle.sync();
      }
    }
    catch (_error) {
      // Ignore flush errors for now
    }
  }

  /**
   * Close the logging service and any open file handles
   */
  async close(): Promise<void> {
    try {
      if (this.logFileHandle) {
        await this.logFileHandle.close();
        this.logFileHandle = null;
      }
    }
    catch (error) {
      console.error('Failed to close log file handle:', error);
    }
  }
}
