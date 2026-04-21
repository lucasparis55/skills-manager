import os from 'os';
import path from 'path';
import { expandPath } from '../utils/paths';
import type { IDEDefinition, ResolvedIDERoot } from '../types/domain';

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
        projectRelative: ['.codex', '.agents/skills'],
      },
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
    },
  ];

  /**
   * List all supported IDEs
   */
  list(): IDEDefinition[] {
    return this.ides;
  }

  /**
   * Detect roots for all IDEs
   */
  detectRoots(): ResolvedIDERoot[] {
    const resolved: ResolvedIDERoot[] = [];

    for (const ide of this.ides) {
      // Check primary roots
      for (const root of ide.roots.primaryGlobal) {
        const expanded = expandPath(root);
        resolved.push({
          ideId: ide.id,
          root: expanded,
          exists: this.pathExists(expanded),
          isPrimary: true,
          isConfigured: false,
        });
      }

      // Check secondary roots
      for (const root of ide.roots.secondaryGlobal) {
        const expanded = expandPath(root);
        resolved.push({
          ideId: ide.id,
          root: expanded,
          exists: this.pathExists(expanded),
          isPrimary: false,
          isConfigured: false,
        });
      }
    }

    return resolved;
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
}
