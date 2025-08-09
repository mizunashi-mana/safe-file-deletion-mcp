import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ComprehensiveErrorHandler } from '@/core/ComprehensiveErrorHandler.js';
import { ConfigurationManager } from '@/core/ConfigurationManager.js';
import { ErrorHandler } from '@/core/ErrorHandler.js';
import { LoggingService } from '@/core/LoggingService.js';
import { MCPServer } from '@/core/MCPServer.js';
import { ProtectionEngine } from '@/core/ProtectionEngine.js';
import { SafeDeletionService } from '@/core/SafeDeletionService.js';
import { type Configuration } from '@/types/index.js';

// Load package.json dynamically
function findPackageJsonPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Try different paths based on build context
  const possiblePaths = [
    join(currentDir, '../../../package.json'), // Development/test from src/core/
    join(currentDir, '../../package.json'), // Built from dist/src/core/
  ];

  for (const path of possiblePaths) {
    try {
      readFileSync(path, 'utf-8');
      return path;
    }
    catch {
      // Continue to next path
    }
  }

  throw new Error('Could not find package.json. Make sure the application is running from the correct directory.');
}

const packageJsonPath = findPackageJsonPath();

const packageJson: {
  name: string;
  version: string;
  description: string;
  homepage: string;
  license: string;
  repository: { url: string };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- package.json is a known structure
} = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  name: string;
  version: string;
  description: string;
  homepage: string;
  license: string;
  repository: { url: string };
};

// CLI argument interface
export interface CLIArguments {
  allowedDirectories: string[];
  protectedPatterns: string[];
  configPath?: string;
  logLevel?: 'none' | 'debug' | 'info' | 'warn' | 'error';
  showHelp?: boolean;
  showVersion?: boolean;
}

function isLogLevel(value: string): value is 'none' | 'debug' | 'info' | 'warn' | 'error' {
  return ['none', 'debug', 'info', 'warn', 'error'].includes(value);
}

// Server startup result interface
export interface StartupResult {
  success: boolean;
  error?: string;
  suggestion?: string;
}

// Component container interface
export interface ServerComponents {
  configManager: ConfigurationManager;
  protectionEngine: ProtectionEngine;
  deletionService: SafeDeletionService;
  loggingService: LoggingService;
  mcpServer: MCPServer;
  errorHandler: ErrorHandler;
  comprehensiveErrorHandler: ComprehensiveErrorHandler;
}

export class ServerStartup {
  /**
   * Parse CLI arguments into structured format
   */
  parseCliArguments(args: string[]): CLIArguments {
    const { values } = parseArgs({
      args,
      options: {
        'allowed-directories': { type: 'string' },
        'protected-patterns': { type: 'string' },
        'config': { type: 'string' },
        'log-level': { type: 'string' },
        'help': { type: 'boolean', short: 'h' },
        'version': { type: 'boolean', short: 'v' },
      },
      allowPositionals: false,
      strict: true, // Reject unknown options
    });

    const result: CLIArguments = {
      allowedDirectories: [],
      protectedPatterns: [],
    };

    if (typeof values['allowed-directories'] === 'string') {
      // Convert relative paths to absolute paths
      result.allowedDirectories = values['allowed-directories'].split(',').map((d: string) => resolve(d.trim()));
    }

    if (typeof values['protected-patterns'] === 'string') {
      result.protectedPatterns = values['protected-patterns'].split(',').map((p: string) => p.trim());
    }

    if (typeof values.config === 'string') {
      result.configPath = values.config;
    }

    if (typeof values['log-level'] === 'string' && isLogLevel(values['log-level'])) {
      result.logLevel = values['log-level'];
    }

    if (values.help === true) {
      result.showHelp = true;
    }

    if (values.version === true) {
      result.showVersion = true;
    }

    return result;
  }

  /**
   * Initialize configuration from CLI arguments and config file
   */
  async initializeConfiguration(cliArgs: CLIArguments): Promise<Configuration> {
    const configManager = new ConfigurationManager(cliArgs, cliArgs.configPath);
    return await configManager.initialize();
  }

