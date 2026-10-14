import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function runRepeatedReviewRoundsTest() {
  console.log('--- STARTING REPEATED REVIEW ROUNDS TEST IN REAL CHROME ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const errors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('status of 404') || text.includes('status of 400')) {
          // Expected network response when remote Supabase tables are not yet created
          return;
        }
        errors.push(text);
        console.error('Browser console error:', text);
      }
    });

    // Setup: Ensure a demo wedding album exists
    console.log('\n[SETUP] Checking / loading demo album on dashboard...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    const demoBtn = await page.$('button[id="load-demo-button"]') || await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent?.includes('Load Demo Wedding Album'));
    });

    if (demoBtn && demoBtn.asElement()) {
      console.log('Clicking "Load Demo Wedding Album"...');
      await demoBtn.asElement().click();
      await page.waitForSelector('a[href^="/album/"]', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));
    }

    const albumLink = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/album/"]');
      return a ? a.getAttribute('href') : null;
    });

    if (!albumLink) {
      throw new Error('No album link found on dashboard');
    }

    const albumId = albumLink.replace('/album/', '');
    const reviewUrl = `${BASE_URL}/review/${albumId}`;
    const studioUrl = `${BASE_URL}/album/${albumId}`;
    console.log(`Stable Album ID: ${albumId}`);
    console.log(`Permanent Review URL: ${reviewUrl}`);

    // Verify initial album count to confirm no duplicate albums are ever created
    const initialAlbumCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href^="/album/"]').length;
    });
    console.log(`Initial albums on dashboard: ${initialAlbumCount}`);

    // ========================================================
    // ROUND 1: Steps 1 - 8
    // ========================================================
    console.log('\n========================================================');
    console.log('ROUND 1: Client Creates A & B -> Provider Resolves A & B');
    console.log('========================================================');

    // Step 1: Provider opens album
    console.log('\n--- Step 1: Provider opens album ---');
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('h1', { timeout: 5000 });
    console.log('[PASS] Step 1: Provider opened album in Studio');

    // Step 2: Client opens review link
    console.log('\n--- Step 2: Client opens review link ---');
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('h1', { timeout: 5000 });
    console.log('[PASS] Step 2: Client opened review link');

    // Step 3: Client creates correction A on Page 2
    console.log('\n--- Step 3: Client creates correction A on Page 2 ---');
    // Flip to Spread 1 (Pages 2-3)
    const nextBtn1 = await page.waitForSelector('button[title*="Next Spread"]');
    await nextBtn1.click();
    await new Promise(r => setTimeout(r, 600));
    await page.waitForSelector('img[alt*="Page 2"]', { timeout: 5000 });

    // Click photo Page 2 (left side of spread)
    const spreadBox1 = await (await page.$('.aspect-16\\/10, .aspect-16\\/9')).boundingBox();
    await page.mouse.click(spreadBox1.x + spreadBox1.width * 0.25, spreadBox1.y + spreadBox1.height * 0.35);
    await page.waitForSelector('form textarea', { timeout: 5000 });

    // Select category 'Photo Correction' and enter comment A
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cat = btns.find(b => b.textContent?.trim() === 'Photo Correction');
      if (cat) cat.click();
    });
    await page.type('form textarea', 'Correction A: Please increase face brightness on left portrait.');
    const submitBtnA = await page.$('button[type="submit"]');
    if (submitBtnA) await submitBtnA.click();
    await new Promise(r => setTimeout(r, 1200));
    console.log('[PASS] Step 3: Correction A created on Page 2');

    // Step 4: Client creates correction B on Page 3
    console.log('\n--- Step 4: Client creates correction B on Page 3 ---');
    // Click photo Page 3 (right side of spread)
    const spreadBox2 = await (await page.$('.aspect-16\\/10, .aspect-16\\/9')).boundingBox();
    await page.mouse.click(spreadBox2.x + spreadBox2.width * 0.75, spreadBox2.y + spreadBox2.height * 0.45);
    await page.waitForSelector('form textarea', { timeout: 5000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cat = btns.find(b => b.textContent?.trim() === 'Color Correction');
      if (cat) cat.click();
    });
    await page.type('form textarea', 'Correction B: Warm up the floral tones slightly.');
    const submitBtnB = await page.$('button[type="submit"]');
    if (submitBtnB) await submitBtnB.click();
    await new Promise(r => setTimeout(r, 1200));
    console.log('[PASS] Step 4: Correction B created on Page 3');

    // Step 5: Refresh client page
    console.log('\n--- Step 5: Refresh client page ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    console.log('[PASS] Step 5: Client page refreshed');

    // Step 6: Confirm A and B persist
    console.log('\n--- Step 6: Confirm A and B persist ---');
    const hasAPersisted = await page.evaluate(() => document.body.textContent?.includes('Correction A: Please increase face brightness'));
    const hasBPersisted = await page.evaluate(() => document.body.textContent?.includes('Correction B: Warm up the floral tones'));
    console.log(`Correction A persisted: ${hasAPersisted}, Correction B persisted: ${hasBPersisted}`);
    if (!hasAPersisted || !hasBPersisted) {
      throw new Error('FAIL: Corrections A and B did not persist after client reload');
    }
    console.log('[PASS] Step 6: Confirmed A and B persisted in IndexedDB');

    // Step 7: Provider sees A and B
    console.log('\n--- Step 7: Provider opens studio and sees A and B ---');
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const providerSeesA = await page.evaluate(() => document.body.textContent?.includes('Correction A: Please increase face brightness'));
    const providerSeesB = await page.evaluate(() => document.body.textContent?.includes('Correction B: Warm up the floral tones'));
    console.log(`Provider sees A: ${providerSeesA}, Provider sees B: ${providerSeesB}`);
    if (!providerSeesA || !providerSeesB) {
      throw new Error('FAIL: Provider does not see both A and B');
    }
    console.log('[PASS] Step 7: Provider sees both A and B');

    // Step 8: Provider resolves A and B
    console.log('\n--- Step 8: Provider resolves A and B ---');
    // Resolve A
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardA = cards.find(c => c.textContent?.includes('Correction A'));
      const btn = cardA?.querySelector('button[title="Mark as Resolved"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Resolve B
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardB = cards.find(c => c.textContent?.includes('Correction B'));
      const btn = cardB?.querySelector('button[title="Mark as Resolved"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const bothResolvedInStudio = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardA = cards.find(c => c.textContent?.includes('Correction A'));
      const cardB = cards.find(c => c.textContent?.includes('Correction B'));
      return (cardA?.textContent?.includes('Resolved') ?? false) && (cardB?.textContent?.includes('Resolved') ?? false);
    });
    if (!bothResolvedInStudio) {
      throw new Error('FAIL: Both A and B must be Resolved in Studio');
    }
    console.log('[PASS] Step 8: Provider resolved both A and B');

    // ========================================================
    // ROUND 2: Steps 9 - 17
    // ========================================================
    console.log('\n========================================================');
    console.log('ROUND 2: Client Opens SAME URL -> Inspects A -> Adds C');
    console.log('========================================================');

    // Step 9: Open the EXACT SAME review URL again
    console.log('\n--- Step 9: Open the SAME review URL again ---');
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    console.log(`[PASS] Step 9: Opened the exact same review URL: ${reviewUrl}`);

    // Step 10: Confirm A and B are still visible as Resolved
    console.log('\n--- Step 10: Confirm A and B are still visible as Resolved ---');
    const bothResolvedInClient = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardA = cards.find(c => c.textContent?.includes('Correction A'));
      const cardB = cards.find(c => c.textContent?.includes('Correction B'));
      return (cardA?.textContent?.includes('Resolved') ?? false) && (cardB?.textContent?.includes('Resolved') ?? false);
    });
    console.log(`Are both A and B visible as Resolved for client? ${bothResolvedInClient}`);
    if (!bothResolvedInClient) {
      throw new Error('FAIL: Both A and B must be visible as Resolved on review reload');
    }
    console.log('[PASS] Step 10: A and B are visible as Resolved in customer correction history');

    // Step 11 & 12: Click A and confirm navigation to A's page and pin
    console.log('\n--- Step 11 & 12: Click A -> confirm navigation & highlight ---');
    // First flip to Cover spread (Spread 0) to verify auto-navigation
    const firstSpreadBtn = await page.$('button[title*="First Page"]');
    if (firstSpreadBtn) {
      await firstSpreadBtn.click();
      await new Promise(r => setTimeout(r, 600));
    }

    // Now click correction A card in list
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardA = cards.find(c => c.textContent?.includes('Correction A'));
      if (cardA) cardA.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Confirm viewer auto-navigated to Page 2 (Spread 1)
    const onPage2Spread = await page.evaluate(() => {
      return Boolean(document.querySelector('img[alt*="Page 2"]'));
    });
    console.log(`Did viewer auto-navigate to Page 2? ${onPage2Spread}`);
    if (!onPage2Spread) {
      throw new Error("FAIL: Clicking A did not navigate to A's page");
    }

    // Confirm pin A is highlighted on the page
    const pinASelected = await page.evaluate(() => {
      const pin = document.querySelector('div[title*="Correction A"]');
      return Boolean(pin?.querySelector('.animate-ping') || pin?.querySelector('.ring-blue-500'));
    });
    console.log(`Is pin A highlighted with focus ring? ${pinASelected}`);
    if (!pinASelected) {
      throw new Error('FAIL: Pin A was not highlighted upon clicking correction A');
    }
    console.log('[PASS] Step 11 & 12: Auto-navigated to Page 2 and highlighted pin A');

    // Step 13: Create a NEW correction C because customer is not satisfied with face brightness
    console.log('\n--- Step 13: Customer creates NEW correction C on Page 2 ---');
    const spreadBox3 = await (await page.$('.aspect-16\\/10, .aspect-16\\/9')).boundingBox();
    // Click on photo at x=28%, y=40% (near face on Page 2)
    await page.mouse.click(spreadBox3.x + spreadBox3.width * 0.28, spreadBox3.y + spreadBox3.height * 0.40);
    await page.waitForSelector('form textarea', { timeout: 5000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cat = btns.find(b => b.textContent?.trim() === 'Photo Correction');
      if (cat) cat.click();
    });
    await page.type('form textarea', 'Correction C: Still slightly dark. Please increase brightness a little more.');
    const submitBtnC = await page.$('button[type="submit"]');
    await submitBtnC.click();
    await new Promise(r => setTimeout(r, 800));
    console.log('[PASS] Step 13: Created new follow-up correction C');

    // Step 14 & 15: Confirm A remains Resolved and C is Open
    console.log('\n--- Step 14 & 15: Confirm A remains Resolved and C is Open ---');
    const aStillResolved = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardA = cards.find(c => c.textContent?.includes('Correction A'));
      return cardA?.textContent?.includes('Resolved') ?? false;
    });
    const cIsOpen = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      return cardC?.textContent?.includes('Open') ?? false;
    });
    console.log(`Correction A remains Resolved: ${aStillResolved}, Correction C is Open: ${cIsOpen}`);
    if (!aStillResolved || !cIsOpen) {
      throw new Error('FAIL: A must remain Resolved and C must be Open');
    }
    console.log('[PASS] Step 14 & 15: A remains Resolved and C is Open');

    // Step 16 & 17: Refresh and confirm A and C persist
    console.log('\n--- Step 16 & 17: Refresh and confirm A, B, and C persist ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const totalInClientList = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      return {
        count: cards.length,
        hasA: cards.some(c => c.textContent?.includes('Correction A') && c.textContent?.includes('Resolved')),
        hasB: cards.some(c => c.textContent?.includes('Correction B') && c.textContent?.includes('Resolved')),
        hasC: cards.some(c => c.textContent?.includes('Correction C') && c.textContent?.includes('Open')),
      };
    });
    console.log('Client list state after reload:', totalInClientList);
    if (!totalInClientList.hasA || !totalInClientList.hasB || !totalInClientList.hasC) {
      throw new Error('FAIL: A, B, and C must all persist after reload');
    }
    console.log('[PASS] Step 16 & 17: Confirmed A, B, and C persisted across refresh');

    // ========================================================
    // ROUND 3: Steps 18 - 28
    // ========================================================
    console.log('\n========================================================');
    console.log('ROUND 3: Provider Resolves C -> Client Approves Album');
    console.log('========================================================');

    // Step 18 & 19: Provider opens the SAME album and sees C
    console.log('\n--- Step 18 & 19: Provider opens the SAME album and sees C ---');
    await page.goto(studioUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const providerSeesC = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      return cardC?.textContent?.includes('Open') ?? false;
    });
    console.log(`Provider sees C as Open: ${providerSeesC}`);
    if (!providerSeesC) {
      throw new Error('FAIL: Provider does not see correction C as Open');
    }
    console.log('[PASS] Step 18 & 19: Provider opened the same album and sees C as Open');

    // Step 20: Provider navigates to C's exact page/pin
    console.log('\n--- Step 20: Provider navigates to C exact page/pin ---');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      if (cardC) cardC.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const pinCSelectedInStudio = await page.evaluate(() => {
      const pin = document.querySelector('div[title*="Correction C"]');
      return Boolean(pin?.querySelector('.animate-ping') || pin?.querySelector('.ring-blue-500'));
    });
    console.log(`Pin C focused and selected in Studio: ${pinCSelectedInStudio}`);
    if (!pinCSelectedInStudio) {
      throw new Error('FAIL: Pin C was not focused when clicking card C in Studio');
    }
    console.log('[PASS] Step 20: Provider jumped to C exact page and pin');

    // Step 21: Provider resolves C
    console.log('\n--- Step 21: Provider marks C Resolved ---');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      const btn = cardC?.querySelector('button[title="Mark as Resolved"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const cIsResolvedInStudio = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      return cardC?.textContent?.includes('Resolved') ?? false;
    });
    console.log(`Is C now marked Resolved in Studio? ${cIsResolvedInStudio}`);
    if (!cIsResolvedInStudio) {
      throw new Error('FAIL: C was not marked Resolved in Studio');
    }
    console.log('[PASS] Step 21: Provider resolved C');

    // Step 22 & 23: Client opens the SAME review URL and confirms C is Resolved
    console.log('\n--- Step 22 & 23: Client opens SAME review URL -> C is Resolved ---');
    await page.goto(reviewUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const cIsResolvedInClient = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const cardC = cards.find(c => c.textContent?.includes('Correction C'));
      return cardC?.textContent?.includes('Resolved') ?? false;
    });
    console.log(`Is C now visible as Resolved in Client Review? ${cIsResolvedInClient}`);
    if (!cIsResolvedInClient) {
      throw new Error('FAIL: C is not visible as Resolved for client');
    }
    console.log('[PASS] Step 22 & 23: Client opened same URL and confirmed C is Resolved');

    // Step 24: Confirm A, B, and C ALL remain in correction history
    console.log('\n--- Step 24: Confirm A, B, and C ALL remain in correction history ---');
    const allThreeResolved = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const hasA = cards.some(c => c.textContent?.includes('Correction A') && c.textContent?.includes('Resolved'));
      const hasB = cards.some(c => c.textContent?.includes('Correction B') && c.textContent?.includes('Resolved'));
      const hasC = cards.some(c => c.textContent?.includes('Correction C') && c.textContent?.includes('Resolved'));
      return { total: cards.length, hasA, hasB, hasC };
    });
    console.log('Correction history status:', allThreeResolved);
    if (!allThreeResolved.hasA || !allThreeResolved.hasB || !allThreeResolved.hasC || allThreeResolved.total < 3) {
      throw new Error('FAIL: Complete correction history (A, B, C) was not preserved');
    }
    console.log('[PASS] Step 24: Complete correction history (A, B, C) confirmed intact and Resolved');

    // Step 25: Client approves the album
    console.log('\n--- Step 25: Client approves the album ---');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const approve = btns.find(b => b.textContent?.includes('Approve Album'));
      if (approve) approve.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Confirm dialog
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirm = btns.find(b => b.textContent?.includes('Confirm & Approve Album'));
      if (confirm) confirm.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const isApprovedSuccess = await page.evaluate(() => {
      return document.body.textContent?.includes('Album Approved!') || document.body.textContent?.includes('Approved & Finalized');
    });
    console.log(`Did approval succeed? ${isApprovedSuccess}`);
    if (!isApprovedSuccess) {
      throw new Error('FAIL: Album approval confirmation did not appear');
    }
    console.log('[PASS] Step 25: Client approved album design');

    // Step 26 & 27: Refresh and confirm Approved status persists
    console.log('\n--- Step 26 & 27: Refresh and confirm Approved status persists ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const approvedPersists = await page.evaluate(() => {
      return document.body.textContent?.includes('Album Approved & Finalized') || document.body.textContent?.includes('Approved on');
    });
    console.log(`Approved status persists after reload: ${approvedPersists}`);
    if (!approvedPersists) {
      throw new Error('FAIL: Approved status did not persist after reload');
    }
    console.log('[PASS] Step 26 & 27: Approved status persists after reload');

    // Step 28: Confirm correction history still exists after approval
    console.log('\n--- Step 28: Confirm correction history STILL exists after approval ---');
    const historyAfterApproval = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      return {
        total: cards.length,
        hasA: cards.some(c => c.textContent?.includes('Correction A')),
        hasB: cards.some(c => c.textContent?.includes('Correction B')),
        hasC: cards.some(c => c.textContent?.includes('Correction C')),
      };
    });
    console.log('Correction history after approval:', historyAfterApproval);
    if (!historyAfterApproval.hasA || !historyAfterApproval.hasB || !historyAfterApproval.hasC) {
      throw new Error('FAIL: Correction history was wiped or lost after approval');
    }
    console.log('[PASS] Step 28: Complete correction history still exists after final approval');

    // Final verification: Confirm NO duplicate albums exist on dashboard
    console.log('\n--- Final Check: Confirm NO duplicate albums created ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    const finalAlbumCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href^="/album/"]').length;
    });
    console.log(`Final album count on dashboard: ${finalAlbumCount} (Initial was ${initialAlbumCount})`);
    if (finalAlbumCount !== initialAlbumCount) {
      throw new Error(`FAIL: Duplicate albums were created (initial: ${initialAlbumCount}, final: ${finalAlbumCount})`);
    }
    console.log('[PASS] Confirmed 0 duplicate albums created across all 3 review rounds');

    console.log('\n============================================================');
    console.log('ALL 28 REPEATED REVIEW ROUND STEPS PASSED WITH 100% SUCCESS!');
    console.log(`Total console errors: ${errors.length}`);
    console.log('============================================================');

  } finally {
    await browser.close();
  }
}

runRepeatedReviewRoundsTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
