import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const PackageInfoProviderTag = Symbol.for('PackageInfoProvider');

export interface PackageInfoProvider {
  getName: () => string;
  getVersion: () => string;
  getDescription: () => string;
}

class PackageInfoProviderImpl implements PackageInfoProvider {
  constructor(private readonly packageJson: { name: string; version: string; description?: string }) {}

  getName(): string {
    return this.packageJson.name;
  }

  getVersion(): string {
    return this.packageJson.version;
  }

  getDescription(): string {
    return this.packageJson.description ?? '';
  }
}

const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
});

export async function loadPackageInfo(): Promise<PackageInfoProvider> {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  const packageJsonPaths = [
    resolve(currentDir, '../../../package.json'), // For built dist files
    resolve(currentDir, '../../package.json'), // For test/dev context
  ];

  let packageJson: { name: string; version: string; description?: string } | undefined = undefined;
  for (const path of packageJsonPaths) {
    try {
      const content = await readFile(path, 'utf-8');
      packageJson = packageJsonSchema.parse(JSON.parse(content));
    }
    catch (_error) {
      // Ignore errors and try the next path
    }
  }

  if (packageJson === undefined) {
    throw new Error('Failed to load package.json from known paths');
  }

  return new PackageInfoProviderImpl(packageJson);
}
