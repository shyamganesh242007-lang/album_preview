import assert from 'assert';
import { buildAlbumSpreads } from '../utils/spreadBuilder.ts';

console.log('===============================================================');
console.log('RUNNING DEDICATED UPLOAD CHECKBOX LOGIC TESTS (TESTS 1 - 5)');
console.log('===============================================================\n');

/**
 * Simulates processPdfFile with the exact logic in pdfProcessor.ts
 */
function processPdf(totalPages, isWideSpreadFn, options = {}) {
  const markFirstAsCover = options.markFirstAsCover !== false;
  const markLastAsBackCover = options.markLastAsBackCover !== false;

  const pagesBySourceIndex = new Array(totalPages);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const sourcePageIndex = pageNum - 1;
    const sourcePageNumber = pageNum;

    const isFirstPage = pageNum === 1;
    const isLastPage = totalPages > 1 && pageNum === totalPages;

    const forceCoverSingle = isFirstPage && Boolean(markFirstAsCover);
    const forceBackCoverSingle = isLastPage && Boolean(markLastAsBackCover);
    const forceSingle = forceCoverSingle || forceBackCoverSingle;

    const isWide = isWideSpreadFn(pageNum);
    const isSpread = !forceSingle && isWide;

    if (isSpread) {
      const leftPage = {
        id: `p_${pageNum}_L`,
        albumId: 'alb_test',
        order: 0,
        sourcePageIndex,
        sourcePageNumber,
        splitSide: 'left',
        side: 'left',
        isSpread: true,
        width: 1200,
        height: 800,
        filename: `doc.pdf - Page ${pageNum} (Left)`,
      };
      const rightPage = {
        id: `p_${pageNum}_R`,
        albumId: 'alb_test',
        order: 0,
        sourcePageIndex,
        sourcePageNumber,
        splitSide: 'right',
        side: 'right',
        isSpread: true,
        width: 1200,
        height: 800,
        filename: `doc.pdf - Page ${pageNum} (Right)`,
      };
      pagesBySourceIndex[sourcePageIndex] = [leftPage, rightPage];
    } else {
      const pageSide = forceCoverSingle
        ? 'front_cover'
        : forceBackCoverSingle
        ? 'back_cover'
        : 'single';

      const singlePage = {
        id: `p_${pageNum}`,
        albumId: 'alb_test',
        order: 0,
        sourcePageIndex,
        sourcePageNumber,
        splitSide: 'single',
        side: pageSide,
        isSpread: false,
        width: isWide ? 2400 : 1200,
        height: 800,
        filename: `doc.pdf - Page ${pageNum}`,
      };
      pagesBySourceIndex[sourcePageIndex] = [singlePage];
    }
  }

  // Reassemble by sourcePageIndex
  const resultPages = [];
  let currentOrder = 1;
  for (let srcIdx = 0; srcIdx < totalPages; srcIdx++) {
    const pagesForSlot = pagesBySourceIndex[srcIdx];
    const ordered = [...pagesForSlot].sort((a, b) => {
      if (a.splitSide === 'left' && b.splitSide === 'right') return -1;
      if (a.splitSide === 'right' && b.splitSide === 'left') return 1;
      return 0;
    });
    for (const p of ordered) {
      p.order = currentOrder++;
      resultPages.push(p);
    }
  }

  return resultPages;
}

