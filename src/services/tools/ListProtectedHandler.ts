import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { inject, injectable } from 'inversify';
import { LoggingServiceTag, LoggingService } from '@/services/LoggingService.js';
import { ProtectionEngine, ProtectionEngineTag } from '@/services/ProtectionEngine.js';

@injectable()
export class ListProtectedHandler {
  constructor(
    @inject(ProtectionEngineTag)
    private readonly protectionEngine: ProtectionEngine,
    @inject(LoggingServiceTag)
    private readonly loggingService: LoggingService,
  ) {}

  async handle(): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const patterns = this.protectionEngine.getProtectedPatterns();
      await this.loggingService.logOperation('list_protected', 'success');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ patterns }),
        }],
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
}
