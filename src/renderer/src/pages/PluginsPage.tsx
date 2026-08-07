import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, PackageSearch, Puzzle, RefreshCw } from 'lucide-react';

const PluginsPage: React.FC = () => {
  const [inventory, setInventory] = useState<PluginInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setInventory(await window.api.plugins.scan());
    } catch (scanError) {
      setError(errorMessage(scanError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  if (loading && !inventory) {
    return <PluginsLoading />;
  }

  if (error && !inventory) {
    return <PluginsError message={error} onRetry={() => void loadInventory()} />;
  }

  if (!inventory) return null;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6" aria-busy={loading}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Puzzle className="h-6 w-6 text-blue-300" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-white">Codex Desktop plugins</h1>
          </div>
          <p className="mt-2 text-sm text-white/45">
            Read-only inventory of plugin bundles detected in the local Codex Desktop cache.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInventory()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg glass px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="glass-card flex flex-col gap-2 p-4 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Last scan: <time dateTime={inventory.scannedAt}>{formatScanTime(inventory.scannedAt)}</time>
        </p>
        <p>
          Cache root: <code className="break-all text-white/75">{inventory.rootPath}</code>
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100/80" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {inventory.plugins.length === 0 && inventory.invalidEntries.length === 0 ? (
        <EmptyPlugins />
      ) : (
        <>
          {inventory.plugins.length > 0 && (
            <div className="grid gap-4 xl:grid-cols-2">
              {inventory.plugins.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} />)}
            </div>
          )}
          {inventory.invalidEntries.length > 0 && <InvalidPluginEntries entries={inventory.invalidEntries} />}
        </>
      )}
    </div>
  );
};

const PluginCard: React.FC<{ plugin: PluginInventoryPlugin }> = ({ plugin }) => (
  <article className="glass-card space-y-4 p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-white">{plugin.displayName}</h2>
        <p className="mt-1 truncate font-mono text-xs text-white/40">{plugin.name}</p>
      </div>
      <StatusBadge status={plugin.status} />
    </div>

    <p className="min-h-10 text-sm leading-5 text-white/55">{plugin.description || 'No description provided.'}</p>

    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-xs uppercase tracking-wide text-white/35">Marketplace</dt>
        <dd className="mt-1 break-all font-mono text-white/70">{plugin.marketplace}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-white/35">Versions</dt>
        <dd className="mt-1 text-white/70">{plugin.versions.length} {plugin.versions.length === 1 ? 'version' : 'versions'}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-xs uppercase tracking-wide text-white/35">Declared components</dt>
        <dd className="mt-1 text-white/70">{formatComponentCounts(plugin.componentCounts)}</dd>
      </div>
    </dl>

    <div className="space-y-3 border-t border-white/[0.08] pt-4">
      {plugin.versions.map((version) => <PluginVersion key={version.id} version={version} />)}
    </div>

    {plugin.issues.length > 0 && (
      <IssueList issues={plugin.issues} />
    )}
  </article>
);

const PluginVersion: React.FC<{ version: PluginInventoryVersion }> = ({ version }) => (
  <section className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4" aria-label={`Version ${version.version}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-mono text-sm font-semibold text-white">v{version.version}</h3>
        <p className="mt-1 text-xs text-white/45">{formatComponentCounts(version.componentCounts)}</p>
      </div>
      <StatusBadge status={version.status} />
    </div>

    {version.components.length > 0 && (
      <ul className="space-y-2" aria-label={`Components for version ${version.version}`}>
        {version.components.map((component) => <ComponentRow key={component.id} component={component} />)}
      </ul>
    )}

    {version.issues.length > 0 && <IssueList issues={version.issues} />}
  </section>
);

const ComponentRow: React.FC<{ component: PluginComponent }> = ({ component }) => (
  <li className="rounded border border-white/[0.06] px-3 py-2 text-sm">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium text-white/80">{component.name}</span>
      <span className="text-xs uppercase tracking-wide text-white/35">{componentKindLabel(component.kind)}</span>
      <span className={`text-xs ${component.status === 'available' ? 'text-emerald-300' : 'text-amber-200'}`}>
        {componentStatusLabel(component.status)}
      </span>
    </div>
    {component.reason && <p className="mt-1 text-xs text-amber-100/70">{component.reason}</p>}
  </li>
);

