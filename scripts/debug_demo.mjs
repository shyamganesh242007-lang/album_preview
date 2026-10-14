import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('dialog', async (dialog) => {
    console.log('ALERT DIALOG:', dialog.message());
    await dialog.dismiss();
  });
  page.on('console', (msg) => {
    console.log(`[CONSOLE ${msg.type()}]:`, msg.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  
  // Wait for initial load skeleton to finish
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));

  console.log('Clicking Load Demo Wedding Album...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const demo = btns.find((b) => b.textContent?.includes('Load Demo Wedding Album'));
    if (demo) demo.click();
  });

  await new Promise((r) => setTimeout(r, 4000));

  const albumsCount = await page.evaluate(() => {
    return document.querySelectorAll('a[href^="/album/"]').length;
  });
  const albumLink = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/album/"]');
    return a ? a.getAttribute('href') : null;
  });
  console.log('Albums count on dashboard:', albumsCount, 'Link:', albumLink);

  await browser.close();
}

main().catch(console.error);
