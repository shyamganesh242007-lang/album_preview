import { AlbumPage } from '@/types/album';

export interface AlbumSpread {
  id: string;
  spreadIndex: number;
  leftPage?: AlbumPage;
  rightPage?: AlbumPage;
  isCover: boolean;
  isBackCover?: boolean;
  label: string;
}

/**
 * Organizes album pages into physical wedding album spreads.
 * Front cover is shown as single page on the right side of the closed book spread.
 * Back cover is shown as single page on the left side of the closed back spread.
 * Inside pages are paired into Left & Right pages.
 */
export function buildAlbumSpreads(pages: AlbumPage[]): AlbumSpread[] {
  if (!pages || pages.length === 0) return [];

  const sortedPages = [...pages].sort((a, b) => a.order - b.order);
  const spreads: AlbumSpread[] = [];

  // 1. Check if first page is a cover
  const firstPage = sortedPages[0];
  let startIndex = 0;

  if (
    firstPage.side === 'cover' ||
    firstPage.side === 'front_cover' ||
    sortedPages.length === 1
  ) {
    spreads.push({
      id: `spread_cover_${firstPage.id}`,
      spreadIndex: 0,
      leftPage: undefined,
      rightPage: firstPage,
      isCover: true,
      isBackCover: false,
      label: 'Front Cover',
    });
    startIndex = 1;
  }

  // 2. Check if last page is a back cover (only if more than 1 page)
  const lastIndex = sortedPages.length - 1;
  const hasBackCover =
    sortedPages.length > 1 &&
    lastIndex >= startIndex &&
    (sortedPages[lastIndex].side === 'back-cover' ||
      sortedPages[lastIndex].side === 'back_cover');

  const insideEndIndex = hasBackCover ? lastIndex : sortedPages.length;
  const insidePages = sortedPages.slice(startIndex, insideEndIndex);

  // 3. Pair up inside pages
  for (let i = 0; i < insidePages.length; i += 2) {
    const left = insidePages[i];
    const right = insidePages[i + 1];

    if (right) {
      spreads.push({
        id: `spread_${left.id}_${right.id}`,
        spreadIndex: spreads.length,
        leftPage: left,
        rightPage: right,
        isCover: false,
        isBackCover: false,
        label: `Pages ${left.order} - ${right.order}`,
      });
    } else {
      // Single trailing inside page
      spreads.push({
        id: `spread_single_${left.id}`,
        spreadIndex: spreads.length,
        leftPage: left,
        rightPage: undefined,
        isCover: false,
        isBackCover: false,
        label: `Page ${left.order}`,
      });
    }
  }

  // 4. Append Back Cover if present
  if (hasBackCover) {
    const backCoverPage = sortedPages[lastIndex];
    spreads.push({
      id: `spread_back_cover_${backCoverPage.id}`,
      spreadIndex: spreads.length,
      leftPage: backCoverPage,
      rightPage: undefined,
      isCover: false,
      isBackCover: true,
      label: 'Back Cover',
    });
  }

  return spreads;
}
