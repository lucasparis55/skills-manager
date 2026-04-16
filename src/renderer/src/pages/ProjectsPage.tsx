import React, { useState, useEffect } from 'react';
import { FolderGit2, Plus, Scan, Trash2, CheckCircle } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  path: string;
  detectedIDEs: string[];
  addedAt: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await window.api.projects.list();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async () => {
    try {
      const path = prompt('Enter project path:');
      if (!path) return;

      await window.api.projects.add(path);
      await loadProjects();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleScanProjects = async () => {
    try {
      const result = await window.api.projects.scan();
      await loadProjects();
      alert(`Found ${result?.length || 0} projects!`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRemoveProject = async (project: Project) => {
    if (!confirm(`Remove project "${project.name}"?`)) return;

    try {
      await window.api.projects.remove(project.id);
      await loadProjects();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading projects...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{projects.length} Projects</h3>
        <div className="flex gap-2">
          <button
            onClick={handleScanProjects}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            <Scan className="w-4 h-4" />
            Scan
          </button>
          <button
            onClick={handleAddProject}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
          <FolderGit2 className="w-12 h-12 mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400 mb-4">No projects added yet</p>
          <button
            onClick={handleAddProject}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Add your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onRemove={handleRemoveProject} />
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectCard: React.FC<{ project: Project; onRemove: (project: Project) => void }> = ({ project, onRemove }) => {
  const ideColors: Record<string, string> = {
    'claude-code': 'bg-purple-500/20 text-purple-400',
    'cursor': 'bg-blue-500/20 text-blue-400',
    'opencode': 'bg-green-500/20 text-green-400',
    'codex-cli': 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-semibold text-white">{project.name}</h4>
        <button
          onClick={() => onRemove(project)}
          className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3 truncate" title={project.path}>
        {project.path}
      </p>

      {/* Detected IDEs */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Detected IDEs:</p>
        {project.detectedIDEs.length === 0 ? (
          <p className="text-xs text-slate-600">None detected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {project.detectedIDEs.map((ide) => (
              <span
                key={ide}
                className={`px-2 py-1 rounded text-xs ${ideColors[ide] || 'bg-slate-700 text-slate-300'}`}
              >
                {ide}
              </span>
            ))}
          </div>
        )}
      </div>

      {project.metadata?.hasGit && (
        <div className="flex items-center gap-1 mt-3 text-xs text-green-400">
          <CheckCircle className="w-3 h-3" />
          Git repository
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
