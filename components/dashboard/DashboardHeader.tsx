import React from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DashboardHeaderProps {
  onCreateClick: () => void;
  albumCount: number;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onCreateClick,
  albumCount,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-[#0b0e17]/90 sticky top-0 z-30 shadow-sm backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 bg-purple-600 rounded-lg flex items-center justify-center text-white shadow-sm shadow-purple-950/50">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-100 tracking-tight">
                  Zeebook Studio
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold bg-purple-950/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/40">
                  Proofing
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Wedding Album Proofing & Client Approval System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-xs text-slate-400 mr-2">
              <span className="font-semibold text-slate-200">{albumCount}</span> {albumCount === 1 ? 'Album' : 'Albums'} in library
            </div>
            <Button onClick={onCreateClick} variant="primary" size="md">
              <Plus className="h-4 w-4 mr-1" />
              New Album
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