  /**
   * Initialize all server components with dependency injection
   */
  async initializeComponents(config: Configuration): Promise<ServerComponents> {
    // Create configuration manager
    const configManager = new ConfigurationManager({
      allowedDirectories: config.allowedDirectories,
      protectedPatterns: config.protectedPatterns,
      logLevel: config.logLevel,
    });
    await configManager.initialize();

    // Create protection engine
    const protectionEngine = new ProtectionEngine(
      config.protectedPatterns,
      config.allowedDirectories,
    );

    // Create logging service
    const loggingService = new LoggingService(config);

    // Create error handlers
    const errorHandler = new ErrorHandler();
    const comprehensiveErrorHandler = new ComprehensiveErrorHandler(
      errorHandler,
      loggingService,
    );

    // Create deletion service with logger interface
    const logger = {
      logDeletion: async (path: string, result: 'success' | 'failed' | 'rejected', reason?: string): Promise<void> => {
        await loggingService.logDeletion(path, result, reason);
      },
      logError: async (error: Error, context: string): Promise<void> => {
        await loggingService.logError(error, context);
      },
    };

    const deletionService = new SafeDeletionService(
      config,
      protectionEngine,
      logger,
    );

    // Create MCP server
    const mcpServer = new MCPServer(
      configManager,
      protectionEngine,
      deletionService,
      loggingService,
    );

    return {
      configManager,
      protectionEngine,
      deletionService,
      loggingService,
      mcpServer,
      errorHandler,
      comprehensiveErrorHandler,
    };
  }

  /**
   * Start the server with given CLI arguments
   */
  async startServer(cliArgs: CLIArguments): Promise<StartupResult> {
    try {
      // Initialize configuration
      const config = await this.initializeConfiguration(cliArgs);

      // Initialize all components
      const components = await this.initializeComponents(config);

      // Log server startup
      await components.loggingService.logServerStart(config);

      // Start MCP server
      await components.mcpServer.start();

      // Register shutdown handlers
      this.registerShutdownHandlers(
        components.mcpServer,
        components.loggingService,
      );

      return { success: true };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        suggestion: this.generateErrorSuggestion(errorMessage),
      };
    }
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  registerShutdownHandlers(mcpServer: MCPServer, loggingService: LoggingService): void {
    const gracefulShutdown = async () => {
      console.log('\\nReceived shutdown signal, shutting down gracefully...');

      try {
        await mcpServer.stop();
        await loggingService.close();
        console.log('Server shut down successfully.');
      }
      catch (error) {
        console.error('Error during shutdown:', error);
      }
      finally {
        // eslint-disable-next-line n/no-process-exit -- Required for graceful shutdown
        process.exit(0);
      }
    };

    process.on('SIGINT', () => {
      void gracefulShutdown();
    });
    process.on('SIGTERM', () => {
      void gracefulShutdown();
    });
  }

  /**
   * Graceful shutdown of all components
   */
  async gracefulShutdown(components: ServerComponents): Promise<void> {
    try {
      // Stop MCP server
      await components.mcpServer.stop();
    }
    catch (error) {
      console.warn('Error stopping MCP server:', error);
    }

    try {
      // Dispose protection engine
      components.protectionEngine.dispose();
    }
    catch (error) {
      console.warn('Error disposing protection engine:', error);
    }

    try {
      // Close logging service
      await components.loggingService.close();
    }
    catch (error) {
      console.warn('Error closing logging service:', error);
    }
  }

  /**
   * Generate helpful error suggestions based on error message
   */
  private generateErrorSuggestion(errorMessage: string): string {
    if (errorMessage.includes('At least one allowed directory must be specified')) {
      return 'Please specify at least one allowed directory using --allowed-directories flag.';
    }

    if (errorMessage.includes('Allowed directory does not exist')) {
      return 'Please verify the directory path exists and is accessible.';
    }

    if (errorMessage.includes('permission denied') || errorMessage.includes('EACCES')) {
      return 'Please check access permissions for the specified directories.';
    }

    if (errorMessage.includes('ENOENT')) {
      return 'Please verify the file or directory path is correct.';
    }

    if (errorMessage.includes('Failed to bind')) {
      return 'Another instance might be running, or there may be a port conflict.';
    }

    if (errorMessage.includes('config')) {
      return 'Please check the configuration file format and values.';
    }

    return 'Please check the error details and refer to the documentation for guidance.';
  }

  /**
   * Display help information
   */
  displayHelp(): void {
    const binaryName = 'safe-file-deletion-mcp';
    console.log(`
${packageJson.description}
Version: ${packageJson.version}

USAGE:
  ${binaryName} [OPTIONS]

OPTIONS:
  --allowed-directories <dirs>    Comma-separated list of allowed directories
  --protected-patterns <patterns> Comma-separated list of protected patterns
  --config <path>                 Path to configuration file
  --log-level <level>             Log level (none, debug, info, warn, error)
  --help, -h                      Show this help message
  --version, -v                   Show version information

EXAMPLES:
  ${binaryName} --allowed-directories /tmp,/home/user/projects --protected-patterns .git,node_modules
  ${binaryName} --config /etc/safe-deletion.json --log-level debug

For more information, visit: ${packageJson.homepage}
`);
  }

  /**
   * Display version information
   */
  displayVersion(): void {
    console.log(`${packageJson.name} v${packageJson.version}`);
    console.log(`Description: ${packageJson.description}`);
    console.log(`License: ${packageJson.license}`);
    console.log(`Homepage: ${packageJson.homepage}`);
  }
}
