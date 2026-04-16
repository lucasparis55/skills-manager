import React from 'react';
import { Link } from 'lucide-react';

const LinksPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
        <Link className="w-12 h-12 mx-auto text-slate-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Link Management</h3>
        <p className="text-slate-400">
          Link skills to projects from the Skills or Projects page.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Symlinks will be created in the appropriate IDE directories.
        </p>
      </div>
    </div>
  );
};

export default LinksPage;
