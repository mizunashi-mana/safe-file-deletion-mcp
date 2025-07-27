import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

export interface CLIArguments {
  allowedDirectories: string[];
  protectedPatterns: string[];
  configPath?: string;
  logLevel?: 'none' | 'debug' | 'info' | 'warn' | 'error';
}

export interface Configuration {
  allowedDirectories: string[];
  protectedPatterns: string[];
  logLevel: 'none' | 'debug' | 'info' | 'warn' | 'error';
  maxBatchSize: number;
}

interface FileConfig {
  allowedDirectories?: string[];
  protectedPatterns?: string[];
  logLevel?: 'none' | 'debug' | 'info' | 'warn' | 'error';
  maxBatchSize?: number;
}

const DEFAULT_CONFIG: Partial<Configuration> = {
  protectedPatterns: ['.git'],
  logLevel: 'none', // Logging disabled by default
  maxBatchSize: 100,
};

const FileConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).optional(),
  protectedPatterns: z.array(z.string()).optional(),
  logLevel: z.enum(['none', 'debug', 'info', 'warn', 'error']).optional(),
  maxBatchSize: z.number().positive().optional(),
});

export class ConfigurationManager {
  private configuration?: Configuration;

  constructor(
    private readonly args: CLIArguments,
    private readonly configPath?: string,
  ) {}

  async initialize(): Promise<Configuration> {
    const fileConfig = await this.loadConfigFile();
    const mergedConfig = this.mergeConfigurations(this.args, fileConfig, DEFAULT_CONFIG);

    // 許可ディレクトリの検証
    if (mergedConfig.allowedDirectories.length === 0) {
      throw new Error('At least one allowed directory must be specified');
    }

    // 許可ディレクトリの存在確認
    for (const dir of mergedConfig.allowedDirectories) {
      if (!existsSync(dir)) {
        throw new Error(`Allowed directory does not exist: ${dir}`);
      }
    }

    this.configuration = mergedConfig;
    return this.configuration;
  }

  getAllowedDirectories(): string[] {
    if (!this.configuration) {
      throw new Error('Configuration not initialized');
    }
    return [...this.configuration.allowedDirectories];
  }

  getProtectedPatterns(): string[] {
    if (!this.configuration) {
      throw new Error('Configuration not initialized');
    }
    return [...this.configuration.protectedPatterns];
  }

  private async loadConfigFile(): Promise<FileConfig> {
    if (this.configPath === undefined || this.configPath === '') {
      return {};
    }

    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      return FileConfigSchema.parse(parsed);
    }
    catch (error) {
      // Return empty configuration if config file doesn't exist
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return {};
      }
      // Re-throw other errors
      throw error;
    }
  }

  private mergeConfigurations(
    cli: CLIArguments,
    file: FileConfig,
    defaults: Partial<Configuration>,
  ): Configuration {
    // CLI引数 > 設定ファイル > デフォルト値の優先順位
    // Convert all paths to absolute paths
    const allowedDirectories = (cli.allowedDirectories.length > 0
      ? cli.allowedDirectories
      : file.allowedDirectories ?? []).map(dir => path.resolve(dir));

    const protectedPatterns = cli.protectedPatterns.length > 0
      ? cli.protectedPatterns
      : file.protectedPatterns ?? defaults.protectedPatterns ?? [];

    const logLevel = cli.logLevel ?? file.logLevel ?? defaults.logLevel ?? 'none';
    const maxBatchSize = file.maxBatchSize ?? defaults.maxBatchSize ?? 100;

    return {
      allowedDirectories: this.normalizeDirectories(allowedDirectories),
      protectedPatterns,
      logLevel,
      maxBatchSize,
    };
  }

  private normalizeDirectories(directories: string[]): string[] {
    return directories.map((dir) => {
      if (path.isAbsolute(dir)) {
        return dir;
      }
      return path.resolve(process.cwd(), dir);
    });
  }
}
