import os from 'os';
import path from 'path';
import fs from 'fs';
import { ensureSkillsRoot, expandPath } from '../utils/paths';
import type { DetectedSkillRoot, IDEDefinition, ResolvedIDERoot } from '../types/domain';

/**
 * IDE Adapter Service - Manages IDE definitions and root detection
 */
export class IDEAdapterService {
  private ides: IDEDefinition[] = [
    {
      id: 'claude-code',
      name: 'Claude Code CLI',
      configFormat: 'json',
      mode: 'subagents',
      roots: {
        primaryGlobal: ['~/.claude'],
        secondaryGlobal: ['%APPDATA%/Claude', '%LOCALAPPDATA%/Claude'],
        projectRelative: ['.claude/agents'],
      },
      skillRootTemplates: ['~/.claude/skills', '%APPDATA%/Claude/skills', '%LOCALAPPDATA%/Claude/skills'],
    },
    {
      id: 'codex-cli',
      name: 'Codex CLI',
      configFormat: 'json',
      mode: 'skills',
      roots: {
        primaryGlobal: ['~/.agents/skills'],
        secondaryGlobal: [],
        projectRelative: ['.agents/skills'],
      },
      skillRootTemplates: ['~/.agents/skills'],
    },
    {
      id: 'codex-desktop',
      name: 'Codex Desktop',
      configFormat: 'json',
      mode: 'skills',
      roots: {
        primaryGlobal: ['~/.codex', '~/.codex/skills', '~/.agents/skills'],
        secondaryGlobal: [
          '%APPDATA%/Codex',
          '%LOCALAPPDATA%/Codex',
          '%APPDATA%/Codex/skills',
          '%LOCALAPPDATA%/Codex/skills',
          '%LOCALAPPDATA%/Programs/Codex',
        ],
        projectRelative: ['.agents/skills', '.codex'],
      },
      skillRootTemplates: [
        '~/.codex/skills',
        '~/.agents/skills',
        '%APPDATA%/Codex/skills',
        '%LOCALAPPDATA%/Codex/skills',
      ],
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      configFormat: 'yaml',
      mode: 'skills',
      roots: {
        primaryGlobal: ['~/.config/opencode/skills'],
        secondaryGlobal: [
          '~/.claude/skills',
          '~/.agents/skills',
          '%APPDATA%/opencode',
          '%LOCALAPPDATA%/opencode',
        ],
        projectRelative: ['.opencode/skills', '.claude/skills'],
      },
      skillRootTemplates: [
        '~/.config/opencode/skills',
        '~/.claude/skills',
        '~/.agents/skills',
        '%APPDATA%/opencode/skills',
        '%LOCALAPPDATA%/opencode/skills',
      ],
    },
    {
      id: 'kimi-cli',
      name: 'Kimi Code CLI',
      configFormat: 'markdown',
      mode: 'skills',
      roots: {
        primaryGlobal: ['~/.kimi/skills'],
        secondaryGlobal: ['~/.kimi', '~/.config/agents/skills', '~/.agents/skills'],
        projectRelative: ['.kimi/skills', '.agents/skills'],
      },
      skillRootTemplates: ['~/.kimi/skills', '~/.config/agents/skills', '~/.agents/skills'],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configFormat: 'markdown',
      mode: 'rules',
      roots: {
        primaryGlobal: ['~/.cursor'],
        secondaryGlobal: ['%APPDATA%/Cursor', '%LOCALAPPDATA%/Cursor'],
        projectRelative: ['.cursor/rules'],
      },
      skillRootTemplates: ['~/.cursor/skills', '%APPDATA%/Cursor/skills', '%LOCALAPPDATA%/Cursor/skills'],
    },
  ];

  /**
   * List all supported IDEs
   */
  list(): IDEDefinition[] {
    return this.ides;
  }

  /**
   * Get the effective global root for an IDE, considering overrides
   */
  getEffectiveGlobalRoot(ideId: string, overrides?: Record<string, string>): string | null {
    const ide = this.ides.find((i) => i.id === ideId);
    if (!ide) {
      return null;
    }
    if (overrides?.[ideId]) {
      return expandPath(overrides[ideId]);
    }
    return ide.roots.primaryGlobal.length > 0 ? expandPath(ide.roots.primaryGlobal[0]) : null;
  }

  /**
   * Detect roots for all IDEs
   */
  detectRoots(overrides?: Record<string, string>): ResolvedIDERoot[] {
    const resolved: ResolvedIDERoot[] = [];
    for (const ide of this.ides) {
      const effective = this.getEffectiveGlobalRoot(ide.id, overrides);
      const pushRoot = (rootTemplate: string, isPrimary: boolean) => {
        const expanded = expandPath(rootTemplate);
        const sameAsEffective =
          !!effective &&
          (process.platform === 'win32'
            ? path.normalize(expanded).toLowerCase() === path.normalize(effective).toLowerCase()
            : path.normalize(expanded) === path.normalize(effective));
        const exists = this.pathExists(expanded);
        resolved.push({
          ideId: ide.id,
          root: expanded,
          exists,
          isPrimary,
          isConfigured: exists && sameAsEffective,
        });
      };
      for (const root of ide.roots.primaryGlobal) pushRoot(root, true);
      for (const root of ide.roots.secondaryGlobal) pushRoot(root, false);
    }
    return resolved;
  }

  /**
   * Detect existing, explicit global roots that contain skills for each IDE.
   * Unlike detectRoots(), this intentionally does not include project roots.
   */
  detectSkillRoots(overrides?: Record<string, string>): DetectedSkillRoot[] {
    const byPath = new Map<string, DetectedSkillRoot>();

    for (const ide of this.ides) {
      const overrideRoot = overrides?.[ide.id]?.trim();
      const templates = overrideRoot ? [ensureSkillsRoot(overrideRoot)] : ide.skillRootTemplates;

      for (const template of templates) {
        const root = expandPath(template);
        if (!this.isExistingDirectory(root) || this.isLinkEntry(root)) {
          continue;
        }

        const key = this.pathKey(root);
        const current = byPath.get(key);
        if (current) {
          if (!current.ideIds.includes(ide.id)) current.ideIds.push(ide.id);
          if (!current.ideNames.includes(ide.name)) current.ideNames.push(ide.name);
          continue;
        }

        byPath.set(key, {
          root,
          ideIds: [ide.id],
          ideNames: [ide.name],
        });
      }
    }

    return [...byPath.values()].sort((a, b) => a.root.localeCompare(b.root));
  }

  /**
   * Check if a path exists
   */
  private pathExists(p: string): boolean {
    try {
      const fs = require('fs');
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }

  private isExistingDirectory(p: string): boolean {
    try {
      return fs.lstatSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  private isLinkEntry(p: string, stat?: fs.Stats): boolean {
    try {
      const entryStat = stat || fs.lstatSync(p);
      if (entryStat.isSymbolicLink()) {
        return true;
      }

      if (process.platform === 'win32' && entryStat.isDirectory()) {
        try {
          fs.readlinkSync(p);
          return true;
        } catch {
          return false;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private pathKey(p: string): string {
    const normalized = path.resolve(path.normalize(p));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }
}
