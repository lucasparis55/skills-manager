import React, { useState, useEffect } from 'react';
import { File, Folder, Plus, Trash2, Edit3, ExternalLink, Loader2, X, Save } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface SkillFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

interface FileBrowserProps {
  skillId: string;
  onFileChange?: () => void;
}

interface EditFileState {
  path: string;
  content: string;
  isNew: boolean;
}

const FileBrowser: React.FC<FileBrowserProps> = ({ skillId, onFileChange }) => {
  const [files, setFiles] = useState<SkillFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFile, setEditingFile] = useState<EditFileState | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SkillFileEntry | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadFiles();
  }, [skillId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const data = await window.api.skills.listFiles(skillId);
      setFiles(data || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await window.api.skills.openFolder(skillId);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleEditFile = async (file: SkillFileEntry) => {
    if (file.isDirectory) return;
    try {
      const content = await window.api.skills.readFile(skillId, file.path);
      setEditingFile({ path: file.path, content, isNew: false });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    try {
      setEditingFile({ path: newFileName.trim(), content: '', isNew: true });
      setShowNewFileDialog(false);
      setNewFileName('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      await window.api.skills.writeFile(skillId, editingFile.path, editingFile.content);
      setEditingFile(null);
      await loadFiles();
      onFileChange?.();
      toast({
        title: 'Saved',
        description: `File "${editingFile.path}" ${editingFile.isNew ? 'created' : 'updated'}.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteTarget) return;
    try {
      await window.api.skills.deleteFile(skillId, deleteTarget.path);
      setDeleteTarget(null);
      await loadFiles();
      onFileChange?.();
      toast({ title: 'Deleted', description: `"${deleteTarget.name}" has been removed.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName: string, isDir: boolean) => {
    if (isDir) return <Folder className="w-4 h-4 text-blue-400" />;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['md', 'markdown'].includes(ext || '')) return <File className="w-4 h-4 text-green-400" />;
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) return <File className="w-4 h-4 text-yellow-400" />;
    if (['css', 'scss', 'less'].includes(ext || '')) return <File className="w-4 h-4 text-purple-400" />;
    if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) return <File className="w-4 h-4 text-orange-400" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) return <File className="w-4 h-4 text-pink-400" />;
    return <File className="w-4 h-4 text-white/45" />;
  };

  const getIndentLevel = (filePath: string): number => {
    const parts = filePath.split('/');
    return parts.length - 1;
  };

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        <span className="ml-2 text-white/45">Loading files...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">
          Skill Files ({files.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFileDialog(true)}
            className="flex items-center gap-1 px-3 py-1.5 glass hover:bg-white/[0.10] rounded-lg text-sm text-white/70 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New File
          </button>
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1 px-3 py-1.5 glass hover:bg-white/[0.10] rounded-lg text-sm text-white/70 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open Folder
          </button>
        </div>
      </div>

      {/* New File Input */}
      {showNewFileDialog && (
        <div className="flex gap-2 p-3 bg-white/[0.06] rounded-lg border border-white/[0.12]">
          <input
            type="text"
            placeholder="filename.md"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewFile();
              if (e.key === 'Escape') {
                setShowNewFileDialog(false);
                setNewFileName('');
              }
            }}
            className="flex-1 px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500 text-sm"
            autoFocus
          />
          <button
            onClick={handleNewFile}
            disabled={!newFileName.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => {
              setShowNewFileDialog(false);
              setNewFileName('');
            }}
            className="px-3 py-2 text-white/45 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File List */}
      {files.length === 0 ? (
        <div className="text-center py-8 text-white/40 text-sm">
          No files yet. Create a file to get started.
        </div>
      ) : (
        <div className="glass-input rounded-lg divide-y divide-white/[0.06] max-h-80 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors group"
              style={{ paddingLeft: `${getIndentLevel(file.path) * 16 + 16}px` }}
            >
              {getFileIcon(file.name, file.isDirectory)}
              <span className="flex-1 text-sm text-white/70 truncate">
                {file.name}
              </span>
              {!file.isDirectory && (
                <span className="text-xs text-white/40">
                  {formatSize(file.size)}
                </span>
              )}
              {!file.isDirectory && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEditFile(file)}
                    className="p-1 text-white/45 hover:text-blue-400 transition-colors"
                    title="Edit file"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(file)}
                    className="p-1 text-white/45 hover:text-red-400 transition-colors"
                    title="Delete file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {file.isDirectory && (
                <Folder className="w-3.5 h-3.5 text-white/30" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit File Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-dialog rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h3 className="text-sm font-medium text-white">
                {editingFile.isNew ? 'New File' : 'Edit'}: {editingFile.path}
              </h3>
              <button
                onClick={() => setEditingFile(null)}
                className="text-white/40 hover:text-white/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                placeholder="File content..."
                className="w-full h-64 px-4 py-3 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500 resize-y font-mono text-sm"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveFile();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-white/[0.08]">
              <button
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 text-white/45 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFile}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Delete File"
          description={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDeleteFile}
          confirmLabel="Delete"
          variant="danger"
        />
      )}
    </div>
  );
};

export default FileBrowser;
