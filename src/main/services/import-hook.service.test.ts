import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportHookService } from './import-hook.service';
import type { ImportComponent, ImportTarget } from '../types/import';

describe('ImportHookService', () => {
  let root: string;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('installs hook files disabled and activates only after matching content approval', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-hook-'));
    const stagedRoot = path.join(root, 'staged');
    const targetRoot = path.join(root, 'claude');
    fs.mkdirSync(path.join(stagedRoot, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(stagedRoot, 'hooks', 'hooks.json'), '{"staged":true}');

    const component: ImportComponent = {
      id: 'hook:hooks/hooks.json',
      kind: 'hook',
      name: 'repository-hooks',
      displayName: 'Repository hooks',
      description: 'hooks',
      sourcePath: 'hooks',
      files: [{ path: 'hooks/hooks.json', sha: 'hooks', type: 'blob' }],
      dependencies: [],
      risk: 'high',
      hasExecutableFiles: true,
      requiresActivation: true,
      events: ['SessionStart'],
      nativeTargets: ['claude-code'],
      metadata: {},
    };
    const target: ImportTarget = {
      id: 'claude-code:global',
      label: 'Claude Code',
      adapterId: 'claude-code',
      scope: 'global',
      rootPath: targetRoot,
      componentRoots: { hook: path.join(targetRoot, 'hooks') },
      supportedKinds: ['hook'],
      native: true,
      available: true,
      hookConfigPath: path.join(targetRoot, 'settings.json'),
    };
    const manifest = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh' }] }],
      },
    });
    const service = new ImportHookService();

    const installation = await service.installDisabled({
      component,
      target,
      stagedRoot,
      destinationPath: path.join(targetRoot, 'hooks', 'repository-hooks'),
      manifestContent: manifest,
    });

    expect(fs.existsSync(target.hookConfigPath!)).toBe(false);
    expect(fs.existsSync(path.join(installation.installedPath, 'hooks.json'))).toBe(true);
    expect(installation.preview.currentlyActive).toBe(false);
    expect(installation.preview.events).toEqual(['SessionStart']);

    expect(() => service.activate(installation, {
      contentSha256: 'wrong',
      events: ['SessionStart'],
    })).toThrow('approval');

    await service.activate(installation, {
      contentSha256: installation.preview.contentSha256,
      events: installation.preview.events,
    });
    const settings = JSON.parse(fs.readFileSync(target.hookConfigPath!, 'utf8'));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain(targetRoot);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('/hooks/session-start.sh');
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('session-start.sh');
    expect(fs.existsSync(`${target.hookConfigPath}.bak`)).toBe(true);
    expect(crypto.createHash('sha256').update(installation.preview.content).digest('hex')).toBe(installation.preview.contentSha256);
  });
});
