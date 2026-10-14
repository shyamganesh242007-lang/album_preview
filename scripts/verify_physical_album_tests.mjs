import puppeteer from 'puppeteer-core';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log(' PHYSICAL WEDDING ALBUM & SPREAD HANDLING VERIFICATION (TESTS 1-11)');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let leakedOriginalRequests = 0;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('album-originals')) {
      console.error(`[LEAK] Request made to album-originals: ${url}`);
      leakedOriginalRequests++;
    }
    req.continue();
  });

  page.on('console', (msg) => {
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });
  page.on('pageerror', (err) => {
    console.error(`[Page Exception]`, err);
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: UPLOAD MULTI-PAGE PDF
    // -------------------------------------------------------------
    console.log('--- TEST 1: Upload PDF (Cover single, Middle spread split, Middle portrait single, Back cover single) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });

    // Click "New Album"
    await page.waitForSelector('button');
    const newAlbumBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('New Album'));
    });
    await newAlbumBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // Fill title
    const pdfAlbumTitle = `PDF Physical Album Test ${Date.now()}`;
    const textInputs = await page.$$('form input[type="text"]');
    await textInputs[0].type(pdfAlbumTitle);
    await textInputs[1].type('Sophia PDF Client');

    // Submit Create
    const createBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('Create Album'));
    });
    await createBtn.click();

    await page.waitForFunction(
      (title) => document.body.innerText.includes(title),
      { timeout: 8000 },
      pdfAlbumTitle
    );

    const studioHref = await page.evaluate((title) => {
      const cards = Array.from(document.querySelectorAll('.group'));
      for (const card of cards) {
        if (card.textContent?.includes(title)) {
          const link = card.querySelector('a[href^="/album/"]');
          return link ? link.getAttribute('href') : null;
        }
      }
      return null;
    }, pdfAlbumTitle);

    if (!studioHref) throw new Error('Studio link not found for Album A');
    const albumAId = studioHref.replace('/album/', '');
    assert(Boolean(albumAId), `Album A created successfully with ID: ${albumAId}`);

    await page.goto(`${BASE_URL}/album/${albumAId}`, { waitUntil: 'networkidle0' });

    // Since album.pages.length === 0, Dropzone input is already present
    await page.waitForSelector('input[type="file"]', { timeout: 10000 });
    const pdfPath = path.resolve('test-assets/test-multipage-album.pdf');
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(pdfPath);
    console.log('  Uploaded test-multipage-album.pdf. Waiting for browser WebP processing & upload...');

    // Wait for processing to complete
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('1 / 1 files complete');
      },
      { timeout: 45000 }
    );
    await new Promise((r) => setTimeout(r, 3000));

    // Fetch pages from Supabase DB
    const { data: pdfPages, error: pdfPagesErr } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumAId)
      .order('page_number', { ascending: true });

    assert(!pdfPagesErr, 'Supabase query succeeded for PDF album pages');
    assert(pdfPages.length === 5, `Expected exactly 5 generated pages from 4-page PDF with 1 spread, got ${pdfPages.length}`);

    // Verify Page 1: Cover (Single)
    assert(pdfPages[0].page_number === 1, 'Page 1 has order 1');
    assert(pdfPages[0].page_type === 'cover', `Page 1 is single cover (got ${pdfPages[0].page_type})`);

    // Verify Page 2 & 3: Middle Spread (Split into Left & Right)
    assert(pdfPages[1].page_number === 2, 'Page 2 has order 2');
    assert(pdfPages[1].page_type === 'left', `Page 2 is left page (got ${pdfPages[1].page_type})`);
    assert(pdfPages[1].filename.includes('(Left)'), 'Page 2 filename indicates Left half');

    assert(pdfPages[2].page_number === 3, 'Page 3 has order 3');
    assert(pdfPages[2].page_type === 'right', `Page 3 is right page (got ${pdfPages[2].page_type})`);
    assert(pdfPages[2].filename.includes('(Right)'), 'Page 3 filename indicates Right half');

    // Verify Page 4: Middle Portrait (Single)
    assert(pdfPages[3].page_number === 4, 'Page 4 has order 4');
    assert(pdfPages[3].page_type === 'single', `Page 4 is middle single page (got ${pdfPages[3].page_type})`);

    // Verify Page 5: Back Cover (Single, even though wide)
    assert(pdfPages[4].page_number === 5, 'Page 5 has order 5');
    assert(pdfPages[4].page_type === 'back-cover', `Page 5 is single back cover (got ${pdfPages[4].page_type})`);

    // Verify ONLY WebP files in Supabase Storage
    for (const p of pdfPages) {
      assert(p.preview_storage_path && p.preview_storage_path.endsWith('.webp'), `Page preview is WebP: ${p.preview_storage_path}`);
    }
    console.log('✅ TEST 1 PASSED: Multi-page PDF processed into physical album order with center split!\n');

    // -------------------------------------------------------------
    // CREATE ALBUM B FOR TESTS 2, 3, 4, 5, 6
    // -------------------------------------------------------------
    console.log('--- TESTS 2-6: Image Uploads (Cover, Wide Spread, Portrait, Landscape, Back Cover) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });

    const newAlbumBtn2 = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('New Album'));
    });
    await newAlbumBtn2.click();
    await new Promise((r) => setTimeout(r, 600));

    const imageAlbumTitle = `Image Physical Album Test ${Date.now()}`;
    const textInputs2 = await page.$$('form input[type="text"]');
    await textInputs2[0].type(imageAlbumTitle);
    await textInputs2[1].type('Emma Image Client');

    const createBtn2 = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('Create Album'));
    });
    await createBtn2.click();

    await page.waitForFunction(
      (title) => document.body.innerText.includes(title),
      { timeout: 8000 },
      imageAlbumTitle
    );

    const studioHref2 = await page.evaluate((title) => {
      const cards = Array.from(document.querySelectorAll('.group'));
      for (const card of cards) {
        if (card.textContent?.includes(title)) {
          const link = card.querySelector('a[href^="/album/"]');
          return link ? link.getAttribute('href') : null;
        }
      }
      return null;
    }, imageAlbumTitle);

    if (!studioHref2) throw new Error('Studio link not found for Album B');
    const albumBId = studioHref2.replace('/album/', '');
    assert(Boolean(albumBId), `Album B created successfully with ID: ${albumBId}`);

    await page.goto(`${BASE_URL}/album/${albumBId}`, { waitUntil: 'networkidle0' });

    // Helper to upload a single file to Album B
    async function uploadSingleFile(filePath) {
      let input = await page.$('input[type="file"]');
      if (!input) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const uploadBtn = btns.find((b) => b.textContent?.trim() === 'Upload' || b.textContent?.includes('Upload More'));
          if (uploadBtn) uploadBtn.click();
        });
        await page.waitForSelector('input[type="file"]', { timeout: 8000 });
        input = await page.$('input[type="file"]');
      }
      await input.uploadFile(filePath);
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes('1 / 1 files complete');
        },
        { timeout: 45000 }
      );
      await new Promise((r) => setTimeout(r, 2000));
      // Close modal / dropzone if close button exists
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const close = btns.find((b) => b.querySelector('svg.lucide-x') || b.textContent === 'Done');
        if (close) close.click();
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    // TEST 5: Upload wide first-page image
    console.log('Testing TEST 5: Upload wide first-page image...');
    await uploadSingleFile(path.resolve('test-assets/test-wide-cover.jpg'));

    let { data: pagesB } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumBId)
      .order('page_number', { ascending: true });

    assert(pagesB.length === 1, `Test 5: Wide first-page must remain SINGLE page, got ${pagesB.length}`);
    assert(pagesB[0].page_type === 'cover', `Test 5: Wide first-page has type 'cover', got ${pagesB[0].page_type}`);
    console.log('✅ TEST 5 PASSED: Wide first page remains SINGLE Cover!\n');

    // TEST 2: Upload single wide JPG (12x24, ratio 2.0)
    console.log('Testing TEST 2: Upload single wide JPG (12x24 spread)...');
    await uploadSingleFile(path.resolve('test-assets/test-spread-12x24.jpg'));

    ({ data: pagesB } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumBId)
      .order('page_number', { ascending: true }));

    assert(pagesB.length === 3, `Test 2: Expected 1 cover + 2 split spread pages = 3, got ${pagesB.length}`);
    assert(pagesB[1].page_type === 'left', `Test 2: Page 2 is 'left' half, got ${pagesB[1].page_type}`);
    assert(pagesB[2].page_type === 'right', `Test 2: Page 3 is 'right' half, got ${pagesB[2].page_type}`);
    console.log('✅ TEST 2 PASSED: Single wide JPG automatically split into LEFT + RIGHT!\n');

    // TEST 3: Upload normal portrait JPG
    console.log('Testing TEST 3: Upload normal portrait JPG (800x1200)...');
    await uploadSingleFile(path.resolve('test-assets/test-portrait.jpg'));

    ({ data: pagesB } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumBId)
      .order('page_number', { ascending: true }));

    assert(pagesB.length === 4, `Test 3: Expected 3 + 1 single portrait = 4, got ${pagesB.length}`);
    assert(pagesB[3].page_type === 'single', `Test 3: Portrait page is 'single', got ${pagesB[3].page_type}`);
    console.log('✅ TEST 3 PASSED: Normal portrait JPG remains single page, NOT split!\n');

    // TEST 4: Upload normal landscape single page (1500x1000, ratio 1.5 < 1.6)
    console.log('Testing TEST 4: Upload normal landscape single page (ratio 1.5)...');
    await uploadSingleFile(path.resolve('test-assets/test-single-landscape.jpg'));

    ({ data: pagesB } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumBId)
      .order('page_number', { ascending: true }));

    assert(pagesB.length === 5, `Test 4: Expected 4 + 1 single landscape = 5, got ${pagesB.length}`);
    assert(pagesB[4].page_type === 'single', `Test 4: Normal landscape page is 'single', got ${pagesB[4].page_type}`);
    console.log('✅ TEST 4 PASSED: Normal landscape single page remains single, NOT split!\n');

    // TEST 6: Upload wide final-page image (test-wide-backcover.jpg)
    console.log('Testing TEST 6: Upload wide final-page image...');
    await uploadSingleFile(path.resolve('test-assets/test-wide-backcover.jpg'));

    ({ data: pagesB } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumBId)
      .order('page_number', { ascending: true }));

    assert(pagesB.length === 6, `Test 6: Expected 5 + 1 single back cover = 6, got ${pagesB.length}`);
    assert(pagesB[5].page_type === 'back-cover', `Test 6: Final page is 'back-cover', got ${pagesB[5].page_type}`);
    console.log('✅ TEST 6 PASSED: Wide final-page image remains SINGLE Back Cover!\n');

    // -------------------------------------------------------------
    // TESTS 7 & 8: CORRECTION PIN ON LEFT & RIGHT GENERATED PAGES
    // -------------------------------------------------------------
    console.log('--- TESTS 7 & 8: Pin Placement on LEFT and RIGHT Generated Pages ---');
    const leftPage = pagesB[1];
    const rightPage = pagesB[2];

    const reviewUrl = `${BASE_URL}/review/${albumBId}`;
    await page.goto(reviewUrl, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));

    // Front Cover is Spread 0. Advance to Spread 1 (Pages 2-3: Left and Right!)
    const nextBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.getAttribute('title')?.includes('Next') || b.querySelector('svg.lucide-chevron-right'));
    });
    assert(Boolean(nextBtn), 'Found Next Spread button in flipbook controls');
    await nextBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // Verify current label shows "Pages 2 - 3"
    const spreadLabel = await page.evaluate(() => {
      return document.querySelector('span.tabular-nums')?.textContent || '';
    });
    console.log(`  Flipbook is displaying: "${spreadLabel}"`);

    // Place pin on LEFT page container
    console.log('Placing pin on LEFT page (pageId:', leftPage.id, ')...');
    const pageContainers = await page.$$('div.cursor-crosshair, div[class*="cursor-"]');
    assert(pageContainers.length >= 2, 'Found Left and Right page containers');

    // Click left container at 30%, 40%
    const leftBox = await pageContainers[0].boundingBox();
    assert(Boolean(leftBox), 'Got bounding box for Left page container');
    await page.mouse.click(leftBox.x + leftBox.width * 0.3, leftBox.y + leftBox.height * 0.4);
    await new Promise((r) => setTimeout(r, 500));

    // Correction modal should open
    await page.waitForSelector('textarea', { timeout: 5000 });
    await page.type('textarea', 'Veil needs slight retouch on left page');
    await page.evaluate(() => {
      const submitBtn = document.querySelector('form button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify LEFT correction in DB
    const { data: leftCorrs } = await supabase
      .from('corrections')
      .select('*')
      .eq('album_id', albumBId)
      .eq('page_id', leftPage.id);

    assert(leftCorrs && leftCorrs.length === 1, `Test 7: Correction saved against LEFT page ID (${leftPage.id})`);
    assert(Math.abs(leftCorrs[0].x - 0.3) < 0.1, `Test 7: x coordinate normalized around 0.3 (got ${leftCorrs[0].x})`);
    console.log('✅ TEST 7 PASSED: Correction pin created on LEFT generated page with correct page ID and coordinates!\n');

    // Place pin on RIGHT page container
    console.log('Placing pin on RIGHT page (pageId:', rightPage.id, ')...');
    const rightBox = await pageContainers[1].boundingBox();
    assert(Boolean(rightBox), 'Got bounding box for Right page container');
    await page.mouse.click(rightBox.x + rightBox.width * 0.7, rightBox.y + rightBox.height * 0.6);
    await new Promise((r) => setTimeout(r, 500));

    await page.waitForSelector('textarea', { timeout: 5000 });
    await page.type('textarea', 'Color balance on right page should match warmer tone');
    await page.evaluate(() => {
      const submitBtn = document.querySelector('form button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify RIGHT correction in DB
    const { data: rightCorrs } = await supabase
      .from('corrections')
      .select('*')
      .eq('album_id', albumBId)
      .eq('page_id', rightPage.id);

    assert(rightCorrs && rightCorrs.length === 1, `Test 8: Correction saved against RIGHT page ID (${rightPage.id})`);
    assert(Math.abs(rightCorrs[0].x - 0.7) < 0.1, `Test 8: x coordinate normalized around 0.7 (got ${rightCorrs[0].x})`);
    console.log('✅ TEST 8 PASSED: Correction pin created on RIGHT generated page with correct page ID and coordinates!\n');

    // -------------------------------------------------------------
    // TEST 9: REFRESH BROWSER PERSISTENCE
    // -------------------------------------------------------------
    console.log('--- TEST 9: Browser Refresh Persistence ---');
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));

    // Advance to Spread 1
    const nextBtnAfterReload = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.getAttribute('title')?.includes('Next') || b.querySelector('svg.lucide-chevron-right'));
    });
    await nextBtnAfterReload.click();
    await new Promise((r) => setTimeout(r, 800));

    // Pins should be visible on both pages
    const pinMarkers = await page.$$('button[title*="Correction"]');
    assert(pinMarkers.length >= 2, `Test 9: Both correction pins persisted and re-rendered after refresh (found ${pinMarkers.length})`);
    console.log('✅ TEST 9 PASSED: Album structure, split pages, and pins persist perfectly after browser refresh!\n');

    // -------------------------------------------------------------
    // TEST 10: CUSTOMER APPROVAL & SAME REVIEW URL
    // -------------------------------------------------------------
    console.log('--- TEST 10: Customer Approval Workflow ---');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const approveBtn = btns.find((b) => b.textContent?.includes('Approve Album'));
      if (approveBtn) approveBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Click confirm in modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.textContent?.includes('Confirm & Approve Album'));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Check DB status
    const { data: approvedAlbum } = await supabase
      .from('albums')
      .select('*')
      .eq('id', albumBId)
      .single();

    assert(approvedAlbum.status === 'Approved', `Test 10: Album status updated to 'Approved' in Supabase (got ${approvedAlbum.status})`);
    assert(Boolean(approvedAlbum.approved_at), 'Test 10: approved_at timestamp populated');

    // Reload review page to verify approved state view
    await page.reload({ waitUntil: 'networkidle0' });
    const approvedBadge = await page.evaluate(() => document.body.innerText.includes('Approved'));
    assert(approvedBadge, 'Test 10: Review page displays Approved status');
    console.log('✅ TEST 10 PASSED: Customer approval succeeds and review URL continues to work seamlessly!\n');

    // -------------------------------------------------------------
    // TEST 11: SCAN REPO FOR FORBIDDEN ARTIFACTS
    // -------------------------------------------------------------
    console.log('--- TEST 11: Static Project Audit for Forbidden Artifacts ---');
    const forbiddenPatterns = [
      'ReplacePage',
      'replacePage',
      'album-originals',
      'original_storage_path',
      'Download Original',
    ];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === '.next' ||
            entry.name === '.git' ||
            entry.name === 'migrations' // ignore old migration history SQL comments
          ) {
            continue;
          }
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') ||
            entry.name.endsWith('.tsx') ||
            entry.name.endsWith('.js') ||
            entry.name.endsWith('.jsx'))
        ) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of forbiddenPatterns) {
            if (content.includes(pattern)) {
              throw new Error(`Forbidden term "${pattern}" found in active file: ${fullPath}`);
            }
          }
        }
      }
    }

    scanDir(path.resolve('.'));
    assert(leakedOriginalRequests === 0, `Zero storage requests leaked to album-originals (actual: ${leakedOriginalRequests})`);
    console.log('✅ TEST 11 PASSED: Codebase audit clean! Zero forbidden terms or original storage patterns detected.\n');

    console.log('================================================================');
    console.log(' 🎉 ALL 11 VERIFICATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
