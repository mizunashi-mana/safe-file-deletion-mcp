import { existsSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

export class ProtectionEngine {
  private readonly patternCache = new Map<string, boolean>();
  private fileWatchers: fs.FSWatcher[] = [];

  constructor(
    private readonly patterns: string[],
    private readonly allowedDirectories: string[],
  ) {
    this.initializeFileWatchers();
  }

  isProtected(filePath: string): boolean {
    // 許可ディレクトリ外のパスは自動的に保護
    if (!this.isWithinAllowedDirectories(filePath)) {
      return true;
    }

    // Get result from cache
    const cacheKey = filePath;
    if (this.patternCache.has(cacheKey)) {
      const cachedResult = this.patternCache.get(cacheKey);
      if (cachedResult !== undefined) {
        return cachedResult;
      }
    }

    // Pattern matching for protection
    const result = this.patterns.some((pattern) => {
      // パスの各部分でマッチングを試みる
      const normalizedPath = filePath.replace(/\/$/, ''); // 末尾のスラッシュを削除

      // パス全体でのマッチング
      if (minimatch(normalizedPath, pattern, { matchBase: true })) {
        return true;
      }

      // ファイル名のみでマッチング
      const basename = path.basename(normalizedPath);
      if (minimatch(basename, pattern)) {
        return true;
      }

      // For patterns that include directory structure
      if (pattern.includes('/') || pattern.includes('**')) {
        // 相対パスでのマッチング
        const matchingDir = this.getMatchingAllowedDirectory(normalizedPath);
        if (matchingDir !== null) {
          const relativePath = path.relative(matchingDir, normalizedPath);
          if (minimatch(relativePath, pattern)) {
            return true;
          }
        }
      }

      // Pattern to protect directory and its contents
      // 例: .git → .git/* も保護
      const segments = normalizedPath.split('/');
      for (const segment of segments) {
        if (minimatch(segment, pattern)) {
          return true;
        }
      }

      return false;
    });

    // 結果をキャッシュに保存
    this.patternCache.set(cacheKey, result);
    return result;
  }

  getProtectedPatterns(): string[] {
    return [...this.patterns];
  }

  isWithinAllowedDirectories(filePath: string): boolean {
    return this.allowedDirectories.some(dir =>
      filePath === dir || filePath.startsWith(dir + '/'),
    );
  }

  getMatchingAllowedDirectory(filePath: string): string | null {
    // 最も長いマッチングパスを優先
    const matches = this.allowedDirectories
      .filter(dir => filePath === dir || filePath.startsWith(dir + '/'))
      .sort((a, b) => b.length - a.length);

    return matches.length > 0 ? matches[0] ?? null : null;
  }

  async validateAllowedDirectories(): Promise<string[]> {
    const validDirectories: string[] = [];

    for (const dir of this.allowedDirectories) {
      if (existsSync(dir)) {
        validDirectories.push(dir);
      }
    }

    return validDirectories;
  }

  private initializeFileWatchers(): void {
    try {
      this.fileWatchers = this.allowedDirectories.map((dir) => {
        if (existsSync(dir)) {
          return fs.watch(dir, { recursive: true }, (eventType, filename) => {
            if (filename !== null) {
              this.invalidateCache(path.join(dir, filename));
            }
          });
        }
        return null;
      }).filter(watcher => watcher !== null);
    }
    catch (error) {
      // Warn but don't error when filesystem watching fails
      console.warn('Failed to initialize file watchers:', error);
    }
  }

  private invalidateCache(changedPath: string): void {
    // 影響を受けるキャッシュエントリを削除
    for (const [cachedPath] of this.patternCache) {
      if (cachedPath.includes(changedPath) || changedPath.includes(cachedPath)) {
        this.patternCache.delete(cachedPath);
      }
    }
  }

  dispose(): void {
    // ファイルウォッチャーをクリーンアップ
    this.fileWatchers.forEach((watcher) => {
      try {
        watcher.close();
      }
      catch (error) {
        console.warn('Failed to close file watcher:', error);
      }
    });
    this.fileWatchers = [];
    this.patternCache.clear();
  }
}
