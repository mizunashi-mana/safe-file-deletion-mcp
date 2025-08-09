#!/usr/bin/env node

import { ServerStartup } from '@/core/ServerStartup.js';

/**
 * Main entry point for the Safe File Deletion MCP Server
 */
async function main(): Promise<void> {
  const serverStartup = new ServerStartup();

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const cliArgs = serverStartup.parseCliArguments(args);

    // Handle help and version flags
    if (cliArgs.showHelp === true) {
      serverStartup.displayHelp();
      return;
    }

    if (cliArgs.showVersion === true) {
      serverStartup.displayVersion();
      return;
    }

    // Validate required arguments
    if (cliArgs.allowedDirectories.length === 0) {
      console.error('Error: At least one allowed directory must be specified.');
      console.error('Use --allowed-directories to specify directories where files can be deleted.');
      console.error('Run with --help for more information.');
      // eslint-disable-next-line n/no-process-exit -- Required for error exit code
      process.exit(1);
    }

    // Display startup information
    console.log('Starting Safe File Deletion MCP Server...');
    console.log(`Allowed directories: ${cliArgs.allowedDirectories.join(', ')}`);
    console.log(`Protected patterns: ${cliArgs.protectedPatterns.length > 0 ? cliArgs.protectedPatterns.join(', ') : 'none'}`);
    console.log(`Log level: ${cliArgs.logLevel ?? 'none'}`);
    console.log('');

    // Start the server
    const result = await serverStartup.startServer(cliArgs);

    if (result.success) {
      console.log('✅ Safe File Deletion MCP Server started successfully!');
      console.log('Server is ready to accept MCP connections via stdio.');
    }
    else {
      console.error('❌ Failed to start server:', result.error);
      if (result.suggestion !== undefined) {
        console.error('💡 Suggestion:', result.suggestion);
      }
      // eslint-disable-next-line n/no-process-exit -- Required for error exit code
      process.exit(1);
    }
  }
  catch (error) {
    console.error('❌ Unexpected error during startup:', error);
    // eslint-disable-next-line n/no-process-exit -- Required for error exit code
    process.exit(1);
  }
}

// Error handling for unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // eslint-disable-next-line n/no-process-exit -- Required for unhandled rejection
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // eslint-disable-next-line n/no-process-exit -- Required for uncaught exception
  process.exit(1);
});

// Start the application
main().catch((error: unknown) => {
  console.error('Failed to start application:', error);
  // eslint-disable-next-line n/no-process-exit -- Required for startup failure
  process.exit(1);
});