const InvalidPluginEntries: React.FC<{ entries: PluginInventoryInvalidEntry[] }> = ({ entries }) => (
  <section className="space-y-3" aria-labelledby="invalid-plugin-manifests-heading">
    <div>
      <h2 id="invalid-plugin-manifests-heading" className="text-lg font-semibold text-white">Invalid plugin manifests</h2>
      <p className="mt-1 text-sm text-white/45">These cache entries were not counted as valid plugins.</p>
    </div>
    <div className="grid gap-3 xl:grid-cols-2">
      {entries.map((entry) => (
        <article key={entry.id} className="glass-card space-y-3 border-amber-400/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-white">{entry.name}</h3>
              <p className="mt-1 break-all font-mono text-xs text-white/40">{entry.marketplace} · v{entry.version}</p>
            </div>
            <StatusBadge status="invalid" label="Invalid manifest" />
          </div>
          <p className="text-sm text-amber-100/80">{entry.reason}</p>
          <p className="break-all text-xs text-white/40">{entry.manifestPath}</p>
        </article>
      ))}
    </div>
  </section>
);

const StatusBadge: React.FC<{ status: PluginInventoryStatus; label?: string }> = ({ status, label }) => (
  <span className={`shrink-0 rounded px-2 py-1 text-xs ${statusClasses(status)}`}>
    {label || statusLabel(status)}
  </span>
);

const IssueList: React.FC<{ issues: string[] }> = ({ issues }) => (
  <ul className="space-y-1 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-xs text-amber-100/75" aria-label="Plugin issues">
    {issues.map((issue) => <li key={issue}>{issue}</li>)}
  </ul>
);

const EmptyPlugins: React.FC = () => (
  <div className="glass-panel flex flex-col items-center justify-center p-12 text-center" role="status">
    <PackageSearch className="h-10 w-10 text-white/30" aria-hidden="true" />
    <h2 className="mt-4 font-semibold text-white">No Codex Desktop plugins found in the local cache.</h2>
    <p className="mt-2 max-w-md text-sm text-white/45">
      Only valid plugin bundles with a Codex manifest are shown here.
    </p>
  </div>
);

const PluginsLoading: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading plugins">
    <div className="h-10 w-80 animate-pulse rounded-lg bg-white/[0.06]" />
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/45" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-blue-300" aria-hidden="true" />
      Loading plugins...
    </div>
  </div>
);

const PluginsError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="glass-panel flex flex-col items-center justify-center p-12 text-center" role="alert">
    <AlertCircle className="h-10 w-10 text-red-300" aria-hidden="true" />
    <h1 className="mt-4 font-semibold text-white">Could not load Codex Desktop plugins</h1>
    <p className="mt-2 max-w-md text-sm text-white/45">{message}</p>
    <button type="button" onClick={onRetry} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
      Try again
    </button>
  </div>
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatScanTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatComponentCounts(counts: PluginComponentCounts): string {
  return [
    `${counts.skills} ${counts.skills === 1 ? 'skill' : 'skills'}`,
    `${counts.apps} ${counts.apps === 1 ? 'app' : 'apps'}`,
    `${counts.mcpServers} ${counts.mcpServers === 1 ? 'MCP server' : 'MCP servers'}`,
  ].join(' · ');
}

function componentKindLabel(kind: PluginComponentKind): string {
  return kind === 'mcp-server' ? 'MCP server' : kind;
}

function componentStatusLabel(status: PluginComponentStatus): string {
  switch (status) {
    case 'available': return 'Available';
    case 'missing': return 'Missing';
    case 'invalid-reference': return 'Invalid reference';
    case 'external-symlink': return 'External symlink';
    case 'invalid-manifest': return 'Invalid manifest';
  }
}

function statusLabel(status: PluginInventoryStatus): string {
  switch (status) {
    case 'bundled': return 'Bundled';
    case 'cache-detected': return 'Cache detected';
    case 'protected': return 'Protected';
    case 'invalid': return 'Invalid';
  }
}

function statusClasses(status: PluginInventoryStatus): string {
  switch (status) {
    case 'bundled': return 'bg-blue-400/10 text-blue-200';
    case 'protected': return 'bg-violet-400/10 text-violet-200';
    case 'invalid': return 'bg-amber-400/10 text-amber-200';
    case 'cache-detected': return 'bg-emerald-400/10 text-emerald-300';
  }
}

export default PluginsPage;
