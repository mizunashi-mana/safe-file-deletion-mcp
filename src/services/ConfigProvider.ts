export type LogLevel = 'none' | 'debug' | 'info' | 'warn' | 'error';

export const ConfigProviderTag = Symbol.for('ConfigProvider');

export interface ConfigProvider {
  getAllowedDirectories: () => string[];
  getProtectedPatterns: () => string[];
  getLogLevel: () => LogLevel;
  getLogDirectory: () => string;
  getMaxBatchSize: () => number;
  getMaxLogFileSize: () => number | undefined;
  getMaxLogFiles: () => number | undefined;
}

export type CLIArguments = {
  allowedDirectories: string[];
  protectedPatterns: string[];
  configPath?: string;
  logLevel?: LogLevel;
};

export type Configuration = {
  allowedDirectories: string[];
  protectedPatterns: string[];
  logLevel: LogLevel;
  logDirectory: string;
  maxBatchSize: number;
  maxLogFileSize?: number;
  maxLogFiles?: number;
};

export class ConfigProviderImpl implements ConfigProvider {
  constructor(private readonly config: Configuration) {}

  getAllowedDirectories(): string[] {
    return this.config.allowedDirectories;
  }

  getProtectedPatterns(): string[] {
    return this.config.protectedPatterns;
  }

  getLogLevel(): LogLevel {
    return this.config.logLevel;
  }

  getMaxBatchSize(): number {
    return this.config.maxBatchSize;
  }

  getLogDirectory(): string {
    return this.config.logDirectory;
  }

  getMaxLogFileSize(): number | undefined {
    return this.config.maxLogFileSize;
  }

  getMaxLogFiles(): number | undefined {
    return this.config.maxLogFiles;
  }
}
