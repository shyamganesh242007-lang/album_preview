import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function testMigrationAndDemo() {
  console.log('--- STARTING INDEXEDDB MIGRATION & DEMO ALBUM VERIFICATION ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850'],
    defaultViewport: { width: 1280, height: 850 },
  });

  const page = await browser.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      console.error('[BROWSER ERROR]:', text);
    } else if (text.includes('[IndexedDBStorage]')) {
      console.log('[BROWSER IDB]:', text);
    }
  });

  page.on('dialog', async (dialog) => {
    console.log(`[BROWSER DIALOG ${dialog.type()}]: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // STEP 1: Simulate an OLD v1 database with ONLY 'albums' store (the exact bug reproduction state)
    console.log('\n1. Simulating an older v1 database with ONLY "albums" store...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        // Delete any existing DB first to set up test state
        const delReq = indexedDB.deleteDatabase('zeebook_studio_db');
        delReq.onsuccess = () => {
          // Open at version 1 and intentionally ONLY create 'albums' store
          const openReq = indexedDB.open('zeebook_studio_db', 1);
          openReq.onupgradeneeded = (e) => {
            const db = openReq.result;
            if (!db.objectStoreNames.contains('albums')) {
              db.createObjectStore('albums', { keyPath: 'id' });
            }
            // Intentionally DO NOT create 'blobs' to simulate the bug condition!
          };
          openReq.onsuccess = () => {
            const db = openReq.result;
            console.log('Simulated old DB version:', db.version);
            console.log('Stores in simulated old DB:', Array.from(db.objectStoreNames));
            db.close();
            resolve();
          };
          openReq.onerror = () => reject(openReq.error);
        };
        delReq.onerror = () => reject(delReq.error);
      });
    });

    console.log('Old v1 database state successfully prepared (missing "blobs" store).');

    // STEP 2: Reload the page with our updated self-healing storage layer
    console.log('\n2. Reloading page with self-healing storage engine...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // Verify stores before clicking demo
    const storeInfo = await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.open('zeebook_studio_db');
        req.onsuccess = () => {
          const db = req.result;
          const info = {
            version: db.version,
            stores: Array.from(db.objectStoreNames),
          };
          db.close();
          resolve(info);
        };
      });
    });
    console.log('Upgraded database state:', storeInfo);

    // STEP 3: Click "Load Demo Wedding Album"
    console.log('\n3. Clicking "Load Demo Wedding Album"...');
    // Ensure button is present
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.innerText.includes('Load Demo'));
    }, { timeout: 5000 });

    const clickRes = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const demoBtn = btns.find((b) => b.innerText.includes('Load Demo'));
      if (demoBtn) {
        demoBtn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked Load Demo Wedding Album:', clickRes);

    // Wait for demo album creation to complete and album card to appear
    console.log('\n4. Waiting for demo album creation and card rendering...');
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Victoria & James — Villa Rosa Wedding');
    }, { timeout: 15000 });
    console.log('[PASS] Demo album created successfully without object store error!');

    // STEP 4: Inspect the database contents to verify binary Blobs and album data
    const dbContents = await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.open('zeebook_studio_db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['albums', 'blobs'], 'readonly');
          const albumReq = tx.objectStore('albums').getAll();
          const blobReq = tx.objectStore('blobs').getAll();

          tx.oncomplete = () => {
            const albums = albumReq.result || [];
            const blobs = blobReq.result || [];
            db.close();
            resolve({
              albumCount: albums.length,
              albumTitle: albums[0]?.title,
              pagesCount: albums[0]?.pages?.length,
              correctionsCount: albums[0]?.corrections?.length,
              blobsCount: blobs.length,
              blobSizes: blobs.map((b) => ({ id: b.blobId, size: b.size, isBlob: b.blob instanceof Blob })),
            });
          };
        };
      });
    });

    console.log('\n5. Database Contents Verification:');
    console.log('Albums count:', dbContents.albumCount);
    console.log('Album title:', dbContents.albumTitle);
    console.log('Pages count:', dbContents.pagesCount);
    console.log('Corrections count:', dbContents.correctionsCount);
    console.log('Stored Blobs count:', dbContents.blobsCount);
    console.log('All stored as binary Blobs:', dbContents.blobSizes.every((b) => b.isBlob));
    console.log('Total binary image bytes stored:', dbContents.blobSizes.reduce((acc, b) => acc + b.size, 0));

    if (dbContents.blobsCount < 5 || !dbContents.blobSizes.every((b) => b.isBlob)) {
      throw new Error('Blob persistence validation failed: Blobs not properly saved in "blobs" store');
    }

    // STEP 5: Open the created demo album proof
    console.log('\n6. Opening Studio Proof view...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const proofBtn = btns.find((b) => b.innerText.includes('Studio Proof'));
      if (proofBtn) proofBtn.click();
    });

    await page.waitForFunction(() => window.location.pathname.includes('/album/'), { timeout: 6000 });
    console.log('[PASS] Navigated to album proof view:', page.url());

    // Wait for cover image to load from blob
    await page.waitForSelector('img[alt*="Page 1"]', { timeout: 8000 });
    const img1Src = await page.$eval('img[alt*="Page 1"]', (el) => el.getAttribute('src'));
    console.log('Page 1 rendered with Object URL:', img1Src.substring(0, 35));

    // STEP 6: Hard page refresh to verify persistence
    console.log('\n7. Reloading page to verify persistence from IndexedDB...');
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('img[alt*="Page 1"]', { timeout: 8000 });
    console.log('[PASS] Album and pages successfully persisted after hard reload!');

    // STEP 7: Test normal "Create New Album" flow (Requirement 10)
    console.log('\n8. Testing normal "New Album" creation flow (Requirement 10)...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const newBtn = btns.find((b) => b.innerText.includes('New Album'));
      if (newBtn) newBtn.click();
    });

    await page.waitForSelector('form input', { timeout: 4000 });
    const inputs = await page.$$('form input');
    await inputs[0].type('Manual Test Album 10');
    await inputs[1].type('Elena Gilbert');

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('form button'));
      const createBtn = btns.find((b) => b.innerText.includes('Create Album'));
      if (createBtn) createBtn.click();
    });

    await page.waitForFunction(() => document.body.innerText.includes('Manual Test Album 10'), { timeout: 6000 });
    console.log('[PASS] Normal album creation flow works perfectly alongside demo albums!');

    console.log('\n======================================================');
    console.log('ALL INDEXEDDB MIGRATION & DEMO ALBUM TESTS PASSED 100%');
    console.log('======================================================');
  } catch (err) {
    console.error('\n[TEST FAILED]:', err.stack || err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testMigrationAndDemo();
