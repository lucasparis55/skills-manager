import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ensureSkillsRoot, expandPath, getAppDataDir, getSkillsRoot, isSubDirectory, resolveSkillsRoot } from './paths';

describe('paths utils', () => {
  it('expands home and environment variables', () => {
    process.env.TEST_HOME_SEGMENT = 'dev';
    process.env.WIN_SEGMENT = 'Users';

    const expanded = expandPath('~/%WIN_SEGMENT%/$TEST_HOME_SEGMENT/${TEST_HOME_SEGMENT}');
    const normalizedHome = path.normalize(os.homedir());

    expect(expanded).toContain(normalizedHome);
    expect(expanded).toContain(path.normalize('Users'));
    expect(expanded).toContain(path.normalize('dev'));
  });

  it('removes unknown env placeholders', () => {
    const expanded = expandPath('/tmp/%NOT_SET%/$NOT_SET/${NOT_SET}');
    expect(expanded).toBe(path.normalize('/tmp/'));
  });

  it('returns app data and skills root under home directory', () => {
    expect(getAppDataDir()).toBe(path.join(os.homedir(), '.skills-manager'));
    expect(getSkillsRoot()).toBe(path.join(os.homedir(), '.skills-manager', 'skills'));
  });

  it('checks subdirectory relationship correctly', () => {
    expect(isSubDirectory('/parent/child', '/parent')).toBe(true);
    expect(isSubDirectory('/parent', '/parent')).toBe(false);
    expect(isSubDirectory('/other/place', '/parent')).toBe(false);
  });

  it('resolveSkillsRoot uses configured path when non-empty', () => {
    const configured = path.join(os.tmpdir(), 'custom-skills');
    expect(resolveSkillsRoot(configured)).toBe(path.resolve(configured));
  });

  it('resolveSkillsRoot falls back to getSkillsRoot', () => {
    expect(resolveSkillsRoot('')).toBe(path.resolve(getSkillsRoot()));
    expect(resolveSkillsRoot(null)).toBe(path.resolve(getSkillsRoot()));
  });

  it('keeps an existing skills segment and appends it to broader tool roots', () => {
    expect(ensureSkillsRoot('C:/Users/test/.cursor')).toBe(path.normalize('C:/Users/test/.cursor/skills'));
    expect(ensureSkillsRoot('C:/Users/test/.cursor/skills')).toBe(path.normalize('C:/Users/test/.cursor/skills'));
  });
});
