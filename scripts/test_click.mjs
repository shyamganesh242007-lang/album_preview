import puppeteer from 'puppeteer-core';

async function testClick() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));

  // Click on the album card
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const proofBtn = btns.find((b) => b.innerText.includes('Studio Proof'));
    if (proofBtn) proofBtn.click();
  });

  await page.waitForFunction(() => window.location.pathname.includes('/album/'));
  await new Promise((r) => setTimeout(r, 1000));

  // Navigate to Page 2
  await page.evaluate(() => {
    const nextBtn = document.querySelector('button[title*="Next Spread"]');
    if (nextBtn) nextBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Check element at left page
  const info = await page.evaluate(() => {
    const img = document.querySelector('img[alt*="Page 2"]');
    if (!img) return 'Image Page 2 not found';
    const parent = img.parentElement;
    const rect = parent.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.4;
    const cy = rect.top + rect.height * 0.35;
    const topEl = document.elementFromPoint(cx, cy);
    return {
      parentTag: parent.tagName,
      parentClass: parent.className,
      rect,
      cx,
      cy,
      topElTag: topEl ? topEl.tagName : null,
      topElClass: topEl ? topEl.className : null,
    };
  });
  console.log('Element from point info:', info);

  // Now trigger click on parent
  await page.evaluate(() => {
    const img = document.querySelector('img[alt*="Page 2"]');
    const parent = img.parentElement;
    const rect = parent.getBoundingClientRect();
    const event = new MouseEvent('click', {
      clientX: rect.left + rect.width * 0.4,
      clientY: rect.top + rect.height * 0.35,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    parent.dispatchEvent(event);
  });

  await new Promise((r) => setTimeout(r, 600));
  const modalText = await page.evaluate(() => document.body.innerText);
  console.log('Did modal open?', modalText.includes('Add Correction Pin'));

  await browser.close();
}

testClick().catch(console.error);
