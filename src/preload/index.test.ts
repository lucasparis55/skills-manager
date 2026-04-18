import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes api object in main world', async () => {
    await import('./index');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'api',
      expect.objectContaining({
        skills: expect.any(Object),
        projects: expect.any(Object),
        links: expect.any(Object),
        ides: expect.any(Object),
        detection: expect.any(Object),
        settings: expect.any(Object),
        dialog: expect.any(Object),
        githubImport: expect.any(Object),
        zipImport: expect.any(Object),
      }),
    );
  });

  it('routes invoke calls to expected ipc channels', async () => {
    await import('./index');
    const api = exposeInMainWorld.mock.calls[0][1];

    await api.skills.list();
    await api.skills.get('s1');
    await api.skills.create({ name: 's1' });
    await api.skills.update('s1', { description: 'x' });
    await api.skills.delete('s1');
    await api.skills.scan();
    await api.skills.getContent('s1');
    await api.skills.saveContent('s1', '# updated');
    await api.skills.listFiles('s1');
    await api.skills.readFile('s1', 'README.md');
    await api.skills.writeFile('s1', 'README.md', 'body');
    await api.skills.deleteFile('s1', 'README.md');
    await api.skills.getPath('s1');
    await api.skills.openFolder('s1');

    await api.projects.list();
    await api.projects.add('C:/repo');
    await api.projects.remove('p1');
    await api.projects.scan('C:/root');

    await api.links.list();
    await api.links.create({ skillId: 's1', projectId: 'p1', ideName: 'ide', scope: 'project' });
    await api.links.createMultiple({ skillIds: ['a'], projectId: 'p', ideName: 'i', scope: 'project' });
    await api.links.remove('l1');
    await api.links.removeMultiple(['l1', 'l2']);
    await api.links.verify('l1');
    await api.links.verifyAll();

    await api.ides.list();
    await api.ides.detectRoots();
    await api.detection.checkDuplicates('s1', 'p1', 'ide');

    await api.settings.get();
    await api.settings.update({ theme: 'dark' });
    await api.settings.setGithubToken('ghp_secure');
    await api.settings.clearGithubToken();

    await api.githubImport.parseUrl('owner/repo');
    await api.githubImport.analyze({ owner: 'owner', repo: 'repo' });
    await api.githubImport.checkConflicts(['s1']);
    await api.githubImport.importSkills({ parsed: {}, skills: [], resolutions: {} });
    await api.githubImport.cancelImport();
    await api.dialog.selectFolder({ defaultPath: 'C:/', title: 'Pick' });
    await api.dialog.selectFile({ defaultPath: 'C:/', title: 'Pick file', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    await api.zipImport.analyze('C:/skills.zip');
    await api.zipImport.checkConflicts(['s1']);
    await api.zipImport.importSkills({ zipPath: 'C:/skills.zip', skills: [], resolutions: {} });
    await api.zipImport.cancelImport();

    expect(invoke).toHaveBeenCalledWith('skills:list');
    expect(invoke).toHaveBeenCalledWith('skills:get', 's1');
    expect(invoke).toHaveBeenCalledWith('skills:create', { name: 's1' });
    expect(invoke).toHaveBeenCalledWith('skills:update', 's1', { description: 'x' });
    expect(invoke).toHaveBeenCalledWith('skills:delete', 's1');
    expect(invoke).toHaveBeenCalledWith('skills:scan');
    expect(invoke).toHaveBeenCalledWith('skills:getContent', 's1');
    expect(invoke).toHaveBeenCalledWith('skills:saveContent', 's1', '# updated');
    expect(invoke).toHaveBeenCalledWith('skills:listFiles', 's1');
    expect(invoke).toHaveBeenCalledWith('skills:readFile', 's1', 'README.md');
    expect(invoke).toHaveBeenCalledWith('skills:writeFile', 's1', 'README.md', 'body');
    expect(invoke).toHaveBeenCalledWith('skills:deleteFile', 's1', 'README.md');
    expect(invoke).toHaveBeenCalledWith('skills:getPath', 's1');
    expect(invoke).toHaveBeenCalledWith('skills:openFolder', 's1');

    expect(invoke).toHaveBeenCalledWith('projects:list');
    expect(invoke).toHaveBeenCalledWith('projects:add', 'C:/repo');
    expect(invoke).toHaveBeenCalledWith('projects:remove', 'p1');
    expect(invoke).toHaveBeenCalledWith('projects:scan', 'C:/root');

    expect(invoke).toHaveBeenCalledWith('links:list');
    expect(invoke).toHaveBeenCalledWith(
      'links:create',
      { skillId: 's1', projectId: 'p1', ideName: 'ide', scope: 'project' },
    );
    expect(invoke).toHaveBeenCalledWith(
      'links:createMultiple',
      { skillIds: ['a'], projectId: 'p', ideName: 'i', scope: 'project' },
    );
    expect(invoke).toHaveBeenCalledWith('links:remove', 'l1');
    expect(invoke).toHaveBeenCalledWith('links:removeMultiple', ['l1', 'l2']);
    expect(invoke).toHaveBeenCalledWith('links:verify', 'l1');
    expect(invoke).toHaveBeenCalledWith('links:verifyAll');

    expect(invoke).toHaveBeenCalledWith('ides:list');
    expect(invoke).toHaveBeenCalledWith('ides:detect-roots');
    expect(invoke).toHaveBeenCalledWith('detection:check-duplicates', 's1', 'p1', 'ide');

    expect(invoke).toHaveBeenCalledWith('settings:get');
    expect(invoke).toHaveBeenCalledWith('settings:update', { theme: 'dark' });
    expect(invoke).toHaveBeenCalledWith('settings:setGithubToken', 'ghp_secure');
    expect(invoke).toHaveBeenCalledWith('settings:clearGithubToken');

    expect(invoke).toHaveBeenCalledWith('github:parseUrl', 'owner/repo');
    expect(invoke).toHaveBeenCalledWith('github:analyze', { owner: 'owner', repo: 'repo' });
    expect(invoke).toHaveBeenCalledWith('github:checkConflicts', ['s1']);
    expect(invoke).toHaveBeenCalledWith('github:importSkills', { parsed: {}, skills: [], resolutions: {} });
    expect(invoke).toHaveBeenCalledWith('github:cancelImport');
    expect(invoke).toHaveBeenCalledWith(
      'dialog:selectFolder',
      { defaultPath: 'C:/', title: 'Pick' },
    );
    expect(invoke).toHaveBeenCalledWith(
      'dialog:selectFile',
      { defaultPath: 'C:/', title: 'Pick file', filters: [{ name: 'ZIP', extensions: ['zip'] }] },
    );
    expect(invoke).toHaveBeenCalledWith('zip:analyze', 'C:/skills.zip');
    expect(invoke).toHaveBeenCalledWith('zip:checkConflicts', ['s1']);
    expect(invoke).toHaveBeenCalledWith('zip:importSkills', { zipPath: 'C:/skills.zip', skills: [], resolutions: {} });
    expect(invoke).toHaveBeenCalledWith('zip:cancelImport');
  });

  it('subscribes and unsubscribes from progress channels', async () => {
    await import('./index');
    const api = exposeInMainWorld.mock.calls[0][1];
    const callback = vi.fn();

    const unsubscribeLinks = api.links.onCreateProgress(callback);
    expect(on).toHaveBeenCalledWith('links:createProgress', expect.any(Function));
    const linksHandler = on.mock.calls[0][1];
    linksHandler({}, { current: 1 });
    expect(callback).toHaveBeenCalledWith({ current: 1 });
    unsubscribeLinks();
    expect(removeListener).toHaveBeenCalledWith('links:createProgress', linksHandler);

    const unsubscribeGithub = api.githubImport.onProgress(callback);
    expect(on).toHaveBeenCalledWith('github:importProgress', expect.any(Function));
    const githubHandler = on.mock.calls[1][1];
    githubHandler({}, { phase: 'fetching' });
    expect(callback).toHaveBeenCalledWith({ phase: 'fetching' });
    unsubscribeGithub();
    expect(removeListener).toHaveBeenCalledWith('github:importProgress', githubHandler);

    const unsubscribeZip = api.zipImport.onProgress(callback);
    expect(on).toHaveBeenCalledWith('zip:importProgress', expect.any(Function));
    const zipHandler = on.mock.calls[2][1];
    zipHandler({}, { phase: 'reading' });
    expect(callback).toHaveBeenCalledWith({ phase: 'reading' });
    unsubscribeZip();
    expect(removeListener).toHaveBeenCalledWith('zip:importProgress', zipHandler);
  });
});
