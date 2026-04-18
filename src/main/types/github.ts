import type { ConflictResolution, ImportFileEntry, ImportProgress, ImportResult, SkillStructure } from './import';

export type { ConflictResolution, ImportFileEntry, ImportProgress, ImportResult, SkillStructure };

/**
 * Type definitions for GitHub skill import feature
 */

/** Parsed components of a GitHub repository URL */
export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  branch: string;
  subpath?: string;
}

/** Repository metadata from GitHub API */
export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  starsCount: number;
}

/** Entry from GitHub git/trees API */
export interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

/** A skill detected within a GitHub repository */
export interface DetectedSkill {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  hasSkillMd: boolean;
  fileCount: number;
  files: GitHubTreeEntry[];
  structure: SkillStructure;
  repoInfo: GitHubRepoInfo;
}

/** Typed error from GitHub API interactions */
export interface GitHubApiError {
  status: number;
  message: string;
  isRateLimit: boolean;
  rateLimitReset?: number;
  rateLimitRemaining?: number;
}

/** Response from GitHub repo analysis */
export interface AnalyzeResult {
  repoInfo: GitHubRepoInfo;
  skills: DetectedSkill[];
}
