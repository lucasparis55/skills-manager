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

      {inventory.plugins.length === 0 ? (
        <EmptyPlugins />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {inventory.plugins.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} />)}
        </div>
      )}
    </div>
  );
};

const PluginCard: React.FC<{ plugin: PluginInventoryEntry }> = ({ plugin }) => (
  <article className="glass-card space-y-4 p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-white">{plugin.displayName}</h2>
        <p className="mt-1 truncate font-mono text-xs text-white/40">{plugin.name}</p>
      </div>
      <span className="shrink-0 rounded bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">Cache detected</span>
    </div>

    <p className="min-h-10 text-sm leading-5 text-white/55">{plugin.description || 'No description provided.'}</p>

    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-xs uppercase tracking-wide text-white/35">Marketplace</dt>
        <dd className="mt-1 break-all font-mono text-white/70">{plugin.marketplace}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-white/35">Version</dt>
        <dd className="mt-1 font-mono text-white/70">v{plugin.version}</dd>
      </div>
    </dl>
  </article>
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

export default PluginsPage;
