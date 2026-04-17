import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DetectionService } from './detection.service';
import { ProjectService } from './project.service';
import { SkillService } from './skill.service';

describe('DetectionService', () => {
  let tempAppDataDir: string;
  let tempSkillsRoot: string;
  let tempProjectRoot: string;
  let projectService: ProjectService;
  let skillService: SkillService;

  beforeEach(() => {
    tempAppDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detection-appdata-'));
    tempSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'detection-skills-'));
    tempProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'detection-project-'));

    projectService = new ProjectService(tempAppDataDir);
    skillService = new SkillService(tempSkillsRoot);
    skillService.create({
      name: 'safe-skill',
      displayName: 'Safe Skill',
      description: 'test',
      format: 'folder',
      targetIDEs: ['codex-cli'],
      tags: [],
    });
  });

  afterEach(() => {
    fs.rmSync(tempAppDataDir, { recursive: true, force: true });
    fs.rmSync(tempSkillsRoot, { recursive: true, force: true });
    fs.rmSync(tempProjectRoot, { recursive: true, force: true });
  });

  it('should compute project duplicate path from projectId path instead of process.cwd()', () => {
    const project = projectService.add(tempProjectRoot);
    const duplicatePath = path.join(tempProjectRoot, '.agents/skills/safe-skill');
    fs.mkdirSync(duplicatePath, { recursive: true });

    const detectionService = new DetectionService(
      {
        get: () => ({ centralSkillsRoot: tempSkillsRoot }),
      } as any,
      projectService,
      {
        list: () => [
          {
            id: 'codex-cli',
            roots: {
              projectRelative: ['.agents/skills'],
              primaryGlobal: [],
              secondaryGlobal: [],
            },
          },
        ],
      } as any,
    );

    const report = detectionService.checkDuplicates('safe-skill', project.id, 'codex-cli');
    expect(report.hasDuplicate).toBe(true);
    expect(report.existingType).toBe('project-skill');
    expect(report.existingPath).toBe(duplicatePath);
  });

  it('should detect duplicate in expanded global root', () => {
    const project = projectService.add(tempProjectRoot);
    const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'detection-global-'));
    const duplicatePath = path.join(globalRoot, 'safe-skill');
    fs.mkdirSync(duplicatePath, { recursive: true });

    const detectionService = new DetectionService(
      {
        get: () => ({ centralSkillsRoot: tempSkillsRoot }),
      } as any,
      projectService,
      {
        list: () => [
          {
            id: 'codex-cli',
            roots: {
              projectRelative: ['.agents/skills'],
              primaryGlobal: [globalRoot],
              secondaryGlobal: [],
            },
          },
        ],
      } as any,
    );

    const report = detectionService.checkDuplicates('safe-skill', project.id, 'codex-cli');
    expect(report.hasDuplicate).toBe(true);
    expect(report.existingType).toBe('global-skill');
    expect(report.existingPath).toBe(duplicatePath);

    fs.rmSync(globalRoot, { recursive: true, force: true });
  });
});

