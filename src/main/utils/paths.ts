import path from 'path';
import os from 'os';

/**
 * Expands environment variables in path templates
 * Supports: ~, %VAR%, $VAR, ${VAR}
 */
export function expandPath(template: string): string {
  let expanded = template;

  // Expand home directory
  if (expanded.startsWith('~') || expanded.startsWith('~' + path.sep)) {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }

  // Expand Windows environment variables (%VAR%)
  expanded = expanded.replace(/%([^%]+)%/g, (_, name) => {
    return process.env[name] || '';
  });

  // Expand Unix-style environment variables ($VAR or ${VAR})
  expanded = expanded.replace(/\$\{([^}]+)\}/g, (_, name) => {
    return process.env[name] || '';
  });

  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    return process.env[name] || '';
  });

  return path.normalize(expanded);
}

/**
 * Gets the central skills root directory
 */
export function getSkillsRoot(): string {
  return path.join(os.homedir(), '.skills-manager', 'skills');
}

/**
 * Gets the app data directory
 */
export function getAppDataDir(): string {
  return path.join(os.homedir(), '.skills-manager');
}

/**
 * Checks if a path is a subdirectory of parent
 */
export function isSubDirectory(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
