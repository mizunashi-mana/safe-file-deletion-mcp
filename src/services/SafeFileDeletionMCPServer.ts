import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { inject, injectable } from 'inversify';
import { z } from 'zod';
import { PackageInfoProvider, PackageInfoProviderTag } from '@/services/PackageInfoProvider.js';
import { DeleteToolHandler } from '@/services/tools/DeleteToolHandler.js';
import { GetAllowedHandler } from '@/services/tools/GetAllowedHandler.js';
import { ListProtectedHandler } from '@/services/tools/ListProtectedHandler.js';

@injectable()
export class SafeFileDeletionMCPServer {
  private readonly server: McpServer;
  private readonly transport: StdioServerTransport;

  constructor(
    @inject(PackageInfoProviderTag) private readonly packageInfoProvider: PackageInfoProvider,
    @inject(DeleteToolHandler)
    private readonly deleteToolHandler: DeleteToolHandler,
    @inject(GetAllowedHandler)
    private readonly getAllowedHandler: GetAllowedHandler,
    @inject(ListProtectedHandler)
    private readonly listProtectedHandler: ListProtectedHandler,
  ) {
    // Initialize MCP server
    this.server = new McpServer(
      {
        name: packageInfoProvider.getName(),
        version: packageInfoProvider.getVersion(),
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Initialize transport
    this.transport = new StdioServerTransport();

    // Register tools
    this.registerTools();
  }

  private registerTools(): void {
    // Register delete tool
    this.server.registerTool(
      'delete',
      {
        description: 'Delete files or directories safely with protection checks',
        inputSchema: {
          paths: z.array(z.string()).min(1).describe('Array of file or directory paths to delete'),
        },
      },
      async args => await this.deleteToolHandler.handle(args),
    );

    // Register list_protected tool
    this.server.registerTool(
      'list_protected',
      {
        description: 'List all protected patterns that prevent deletion',
        inputSchema: {},
      },
      async () => await this.listProtectedHandler.handle(),
    );

    // Register get_allowed tool
    this.server.registerTool(
      'get_allowed',
      {
        description: 'Get allowed directories where files can be deleted',
        inputSchema: {},
      },
      async () => await this.getAllowedHandler.handle(),
    );
  }

  async start(): Promise<void> {
    await this.server.connect(this.transport);
  }

  async stop(): Promise<void> {
    try {
      await this.transport.close();
    }
    catch (error) {
      console.warn('Failed to close transport:', error);
    }

    try {
      await this.server.close();
    }
    catch (error) {
      console.warn('Failed to close server:', error);
    }
  }
}
