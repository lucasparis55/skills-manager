import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const keytarMock = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
};

vi.mock('keytar', () => ({
  default: keytarMock,
}));

type SafeStorageMock = {
  isEncryptionAvailable: ReturnType<typeof vi.fn>;
  encryptString: ReturnType<typeof vi.fn>;
  decryptString: ReturnType<typeof vi.fn>;
};

const createSafeStorageMock = (available = true): SafeStorageMock => ({
  isEncryptionAvailable: vi.fn(() => available),
  encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf-8')),
  decryptString: vi.fn((value: Buffer) => value.toString('utf-8').replace(/^enc:/, '')),
});

describe('SecureTokenService', () => {
  let tempAppDir: string;

  beforeEach(() => {
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-token-service-'));
    keytarMock.getPassword.mockReset();
    keytarMock.setPassword.mockReset();
    keytarMock.deletePassword.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempAppDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('stores and retrieves PAT via keychain when available', async () => {
    const safeStorageMock = createSafeStorageMock(true);
    let storedToken = '';
    keytarMock.setPassword.mockImplementation(async (_service: string, _account: string, password: string) => {
      storedToken = password;
    });
    keytarMock.getPassword.mockImplementation(async () => storedToken || null);
    keytarMock.deletePassword.mockImplementation(async () => {
      storedToken = '';
      return true;
    });

    const { SecureTokenService } = await import('./secure-token.service');
    const service = new SecureTokenService(tempAppDir, safeStorageMock as any);

    await service.setGithubToken('ghp_secure');
    expect(keytarMock.setPassword).toHaveBeenCalledTimes(1);
    expect(await service.getGithubToken()).toBe('ghp_secure');
    expect(await service.hasGithubToken()).toBe(true);

    await service.clearGithubToken();
    expect(keytarMock.deletePassword).toHaveBeenCalledTimes(1);
    expect(await service.getGithubToken()).toBe('');
    expect(await service.hasGithubToken()).toBe(false);
  });

  it('falls back to encrypted local storage when keychain fails', async () => {
    const safeStorageMock = createSafeStorageMock(true);
    keytarMock.setPassword.mockRejectedValue(new Error('keychain unavailable'));
    keytarMock.getPassword.mockRejectedValue(new Error('keychain unavailable'));
    keytarMock.deletePassword.mockRejectedValue(new Error('keychain unavailable'));

    const { SecureTokenService } = await import('./secure-token.service');
    const service = new SecureTokenService(tempAppDir, safeStorageMock as any);

    await service.setGithubToken('ghp_fallback');
    const secretPath = path.join(tempAppDir, 'secrets.json');
    expect(fs.existsSync(secretPath)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(secretPath, 'utf-8'));
    expect(typeof raw.githubPat).toBe('string');
    expect(raw.githubPat).not.toContain('ghp_fallback');

    expect(await service.getGithubToken()).toBe('ghp_fallback');

    await service.clearGithubToken();
    expect(fs.existsSync(secretPath)).toBe(false);
  });

  it('throws explicit error when keychain and fallback encryption are unavailable', async () => {
    const safeStorageMock = createSafeStorageMock(false);
    keytarMock.setPassword.mockRejectedValue(new Error('no keychain'));
    keytarMock.getPassword.mockRejectedValue(new Error('no keychain'));
    keytarMock.deletePassword.mockRejectedValue(new Error('no keychain'));

    const { SecureTokenService } = await import('./secure-token.service');
    const service = new SecureTokenService(tempAppDir, safeStorageMock as any);

    await expect(service.setGithubToken('ghp_fail')).rejects.toThrow(
      'Unable to persist GitHub token securely',
    );
  });
});
