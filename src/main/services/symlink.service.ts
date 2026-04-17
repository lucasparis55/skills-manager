import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export type SymlinkStrategy = 'auto' | 'symlink' | 'junction';

/**
 * Symlink Service - Cross-platform symlink management
 */
export class SymlinkService {
  private isLinkEntry(destination: string, stat?: fs.Stats): boolean {
    const entryStat = stat || fs.lstatSync(destination);

    if (entryStat.isSymbolicLink()) {
      return true;
    }

    // On Windows, directory junctions can appear as directories in some scenarios.
    if (process.platform === 'win32' && entryStat.isDirectory()) {
      try {
        fs.readlinkSync(destination);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private removeLinkAtPath(destination: string): void {
    try {
      fs.unlinkSync(destination);
    } catch {
      fs.rmSync(destination, { recursive: false, force: true });
    }
  }

  private createJunctionNative(source: string, destination: string): { success: boolean; strategy: string } {
    fs.symlinkSync(source, destination, 'junction');
    return { success: true, strategy: 'junction' };
  }

  private createSymlinkNative(source: string, destination: string): { success: boolean; strategy: string } {
    if (process.platform === 'win32') {
      fs.symlinkSync(source, destination, 'dir');
    } else {
      fs.symlinkSync(source, destination);
    }
    return { success: true, strategy: 'symlink' };
  }

  /**
   * Create a symlink or junction point
   */
  create(
    source: string,
    destination: string,
    strategy: SymlinkStrategy = 'auto',
  ): { success: boolean; strategy: string; error?: string } {
    try {
      // Ensure source exists
      if (!fs.existsSync(source)) {
        throw new Error(`Source does not exist: ${source}`);
      }

      if (!['auto', 'symlink', 'junction'].includes(strategy)) {
        throw new Error(`Unsupported symlink strategy: ${strategy}`);
      }

      // Destination safety gate: only remove if destination is an existing link/junction.
      let existingStat: fs.Stats | null = null;
      try {
        existingStat = fs.lstatSync(destination);
      } catch {
        existingStat = null;
      }
      if (existingStat) {
        if (!this.isLinkEntry(destination, existingStat)) {
          throw new Error(`Destination already exists and is not a link: ${destination}`);
        }
        this.removeLinkAtPath(destination);
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(destination);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Explicit strategies are fail-fast.
      if (strategy === 'junction') {
        if (process.platform !== 'win32') {
          throw new Error('Junction strategy is only supported on Windows');
        }
        return this.createJunctionNative(source, destination);
      }

      if (strategy === 'symlink') {
        return this.createSymlinkNative(source, destination);
      }

      // Auto strategy: prefer junction on Windows, fallback to symlink.
      if (process.platform === 'win32') {
        try {
          return this.createJunctionNative(source, destination);
        } catch (junctionErr) {
          try {
            execSync(`cmd /c mklink /J "${destination}" "${source}"`);
            return { success: true, strategy: 'mklink-junction' };
          } catch {
            try {
              return this.createSymlinkNative(source, destination);
            } catch {
              try {
                execSync(`cmd /c mklink /D "${destination}" "${source}"`);
                return { success: true, strategy: 'mklink-dir' };
              } catch (symlinkErr) {
                throw new Error(
                  `Failed to create link with auto strategy. Junction error: ${String(junctionErr)}. Symlink error: ${String(symlinkErr)}`
                );
              }
            }
          }
        }
      }

      return this.createSymlinkNative(source, destination);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Symlink creation failed:', errorMessage);
      return {
        success: false,
        strategy: 'none',
        error: errorMessage,
      };
    }
  }

  /**
   * Remove a symlink safely
   */
  remove(destination: string): boolean {
    try {
      if (!fs.existsSync(destination)) {
        return false;
      }

      const stat = fs.lstatSync(destination);
      if (!this.isLinkEntry(destination, stat)) {
        return false;
      }

      this.removeLinkAtPath(destination);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a symlink is valid
   */
  verify(destination: string): { valid: boolean; target?: string } {
    try {
      if (!fs.existsSync(destination)) {
        return { valid: false };
      }

      const stat = fs.lstatSync(destination);
      if (!this.isLinkEntry(destination, stat)) {
        return { valid: false };
      }

      const target = fs.readlinkSync(destination);
      const resolved = path.resolve(path.dirname(destination), target);

      if (fs.existsSync(resolved)) {
        return { valid: true, target };
      }

      return { valid: false, target };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Check if path is a symlink
   */
  isSymlink(p: string): boolean {
    try {
      const stat = fs.lstatSync(p);
      return this.isLinkEntry(p, stat);
    } catch {
      return false;
    }
  }

  /**
   * Check if the current process has permission to create symlinks
   */
  checkPermissions(): { canCreate: boolean; message?: string } {
    // Unix platforms don't have this restriction for basic symlinks
    if (process.platform !== 'win32') {
      return { canCreate: true };
    }

    // Windows: test if we can create a junction point
    try {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
      const testSource = path.join(tempDir, 'source');
      const testLink = path.join(tempDir, 'link');

      fs.mkdirSync(testSource, { recursive: true });

      try {
        fs.symlinkSync(testSource, testLink, 'junction');
        return { canCreate: true };
      } finally {
        // Clean up
        try {
          if (fs.existsSync(testLink)) fs.rmSync(testLink, { recursive: false, force: true });
          if (fs.existsSync(testSource)) fs.rmSync(testSource, { recursive: true, force: true });
          if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for permission-related errors
      if (errorMessage.includes('EPERM') || errorMessage.includes('operation not permitted')) {
        return {
          canCreate: false,
          message:
            'Symlink creation requires Administrator privileges or Windows Developer Mode. Enable Developer Mode in Windows Settings > Privacy & security > For developers, or run the app as Administrator.',
        };
      }

      return {
        canCreate: false,
        message: `Cannot create symlinks: ${errorMessage}`,
      };
    }
  }
}
