import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { inject, injectable } from 'inversify';
import { LoggingServiceTag, LoggingService } from '@/services/LoggingService.js';
import { ProtectionEngine, ProtectionEngineTag } from '@/services/ProtectionEngine.js';

@injectable()
export class GetAllowedHandler {
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
      const validDirectories = await this.protectionEngine.validateAllowedDirectories();

      await this.loggingService.logOperation('get_allowed', 'success');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ allowed_dirs: validDirectories }),
        }],
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
}
