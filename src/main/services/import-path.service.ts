import fs from 'fs';
import path from 'path';

/**
 * Centralizes path validation for imports coming from untrusted repositories.
 * Repository paths always use POSIX separators, while target paths use the
 * current platform's path implementation.
 */
export class ImportPathService {
  static normalizeRepositoryPath(rawPath: string): string {
    if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.includes('\0')) {
      throw new Error('Invalid repository path');
    }

    const normalized = rawPath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
      throw new Error(`Repository path is absolute: ${rawPath}`);
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error(`Repository path escapes its root: ${rawPath}`);
    }

    return segments.join('/');
  }

  resolveInside(root: string, repositoryPath: string): string {
    const normalizedPath = ImportPathService.normalizeRepositoryPath(repositoryPath);
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(resolvedRoot, ...normalizedPath.split('/'));

    if (!this.isWithin(resolvedTarget, resolvedRoot)) {
      throw new Error(`Destination is outside the allowed root: ${repositoryPath}`);
    }

    return resolvedTarget;
  }

  assertSafeDestination(destination: string, allowedRoot: string): string {
    const resolvedRoot = path.resolve(allowedRoot);
    const resolvedDestination = path.resolve(destination);

    if (!this.isWithin(resolvedDestination, resolvedRoot)) {
      throw new Error(`Destination is outside the allowed root: ${destination}`);
    }

    this.assertNoSymlinkComponents(resolvedRoot, resolvedDestination);
    return resolvedDestination;
  }

  private isWithin(target: string, root: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private assertNoSymlinkComponents(root: string, target: string): void {
    const relative = path.relative(root, target);
    const segments = relative ? relative.split(path.sep) : [];
    let current = root;

    for (const segment of segments) {
      current = path.join(current, segment);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw error;
      }

      if (stat.isSymbolicLink()) {
        throw new Error(`Destination crosses a symlink: ${current}`);
      }
    }
  }
}
