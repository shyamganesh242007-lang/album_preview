import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const outDir = path.resolve('test-artifacts', 'review-not-found');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runReviewNotFoundIsolationTests() {
  console.log('================================================================');
  console.log(' CUSTOMER REVIEW "NOT FOUND" SECURITY & ISOLATION TEST');
  console.log('================================================================\n');

  // Find an existing active album for valid review testing
  const { data: recentPages } = await supabase
    .from('album_pages')
    .select('album_id')
    .order('created_at', { ascending: false })
    .limit(1);
  const validAlbumId = recentPages?.[0]?.album_id;
  if (!validAlbumId) throw new Error('No active album found');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // -------------------------------------------------------------
    // TEST 1: DIRECT INVALID / DELETED ALBUM ID ON /review/:id
    // -------------------------------------------------------------
    const randomInvalidId = '00000000-0000-0000-0000-000000000000';
    console.log(`--- 1. Testing Invalid Album ID on /review/${randomInvalidId} ---`);
    await page.goto(`${BASE_URL}/review/${randomInvalidId}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));

    // Check Heading
    const heading = await page.evaluate(() => {
      const h2 = document.querySelector('h2');
      return h2 ? h2.textContent : '';
    });
    assert(heading.includes('Album Proof Not Found'), `Heading is "${heading}"`);

    // Check message body
    const pageText = await page.evaluate(() => document.body.innerText);
    assert(
      pageText.includes('This album is no longer available'),
      'Customer-safe explanation text displayed'
    );
    assert(
      pageText.includes('The review link may be invalid or the album may have been removed by the studio'),
      'Neutral explanation displayed'
    );

    // CRITICAL SECURITY CHECK: "Go to Studio Home" MUST NOT EXIST
    const hasStudioHomeBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns.some((b) => b.textContent && b.textContent.includes('Go to Studio Home'));
    });
    assert(!hasStudioHomeBtn, 'CRITICAL: "Go to Studio Home" button is completely removed');

    // CRITICAL: No link to "/" or Provider routes
    const links = await page.evaluate(() => {
      const anchorList = Array.from(document.querySelectorAll('a'));
      return anchorList.map((a) => a.getAttribute('href'));
    });
    const dangerousLinks = links.filter((h) => h === '/' || (h && h.startsWith('/album/')));
    assert(
      dangerousLinks.length === 0,
      `No Provider or dashboard navigation links exist on the page (found: ${dangerousLinks.length})`
    );

    // Check Close button
    const closeBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && b.textContent.trim() === 'Close');
      return Boolean(btn);
    });
    assert(closeBtn, 'Neutral "Close" button is present');

    // Screenshot invalid review state
    await page.screenshot({ path: path.join(outDir, '01_invalid_review_safe_error.png') });

    // Click Close button and verify no navigation occurred
    const initialUrl = page.url();
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && b.textContent.trim() === 'Close');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    assert(page.url() === initialUrl, 'Clicking Close does NOT navigate to Studio or change URL');

    // -------------------------------------------------------------
    // TEST 2: CREATE A REAL ALBUM, TEST VALID REVIEW, THEN DELETE
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Lifecycle: Create -> Review -> Delete -> Not Found ---');

    // Create a temporary test album via Supabase
    const testAlbumId = crypto.randomUUID();
    const testPageId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from('albums').insert({
      id: testAlbumId,
      title: 'Temporary Test Album',
      client_name: 'Test Customer',
      status: 'In Review',
    });
    assert(!insertErr, `Created test album ${testAlbumId}`);

    // Add 1 page to the test album
    const { error: pageErr } = await supabase.from('album_pages').insert({
      id: testPageId,
      album_id: testAlbumId,
      filename: 'cover.jpg',
      image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      width: 1200,
      height: 800,
      page_number: 1,
      page_type: 'cover',
    });
    assert(!pageErr, 'Inserted cover page for test album');

    // 2A: Navigate to Customer Review for this valid album
    console.log(`Navigating to customer review for valid album ${testAlbumId}...`);
    await page.goto(`${BASE_URL}/review/${testAlbumId}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    const validPageReview = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasHeader: text.includes('Temporary Test Album'),
        hasClient: text.includes('Test Customer'),
        hasViewer: Boolean(document.querySelector('[data-testid="physical-album-stage"]')),
      };
    });
    assert(validPageReview.hasHeader, 'Valid album displays customer review header');
    assert(validPageReview.hasClient, 'Valid album displays customer name');
    assert(validPageReview.hasViewer, 'Valid album displays physical album viewer');
    await page.screenshot({ path: path.join(outDir, '02_valid_test_album_review.png') });

    // 2B: Delete the album from the database (simulating Provider deleting album)
    console.log(`Simulating Provider deleting album ${testAlbumId}...`);
    await supabase.from('album_pages').delete().eq('album_id', testAlbumId);
    await supabase.from('albums').delete().eq('id', testAlbumId);

    // 2C: Refresh customer review page
    console.log('Refreshing customer review page after album deletion...');
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify it is now in the safe Not Found state
    const postDeleteState = await page.evaluate(() => {
      const text = document.body.innerText;
      const h2 = document.querySelector('h2');
      const btns = Array.from(document.querySelectorAll('button, a'));
      return {
        isNotFound: h2 ? h2.textContent.includes('Album Proof Not Found') : false,
        hasStudioHome: btns.some((b) => b.textContent && b.textContent.includes('Go to Studio Home')),
        hasNeutralMsg: text.includes('This album is no longer available'),
      };
    });

    assert(postDeleteState.isNotFound, 'Deleted album immediately transitions to "Album Proof Not Found"');
    assert(!postDeleteState.hasStudioHome, 'Deleted album does NOT offer "Go to Studio Home"');
    assert(postDeleteState.hasNeutralMsg, 'Deleted album displays safe neutral customer text');
    await page.screenshot({ path: path.join(outDir, '03_deleted_album_safe_error.png') });

    // -------------------------------------------------------------
    // TEST 3: VALID EXISTING ALBUM IS COMPLETELY UNAFFECTED
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Valid Existing Album Remains 100% Unaffected ---');
    const { data: albData } = await supabase.from('albums').select('title').eq('id', validAlbumId).single();
    const expectedTitle = albData?.title || 'Album';

    await page.goto(`${BASE_URL}/review/${validAlbumId}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    const originalAlbumState = await page.evaluate((title) => {
      const text = document.body.innerText;
      const stage = document.querySelector('[data-testid="physical-album-stage"]');
      return {
        hasTitle: text.includes(title),
        hasViewer: Boolean(stage),
        hasPins: Boolean(document.querySelector('[data-testid^="pin-"]')),
        hasApproveBtn: text.includes('Approve Album'),
        hasRequestChangesBtn: text.includes('Request Changes'),
      };
    }, expectedTitle);

    assert(originalAlbumState.hasTitle, `Original album loads properly with title "${expectedTitle}"`);
    assert(originalAlbumState.hasViewer, 'Original album physical 3D viewer is intact');
    assert(originalAlbumState.hasApproveBtn, 'Approve Album button is present');
    assert(originalAlbumState.hasRequestChangesBtn, 'Request Changes button is present');

    // -------------------------------------------------------------
    // TEST 4: PROVIDER ALBUM VIEW STILL HAS ITS DASHBOARD BACK BUTTON
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Provider View (/album/:id) Separation ---');
    await page.goto(`${BASE_URL}/album/${randomInvalidId}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));

    const providerNotFoundState = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasBackToDashboard: text.includes('Back to Dashboard'),
      };
    });
    assert(providerNotFoundState.hasBackToDashboard, 'Provider route (/album/:id) correctly retains Back to Dashboard for studio users');

    console.log('\n================================================================');
    console.log(' ALL CUSTOMER REVIEW NOT FOUND ISOLATION TESTS PASSED (100%)');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runReviewNotFoundIsolationTests().catch((err) => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:', err);
  process.exit(1);
});
