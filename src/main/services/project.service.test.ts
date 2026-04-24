import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let appDataDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-service-data-'));
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-service-workspace-'));
  });

  afterEach(() => {
    fs.rmSync(appDataDir, { recursive: true, force: true });
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('should create projects.json if absent on construction', () => {
    const service = new ProjectService(appDataDir);

    expect(service.list()).toEqual([]);
    const projectsPath = path.join(appDataDir, 'projects.json');
    expect(fs.existsSync(projectsPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))).toEqual([]);
  });

  it('should persist add() across service reinstantiation', () => {
    const projectPath = path.join(workspaceDir, 'skills-manager');
    fs.mkdirSync(projectPath, { recursive: true });

    const service = new ProjectService(appDataDir);
    const created = service.add(projectPath);

    const reloaded = new ProjectService(appDataDir);
    const projects = reloaded.list();

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(created.id);
    expect(projects[0].path).toBe(path.resolve(projectPath));
  });

  it('should make add() idempotent for the same canonical path', () => {
    const projectPath = path.join(workspaceDir, 'my-project');
    fs.mkdirSync(projectPath, { recursive: true });

    const service = new ProjectService(appDataDir);
    const first = service.add(projectPath);
    const second = service.add(projectPath);

    expect(second.id).toBe(first.id);
    expect(service.list()).toHaveLength(1);

    const onDisk = JSON.parse(fs.readFileSync(path.join(appDataDir, 'projects.json'), 'utf-8'));
    expect(onDisk).toHaveLength(1);
  });

  it('should persist remove()', () => {
    const projectPath = path.join(workspaceDir, 'to-remove');
    fs.mkdirSync(projectPath, { recursive: true });

    const service = new ProjectService(appDataDir);
    const created = service.add(projectPath);
    service.remove(created.id);

    expect(service.list()).toHaveLength(0);

    const reloaded = new ProjectService(appDataDir);
    expect(reloaded.list()).toHaveLength(0);
    expect(JSON.parse(fs.readFileSync(path.join(appDataDir, 'projects.json'), 'utf-8'))).toEqual([]);
  });

  it('should persist scan() additions and avoid duplicate entries by path', () => {
    const scanRoot = path.join(workspaceDir, 'scan-root');
    const discoveredProject = path.join(scanRoot, 'discovered-app');

    fs.mkdirSync(discoveredProject, { recursive: true });
    fs.writeFileSync(path.join(discoveredProject, 'package.json'), '{}', 'utf-8');

    const service = new ProjectService(appDataDir);
    const firstScan = service.scan(scanRoot);
    const secondScan = service.scan(scanRoot);

    expect(firstScan).toHaveLength(1);
    expect(secondScan).toHaveLength(1);
    expect(service.list()).toHaveLength(1);

    const reloaded = new ProjectService(appDataDir);
    expect(reloaded.list()).toHaveLength(1);
  });

  it('should recover from corrupt projects.json using projects.json.bak', () => {
    const restoredPath = path.join(workspaceDir, 'restored-project');
    fs.mkdirSync(restoredPath, { recursive: true });

    const backupProjects = [
      {
        id: 'restored-project',
        name: 'restored-project',
        path: restoredPath,
        detectedIDEs: [],
        addedAt: '2024-01-01T00:00:00.000Z',
        lastScanned: '2024-01-01T00:00:00.000Z',
        metadata: { hasGit: false },
      },
    ];

    fs.writeFileSync(path.join(appDataDir, 'projects.json'), '{invalid json', 'utf-8');
    fs.writeFileSync(path.join(appDataDir, 'projects.json.bak'), JSON.stringify(backupProjects, null, 2), 'utf-8');

    const service = new ProjectService(appDataDir);
    const projects = service.list();

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('restored-project');

    const repaired = JSON.parse(fs.readFileSync(path.join(appDataDir, 'projects.json'), 'utf-8'));
    expect(repaired).toHaveLength(1);
    expect(repaired[0].id).toBe('restored-project');
  });

  it('should avoid overwriting on same-name ID collision by adding a deterministic suffix', () => {
    const firstPath = path.join(workspaceDir, 'team-a', 'app');
    const secondPath = path.join(workspaceDir, 'team-b', 'app');

    fs.mkdirSync(firstPath, { recursive: true });
    fs.mkdirSync(secondPath, { recursive: true });

    const service = new ProjectService(appDataDir);
    const first = service.add(firstPath);
    const second = service.add(secondPath);

    expect(first.id).toBe('app');
    expect(second.id).not.toBe(first.id);
    expect(second.id.startsWith('app-')).toBe(true);
    expect(service.list()).toHaveLength(2);
  });

  it('detects kimi-cli IDE when .kimi directory exists', () => {
    const projectPath = path.join(workspaceDir, 'kimi-project');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, '.kimi'), { recursive: true });

    const service = new ProjectService(appDataDir);
    const ides = service.detectIDEs(projectPath);

    expect(ides).toContain('kimi-cli');
  });

  it('detects kimi-cli IDE when .agents directory exists', () => {
    const projectPath = path.join(workspaceDir, 'agents-project');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, '.agents'), { recursive: true });

    const service = new ProjectService(appDataDir);
    const ides = service.detectIDEs(projectPath);

    expect(ides).toContain('kimi-cli');
  });

  it('scans with custom depth', () => {
    const scanRoot = path.join(workspaceDir, 'deep-root');
    const level1 = path.join(scanRoot, 'level1');
    const level2 = path.join(level1, 'level2');
    const projectAtLevel2 = path.join(level2, 'deep-project');

    fs.mkdirSync(projectAtLevel2, { recursive: true });
    fs.writeFileSync(path.join(projectAtLevel2, 'package.json'), '{}', 'utf-8');

    const service = new ProjectService(appDataDir);
    const depth2 = service.scan(scanRoot, 2);
    const depth3 = service.scan(scanRoot, 3);

    expect(depth2).toHaveLength(0);
    expect(depth3).toHaveLength(1);
    expect(depth3[0].name).toBe('deep-project');
  });

  it('clamps scan depth between 1 and 5', () => {
    const scanRoot = path.join(workspaceDir, 'clamp-root');
    const sub = path.join(scanRoot, 'sub');
    const projectPath = path.join(sub, 'app');

    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'package.json'), '{}', 'utf-8');

    const service = new ProjectService(appDataDir);

    const tooLow = service.scan(scanRoot, 0);
    const tooHigh = service.scan(scanRoot, 10);
    const normal = service.scan(scanRoot, 2);

    expect(tooLow).toHaveLength(0); // depth clamped to 1, scanRoot and sub checked
    expect(tooHigh).toHaveLength(1); // depth clamped to 5, finds project
    expect(normal).toHaveLength(1); // depth 2, finds project at sub/app
  });
});
