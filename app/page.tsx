'use client';

import React, { useState, useMemo } from 'react';
import { useAlbums } from '@/hooks/useAlbums';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AlbumList } from '@/components/dashboard/AlbumList';
import { CreateAlbumModal } from '@/components/dashboard/CreateAlbumModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlbumStatus } from '@/types/album';
import { createDemoWeddingAlbum } from '@/utils/demoAlbumGenerator';
import { Search, Filter, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const { albums, loading, createAlbum, deleteAlbum, refresh } = useAlbums();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const handleLoadDemo = async () => {
    try {
      setIsGeneratingDemo(true);
      await createDemoWeddingAlbum();
      await refresh();
    } catch (err) {
      alert('Failed to generate demo album: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Deletion confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredAlbums = useMemo(() => {
    return albums.filter((album) => {
      const matchesSearch =
        album.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        album.clientName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || album.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [albums, searchQuery, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: albums.length,
      Draft: 0,
      'In Review': 0,
      'Changes Requested': 0,
      Approved: 0,
    };
    albums.forEach((a) => {
      if (counts[a.status] !== undefined) {
        counts[a.status]++;
      }
    });
    return counts;
  }, [albums]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteAlbum(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert('Failed to delete album: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e]">
      <DashboardHeader
        albumCount={albums.length}
        onCreateClick={() => setIsCreateModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Controls: Search & Status Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by album title or client name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-[#111522] border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Filter className="h-3.5 w-3.5 text-slate-500 mr-1 hidden sm:inline" />
            {(['ALL', 'Draft', 'In Review', 'Changes Requested', 'Approved'] as const).map(
              (status) => {
                const count = statusCounts[status] || 0;
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-sm shadow-purple-950/50'
                        : 'bg-[#111522] text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{status === 'ALL' ? 'All Albums' : status}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Album Cards List */}
        <AlbumList
          albums={filteredAlbums}
          loading={loading || isGeneratingDemo}
          onCreateClick={() => setIsCreateModalOpen(true)}
          onLoadDemo={handleLoadDemo}
          onDeleteAlbum={(id, title) => setDeleteTarget({ id, title })}
        />
      </main>

      {/* Create Album Modal */}
      <CreateAlbumModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (title, clientName, clientEmail, notes) => {
          await createAlbum(title, clientName, clientEmail, notes);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Wedding Album"
        description="Are you sure you want to permanently delete this album and all its pages?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Album: <strong className="text-slate-100">{deleteTarget?.title}</strong>
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleDeleteConfirm}
              isLoading={isDeleting}
            >
              Delete Album
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
