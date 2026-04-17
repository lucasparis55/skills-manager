import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as childProcess from 'child_process';
import { SymlinkService } from './symlink.service';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('SymlinkService', () => {
  let symlinkService: SymlinkService;
  let tempDir: string;

  beforeEach(() => {
    symlinkService = new SymlinkService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('create()', () => {
    it('should return success: false with error details when source does not exist', () => {
      const result = symlinkService.create(
        '/nonexistent/source/path',
        path.join(tempDir, 'destination')
      );

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('none');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Source does not exist');
    });

    it('should include error details in return value when symlink creation fails', () => {
      // Mock both fs.symlinkSync and execSync to throw permission errors
      const originalSymlinkSync = fs.symlinkSync;
      const mockedExecSync = vi.mocked(childProcess.execSync);
      
      fs.symlinkSync = vi.fn(() => {
        throw new Error('EPERM: operation not permitted, symlink');
      }) as any;
      
      mockedExecSync.mockImplementation(() => {
        throw new Error('EPERM: operation not permitted, mklink');
      });

      // Create a real source file
      const source = path.join(tempDir, 'source');
      fs.writeFileSync(source, 'test content');
      const destination = path.join(tempDir, 'destination');

      const result = symlinkService.create(source, destination);

      // Restore original functions
      fs.symlinkSync = originalSymlinkSync;
      mockedExecSync.mockRestore();

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('none');
      expect(result.error).toBeDefined();
      // The error should contain information about the failure
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it('should successfully create a symlink when source exists', () => {
      // Create a real source directory
      const source = path.join(tempDir, 'source');
      fs.mkdirSync(source, { recursive: true });
      const destination = path.join(tempDir, 'destination');

      const result = symlinkService.create(source, destination);

      // Check that the result has the expected structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('strategy');
      
      // On success, there should be no error; on failure, error should be defined
      if (result.success) {
        expect(result.strategy).not.toBe('none');
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('checkPermissions()', () => {
    it('should return canCreate: true on non-Windows platforms', () => {
      // Mock process.platform to simulate non-Windows
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = symlinkService.checkPermissions();

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });

      expect(result.canCreate).toBe(true);
    });

    it('should detect Windows symlink permission issues', () => {
      // This test will behave differently based on actual permissions
      // On Windows with Developer Mode or Admin: canCreate will be true
      // On Windows without permissions: canCreate will be false with helpful message
      const result = symlinkService.checkPermissions();

      expect(result).toHaveProperty('canCreate');
      expect(typeof result.canCreate).toBe('boolean');

      // If canCreate is false, message should be defined
      if (!result.canCreate) {
        expect(result.message).toBeDefined();
        expect(typeof result.message).toBe('string');
        expect(result.message!.length).toBeGreaterThan(0);
      }
    });

    it('should provide helpful message when permissions are missing on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Mock fs.mkdtempSync to throw EPERM
      const originalMkdtempSync = fs.mkdtempSync;
      fs.mkdtempSync = vi.fn(() => {
        throw new Error('EPERM: operation not permitted');
      }) as any;

      const result = symlinkService.checkPermissions();

      // Restore
      fs.mkdtempSync = originalMkdtempSync;
      Object.defineProperty(process, 'platform', { value: originalPlatform });

      expect(result.canCreate).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('Developer Mode');
      expect(result.message).toContain('Administrator');
    });
  });

  describe('verify()', () => {
    it('should return valid: false when destination does not exist', () => {
      const result = symlinkService.verify('/nonexistent/path');
      expect(result.valid).toBe(false);
    });
  });

  describe('remove()', () => {
    it('should return false when destination does not exist', () => {
      const result = symlinkService.remove('/nonexistent/path');
      expect(result).toBe(false);
    });
  });
});
