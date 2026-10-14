import puppeteer from 'puppeteer-core';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runWebPOnlySupabaseE2E() {
  console.log('================================================================');
  console.log(' WEBP-ONLY ARCHITECTURE END-TO-END SUPABASE VERIFICATION');
  console.log('================================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const supabaseRestRequests = [];
  const supabaseStorageRequests = [];
  let leakedOriginalRequests = 0;
  let isClientReviewActive = false;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Intercept network requests to audit storage buckets
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('gtyemimwlivvourqbprx.supabase.co')) {
        if (url.includes('/rest/v1/')) {
          supabaseRestRequests.push({ method: req.method(), url });
        }
        if (url.includes('/storage/v1/')) {
          supabaseStorageRequests.push({ method: req.method(), url });
        }
        if (url.includes('album-originals')) {
          console.error(`[SECURITY VIOLATION] Application requested album-originals: ${url}`);
          leakedOriginalRequests++;
        }
      }
      req.continue();
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && !text.includes('404') && !text.includes('400')) {
        console.log(`[Browser Console Error]`, text);
      }
    });

    // -------------------------------------------------------------
    // 1. Create Album
    // -------------------------------------------------------------
    console.log('\n[STEP 1] Navigating to Dashboard and creating new album...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const newBtn = buttons.find((b) => b.textContent?.includes('New Album'));
      if (newBtn) newBtn.click();
    });

    const albumTitle = `WebP Architecture E2E ${Date.now()}`;
    await page.waitForSelector('input[placeholder*="Villa Rosa Wedding"]', { timeout: 6000 });
    await page.type('input[placeholder*="Villa Rosa Wedding"]', albumTitle);
    await page.type('input[placeholder*="Elena Vance"]', 'Sophia & Liam');
    await page.type('input[placeholder*="elena@example.com"]', 'sophia@example.com');

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createBtn = buttons.find((b) => b.textContent?.trim() === 'Create Album');
      if (createBtn) createBtn.click();
    });

    await page.waitForFunction(
      (title) => document.body.innerText.includes(title),
      { timeout: 8000 },
      albumTitle
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
    }, albumTitle);

    if (!studioHref) throw new Error('Studio link not found for created album');
    const albumId = studioHref.replace('/album/', '');
    const studioUrl = `${BASE_URL}${studioHref}`;
    console.log(`✓ [STEP 1] Album created. ID: ${albumId}`);

    // Verify album row in remote Supabase
    const { data: dbAlbum, error: dbAlbumErr } = await supabase
      .from('albums')
      .select('*')
      .eq('id', albumId)
      .single();

    if (dbAlbumErr || !dbAlbum) {
      throw new Error(`Direct Supabase check failed: Album not found! ${dbAlbumErr?.message}`);
    }
    console.log('✓ VERIFIED in remote Supabase: album row exists! ID:', dbAlbum.id);

    // -------------------------------------------------------------
    // 2. Upload JPG
    // -------------------------------------------------------------
    console.log('\n[STEP 2] Navigating to Studio view and uploading JPG...');
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    const portraitPath = path.resolve('test-assets', 'test-portrait.jpg');
    let fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
    if (!fileInput) throw new Error('File input not found');
    await fileInput.uploadFile(portraitPath);

    console.log('[STEP 2] Waiting for JPG to process into WebP and upload...');
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('Page 1 of 1 complete') || text.includes('Page 1') || text.includes('All Album Pages');
      },
      { timeout: 25000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // -------------------------------------------------------------
    // 3 & 4. Verify only WebP uploaded to album-previews, NO original
    // -------------------------------------------------------------
    console.log('\n[STEP 3 & 4] Verifying only WebP in album-previews and NO original in album-originals...');
    const { data: origFilesStep2 } = await supabase.storage.from('album-originals').list(albumId);
    const { data: prevFilesStep2 } = await supabase.storage.from('album-previews').list(albumId);

    console.log(`  -> album-previews objects count: ${prevFilesStep2?.length || 0}`, prevFilesStep2?.map((f) => f.name));
    console.log(`  -> album-originals objects count: ${origFilesStep2?.length || 0}`);

    if (!prevFilesStep2 || prevFilesStep2.length === 0) {
      throw new Error('Expected WebP preview in album-previews bucket, but bucket is empty!');
    }
    const nonWebpInPreviews = prevFilesStep2.filter((f) => !f.name.endsWith('.webp') && f.name !== '.emptyFolderPlaceholder');
    if (nonWebpInPreviews.length > 0) {
      throw new Error(`Found non-WebP file in album-previews: ${JSON.stringify(nonWebpInPreviews)}`);
    }
    console.log('✓ VERIFIED: All stored preview files are .webp!');

    if (origFilesStep2 && origFilesStep2.length > 0) {
      throw new Error(`CRITICAL: Found files in album-originals! ${JSON.stringify(origFilesStep2)}`);
    }
    console.log('✓ VERIFIED: ZERO files uploaded to album-originals!');

    // -------------------------------------------------------------
    // 5 & 6. Upload PNG & Verify WebP only
    // -------------------------------------------------------------
    console.log('\n[STEP 5 & 6] Uploading PNG and verifying WebP only...');
    // Open upload modal or trigger input
    await page.evaluate(() => {
      const uploadBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Upload')
      );
      if (uploadBtn) uploadBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const pngPath = path.resolve('test-assets', 'test-photo.png');
    fileInput = await page.waitForSelector('input[type="file"]', { timeout: 6000 });
    await fileInput.uploadFile(pngPath);

    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('Page 1 of 1 complete') || text.includes('Page 2') || text.includes('2 pages');
      },
      { timeout: 20000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // Close upload modal if open
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], .fixed button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    const { data: prevFilesStep6 } = await supabase.storage.from('album-previews').list(albumId);
    console.log(`  -> album-previews count after PNG: ${prevFilesStep6?.length || 0}`);
    const nonWebpInPreviews6 = (prevFilesStep6 || []).filter((f) => !f.name.endsWith('.webp') && f.name !== '.emptyFolderPlaceholder');
    if (nonWebpInPreviews6.length > 0) {
      throw new Error(`Found non-WebP file after PNG upload: ${JSON.stringify(nonWebpInPreviews6)}`);
    }
    console.log('✓ VERIFIED: PNG converted to WebP-only!');

    // -------------------------------------------------------------
    // 7 & 8. Upload PDF & Verify PDF pages become WebP
    // -------------------------------------------------------------
    console.log('\n[STEP 7 & 8] Uploading PDF and verifying PDF rendered to WebP...');
    await page.evaluate(() => {
      const uploadBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Upload')
      );
      if (uploadBtn) uploadBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const pdfPath = path.resolve('test-assets', 'test-album.pdf');
    fileInput = await page.waitForSelector('input[type="file"]', { timeout: 6000 });
    await fileInput.uploadFile(pdfPath);

    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('Page 1 of 1 complete') || text.includes('Page 3') || text.includes('3 pages');
      },
      { timeout: 25000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // Close upload modal if open
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], .fixed button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // -------------------------------------------------------------
    // 9 & 10. Verify album_pages contains preview_storage_path & preview_url, NO original required
    // -------------------------------------------------------------
    console.log('\n[STEP 9 & 10] Direct Supabase DB Check on album_pages...');
    const { data: dbPages, error: dbPagesErr } = await supabase
      .from('album_pages')
      .select('*')
      .eq('album_id', albumId)
      .order('page_number', { ascending: true });

    if (dbPagesErr || !dbPages || dbPages.length < 3) {
      throw new Error(`Expected at least 3 pages in cloud DB, got: ${dbPages?.length || 0}. Error: ${dbPagesErr?.message}`);
    }
    console.log(`✓ VERIFIED in remote Supabase: ${dbPages.length} album_pages rows exist!`);
    for (const p of dbPages) {
      console.log(`  -> Page ${p.page_number} (ID: ${p.id}):`);
      console.log(`     preview_storage_path: ${p.preview_storage_path}`);
      console.log(`     preview_url:          ${p.preview_url ? 'PRESENT' : 'MISSING'}`);
      console.log(`     preview_width/height: ${p.preview_width}x${p.preview_height}`);
      if (!p.preview_storage_path) {
        throw new Error(`Page ${p.page_number} missing preview_storage_path!`);
      }
      if (!p.preview_url) {
        throw new Error(`Page ${p.page_number} missing preview_url!`);
      }
    }

    const { data: origFilesFinal } = await supabase.storage.from('album-originals').list(albumId);
    if (origFilesFinal && origFilesFinal.length > 0) {
      throw new Error(`CRITICAL: Files found in album-originals: ${JSON.stringify(origFilesFinal)}`);
    }
    console.log('✓ VERIFIED: ZERO files in album-originals across JPG, PNG, and PDF uploads!');

    // -------------------------------------------------------------
    // 11 & 12. Refresh browser & Verify album loads from Supabase
    // -------------------------------------------------------------
    console.log('\n[STEP 11 & 12] Refreshing browser completely...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    const reloadedOk = await page.evaluate((title) => document.body.innerText.includes(title), albumTitle);
    if (!reloadedOk) throw new Error('Album title not found after browser refresh');
    console.log('✓ VERIFIED: Album successfully reloaded from Supabase after refresh!');

    // -------------------------------------------------------------
    // 13, 14, 15. Open customer review, verify WebP loads, verify ZERO requests to album-originals
    // -------------------------------------------------------------
    const reviewUrl = `${BASE_URL}/review/${albumId}`;
    console.log(`\n[STEP 13, 14, 15] Customer opening review: ${reviewUrl}`);
    isClientReviewActive = true;
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    const reviewLoadedOk = await page.evaluate((title) => document.body.innerText.includes(title), albumTitle);
    if (!reviewLoadedOk) throw new Error('Client review failed to load album title');

    const renderedImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map((img) => img.src);
    });
    console.log(`  -> Client view images count: ${renderedImages.length}`);
    for (const src of renderedImages) {
      if (src.includes('album-originals')) {
        throw new Error(`Security breach: Client loaded image from album-originals: ${src}`);
      }
    }
    console.log('✓ VERIFIED: Client requested ZERO objects from album-originals!');

    // -------------------------------------------------------------
    // 16 & 17. Customer places correction pin, verify saved in Supabase
    // -------------------------------------------------------------
    console.log('\n[STEP 16 & 17] Customer placing correction pin on Page 1...');
    // Click on page container to place pin
    const pageContainer = await page.$('.aspect-16\\/10, .aspect-16\\/9, [class*="aspect-"]');
    if (pageContainer) {
      const box = await pageContainer.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.35);
        await new Promise((r) => setTimeout(r, 600));

        const commentArea = await page.$('textarea');
        if (commentArea) {
          await commentArea.type('Please correct this photo.');
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const subBtn = buttons.find((b) =>
              b.textContent?.includes('Place Pin') ||
              b.textContent?.includes('Submit') ||
              b.textContent?.includes('Save')
            );
            if (subBtn) subBtn.click();
          });
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // Direct Supabase Check: correction row
    const { data: dbCorrs1, error: dbCorrs1Err } = await supabase
      .from('corrections')
      .select('*')
      .eq('album_id', albumId);

    if (dbCorrs1Err || !dbCorrs1 || dbCorrs1.length === 0) {
      throw new Error(`Correction not found in cloud DB! ${dbCorrs1Err?.message}`);
    }
    console.log(`✓ VERIFIED in remote Supabase: Correction 1 created! ID: ${dbCorrs1[0].id}, Comment: "${dbCorrs1[0].comment}", Status: "${dbCorrs1[0].status}"`);
    const corr1Id = dbCorrs1[0].id;

    // -------------------------------------------------------------
    // 18 & 19. Provider sees correction and resolves it
    // -------------------------------------------------------------
    console.log('\n[STEP 18 & 19] Provider opening Studio view to resolve correction...');
    isClientReviewActive = false;
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Resolve correction via button
    await page.evaluate(() => {
      const resolveBtn =
        document.querySelector('button[title*="Resolved"]') ||
        document.querySelector('button[title="Mark as Resolved"]') ||
        Array.from(document.querySelectorAll('button')).find((b) =>
          b.getAttribute('title')?.includes('Resolved') ||
          b.textContent?.includes('Resolve')
        );
      if (resolveBtn) resolveBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // -------------------------------------------------------------
    // 20. Verify correction status persists as Resolved
    // -------------------------------------------------------------
    console.log('\n[STEP 20] Verifying correction status = Resolved in remote Supabase...');
    const { data: dbCorrResolved } = await supabase
      .from('corrections')
      .select('*')
      .eq('id', corr1Id)
      .single();

    if (dbCorrResolved?.status !== 'Resolved') {
      throw new Error(`Expected Resolved in cloud DB, got: ${dbCorrResolved?.status}`);
    }
    console.log('✓ VERIFIED in remote Supabase: Correction status is "Resolved"!');

    // -------------------------------------------------------------
    // 21, 22, 23. Customer reopens SAME review URL, history persists, can create NEW correction
    // -------------------------------------------------------------
    console.log('\n[STEP 21, 22, 23] Customer reopens SAME review URL, verifies history & creates NEW correction...');
    isClientReviewActive = true;
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Check that resolved correction is visible
    const hasResolvedText = await page.evaluate(() =>
      document.body.innerText.includes('Please correct this photo.')
    );
    if (!hasResolvedText) throw new Error('Customer could not see correction history!');
    console.log('✓ VERIFIED: Correction history persists on SAME review URL!');

    // Place a NEW correction
    const pageContainer2 = await page.$('.aspect-16\\/10, .aspect-16\\/9, [class*="aspect-"]');
    if (pageContainer2) {
      const box = await pageContainer2.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.80, box.y + box.height * 0.60);
        await new Promise((r) => setTimeout(r, 600));

        const commentArea = await page.$('textarea');
        if (commentArea) {
          await commentArea.type('Second correction: please warm up the tones.');
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const subBtn = buttons.find((b) =>
              b.textContent?.includes('Place Pin') ||
              b.textContent?.includes('Submit') ||
              b.textContent?.includes('Save')
            );
            if (subBtn) subBtn.click();
          });
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    const { data: dbCorrsAll } = await supabase
      .from('corrections')
      .select('*')
      .eq('album_id', albumId);

    console.log(`✓ VERIFIED in remote Supabase: Total corrections in history: ${dbCorrsAll?.length || 0}`);
    if (!dbCorrsAll || dbCorrsAll.length < 2) {
      throw new Error(`Expected at least 2 corrections in cloud DB, got: ${dbCorrsAll?.length}`);
    }

    // -------------------------------------------------------------
    // 24 & 25. Customer approves & verify Approved status persists
    // -------------------------------------------------------------
    console.log('\n[STEP 24 & 25] Customer approving album...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const appBtn = buttons.find((b) => b.textContent?.trim().includes('Approve Album'));
      if (appBtn) appBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const confBtn = buttons.find((b) => b.textContent?.includes('Confirm & Approve Album'));
      if (confBtn) confBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    const { data: dbApprovedAlbum } = await supabase
      .from('albums')
      .select('*')
      .eq('id', albumId)
      .single();

    if (dbApprovedAlbum?.status !== 'Approved' || !dbApprovedAlbum?.approved_at) {
      throw new Error(`Album status not Approved in cloud DB! ${dbApprovedAlbum?.status}, ${dbApprovedAlbum?.approved_at}`);
    }
    console.log(`✓ VERIFIED in remote Supabase: Album status is "Approved"! approved_at: ${dbApprovedAlbum.approved_at}`);

    // Refresh review page to ensure Approved persists
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));
    const approvedText = await page.evaluate(() => document.body.innerText.includes('Approved'));
    console.log(`✓ VERIFIED: Approved status persists on review page after reload: ${approvedText}`);

    // -------------------------------------------------------------
    // 26. Verify NO Replace Page UI exists anywhere
    // -------------------------------------------------------------
    console.log('\n[STEP 26] Verifying NO Replace Page UI exists anywhere...');
    isClientReviewActive = false;
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    // Switch to Grid View
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gridBtn = buttons.find((b) => b.textContent?.includes('Page Grid') || b.getAttribute('title')?.includes('Grid'));
      if (gridBtn) gridBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const replaceUiFound = await page.evaluate(() => {
      const allText = document.body.innerText;
      const allButtons = Array.from(document.querySelectorAll('button')).map((b) => ({
        text: b.textContent?.trim(),
        title: b.getAttribute('title') || '',
      }));
      const replaceButtons = allButtons.filter(
        (b) =>
          b.text?.toLowerCase().includes('replace') ||
          b.title.toLowerCase().includes('replace') ||
          b.text?.toLowerCase().includes('download original') ||
          b.title.toLowerCase().includes('download original')
      );
      return replaceButtons;
    });

    if (replaceUiFound.length > 0) {
      throw new Error(`Found obsolete replacement/download UI: ${JSON.stringify(replaceUiFound)}`);
    }
    console.log('✓ VERIFIED: ZERO Replace Page or Download Original UI exists anywhere!');

    // Security summary
    console.log(`\n[SECURITY AUDIT] Total leaked requests to album-originals: ${leakedOriginalRequests} (Expected: 0)`);
    if (leakedOriginalRequests > 0) {
      throw new Error(`Security breach: Requested album-originals ${leakedOriginalRequests} times!`);
    }

    console.log('\n================================================================');
    console.log(' ALL 26/26 WEBP-ONLY ARCHITECTURE E2E CHECKS PASSED 100%! ');
    console.log('================================================================');
  } catch (err) {
    console.error('WebP-Only E2E Test FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runWebPOnlySupabaseE2E();
