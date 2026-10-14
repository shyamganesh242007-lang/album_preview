import { Suspense } from 'react';
import { StudioAlbumView } from '@/components/album/StudioAlbumView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudioAlbumPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Loading album proof...</p>
          </div>
        </div>
      }
    >
      <StudioAlbumView albumId={id} />
    </Suspense>
  );
}
