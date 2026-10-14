import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = 'ecbaf9c8-4d5d-450d-a7a0-5e6330eae057';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Resting Front Cover screenshot...');
  await page.screenshot({ path: 'scripts/real_01_resting_front_cover.png' });

  // Trigger ArrowRight and wait for canvas to appear
  console.log('Pressing ArrowRight...');
  page.keyboard.press('ArrowRight');

  // Wait for continuous-curl-canvas
  await page.waitForSelector('canvas[data-testid="continuous-curl-canvas"]', { timeout: 5000 });
  console.log('Curl canvas appeared! Capturing mid-turn at ~160ms...');
  await new Promise(r => setTimeout(r, 160));

  await page.screenshot({ path: 'scripts/real_02_midturn_front_cover.png' });
  console.log('Saved real_02_midturn_front_cover.png');

  // Wait for turn to complete
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scripts/real_03_settled_inside_spread.png' });
  console.log('Saved real_03_settled_inside_spread.png');

  await browser.close();
}

main().catch(console.error);
