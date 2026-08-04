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
 * Resolves the effective skills root from settings or the default path.
 */
export function resolveSkillsRoot(centralSkillsRoot?: string | null): string {
  if (typeof centralSkillsRoot === 'string' && centralSkillsRoot.trim().length > 0) {
    return path.resolve(centralSkillsRoot.trim());
  }
  return path.resolve(getSkillsRoot());
}

/**
 * Resolves an integration root to the directory reserved for skills.
 * A configured skills path is kept unchanged; broader tool roots receive
 * a single `skills` segment.
 */
export function ensureSkillsRoot(root: string): string {
  const normalized = path.normalize(root.trim());
  const lastSegment = normalized.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.toLowerCase();
  return lastSegment === 'skills' ? normalized : path.join(normalized, 'skills');
}

export interface SkillLinkIDE {
  id?: string;
  roots: {
    primaryGlobal: string[];
    projectRelative: string[];
  };
  skillRootTemplates?: string[];
}

export function resolveSkillLinkDestination(
  skillName: string,
  projectPath: string,
  ide: SkillLinkIDE,
  scope: 'global' | 'project',
  expandPathFn: (input: string) => string = expandPath,
  overrides?: Record<string, string>,
): string {
  if (scope === 'global') {
    const overrideRoot = overrides?.[ide.id as string]?.trim();
    const configuredRoot = ide.skillRootTemplates?.[0] || ide.roots.primaryGlobal[0];
    const globalRoot = ensureSkillsRoot(overrideRoot || configuredRoot);
    return path.join(expandPathFn(globalRoot), skillName);
  }

  const projectRelativeRoot = ide.roots.projectRelative[0];
  return path.join(projectPath, projectRelativeRoot, skillName);
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
