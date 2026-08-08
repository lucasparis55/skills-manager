import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('child_process', () => ({ spawn: spawnMock }));

import { ImportCommandService } from './import-command.service';

describe('ImportCommandService', () => {
  it('requires explicit authorization before starting a fallback command', async () => {
    await expect(new ImportCommandService().run({
      executable: 'npx',
      args: ['skills', 'add', 'acme/repo'],
      authorized: false,
    })).rejects.toThrow('authorization');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('runs an authorized command without a shell and captures output', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    child.pid = 42;
    spawnMock.mockReturnValueOnce(child);

    const promise = new ImportCommandService().run({
      executable: 'npx',
      args: ['skills', 'add', 'acme/repo'],
      authorized: true,
    });
    child.stdout.emit('data', Buffer.from('installed'));
    child.stderr.emit('data', Buffer.from('notice'));
    child.emit('close', 0, null);

    await expect(promise).resolves.toEqual({
      exitCode: 0,
      signal: null,
      stdout: 'installed',
      stderr: 'notice',
    });
    if (process.platform === 'win32') {
      expect(spawnMock).toHaveBeenCalledWith(
        expect.any(String),
        ['/d', '/s', '/c', expect.stringContaining('npx.cmd')],
        expect.objectContaining({ shell: false }),
      );
    } else {
      expect(spawnMock).toHaveBeenCalledWith('npx', ['skills', 'add', 'acme/repo'], expect.objectContaining({ shell: false }));
    }
  });
});
