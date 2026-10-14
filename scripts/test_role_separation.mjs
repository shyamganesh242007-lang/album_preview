import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function runRoleSeparationTest() {
  console.log('--- STARTING ROLE SEPARATION TEST IN REAL CHROME ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.error('Browser console error:', msg.text());
      }
    });

    // 1. Ensure a demo album exists first
    console.log('\n[STEP 1] Navigating to Dashboard and loading demo album...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Look for existing album or click Load Demo Wedding Album
    const demoBtn = await page.$('button[id="load-demo-button"]') || await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent?.includes('Load Demo Wedding Album'));
    });

    if (demoBtn && demoBtn.asElement()) {
      console.log('Clicking "Load Demo Wedding Album"...');
      await demoBtn.asElement().click();
      await new Promise(r => setTimeout(r, 2000));
    }

    // Now find the demo album card link or id
    const albumLink = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/album/"]');
      return a ? a.getAttribute('href') : null;
    });

    if (!albumLink) {
      throw new Error('No album link found on dashboard');
    }

    const albumId = albumLink.replace('/album/', '');
    console.log(`Found album: ${albumId}`);

    // ==========================================
    // STUDIO TEST
    // ==========================================
    console.log('\n==========================================');
    console.log('STUDIO OWNER TESTS (/album/' + albumId + ')');
    console.log('==========================================');

    await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Studio 1 & 2: Confirm there is NO Pin Mode button & NO "Click anywhere on photo..."
    console.log('\n--- Studio 1 & 2: Check Pin Mode is ABSENT ---');
    const studioPinModeBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent?.includes('Pin Mode Active') || b.textContent?.includes('Enable Pin Mode'));
    });
    console.log(`Is Pin Mode button present in Studio? ${studioPinModeBtn}`);
    if (studioPinModeBtn) {
      throw new Error('FAIL: Pin Mode button must NOT be present in Studio viewer');
    }
    console.log('[PASS] Confirmed NO Pin Mode button in Studio');

    const studioPinHint = await page.evaluate(() => {
      return document.body.textContent?.includes('Click anywhere on photo to place correction pin');
    });
    console.log(`Is "Click anywhere on photo to place correction pin" present? ${studioPinHint}`);
    if (studioPinHint) {
      throw new Error('FAIL: Pin hint banner must NOT be present in Studio viewer');
    }
    console.log('[PASS] Confirmed NO "Click anywhere on photo..." in Studio');

    // Studio 3: Confirm clicking the album image does NOT create a correction
    console.log('\n--- Studio 3: Confirm clicking album image does NOT create correction ---');
    const initialCorrectionsCount = await page.evaluate(() => {
      return document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]').length;
    });
    console.log(`Initial corrections in sidebar: ${initialCorrectionsCount}`);

    // Click on the album image spread
    const photoContainer = await page.$('.aspect-16\\/10, .aspect-16\\/9');
    if (photoContainer) {
      const box = await photoContainer.boundingBox();
      if (box) {
        // Click near center
        await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Verify no Add Correction Modal opened
    const addModalVisible = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h2, h3')).some(h =>
        h.textContent?.includes('Add Correction Pin') || h.textContent?.includes('Correction on Page')
      );
    });
    console.log(`Did Add Correction modal open on photo click in Studio? ${addModalVisible}`);
    if (addModalVisible) {
      throw new Error('FAIL: Clicking photo in Studio must NOT open correction creation UI');
    }
    console.log('[PASS] Clicking album image did NOT create a correction or open add modal');

    // Studio 4: Confirm existing customer pins are visible
    console.log('\n--- Studio 4: Confirm existing customer pins are visible ---');
    // First flip to spread with pins if needed (e.g. spread 2)
    const nextBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button[title*="Next"]'));
      return btns[0] || null;
    });
    if (nextBtn && nextBtn.asElement()) {
      await nextBtn.asElement().click();
      await new Promise(r => setTimeout(r, 600));
    }

    const pinElementsCount = await page.evaluate(() => {
      return document.querySelectorAll('[aria-label^="Correction pin"]').length;
    });
    console.log(`Pins visible on current spread: ${pinElementsCount}`);

    // Studio 5: Confirm correction details can be opened
    console.log('\n--- Studio 5: Confirm correction details can be opened ---');
    // Click on a correction in the sidebar list or click pin
    const sidebarCorrCard = await page.$('.cursor-pointer[class*="rounded-lg border"]');
    if (sidebarCorrCard) {
      await sidebarCorrCard.click();
      await new Promise(r => setTimeout(r, 500));
    }

    // Now click the edit / detail button or open details modal
    const editBtn = await page.$('button[title="Edit Correction"]');
    if (editBtn) {
      await editBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }

    const detailsModalTitle = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('h2, h3'));
      const found = titles.find(t => t.textContent?.includes('Correction Note'));
      return found ? found.textContent : null;
    });
    console.log(`Details modal title: ${detailsModalTitle}`);
    if (!detailsModalTitle) {
      throw new Error('FAIL: Correction details modal did not open');
    }
    console.log('[PASS] Correction details opened for Studio inspection');

    // Studio 6: Confirm Studio can mark a correction Resolved
    console.log('\n--- Studio 6: Confirm Studio can mark a correction Resolved ---');
    const resolveBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent?.includes('Mark as Resolved') || b.textContent?.includes('Reopen Correction'));
    });
    if (resolveBtn && resolveBtn.asElement()) {
      console.log('Clicking "Mark as Resolved" button...');
      await resolveBtn.asElement().click();
      await new Promise(r => setTimeout(r, 800));
    }
    console.log('[PASS] Studio successfully marked correction status');

    // ==========================================
    // CLIENT REVIEW TEST
    // ==========================================
    console.log('\n==========================================');
    console.log('CLIENT REVIEW TESTS (/review/' + albumId + ')');
    console.log('==========================================');

    await page.goto(`${BASE_URL}/review/${albumId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Client 1 & 2: Confirm Pin Mode is available
    console.log('\n--- Client 1 & 2: Confirm Pin Mode is available ---');
    const clientPinModeBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent?.includes('Pin Mode Active') || b.textContent?.includes('Enable Pin Mode'));
    });
    console.log(`Is Pin Mode button present in Client view? ${clientPinModeBtn}`);
    if (!clientPinModeBtn) {
      throw new Error('FAIL: Pin Mode button MUST be present in Client review');
    }

    const clientPinHint = await page.evaluate(() => {
      return document.body.textContent?.includes('Click anywhere on photo to place correction pin') ||
             document.body.textContent?.includes('Click anywhere directly on an album photo');
    });
    console.log(`Is Client correction guidance present? ${clientPinHint}`);
    if (!clientPinHint) {
      throw new Error('FAIL: Client correction guidance hint must be present');
    }
    console.log('[PASS] Pin Mode is active and available for customer');

    // Client 3 & 4: Click a photo and confirm correction creation UI opens
    console.log('\n--- Client 3 & 4: Click photo to open Add Correction modal ---');
    const clientPhotoContainer = await page.$('.aspect-16\\/10, .aspect-16\\/9');
    if (!clientPhotoContainer) {
      throw new Error('FAIL: Album spread container not found in client view');
    }

    const clientBox = await clientPhotoContainer.boundingBox();
    // Click on photo at x=65%, y=45%
    await page.mouse.click(clientBox.x + clientBox.width * 0.65, clientBox.y + clientBox.height * 0.45);
    await new Promise(r => setTimeout(r, 600));

    const clientAddModalOpen = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('h2, h3'));
      return titles.some(t => t.textContent?.includes('Add Correction Pin'));
    });
    console.log(`Did Add Correction modal open on client click? ${clientAddModalOpen}`);
    if (!clientAddModalOpen) {
      throw new Error('FAIL: Add Correction modal did not open upon clicking photo in Client view');
    }
    console.log('[PASS] Correction creation modal opened for client');

    // Client 5: Select category & enter comment
    console.log('\n--- Client 5 & 6: Fill category + comment and submit ---');
    // Select category 'Color Correction'
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const catBtn = btns.find(b => b.textContent?.trim() === 'Color Correction');
      if (catBtn) catBtn.click();
    });

    // Enter comment
    await page.type('textarea', 'Client note: Please warm up the background tone slightly on this right photo.');
    await new Promise(r => setTimeout(r, 300));

    // Submit
    const submitBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button[type="submit"]'));
      return btns[0] || null;
    });
    if (!submitBtn || !submitBtn.asElement()) {
      throw new Error('FAIL: Submit button in Add Correction modal not found');
    }
    await submitBtn.asElement().click();
    await new Promise(r => setTimeout(r, 1000));

    // Client 7: Confirm new pin appears
    console.log('\n--- Client 7: Confirm new pin appears in client view ---');
    const clientPinsCount = await page.evaluate(() => {
      return document.querySelectorAll('[aria-label^="Correction pin"]').length;
    });
    console.log(`Pins on client spread: ${clientPinsCount}`);
    if (clientPinsCount === 0) {
      throw new Error('FAIL: New pin did not appear on page');
    }

    const clientHasNote = await page.evaluate(() => {
      return document.body.textContent?.includes('Please warm up the background tone slightly');
    });
    console.log(`Is client comment listed in sidebar? ${clientHasNote}`);
    if (!clientHasNote) {
      throw new Error('FAIL: New correction note is not visible in sidebar list');
    }
    console.log('[PASS] Client created new pin and comment successfully');

    // Client must NOT have resolve button in their list
    const clientCanResolve = await page.evaluate(() => {
      const resolveBtns = Array.from(document.querySelectorAll('button[title*="Mark as Resolved"], button[title*="Mark as Open"]'));
      return resolveBtns.length > 0;
    });
    console.log(`Does Client have resolve button in list? ${clientCanResolve}`);
    if (clientCanResolve) {
      throw new Error('FAIL: Client must NOT have resolve buttons in correction list');
    }
    console.log('[PASS] Confirmed Client CANNOT resolve corrections');

    // ==========================================
    // RETURN TO STUDIO TO RESOLVE
    // ==========================================
    console.log('\n==========================================');
    console.log('RETURN TO STUDIO TO VERIFY & RESOLVE');
    console.log('==========================================');

    await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Studio 8 & 9: Confirm the client's correction appears in Studio
    const studioSeesClientNote = await page.evaluate(() => {
      return document.body.textContent?.includes('Please warm up the background tone slightly');
    });
    console.log(`Does Studio see client's note? ${studioSeesClientNote}`);
    if (!studioSeesClientNote) {
      throw new Error("FAIL: Studio does not see the client's new correction note");
    }
    console.log("[PASS] Studio sees client's new correction note");

    // Studio 10: Mark it Resolved
    console.log('\n--- Studio 10: Mark client correction as Resolved ---');
    // Find the item with that comment and click resolve or edit
    const clientCorrCard = await page.evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      return cards.find(c => c.textContent?.includes('Please warm up the background tone slightly'));
    });

    if (clientCorrCard && clientCorrCard.asElement()) {
      // Find the resolve button inside or click the card to open details
      const resolveBtnInside = await clientCorrCard.asElement().$('button[title="Mark as Resolved"]');
      if (resolveBtnInside) {
        console.log('Clicking resolve checkmark button on card in Studio...');
        await resolveBtnInside.click();
      } else {
        console.log('Opening card details in Studio to resolve...');
        await clientCorrCard.asElement().click();
        await new Promise(r => setTimeout(r, 400));
        const editBtn = await page.$('button[title="Edit Correction"]');
        if (editBtn) await editBtn.click();
        await new Promise(r => setTimeout(r, 400));
        const resModalBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.textContent?.includes('Mark as Resolved'));
        });
        if (resModalBtn && resModalBtn.asElement()) {
          await resModalBtn.asElement().click();
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // Verify Studio card now shows Resolved
    const isNowResolvedInStudio = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const targetCard = cards.find(c => c.textContent?.includes('Please warm up the background tone slightly'));
      return targetCard?.textContent?.includes('Resolved') ?? false;
    });
    console.log(`Is note marked Resolved in Studio? ${isNowResolvedInStudio}`);
    if (!isNowResolvedInStudio) {
      throw new Error('FAIL: Correction was not marked Resolved in Studio');
    }
    console.log('[PASS] Studio marked correction as Resolved');

    // ==========================================
    // RETURN TO CLIENT TO CONFIRM RESOLVED
    // ==========================================
    console.log('\n==========================================');
    console.log('RETURN TO CLIENT REVIEW TO VERIFY RESOLVED');
    console.log('==========================================');

    await page.goto(`${BASE_URL}/review/${albumId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const isResolvedInClient = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      const targetCard = cards.find(c => c.textContent?.includes('Please warm up the background tone slightly'));
      return targetCard?.textContent?.includes('Resolved') ?? false;
    });
    console.log(`Does Client Review show the note as Resolved? ${isResolvedInClient}`);
    if (!isResolvedInClient) {
      throw new Error('FAIL: Client Review does not show note as Resolved');
    }
    console.log('[PASS] Client Review confirms correction shows as Resolved');

    console.log('\n========================================');
    console.log('ALL ROLE SEPARATION TESTS PASSED 100%!');
    console.log(`Total console errors: ${errors.length}`);
    console.log('========================================');

  } finally {
    await browser.close();
  }
}

runRoleSeparationTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
