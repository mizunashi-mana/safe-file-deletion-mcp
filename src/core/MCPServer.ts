import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { type ConfigurationManager } from '@/core/ConfigurationManager.js';
import { type LoggingService } from '@/core/LoggingService.js';
import { type ProtectionEngine } from '@/core/ProtectionEngine.js';
import { type SafeDeletionService } from '@/core/SafeDeletionService.js';

// Input validation schemas
const DeleteToolArgsSchema = z.object({
  paths: z.array(z.string()).min(1, 'At least one path is required'),
});

const ListProtectedArgsSchema = z.object({});

const GetAllowedArgsSchema = z.object({});

export class MCPServer {
  private readonly server: Server;
  private readonly transport: StdioServerTransport;

  constructor(
    private readonly configManager: ConfigurationManager,
    private readonly protectionEngine: ProtectionEngine,
    private readonly deletionService: SafeDeletionService,
    private readonly loggingService: LoggingService,
  ) {
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'safe-file-deletion-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Initialize transport
    this.transport = new StdioServerTransport();

    // Register request handlers
    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // Handle tools list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'delete',
            description: 'Delete files or directories safely with protection checks',
            inputSchema: {
              type: 'object',
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of file or directory paths to delete',
                  minItems: 1,
                },
              },
              required: ['paths'],
            },
          },
          {
            name: 'list_protected',
            description: 'List all protected patterns that prevent deletion',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_allowed',
            description: 'Get allowed directories where files can be deleted',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'delete':
          return await this.handleDeleteTool(args);
        case 'list_protected':
          return await this.handleListProtectedTool(args);
        case 'get_allowed':
          return await this.handleGetAllowedTool(args);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`,
          );
      }
    });
  }

  private async handleDeleteTool(args: unknown) {
    // Validate input arguments
    const validatedArgs = DeleteToolArgsSchema.parse(args);
    const { paths } = validatedArgs;

    try {
      if (paths.length === 1) {
        // Single file deletion
        const firstPath = paths[0];
        if (firstPath === undefined) {
          throw new Error('No path provided');
        }
        const result = await this.deletionService.deleteFile(firstPath);

        if (result.success) {
          await this.loggingService.logDeletion(result.path ?? '', 'success');
          return {
            content: [
              {
                type: 'text',
                text: `Successfully deleted: ${result.path}`,
              },
            ],
          };
        }
        else {
          const reason = result.error ?? result.reason ?? 'Unknown error';
          const status = result.reason !== undefined ? 'rejected' : 'failed';
          await this.loggingService.logDeletion(result.path ?? '', status, reason);

          return {
            content: [
              {
                type: 'text',
                text: `Failed to delete ${result.path}: ${reason}`,
              },
            ],
            isError: true,
          };
        }
      }
      else {
        // Batch deletion
        const result = await this.deletionService.deleteBatch(paths);

        // Log all operations
        for (const path of result.deleted) {
          await this.loggingService.logDeletion(path, 'success');
        }
        for (const { path, error } of result.failed) {
          await this.loggingService.logDeletion(path, 'failed', error);
        }
        for (const { path, reason } of result.rejected) {
          await this.loggingService.logDeletion(path, 'rejected', reason);
        }

        // Generate response
        const summary = [
          `Batch deletion completed:`,
          `- Successfully deleted: ${result.deleted.length} files`,
          `- Failed: ${result.failed.length} files`,
          `- Rejected: ${result.rejected.length} files`,
        ];

        if (result.cancelled === true) {
          summary.push(`- Operation cancelled: ${result.reason ?? 'Unknown reason'}`);
        }

        let details = '';
        if (result.failed.length > 0) {
          details += '\\n\\nFailed files:\\n';
          details += result.failed.map(f => `- ${f.path}: ${f.error}`).join('\\n');
        }
        if (result.rejected.length > 0) {
          details += '\\n\\nRejected files:\\n';
          details += result.rejected.map(r => `- ${r.path}: ${r.reason}`).join('\\n');
        }

        return {
          content: [
            {
              type: 'text',
              text: summary.join('\\n') + details,
            },
          ],
          isError: result.failed.length > 0 || result.rejected.length > 0,
        };
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error) {
        await this.loggingService.logError(error, 'delete tool');
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Delete operation failed: ${errorMessage}`,
      );
    }
  }

  private async handleListProtectedTool(args: unknown) {
    // Validate input arguments
    ListProtectedArgsSchema.parse(args);

    try {
      const patterns = this.protectionEngine.getProtectedPatterns();
      await this.loggingService.logOperation('list_protected', 'success');

      return {
        content: [
          {
            type: 'text',
            text: `Protected patterns (${patterns.length}):\\n${patterns.map(p => `- ${p}`).join('\\n')}`,
          },
        ],
      };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error) {
        await this.loggingService.logError(error, 'list_protected tool');
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list protected patterns: ${errorMessage}`,
      );
    }
  }

  private async handleGetAllowedTool(args: unknown) {
    // Validate input arguments
    GetAllowedArgsSchema.parse(args);

    try {
      const configuredDirectories = this.configManager.getAllowedDirectories();
      const validDirectories = await this.protectionEngine.validateAllowedDirectories();

      await this.loggingService.logOperation('get_allowed', 'success');

      const response = [
        `Allowed directories (${validDirectories.length}):\\n${validDirectories.map(d => `- ${d}`).join('\\n')}`,
      ];

      if (validDirectories.length !== configuredDirectories.length) {
        const invalid = configuredDirectories.filter(d => !validDirectories.includes(d));
        response.push(`\\nNote: ${invalid.length} configured directories do not exist:\\n${invalid.map(d => `- ${d}`).join('\\n')}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: response.join('\\n'),
          },
        ],
      };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error) {
        await this.loggingService.logError(error, 'get_allowed tool');
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get allowed directories: ${errorMessage}`,
      );
    }
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
