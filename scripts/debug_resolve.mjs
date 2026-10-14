import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log(`[CONSOLE ${msg.type()}]:`, msg.text()));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1000));

  const albumHref = await page.evaluate(() => {
    return document.querySelector('a[href^="/album/"]')?.getAttribute('href');
  });
  console.log('Album href:', albumHref);

  if (albumHref) {
    await page.goto(`${BASE_URL}${albumHref}`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2000));

    const corrections = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      return cards.map((c) => ({
        text: c.textContent?.trim(),
        hasResolveBtn: Boolean(c.querySelector('button[title="Mark as Resolved"]')),
        allButtons: Array.from(c.querySelectorAll('button')).map((b) => b.getAttribute('title')),
      }));
    });
    console.log('Found corrections in Studio:', JSON.stringify(corrections, null, 2));

    // Try clicking resolve on the first one
    console.log('Clicking resolve button on first correction...');
    await page.evaluate(() => {
      const btn = document.querySelector('button[title="Mark as Resolved"]');
      if (btn) btn.click();
      else console.log('Resolve button not found!');
    });
    await new Promise((r) => setTimeout(r, 1000));

    const after = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer[class*="rounded-lg border"]'));
      return cards.map((c) => c.textContent?.trim());
    });
    console.log('After clicking resolve:', after);
  }

  await browser.close();
}

main().catch(console.error);
