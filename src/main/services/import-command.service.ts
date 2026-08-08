import { spawn } from 'child_process';

const WINDOWS_COMMAND_WRAPPERS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bun']);

export interface ImportCommandRequest {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  authorized: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ImportCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface ImportCommandServiceOptions {
  maxOutputBytes?: number;
}

/** Executes only an already reviewed command, keeping the shell boundary closed. */
export class ImportCommandService {
  private readonly maxOutputBytes: number;

  constructor(options: ImportCommandServiceOptions = {}) {
    this.maxOutputBytes = options.maxOutputBytes || 2 * 1024 * 1024;
  }

  run(request: ImportCommandRequest): Promise<ImportCommandResult> {
    this.assertRequest(request);
    if (!request.authorized) {
      return Promise.reject(new Error('Explicit authorization is required before running an import command.'));
    }

    const { executable, args } = this.buildSpawnCommand(request);
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const child = spawn(executable, args, {
        cwd: request.cwd,
        env: { ...this.safeEnvironment(), ...request.env },
        shell: false,
        windowsHide: true,
      });

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        callback();
      };

      const rejectForOutputLimit = () => {
        child.kill();
        finish(() => reject(new Error('Import command output exceeded the safety limit.')));
      };

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
        if (Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8') > this.maxOutputBytes) {
          rejectForOutputLimit();
        }
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
        if (Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8') > this.maxOutputBytes) {
          rejectForOutputLimit();
        }
      });
      child.once('error', (error) => finish(() => reject(error)));
      child.once('close', (exitCode, signal) => finish(() => resolve({ exitCode, signal, stdout, stderr })));

      if (request.timeoutMs && request.timeoutMs > 0) {
        timeout = setTimeout(() => {
          child.kill();
          finish(() => reject(new Error('Import command timed out.')));
        }, request.timeoutMs);
      }

      if (request.signal) {
        const cancel = () => {
          child.kill();
          finish(() => reject(new Error('Import command cancelled.')));
        };
        if (request.signal.aborted) {
          cancel();
        } else {
          request.signal.addEventListener('abort', cancel, { once: true });
        }
      }
    });
  }

  private assertRequest(request: ImportCommandRequest): void {
    if (!request || typeof request.executable !== 'string' || !request.executable.trim() || request.executable.includes('\0')) {
      throw new Error('A valid import command executable is required.');
    }
    if (!Array.isArray(request.args) || request.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      throw new Error('Import command arguments must be strings without null bytes.');
    }
  }

  private safeEnvironment(): NodeJS.ProcessEnv {
    const allowedKeys = [
      'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP',
      'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'NPM_CONFIG_USERCONFIG',
      'NPM_CONFIG_PREFIX',
    ];
    return Object.fromEntries(
      allowedKeys
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    );
  }

  private buildSpawnCommand(request: ImportCommandRequest): { executable: string; args: string[] } {
    const requestedExecutable = request.executable.trim();
    const executable = process.platform === 'win32'
      && WINDOWS_COMMAND_WRAPPERS.has(requestedExecutable.toLowerCase())
      ? `${requestedExecutable}.cmd`
      : requestedExecutable;
    if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable)) {
      return { executable, args: request.args };
    }

    const commandLine = [executable, ...request.args].map((arg) => this.quoteWindowsArg(arg)).join(' ');
    return {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', commandLine],
    };
  }

  private quoteWindowsArg(value: string): string {
    if (/^[^\s"]+$/.test(value)) return value;
    return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
  }
}
