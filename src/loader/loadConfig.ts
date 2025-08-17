import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { type ConfigProvider } from '@/services/ConfigProvider.js';
import { type CLIArguments, DEFAULT_CONFIG, type FileConfig, type Configuration } from '@/types/index.js';

const FileConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).optional(),
  protectedPatterns: z.array(z.string()).optional(),
  logLevel: z.enum(['none', 'debug', 'info', 'warn', 'error']).optional(),
  maxBatchSize: z.number().positive().optional(),
  maxLogFileSize: z.number().positive().optional(),
  maxLogFiles: z.number().positive().optional(),
});

class ConfigProviderImpl implements ConfigProvider {
  constructor(private readonly config: Configuration & { logDirectory: string }) {}

  getAllowedDirectories(): string[] {
    return this.config.allowedDirectories;
  }

  getProtectedPatterns(): string[] {
    return this.config.protectedPatterns;
  }

  getLogLevel(): 'none' | 'debug' | 'info' | 'warn' | 'error' {
    return this.config.logLevel;
  }

  getLogDirectory(): string {
    return this.config.logDirectory;
  }

  getMaxBatchSize(): number {
    return this.config.maxBatchSize;
  }

  getMaxLogFileSize(): number | undefined {
    return this.config.maxLogFileSize;
  }

  getMaxLogFiles(): number | undefined {
    return this.config.maxLogFiles;
  }
}

export async function loadConfig(
  args: CLIArguments,
): Promise<ConfigProvider> {
  const fileConfig = await loadConfigFile(args.configFile);
  const mergedConfig = mergeConfigurations(args, fileConfig, DEFAULT_CONFIG);

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

  return new ConfigProviderImpl({
    ...mergedConfig,
    logDirectory: DEFAULT_CONFIG.logDirectory,
  });
}

async function loadConfigFile(configPath: string | undefined): Promise<FileConfig> {
  if (configPath === undefined || configPath === '') {
    return {};
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
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

function mergeConfigurations(
  cli: CLIArguments,
  file: FileConfig,
  defaults: Partial<Configuration>,
): Configuration {
  // CLI引数 > 設定ファイル > デフォルト値の優先順位
  // Convert all paths to absolute paths
  const allowedDirectories = (cli.allowedDirectories && cli.allowedDirectories.length > 0
    ? cli.allowedDirectories
    : file.allowedDirectories ?? []).map((dir: string) => path.resolve(dir));

  const protectedPatterns = cli.protectedPatterns && cli.protectedPatterns.length > 0
    ? cli.protectedPatterns
    : file.protectedPatterns ?? defaults.protectedPatterns ?? [];

  const logLevel = cli.logLevel ?? file.logLevel ?? defaults.logLevel ?? 'none';
  const maxBatchSize = file.maxBatchSize ?? defaults.maxBatchSize ?? 100;
  const maxLogFileSize = file.maxLogFileSize ?? defaults.maxLogFileSize;
  const maxLogFiles = file.maxLogFiles ?? defaults.maxLogFiles;

  return {
    allowedDirectories: normalizeDirectories(allowedDirectories),
    protectedPatterns,
    logLevel,
    maxBatchSize,
    maxLogFileSize,
    maxLogFiles,
  };
}

function normalizeDirectories(directories: string[]): string[] {
  return directories.map((dir) => {
    if (path.isAbsolute(dir)) {
      return dir;
    }
    return path.resolve(process.cwd(), dir);
  });
}
