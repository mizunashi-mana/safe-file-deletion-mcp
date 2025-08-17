import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { buildContainer, type DIContainer } from '@/container/DIContainer.js';
import { loadConfig } from '@/loader/loadConfig.js';
import { type LoggingService } from '@/services/LoggingService.js';
import { loadPackageInfo, type PackageInfoProvider } from '@/services/PackageInfoProvider.js';
import { type SafeFileDeletionMCPServer } from '@/services/SafeFileDeletionMCPServer.js';
import { type CLIArguments } from '@/types/index.js';

interface ServerComponents {
  mcpServer: SafeFileDeletionMCPServer;
  loggingService: LoggingService;
}

export class ServerStartup {
  private container?: DIContainer;
  private packageInfoProvider?: PackageInfoProvider;

  /**
   * Initialize package info provider
   */
  async initializePackageInfo(): Promise<PackageInfoProvider> {
    this.packageInfoProvider ??= await loadPackageInfo();
    return this.packageInfoProvider;
  }

  /**
   * Parse command-line arguments
   */
  async parseArguments(): Promise<CLIArguments | undefined> {
    const packageInfoProvider = await this.initializePackageInfo();

    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        'allowed-directories': {
          type: 'string',
          multiple: true,
          default: [],
        },
        'protected-patterns': {
          type: 'string',
          multiple: true,
          default: [],
        },
        'log-level': {
          type: 'string',
          default: 'info',
        },
        'max-batch-size': {
          type: 'string',
        },
        'max-log-file-size': {
          type: 'string',
        },
        'max-log-files': {
          type: 'string',
        },
        'config-file': {
          type: 'string',
        },
        'help': {
          type: 'boolean',
        },
        'version': {
          type: 'boolean',
        },
      },
      allowPositionals: false,
    });

    // Handle help
    if (values.help === true) {
      console.log(`${packageInfoProvider.getName()} v${packageInfoProvider.getVersion()}
${packageInfoProvider.getDescription()}

Usage: ${packageInfoProvider.getName()} [options]

Options:
  --allowed-directories <dir>...  Directories where deletion is allowed (required)
  --protected-patterns <pattern>... Glob patterns for protected files (default: [".git", "node_modules", ".env*"])
  --log-level <level>            Log level: none, debug, info, warn, error (default: info)
  --max-batch-size <size>        Maximum batch deletion size (default: 100)
  --max-log-file-size <bytes>    Maximum log file size in bytes (default: 10485760)
  --max-log-files <count>        Maximum number of log files to keep (default: 10)
  --config-file <path>           Path to configuration file
  --help                         Show this help message
  --version                      Show version information

MCP Server for safe file deletion with comprehensive logging and protection mechanisms.
`);
      return undefined;
    }

    // Handle version
    if (values.version === true) {
      console.log(packageInfoProvider.getVersion());
      return undefined;
    }

    // Convert parsed values to CLIArguments
    const logLevelValue = values['log-level'];
    const isValidLogLevel = (value: unknown): value is 'none' | 'debug' | 'info' | 'warn' | 'error' => {
      return typeof value === 'string' && ['none', 'debug', 'info', 'warn', 'error'].includes(value);
    };

    return {
      allowedDirectories: values['allowed-directories'] as string[] | undefined,
      protectedPatterns: values['protected-patterns'] as string[] | undefined,
      logLevel: isValidLogLevel(logLevelValue) ? logLevelValue : undefined,
      maxBatchSize: values['max-batch-size'] !== undefined ? Number(values['max-batch-size']) : undefined,
      maxLogFileSize: values['max-log-file-size'] !== undefined ? Number(values['max-log-file-size']) : undefined,
      maxLogFiles: values['max-log-files'] !== undefined ? Number(values['max-log-files']) : undefined,
      configFile: values['config-file'],
    };
  }

  /**
   * Initialize all server components
   */
  async initializeComponents(args: CLIArguments): Promise<ServerComponents> {
    // Get package info provider (already initialized)
    const packageInfoProvider = await this.initializePackageInfo();

    // Load configuration
    const configProvider = await loadConfig(args);

    // Build DI container
    this.container = buildContainer({
      packageInfoProvider,
      configProvider,
    });

    // Get services from container
    const mcpServer = this.container.getMCPServer();
    const loggingService = this.container.getLoggingService();

    // Log server startup
    await loggingService.logServerStart({
      allowedDirectories: configProvider.getAllowedDirectories(),
      protectedPatterns: configProvider.getProtectedPatterns(),
      logLevel: configProvider.getLogLevel(),
      maxBatchSize: configProvider.getMaxBatchSize(),
      maxLogFileSize: configProvider.getMaxLogFileSize(),
      maxLogFiles: configProvider.getMaxLogFiles(),
    });

    return {
      mcpServer,
      loggingService,
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      // Parse arguments
      const args = await this.parseArguments();
      if (args === undefined) {
        return;
      }

      // Initialize components
      const { mcpServer, loggingService } = await this.initializeComponents(args);

      // Start the server
      const packageInfoProvider = await this.initializePackageInfo();
      console.error(`Starting ${packageInfoProvider.getName()} v${packageInfoProvider.getVersion()}...`);
      await mcpServer.start();

      // Log successful startup
      await loggingService.logDebug('Server started successfully');
    }
    catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }
}