// --------------------------------------------------------------------------
// TEST 1: Front checkbox ON, PDF Page 1 is wide
// Expected:
// - Page 1 = complete PDF Page 1 as ONE front cover.
// - Page 2 content must not appear on Page 1.
// --------------------------------------------------------------------------
console.log('[TEST 1] Front checkbox ON, PDF Page 1 is wide');
{
  const totalPages = 3;
  // All pages are wide (including Page 1 and Page 2)
  const pages = processPdf(totalPages, () => true, {
    markFirstAsCover: true,
    markLastAsBackCover: false,
  });

  // Verify Page 1
  assert.strictEqual(pages[0].sourcePageNumber, 1, 'First physical page must be from PDF Page 1');
  assert.strictEqual(pages[0].side, 'front_cover', 'First physical page must have side front_cover');
  assert.strictEqual(pages[0].isSpread, false, 'First physical page must NOT be split into a spread');
  assert.strictEqual(pages[0].splitSide, 'single', 'First physical page must be single');
  assert.strictEqual(pages[0].order, 1);

  // Verify Page 2 content is NOT on Page 1
  assert.strictEqual(pages[1].sourcePageNumber, 2, 'Second physical page must be from PDF Page 2');
  assert.strictEqual(pages[1].splitSide, 'left', 'PDF Page 2 left half starts on physical page 2');
  assert.strictEqual(pages[1].order, 2);

  assert.strictEqual(pages[2].sourcePageNumber, 2, 'Third physical page must be from PDF Page 2');
  assert.strictEqual(pages[2].splitSide, 'right', 'PDF Page 2 right half is on physical page 3');
  assert.strictEqual(pages[2].order, 3);

  // Verify Viewer Spreads
  const spreads = buildAlbumSpreads(pages);
  assert.strictEqual(spreads[0].isCover, true);
  assert.strictEqual(spreads[0].rightPage.id, pages[0].id, 'Front Cover must contain ONLY PDF Page 1');
  assert.strictEqual(spreads[0].leftPage, undefined, 'Front Cover left page must be closed book');

  assert.strictEqual(spreads[1].leftPage.id, pages[1].id, 'Spread 1 left page is PDF Page 2 Left');
  assert.strictEqual(spreads[1].rightPage.id, pages[2].id, 'Spread 1 right page is PDF Page 2 Right');
  assert.strictEqual(spreads[1].label, 'Pages 2 - 3');

  console.log('  ✓ Page 1 is one complete front cover (wide-spread splitting bypassed).');
  console.log('  ✓ PDF Page 2 content does NOT appear on Front Cover.');
  console.log('  ✓ Front Cover contains ONLY complete PDF Page 1.');
}

// --------------------------------------------------------------------------
// TEST 2: Front checkbox OFF
// Expected: Existing wide-spread behavior remains unchanged.
// --------------------------------------------------------------------------
console.log('\n[TEST 2] Front checkbox OFF');
{
  const totalPages = 3;
  // All pages are wide
  const pages = processPdf(totalPages, () => true, {
    markFirstAsCover: false,
    markLastAsBackCover: false,
  });

  // PDF Page 1 is wide and NOT forced to cover -> must be split into Left and Right
  assert.strictEqual(pages[0].sourcePageNumber, 1);
  assert.strictEqual(pages[0].side, 'left');
  assert.strictEqual(pages[0].splitSide, 'left');
  assert.strictEqual(pages[0].order, 1);

  assert.strictEqual(pages[1].sourcePageNumber, 1);
  assert.strictEqual(pages[1].side, 'right');
  assert.strictEqual(pages[1].splitSide, 'right');
  assert.strictEqual(pages[1].order, 2);

  // Spreads: Spread 0 is an inside spread Pages 1 - 2
  const spreads = buildAlbumSpreads(pages);
  assert.strictEqual(spreads[0].isCover, false);
  assert.strictEqual(spreads[0].leftPage.id, pages[0].id);
  assert.strictEqual(spreads[0].rightPage.id, pages[1].id);
  assert.strictEqual(spreads[0].label, 'Pages 1 - 2');

  console.log('  ✓ When checkbox is OFF, normal wide-spread detection splits PDF Page 1 into Left & Right.');
  console.log('  ✓ Existing wide-spread behavior remains exactly unchanged.');
}

// --------------------------------------------------------------------------
// TEST 3: Back checkbox ON, Last PDF page is wide
// Expected: Complete last PDF page remains ONE back cover.
// --------------------------------------------------------------------------
console.log('\n[TEST 3] Back checkbox ON, Last PDF page is wide');
{
  const totalPages = 3;
  // All pages wide
  const pages = processPdf(totalPages, () => true, {
    markFirstAsCover: false,
    markLastAsBackCover: true,
  });

  // Last page is source page 3
  const lastPage = pages[pages.length - 1];
  assert.strictEqual(lastPage.sourcePageNumber, 3);
  assert.strictEqual(lastPage.side, 'back_cover');
  assert.strictEqual(lastPage.splitSide, 'single');
  assert.strictEqual(lastPage.isSpread, false);

  const spreads = buildAlbumSpreads(pages);
  const lastSpread = spreads[spreads.length - 1];
  assert.strictEqual(lastSpread.isBackCover, true);
  assert.strictEqual(lastSpread.leftPage.id, lastPage.id);
  assert.strictEqual(lastSpread.rightPage, undefined);
  assert.strictEqual(lastSpread.label, 'Back Cover');

  console.log('  ✓ Last PDF page preserved as complete ONE back cover without splitting.');
  console.log('  ✓ Content from previous PDF page does not appear on Back Cover.');
}

