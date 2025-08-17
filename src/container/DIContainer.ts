import 'reflect-metadata';
import { Container } from 'inversify';
import { type ConfigProvider, ConfigProviderTag } from '@/services/ConfigProvider.js';
import { type ErrorHandler, ErrorHandlerImpl, ErrorHandlerTag } from '@/services/ErrorHandler.js';
import { type LoggingService, LoggingServiceImpl, LoggingServiceTag } from '@/services/LoggingService.js';
import { type PackageInfoProvider, PackageInfoProviderTag } from '@/services/PackageInfoProvider.js';
import { type ProtectionEngine, ProtectionEngineImpl, ProtectionEngineTag } from '@/services/ProtectionEngine.js';
import { type SafeDeletionService, SafeDeletionServiceImpl, SafeDeletionServiceTag } from '@/services/SafeDeletionService.js';
import { SafeFileDeletionMCPServer } from '@/services/SafeFileDeletionMCPServer.js';
import { DeleteToolHandler } from '@/services/tools/DeleteToolHandler.js';
import { GetAllowedHandler } from '@/services/tools/GetAllowedHandler.js';
import { ListProtectedHandler } from '@/services/tools/ListProtectedHandler.js';

export class DIContainer {
  constructor(private readonly container: Container) {}

  public getMCPServer(): SafeFileDeletionMCPServer {
    return this.container.get<SafeFileDeletionMCPServer>(SafeFileDeletionMCPServer);
  }

  public getLoggingService(): LoggingService {
    return this.container.get<LoggingService>(LoggingServiceTag);
  }

  public getPackageInfoProvider(): PackageInfoProvider {
    return this.container.get<PackageInfoProvider>(PackageInfoProviderTag);
  }
}

export function buildContainer(props: {
  packageInfoProvider: PackageInfoProvider;
  configProvider: ConfigProvider;
  loggingService?: LoggingService;
  safeDeletionService?: SafeDeletionService;
}): DIContainer {
  const container = new Container();

  // Bind provided services
  container.bind<PackageInfoProvider>(PackageInfoProviderTag).toConstantValue(props.packageInfoProvider);
  container.bind<ConfigProvider>(ConfigProviderTag).toConstantValue(props.configProvider);

  // Bind singleton services
  if (props.loggingService !== undefined) {
    container.bind<LoggingService>(LoggingServiceTag).toConstantValue(props.loggingService);
  }
  else {
    container.bind<LoggingService>(LoggingServiceTag).to(LoggingServiceImpl).inSingletonScope();
  }
  if (props.safeDeletionService !== undefined) {
    container.bind<SafeDeletionService>(SafeDeletionServiceTag).toConstantValue(props.safeDeletionService);
  }
  else {
    container.bind<SafeDeletionService>(SafeDeletionServiceTag).to(SafeDeletionServiceImpl).inSingletonScope();
  }
  container.bind<ErrorHandler>(ErrorHandlerTag).to(ErrorHandlerImpl).inSingletonScope();
  container.bind<ProtectionEngine>(ProtectionEngineTag).to(ProtectionEngineImpl).inSingletonScope();

  container.bind(DeleteToolHandler).to(DeleteToolHandler).inSingletonScope();
  container.bind(GetAllowedHandler).to(GetAllowedHandler).inSingletonScope();
  container.bind(ListProtectedHandler).to(ListProtectedHandler).inSingletonScope();
  container.bind(SafeFileDeletionMCPServer).to(SafeFileDeletionMCPServer).inSingletonScope();

  return new DIContainer(container);
}
