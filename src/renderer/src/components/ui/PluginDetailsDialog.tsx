import React, { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, ArrowLeft, Copy, FileText, Loader2, X } from 'lucide-react';
import { useToast } from './Toast';

interface PluginDetailsDialogProps {
  open: boolean;
  plugin: PluginInventoryPlugin | null;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
}

const PluginDetailsDialog: React.FC<PluginDetailsDialogProps> = ({ open, plugin, returnFocusRef, onOpenChange }) => {
  const [manifestVersionId, setManifestVersionId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<PluginManifestPreview | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setManifestVersionId(null);
    setManifest(null);
    setManifestLoading(false);
    setManifestError(null);
  }, [open, plugin?.id]);

  const handleManifestOpen = async (versionId: string) => {
    setManifestVersionId(versionId);
    setManifest(null);
    setManifestError(null);
    setManifestLoading(true);

    try {
      setManifest(await window.api.plugins.readManifest(versionId));
    } catch (error) {
      setManifestError(errorMessage(error));
    } finally {
      setManifestLoading(false);
    }
  };

  const handleCopyBundlePath = async (bundlePath: string) => {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard API is unavailable.');
      }

      await navigator.clipboard.writeText(bundlePath);
      toast({
        title: 'Bundle path copied',
        description: bundlePath,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Could not copy bundle path',
        description: errorMessage(error),
        variant: 'error',
      });
    }
  };

  const selectedVersion = plugin?.versions.find((version) => version.id === manifestVersionId);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl glass-dialog shadow-xl data-[state=open]:animate-contentShow focus:outline-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
            <div className="min-w-0">
              {manifestVersionId && (
                <button
                  type="button"
                  onClick={() => {
                    setManifestVersionId(null);
                    setManifest(null);
                    setManifestError(null);
                  }}
                  className="mb-2 inline-flex items-center gap-1 rounded text-xs text-blue-200/80 transition-colors hover:text-blue-100"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to plugin details
                </button>
              )}
              <DialogPrimitive.Title className="truncate text-lg font-semibold text-white">
                {manifestVersionId
                  ? `Manifest for ${plugin?.displayName || 'plugin'}`
                  : `Plugin details: ${plugin?.displayName || 'Plugin'}`}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 truncate text-xs text-white/40">
                {manifestVersionId
                  ? `Read-only manifest for version ${manifest?.version || selectedVersion?.version || 'selected'}.`
                  : 'Read-only metadata and components detected in the local Codex Desktop cache.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Close plugin details">
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {manifestVersionId ? (
              <ManifestContent loading={manifestLoading} error={manifestError} manifest={manifest} />
            ) : plugin ? (
              <PluginDetails plugin={plugin} onCopyBundlePath={handleCopyBundlePath} onViewManifest={handleManifestOpen} />
            ) : (
              <div className="py-16 text-center text-sm text-white/45" role="status">Plugin details are not available.</div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

interface PluginDetailsProps {
  plugin: PluginInventoryPlugin;
  onCopyBundlePath: (bundlePath: string) => void | Promise<void>;
  onViewManifest: (versionId: string) => void | Promise<void>;
}

const PluginDetails: React.FC<PluginDetailsProps> = ({ plugin, onCopyBundlePath, onViewManifest }) => {
  const capabilities = uniqueStrings([
    ...plugin.capabilities,
    ...plugin.versions.flatMap((version) => version.capabilities),
  ]);

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Metadata label="Technical name" value={plugin.name} mono />
        <Metadata label="Marketplace" value={plugin.marketplace} mono />
        <Metadata label="Category" value={plugin.category || 'Not specified'} />
        <Metadata label="Status" value={statusLabel(plugin.status)} />
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-white/35">Description</dt>
          <dd className="mt-1 text-white/70">{plugin.description || 'No description provided.'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-white/35">Capabilities</dt>
          <dd className="mt-2">
            {capabilities.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Plugin capabilities">
                {capabilities.map((capability) => (
                  <li key={capability} className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2.5 py-1 text-xs text-blue-100">
                    {capability}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-white/45">No capabilities declared.</span>
            )}
          </dd>
        </div>
      </dl>

      <section className="space-y-3" aria-labelledby="plugin-versions-heading">
        <h3 id="plugin-versions-heading" className="text-base font-semibold text-white">Versions and components</h3>
        {plugin.versions.map((version) => (
          <PluginVersionDetails
            key={version.id}
            version={version}
            onCopyBundlePath={onCopyBundlePath}
            onViewManifest={onViewManifest}
          />
        ))}
      </section>

      {plugin.issues.length > 0 && (
        <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-sm text-amber-100/80" role="note">
          <p className="font-medium">Plugin issues</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {plugin.issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

const PluginVersionDetails: React.FC<{
  version: PluginInventoryVersion;
  onCopyBundlePath: (bundlePath: string) => void | Promise<void>;
  onViewManifest: (versionId: string) => void | Promise<void>;
}> = ({ version, onCopyBundlePath, onViewManifest }) => (
  <section className="space-y-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4" aria-label={`Version details ${version.version}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="font-mono text-sm font-semibold text-white">v{version.version}</h4>
        <p className="mt-1 text-xs text-white/45">{statusLabel(version.status)} · {formatComponentCounts(version.componentCounts)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onViewManifest(version.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/20 bg-blue-300/10 px-3 py-2 text-xs text-blue-100 transition-colors hover:bg-blue-300/20"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          View manifest for version {version.version}
        </button>
      </div>
    </div>

    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-xs uppercase tracking-wide text-white/35">Bundle path</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <code className="break-all text-xs leading-5 text-white/70">{version.bundlePath}</code>
        <button
          type="button"
          onClick={() => void onCopyBundlePath(version.bundlePath)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copy bundle path for version {version.version}
        </button>
      </div>
    </div>

    {version.components.length > 0 ? (
      <ul className="space-y-2" aria-label={`Declared components for version ${version.version}`}>
        {version.components.map((component) => (
          <li key={component.id} className="rounded border border-white/[0.06] px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-white/80">{component.name}</span>
              <span className="text-xs uppercase tracking-wide text-white/35">{componentKindLabel(component.kind)}</span>
              <span className={`text-xs ${component.status === 'available' ? 'text-emerald-300' : 'text-amber-200'}`}>
                {componentStatusLabel(component.status)}
              </span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-white/40">{component.reference}</p>
            {component.reason && <p className="mt-1 text-xs text-amber-100/70">{component.reason}</p>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-white/45">No components declared for this version.</p>
    )}
  </section>
);

const Metadata: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-white/35">{label}</dt>
    <dd className={`mt-1 break-all text-white/70 ${mono ? 'font-mono' : ''}`}>{value}</dd>
  </div>
);

const ManifestContent: React.FC<{
  loading: boolean;
  error: string | null;
  manifest: PluginManifestPreview | null;
}> = ({ loading, error, manifest }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/50" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-blue-300" aria-hidden="true" />
        Loading plugin manifest...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200" role="alert">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  return manifest?.content ? (
    <pre aria-label="Plugin manifest" className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/35 p-4 font-mono text-xs leading-6 text-white/75">
      {manifest.content}
    </pre>
  ) : (
    <div className="py-16 text-center text-sm text-white/45" role="status">Plugin manifest is not available.</div>
  );
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right));
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

export default PluginDetailsDialog;
