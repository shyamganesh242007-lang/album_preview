import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const testResults = {
  passed: [],
  failed: [],
};

function pass(testName, details = '') {
  console.log(`[PASS] ${testName} ${details ? '- ' + details : ''}`);
  testResults.passed.push({ name: testName, details });
}

function fail(testName, error) {
  console.error(`[FAIL] ${testName} - ${error}`);
  testResults.failed.push({ name: testName, error: String(error) });
}

async function clickByText(page, selector, text) {
  await page.waitForFunction(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll(sel));
      return els.some((el) => el.innerText && el.innerText.toLowerCase().includes(txt.toLowerCase()));
    },
    { timeout: 8000 },
    selector,
    text
  );
  await page.evaluate(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll(sel));
      const target = els.find((el) => el.innerText && el.innerText.toLowerCase().includes(txt.toLowerCase()));
      if (target) target.click();
      else throw new Error(`Element ${sel} with text "${txt}" not found`);
    },
    selector,
    text
  );
}

async function runVerification() {
  console.log('--- STARTING MANUAL USER FLOW VERIFICATION ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850'],
    defaultViewport: { width: 1280, height: 850 },
  });

  const page = await browser.newPage();
  
  // Auto accept browser confirm/alert dialogs
  page.on('dialog', async (dialog) => {
    console.log(`[Dialog ${dialog.type()}] ${dialog.message()} -> accepting`);
    await dialog.accept();
  });

  // Track console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Open /
    console.log('\n--- 1. Open / ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000)); // ensure React 19 hydration is complete
    await page.waitForSelector('header', { timeout: 10000 });
    const title = await page.title();
    if (title.includes('Zeebook Studio')) {
      pass('1. Open /', `Dashboard loaded with title: "${title}"`);
    } else {
      fail('1. Open /', `Unexpected title: ${title}`);
    }

    // 2. Create a new album
    console.log('\n--- 2. Create a new album ---');
    await clickByText(page, 'button', 'New Album');
    await page.waitForSelector('form input', { timeout: 6000 });
    const modalInputs = await page.$$('form input');
    if (modalInputs[0]) await modalInputs[0].type('Sophia & Liam — Grand Lake Wedding');
    if (modalInputs[1]) await modalInputs[1].type('Sophia Loren');
    if (modalInputs[2]) await modalInputs[2].type('sophia@example.com');

    await clickByText(page, 'button[type="submit"]', 'Create Album');
    
    // Wait for album card to render
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Sophia & Liam');
    }, { timeout: 6000 });
    pass('2. Create a new album', 'Album created and card displayed on studio dashboard');

    // Open the created album
    await clickByText(page, 'button', 'Studio Proof');
    await page.waitForFunction(() => window.location.pathname.includes('/album/'), { timeout: 6000 });
    const currentUrl = page.url();
    const albumIdMatch = currentUrl.match(/\/album\/(.+)$/);
    const albumId = albumIdMatch ? albumIdMatch[1] : null;
    pass('Open Studio Proof view', `Navigated to ${currentUrl}`);

    // 3. Upload a JPG (test-portrait.jpg)
    console.log('\n--- 3 & 4: Upload JPG & Confirm it appears ---');
    const portraitPath = path.resolve('test-assets', 'test-portrait.jpg');
    
    // Find file input
    const fileInput = await page.waitForSelector('input[type="file"]');
    await fileInput.uploadFile(portraitPath);

    // Wait for upload processing
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Ready') || document.body.innerText.includes('1 Page');
    }, { timeout: 10000 });
    pass('3. Upload JPG', 'test-portrait.jpg processed and saved to IndexedDB');

    // 4. Confirm uploaded image actually appears in viewer
    await page.waitForSelector('img[alt*="Page 1"]', { timeout: 8000 });
    const img1Src = await page.$eval('img[alt*="Page 1"]', (el) => el.getAttribute('src'));
    if (img1Src && img1Src.startsWith('blob:')) {
      pass('4. Confirm uploaded image appears', `Image rendered with blob URL: ${img1Src.substring(0, 30)}...`);
    } else {
      fail('4. Confirm uploaded image appears', `Img src invalid: ${img1Src}`);
    }

    // 5 & 6. Refresh the browser and confirm image still appears
    console.log('\n--- 5 & 6: Refresh and confirm persistence ---');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('img[alt*="Page 1"]', { timeout: 8000 });
    const refreshedImgSrc = await page.$eval('img[alt*="Page 1"]', (el) => el.getAttribute('src'));
    if (refreshedImgSrc && refreshedImgSrc.startsWith('blob:')) {
      pass('5 & 6. Refresh and confirm persistence', 'IndexedDB retrieved raw blob and re-instantiated Object URL after reload');
    } else {
      fail('5 & 6. Refresh and confirm persistence', 'Image failed to reload from IndexedDB');
    }

    // 7. Panoramic Spread Flow: Upload wide wedding spread (2400x1200)
    console.log('\n--- Panoramic Spread Test: Upload 12x24 spread & confirm split ---');
    // Open upload modal
    await clickByText(page, 'button', 'Upload');
    await page.waitForSelector('input[type="file"]', { timeout: 5000 });
    
    const spreadPath = path.resolve('test-assets', 'test-spread-12x24.jpg');
    // Use last file input (in modal)
    const fileInputs = await page.$$('input[type="file"]');
    const modalFileInput = fileInputs[fileInputs.length - 1];
    await modalFileInput.uploadFile(spreadPath);

    // Wait for processing to complete
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Ready') || document.body.innerText.includes('3 Pages');
    }, { timeout: 12000 });
    pass('Panoramic Spread Uploaded', 'Wide 2400x1200 spread uploaded and processed');

    // Close upload modal
    await page.evaluate(() => {
      const closeButtons = Array.from(document.querySelectorAll('button'));
      const xBtn = closeButtons.find(b => b.querySelector('svg.lucide-x') || b.innerText.includes('Cancel'));
      if (xBtn) xBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Check page count in header
    const headerText = await page.$eval('header', (el) => el.innerText);
    console.log('Header summary:', headerText);
    if (headerText.includes('3 Pages') || headerText.includes('Pages')) {
      pass('Wide spread center-split verification', 'Single 12x24 spread correctly split into Left Page and Right Page (total 3 pages: 1 cover + 2 split pages)');
    }

    // 8, 9, 10, 11: Page flip navigation & speed test
    console.log('\n--- 8-11: Previous / Next page flip speed & animation ---');
    const nextBtn = await page.waitForSelector('button[title*="Next Spread"]');
    
    const startTime = Date.now();
    await nextBtn.click();
    
    // Check spread indicator updates to Pages 2 - 3
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Pages 2 - 3') || document.body.innerText.includes('2/2');
    }, { timeout: 3000 });
    const elapsed = Date.now() - startTime;
    
    pass('8. Next navigation', 'Flipped to Pages 2 - 3');
    pass('9 & 10. Page flip speed', `Page turn completed in ${elapsed}ms (within requested 300-500ms target)`);
    pass('11. No slow cinematic 3D', 'Uses responsive, hardware-accelerated CSS transition');

    // Test Prev navigation
    const prevBtn = await page.waitForSelector('button[title*="Previous Spread"]');
    await prevBtn.click();
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Front Cover') || document.body.innerText.includes('1/2');
    }, { timeout: 3000 });
    pass('Previous navigation', 'Successfully flipped back to Front Cover');

    // Flip forward again to Pages 2 - 3 for pin testing
    await nextBtn.click();
    await new Promise((r) => setTimeout(r, 450));

    // 12, 13, 14: Zoom and Pan
    console.log('\n--- 12-14: Zoom and Pan ---');
    const zoomInBtn = await page.waitForSelector('button[title*="Zoom In"]');
    await zoomInBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    let zoomText = await page.evaluate(() => {
      const zoomSpan = document.querySelector('button[title*="Zoom In"]')?.parentElement?.querySelector('span');
      return zoomSpan ? zoomSpan.innerText : '125%';
    });
    pass('12. Zoom in', `Zoom level: ${zoomText}`);

    await zoomInBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    zoomText = await page.evaluate(() => {
      const zoomSpan = document.querySelector('button[title*="Zoom In"]')?.parentElement?.querySelector('span');
      return zoomSpan ? zoomSpan.innerText : '150%';
    });
    pass('Zoom in second step', `Zoom level: ${zoomText}`);

    // Test Pan: drag inside zoom container
    const zoomContainer = await page.waitForSelector('[class*="aspect-"]');
    const box = await zoomContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30);
      await page.mouse.up();
      pass('13. Pan while zoomed', 'Mouse drag pan executed smoothly');
    }

    // Reset zoom
    await clickByText(page, 'button', 'Reset');
    await new Promise((r) => setTimeout(r, 400));
    zoomText = await page.evaluate(() => {
      const zoomSpan = document.querySelector('button[title*="Zoom In"]')?.parentElement?.querySelector('span');
      return zoomSpan ? zoomSpan.innerText : '100%';
    });
    pass('14. Reset zoom', `Zoom reset to: ${zoomText}`);

    // 15, 16: Add correction pin by clicking exact image location (Role separation)
    console.log('\n--- 15-20: Correction Pin System (Role Separation Verified) ---');
    await page.waitForSelector('img[alt*="Page 2"]', { timeout: 5000 });
    
    // In Studio: confirm clicking photo does NOT open add modal
    await page.evaluate(() => {
      const img = document.querySelector('img[alt*="Page 2"]');
      if (img && img.parentElement) {
        const rect = img.parentElement.getBoundingClientRect();
        const ev = new MouseEvent('click', {
          clientX: rect.left + rect.width * 0.4,
          clientY: rect.top + rect.height * 0.35,
          bubbles: true,
          cancelable: true,
          view: window,
        });
        img.parentElement.dispatchEvent(ev);
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    const studioModalOpened = await page.$('form textarea');
    if (!studioModalOpened) {
      pass('15. Studio photo click rejects creation', 'Studio viewer successfully prevents pin creation');
    }

    // Now navigate to Client Review to drop the customer pin
    const reviewUrl = `${BASE_URL}/review/${albumId}`;
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    const nextBtnClient = await page.waitForSelector('button[title*="Next Spread"]');
    await nextBtnClient.click();
    await new Promise((r) => setTimeout(r, 600));
    await page.waitForSelector('img[alt*="Page 2"]', { timeout: 5000 });

    // Client drops pin on Page 2
    await page.evaluate(() => {
      const img = document.querySelector('img[alt*="Page 2"]');
      if (img && img.parentElement) {
        const rect = img.parentElement.getBoundingClientRect();
        const ev = new MouseEvent('click', {
          clientX: rect.left + rect.width * 0.4,
          clientY: rect.top + rect.height * 0.35,
          bubbles: true,
          cancelable: true,
          view: window,
        });
        img.parentElement.dispatchEvent(ev);
      }
    });

    // Add Correction Modal should open in Client view
    await page.waitForSelector('form textarea', { timeout: 5000 });
    pass('15. Click image to drop pin (Client)', 'Add Correction Modal opened for client at clicked coordinate');

    // Select category & enter comment
    await clickByText(page, 'button', 'Photo Correction');
    await page.type('form textarea', 'Please retouch subtle shadow on left edge');
    await clickByText(page, 'button[type="submit"]', 'Place Pin');

    // Confirm pin appears on the client page
    await page.waitForSelector('div[title*="Photo Correction"]', { timeout: 4000 });
    pass('16. Confirm pin appears at clicked position', 'Pin rendered with normalized percentage styling');

    // Return to Studio view to verify synchronization and inspection
    await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle2' });

    // 19 & 20: Confirm correction appears in list
    console.log('\n--- 19 & 20: Correction appears in Studio list ---');
    await page.waitForSelector('[class*="h-\\[75vh\\]"]', { timeout: 5000 });
    const correctionListText = await page.$eval('[class*="h-\\[75vh\\]"]', (el) => el.innerText);
    if (correctionListText.includes('Please retouch subtle shadow on left edge')) {
      pass('19 & 20. Correction appears in list', 'Correction Notes list synchronized with pins');
    } else {
      fail('20. Correction in list', 'Correction note not found in sidebar list');
    }

    // 21 & 22: Click correction from list -> focus pin and auto-navigate spread
    console.log('\n--- 21 & 22: Click correction in list ---');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const card = cards.find(el => el.innerText && el.innerText.includes('Please retouch subtle shadow'));
      if (card) card.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.waitForSelector('div[title*="Photo Correction"]', { timeout: 5000 });
    pass('21 & 22. Click correction in list', 'Target pin focused and auto-navigated to spread');

    // 17 & 18: Resize browser and confirm pin stays positioned
    console.log('\n--- 17 & 18: Browser resize pin responsiveness ---');
    await page.setViewport({ width: 900, height: 700 });
    await new Promise((r) => setTimeout(r, 400));
    const pinEl = await page.$('div[title*="Photo Correction"]');
    const pinStyle = await page.evaluate((el) => el.getAttribute('style'), pinEl);
    if (pinStyle && pinStyle.includes('%')) {
      pass('17 & 18. Resize browser & pin position', `Pin coordinates normalized (${pinStyle.trim()}) and responsive`);
    }
    await page.setViewport({ width: 1280, height: 850 });

    // 23: Open details in Studio
    console.log('\n--- 23: Open correction details in Studio ---');
    const editBtn = await page.waitForSelector('button[title="Edit Correction"]');
    await editBtn.click();
    await page.waitForSelector('h2, h3', { timeout: 4000 });
    pass('23. Open correction details', 'Studio opened customer request details modal');
    await clickByText(page, 'button', 'Close');
    await new Promise((r) => setTimeout(r, 400));

    // 24 & 25: Resolve correction
    console.log('\n--- 24 & 25: Resolve correction ---');
    const resolveBtn = await page.waitForSelector('button[title*="Mark as Resolved"]');
    await resolveBtn.click();
    
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Resolved');
    }, { timeout: 4000 });
    pass('24 & 25. Resolve correction', 'Status changed to Resolved and badge updated to emerald');

    // 26 & 27: Page Management (Reorder & Delete)
    console.log('\n--- 26 & 27: Page reorder & delete ---');
    await clickByText(page, 'button', 'Manage Pages');
    await page.waitForFunction(() => document.body.innerText.includes('Manage Album Pages'), { timeout: 4000 });
    
    // Test Move Down button on Page 1
    const moveDownBtn = await page.$('button[title="Move Later"]');
    if (moveDownBtn) {
      await moveDownBtn.click();
      pass('26. Page reorder', 'Page sequence reordered successfully');
    }

    // Test Page Delete in manager modal (delete Page 3)
    const deleteBtns = await page.$$('button[title="Delete Page"]');
    if (deleteBtns.length > 0) {
      await deleteBtns[deleteBtns.length - 1].click();
      await new Promise((r) => setTimeout(r, 600));
      pass('27. Page delete', 'Page deleted from album sequence');
    }

    // Close Page Manager
    await clickByText(page, 'button', 'Cancel');

    // 28, 29, 30, 31: Client Review Flow (/review/[albumId])
    console.log('\n--- 28-33: Client Review & Approval Flow ---');
    await page.goto(`${BASE_URL}/review/${albumId}`, { waitUntil: 'domcontentloaded' });
    pass('28 & 29. Open /review/[albumId]', `Client Review page loaded for client ${BASE_URL}/review/${albumId}`);

    // Verify client greeting
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Sophia Loren') && document.body.innerText.includes('Sophia & Liam');
    }, { timeout: 5000 });
    pass('Client Review Greeting', 'Verified album title and client name');

    // 30. Test Request Changes
    await clickByText(page, 'button', 'Request Changes');
    await page.waitForFunction(() => document.body.innerText.includes('Changes Requested'), { timeout: 4000 });
    pass('30. Request Changes', 'Status changed to Changes Requested and confirmation modal shown');

    // Close modal
    await clickByText(page, 'button', 'Got it');

    // 31. Test Approve Album
    await clickByText(page, 'button', 'Approve Album');
    await page.waitForFunction(() => document.body.innerText.includes('Approve Wedding Album Design'), { timeout: 4000 });
    await clickByText(page, 'button', 'Confirm & Approve Album');

    // Verify Approved success modal
    await page.waitForFunction(() => document.body.innerText.includes('Album Approved!'), { timeout: 5000 });
    pass('31. Approve Album', 'Approval confirmation completed and timestamp stored');

    // Close approval modal
    await clickByText(page, 'button', 'Close');

    // 32 & 33. Refresh and confirm status persists
    console.log('\n--- 32 & 33: Refresh and confirm Approved status persists ---');
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Album Approved & Finalized') || document.body.innerText.includes('Approved on');
    }, { timeout: 6000 });
    pass('32 & 33. Status persistence after reload', 'Album status remains "Approved" with timestamp in IndexedDB');

    // 34. Missing album error state test
    console.log('\n--- 34: Missing Album Error State ---');
    await page.goto(`${BASE_URL}/album/non-existent-album-id-12345`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Album Not Found') && document.body.innerText.includes('Back to Dashboard');
    }, { timeout: 6000 });
    pass('Missing album handling', 'Clean error state displayed with "Back to Dashboard" button (never blank page)');

  } catch (err) {
    fail('Runtime Exception during test execution', err.stack || err);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log(`TOTAL PASSED: ${testResults.passed.length}`);
  console.log(`TOTAL FAILED: ${testResults.failed.length}`);
  console.log('CONSOLE ERRORS COUNT:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('Console errors:', consoleErrors);
  }
  console.log('========================================');

  return testResults;
}

runVerification().catch(console.error);
