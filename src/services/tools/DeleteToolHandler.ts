import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { inject, injectable } from 'inversify';
import { LoggingServiceTag, LoggingService } from '@/services/LoggingService.js';
import { SafeDeletionService, SafeDeletionServiceTag } from '@/services/SafeDeletionService.js';

@injectable()
export class DeleteToolHandler {
  constructor(
    @inject(SafeDeletionServiceTag)
    private readonly deletionService: SafeDeletionService,
    @inject(LoggingServiceTag)
    private readonly loggingService: LoggingService,
  ) {}

  async handle(args: {
    paths: string[];
  }): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      if (args.paths.length === 1) {
        // Single file deletion
        const firstPath = args.paths[0];
        if (firstPath === undefined) {
          throw new Error('No path provided');
        }
        const result = await this.deletionService.deleteFile(firstPath);

        if (result.success) {
          await this.loggingService.logDeletion(result.path ?? '', 'success');
          return {
            content: [
              {
                type: 'text' as const,
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
                type: 'text' as const,
                text: `Failed to delete ${result.path}: ${reason}`,
              },
            ],
          };
        }
      }
      else {
        // Batch deletion
        const result = await this.deletionService.deleteBatch(args.paths);

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
          details += '\n\nFailed files:\n';
          details += result.failed.map(f => `- ${f.path}: ${f.error}`).join('\n');
        }
        if (result.rejected.length > 0) {
          details += '\n\nRejected files:\n';
          details += result.rejected.map(r => `- ${r.path}: ${r.reason}`).join('\n');
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: summary.join('\n') + details,
            },
          ],
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
}