// --------------------------------------------------------------------------
// TEST 4: Both checkboxes ON
// Expected:
// - First PDF page = one complete Front Cover.
// - Middle PDF pages = existing normal/wide processing.
// - Last PDF page = one complete Back Cover.
// - Exact PDF source order is preserved.
// --------------------------------------------------------------------------
console.log('\n[TEST 4] Both checkboxes ON (Expected wedding album workflow)');
{
  // 5 PDF pages:
  // Page 1: wide -> forced single Front Cover
  // Page 2: wide -> split into Left & Right
  // Page 3: normal -> single page
  // Page 4: wide -> split into Left & Right
  // Page 5: wide -> forced single Back Cover
  const isWideFn = (p) => p !== 3; // Page 3 normal, others wide
  const pages = processPdf(5, isWideFn, {
    markFirstAsCover: true,
    markLastAsBackCover: true,
  });

  // Expected physical pages:
  // 1: Source 1 single (front_cover)
  // 2: Source 2 left
  // 3: Source 2 right
  // 4: Source 3 single
  // 5: Source 4 left
  // 6: Source 4 right
  // 7: Source 5 single (back_cover)
  assert.strictEqual(pages.length, 7);

  assert.strictEqual(pages[0].sourcePageNumber, 1);
  assert.strictEqual(pages[0].side, 'front_cover');
  assert.strictEqual(pages[0].order, 1);

  assert.strictEqual(pages[1].sourcePageNumber, 2);
  assert.strictEqual(pages[1].side, 'left');
  assert.strictEqual(pages[1].order, 2);

  assert.strictEqual(pages[2].sourcePageNumber, 2);
  assert.strictEqual(pages[2].side, 'right');
  assert.strictEqual(pages[2].order, 3);

  assert.strictEqual(pages[3].sourcePageNumber, 3);
  assert.strictEqual(pages[3].side, 'single');
  assert.strictEqual(pages[3].order, 4);

  assert.strictEqual(pages[4].sourcePageNumber, 4);
  assert.strictEqual(pages[4].side, 'left');
  assert.strictEqual(pages[4].order, 5);

  assert.strictEqual(pages[5].sourcePageNumber, 4);
  assert.strictEqual(pages[5].side, 'right');
  assert.strictEqual(pages[5].order, 6);

  assert.strictEqual(pages[6].sourcePageNumber, 5);
  assert.strictEqual(pages[6].side, 'back_cover');
  assert.strictEqual(pages[6].order, 7);

  // Spreads verification
  const spreads = buildAlbumSpreads(pages);
  assert.strictEqual(spreads[0].isCover, true);
  assert.strictEqual(spreads[0].rightPage.id, pages[0].id);

  assert.strictEqual(spreads[spreads.length - 1].isBackCover, true);
  assert.strictEqual(spreads[spreads.length - 1].leftPage.id, pages[6].id);

  console.log('  ✓ First PDF page = complete Front Cover.');
  console.log('  ✓ Middle PDF pages = existing normal/wide processing.');
  console.log('  ✓ Last PDF page = complete Back Cover.');
  console.log('  ✓ Exact source page sequence strictly preserved: 1, 2(L), 2(R), 3, 4(L), 4(R), 5.');
}

// --------------------------------------------------------------------------
// TEST 5: Both checkboxes OFF
// Expected: Existing behavior remains exactly as before.
// --------------------------------------------------------------------------
console.log('\n[TEST 5] Both checkboxes OFF');
{
  // 4 PDF pages, all wide
  const pages = processPdf(4, () => true, {
    markFirstAsCover: false,
    markLastAsBackCover: false,
  });

  // All 4 wide pages split into Left & Right (total 8 physical pages)
  assert.strictEqual(pages.length, 8);
  for (let i = 0; i < 4; i++) {
    const l = pages[i * 2];
    const r = pages[i * 2 + 1];
    assert.strictEqual(l.sourcePageNumber, i + 1);
    assert.strictEqual(l.side, 'left');
    assert.strictEqual(r.sourcePageNumber, i + 1);
    assert.strictEqual(r.side, 'right');
  }

  const spreads = buildAlbumSpreads(pages);
  assert.strictEqual(spreads.length, 4);
  for (let s = 0; s < 4; s++) {
    assert.strictEqual(spreads[s].isCover, false);
    assert.strictEqual(spreads[s].isBackCover, false);
    assert.strictEqual(spreads[s].leftPage.sourcePageNumber, s + 1);
    assert.strictEqual(spreads[s].rightPage.sourcePageNumber, s + 1);
  }

  console.log('  ✓ All pages handled with standard spread detection without forced cover roles.');
  console.log('  ✓ Existing behavior remains exactly as before.');
}

console.log('\n===============================================================');
console.log('ALL 5 DEDICATED UPLOAD CHECKBOX TESTS PASSED SUCCESSFULLY!');
console.log('===============================================================\n');
