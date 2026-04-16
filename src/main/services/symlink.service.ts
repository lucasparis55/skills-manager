import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Symlink Service - Cross-platform symlink management
 */
export class SymlinkService {
  /**
   * Create a symlink or junction point
   */
  create(source: string, destination: string): { success: boolean; strategy: string } {
    try {
      // Ensure source exists
      if (!fs.existsSync(source)) {
        throw new Error(`Source does not exist: ${source}`);
      }

      // Remove destination if it exists
      if (fs.existsSync(destination) || fs.lstatSync(destination)?.isSymbolicLink()) {
        try {
          fs.rmSync(destination, { recursive: true, force: true });
        } catch {
          // Ignore
        }
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
      return {
        success: false,
        strategy: 'none',
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
}
