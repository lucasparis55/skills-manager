import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import { getAppDataDir } from '../utils/paths';

type KeytarLike = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(cipherText: Buffer): string;
};

type SecretFile = {
  githubPat?: string;
};

export const GITHUB_PAT_KEYCHAIN_SERVICE = 'skills-manager';
export const GITHUB_PAT_KEYCHAIN_ACCOUNT = 'github-pat';

const NO_SECURE_STORAGE_ERROR =
  'Unable to persist GitHub token securely: no secure storage is available on this host.';

/**
 * Persists sensitive credentials using OS keychain when possible, with a local
 * encrypted fallback via Electron safeStorage.
 */
export class SecureTokenService {
  private readonly secretsPath: string;
  private keytarPromise?: Promise<KeytarLike | null>;
  private readonly safeStorageApi: SafeStorageLike;

  constructor(
    appDataDir: string = getAppDataDir(),
    safeStorageApi: SafeStorageLike = safeStorage as unknown as SafeStorageLike,
  ) {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    this.secretsPath = path.join(appDataDir, 'secrets.json');
    this.safeStorageApi = safeStorageApi;
  }

  async getGithubToken(): Promise<string> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      try {
        const token = await keytar.getPassword(GITHUB_PAT_KEYCHAIN_SERVICE, GITHUB_PAT_KEYCHAIN_ACCOUNT);
        if (token) {
          return token;
        }
      } catch {
        // Fall back to encrypted local storage.
      }
    }

    return this.getFallbackToken() ?? '';
  }

  async hasGithubToken(): Promise<boolean> {
    const token = await this.getGithubToken();
    return token.length > 0;
  }

  async setGithubToken(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      await this.clearGithubToken();
      return;
    }

    const keytar = await this.loadKeytar();
    if (keytar) {
      try {
        await keytar.setPassword(
          GITHUB_PAT_KEYCHAIN_SERVICE,
          GITHUB_PAT_KEYCHAIN_ACCOUNT,
          normalizedToken,
        );
        this.tryClearFallbackToken();
        return;
      } catch {
        // Continue to fallback.
      }
    }

    if (!this.canUseSafeStorage()) {
      throw new Error(NO_SECURE_STORAGE_ERROR);
    }

    const encrypted = this.safeStorageApi.encryptString(normalizedToken).toString('base64');
    const secrets = this.readSecretFile();
    secrets.githubPat = encrypted;
    this.writeSecretFile(secrets);
  }

  async clearGithubToken(): Promise<void> {
    const keytar = await this.loadKeytar();
    let keychainHandled = false;

    if (keytar) {
      keychainHandled = true;
      try {
        await keytar.deletePassword(GITHUB_PAT_KEYCHAIN_SERVICE, GITHUB_PAT_KEYCHAIN_ACCOUNT);
      } catch {
        // Best-effort; fallback cleanup still applies below.
      }
    }

    if (this.canUseSafeStorage()) {
      const secrets = this.readSecretFile();
      if (secrets.githubPat) {
        delete secrets.githubPat;
        this.writeSecretFile(secrets);
      }
      return;
    }

    if (!keychainHandled) {
      throw new Error(NO_SECURE_STORAGE_ERROR);
    }
  }

  private async loadKeytar(): Promise<KeytarLike | null> {
    if (!this.keytarPromise) {
      this.keytarPromise = (async () => {
        try {
          const keytarModule = await import('keytar');
          return (keytarModule.default || keytarModule) as unknown as KeytarLike;
        } catch {
          return null;
        }
      })();
    }

    return this.keytarPromise;
  }

  private canUseSafeStorage(): boolean {
    try {
      return (
        !!this.safeStorageApi &&
        typeof this.safeStorageApi.isEncryptionAvailable === 'function' &&
        this.safeStorageApi.isEncryptionAvailable()
      );
    } catch {
      return false;
    }
  }

  private getFallbackToken(): string | null {
    if (!this.canUseSafeStorage()) {
      return null;
    }

    const encrypted = this.readSecretFile().githubPat;
    if (!encrypted) {
      return null;
    }

    try {
      const cipher = Buffer.from(encrypted, 'base64');
      return this.safeStorageApi.decryptString(cipher);
    } catch {
      return null;
    }
  }

  private tryClearFallbackToken(): void {
    if (!this.canUseSafeStorage()) {
      return;
    }
    const secrets = this.readSecretFile();
    if (!secrets.githubPat) {
      return;
    }
    delete secrets.githubPat;
    this.writeSecretFile(secrets);
  }

  private readSecretFile(): SecretFile {
    if (!fs.existsSync(this.secretsPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.secretsPath, 'utf-8');
      const parsed = JSON.parse(content) as SecretFile;
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeSecretFile(secrets: SecretFile): void {
    const hasSecrets = Object.values(secrets).some((value) => typeof value === 'string' && value.length > 0);
    if (!hasSecrets) {
      if (fs.existsSync(this.secretsPath)) {
        fs.rmSync(this.secretsPath, { force: true });
      }
      return;
    }

    fs.writeFileSync(this.secretsPath, JSON.stringify(secrets, null, 2), 'utf-8');
  }
}
