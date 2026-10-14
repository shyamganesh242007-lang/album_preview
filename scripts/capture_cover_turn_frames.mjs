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

  console.log('Taking before-turn screenshot...');
  await page.screenshot({ path: 'scripts/frame_00_resting.png' });

  // Start turn
  console.log('Pressing ArrowRight and capturing frames...');
  // We can initiate turn and immediately capture frames at intervals
  const turnPromise = page.keyboard.press('ArrowRight');

  // Capture frame at ~60ms
  await new Promise(r => setTimeout(r, 60));
  await page.screenshot({ path: 'scripts/frame_01_p02.png' });
  console.log('Saved frame_01_p02.png');

  // Capture frame at ~120ms
  await new Promise(r => setTimeout(r, 60));
  await page.screenshot({ path: 'scripts/frame_02_p04.png' });
  console.log('Saved frame_02_p04.png');

  // Capture frame at ~180ms
  await new Promise(r => setTimeout(r, 60));
  await page.screenshot({ path: 'scripts/frame_03_p06.png' });
  console.log('Saved frame_03_p06.png');

  // Capture frame at ~240ms
  await new Promise(r => setTimeout(r, 60));
  await page.screenshot({ path: 'scripts/frame_04_p08.png' });
  console.log('Saved frame_04_p08.png');

  // Wait for finish
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'scripts/frame_05_settled.png' });
  console.log('Saved frame_05_settled.png');

  await browser.close();
}

main().catch(console.error);
