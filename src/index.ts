#!/usr/bin/env node

import { ServerStartup } from '@/core/ServerStartup.js';

/**
 * Main entry point for the Safe File Deletion MCP Server
 */
async function main(): Promise<void> {
  const serverStartup = new ServerStartup();

  try {
    // Start the server (handles argument parsing internally)
    await serverStartup.start();
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
