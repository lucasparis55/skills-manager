import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Symlink Service - Cross-platform symlink management
 */
export class SymlinkService {
  /**
   * Create a symlink or junction point
   */
  create(source: string, destination: string): { success: boolean; strategy: string; error?: string } {
    try {
      // Ensure source exists
      if (!fs.existsSync(source)) {
        throw new Error(`Source does not exist: ${source}`);
      }

      // Remove destination if it exists (check if it's a symlink first to avoid ENOENT errors)
      try {
        const stat = fs.lstatSync(destination);
        // Only remove if it exists and is a symlink or directory
        if (stat.isSymbolicLink() || stat.isDirectory()) {
          fs.rmSync(destination, { recursive: true, force: true });
        }
      } catch {
        // Destination doesn't exist or can't be accessed, which is fine
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(destination);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Try native symlink first
      try {
        fs.symlinkSync(source, destination, 'junction');
        return { success: true, strategy: 'junction' };
      } catch {
        // Fallback to mklink on Windows
        if (process.platform === 'win32') {
          try {
            execSync(`mklink /J "${destination}" "${source}"`);
            return { success: true, strategy: 'mklink-junction' };
          } catch {
            try {
              execSync(`mklink /D "${destination}" "${source}"`);
              return { success: true, strategy: 'mklink-dir' };
            } catch (e) {
              throw new Error(`Failed to create symlink: ${e}`);
            }
          }
        }

        // Unix symlink
        fs.symlinkSync(source, destination);
        return { success: true, strategy: 'symlink' };
      }
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

      // Only remove if it's a symlink or junction
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        // Double-check it's actually a link by reading it
        try {
          fs.readlinkSync(destination);
          fs.rmSync(destination, { recursive: false, force: true });
          return true;
        } catch {
          // Not a symlink, don't remove
          return false;
        }
      }

      return false;
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

      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(destination);
        const resolved = path.resolve(path.dirname(destination), target);

        if (fs.existsSync(resolved)) {
          return { valid: true, target };
        } else {
          return { valid: false, target };
        }
      }

      return { valid: false };
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
      return stat.isSymbolicLink();
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

      fs.writeFileSync(testSource, 'test');

      try {
        fs.symlinkSync(testSource, testLink, 'junction');
        return { canCreate: true };
      } finally {
        // Clean up
        try {
          if (fs.existsSync(testLink)) fs.rmSync(testLink, { force: true });
          if (fs.existsSync(testSource)) fs.rmSync(testSource, { force: true });
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
