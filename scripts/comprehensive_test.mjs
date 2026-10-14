import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = 'ecbaf9c8-4d5d-450d-a7a0-5e6330eae057';

async function main() {
  console.log('Starting comprehensive flipbook test...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[APPLY_TRANSFORM]') || text.includes('Error')) {
      console.log('CONSOLE:', text);
    }
  });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  const stageBox = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  console.log('Stage box:', stageBox);

  // -------------------------------------------------------------
  // TEST 1: Resting Front Cover
  // -------------------------------------------------------------
  await page.screenshot({ path: 'scripts/verify_01_resting_front_cover.png' });
  console.log('Saved verify_01_resting_front_cover.png');

  // -------------------------------------------------------------
  // TEST 2: Front Cover Drag at p = 0.25 (Quarter Turn)
  // -------------------------------------------------------------
  const startX = stageBox.x + stageBox.width - 20;
  const startY = stageBox.y + stageBox.height / 2;
  const p25X = startX - stageBox.width * 0.25;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(p25X, startY);
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/verify_02_front_cover_p25.png' });
  console.log('Saved verify_02_front_cover_p25.png');

  // -------------------------------------------------------------
  // TEST 3: Front Cover Drag at p = 0.50 (Halfway Turn)
  // -------------------------------------------------------------
  const p50X = startX - stageBox.width * 0.50;
  await page.mouse.move(p50X, startY);
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/verify_03_front_cover_p50.png' });
  console.log('Saved verify_03_front_cover_p50.png');

  // -------------------------------------------------------------
  // TEST 4: Front Cover Drag at p = 0.75 (Three-Quarter Turn)
  // -------------------------------------------------------------
  const p75X = startX - stageBox.width * 0.75;
  await page.mouse.move(p75X, startY);
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/verify_04_front_cover_p75.png' });
  console.log('Saved verify_04_front_cover_p75.png');

  // Complete turn to Spread 1
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/verify_05_settled_spread1.png' });
  console.log('Saved verify_05_settled_spread1.png');

  // -------------------------------------------------------------
  // TEST 5: Middle Spread Turn (Spread 1 -> Spread 2)
  // -------------------------------------------------------------
  const midStartX = stageBox.x + stageBox.width - 20;
  const midEndX = stageBox.x + stageBox.width * 0.65;
  await page.mouse.move(midStartX, startY);
  await page.mouse.down();
  await page.mouse.move(midEndX, startY);
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/verify_06_middle_spread_turning.png' });
  console.log('Saved verify_06_middle_spread_turning.png');
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 600));

  // -------------------------------------------------------------
  // TEST 6: Jump to Last Spread and Turn to Back Cover
  // -------------------------------------------------------------
  // Jump to last spread using End key
  await page.keyboard.press('End');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/verify_07_back_cover_resting.png' });
  console.log('Saved verify_07_back_cover_resting.png');

  // Drag Back Cover (from left to right)
  const backStartX = stageBox.x + 20;
  const backMidX = stageBox.x + stageBox.width * 0.40;
  await page.mouse.move(backStartX, startY);
  await page.mouse.down();
  await page.mouse.move(backMidX, startY);
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/verify_08_back_cover_turning.png' });
  console.log('Saved verify_08_back_cover_turning.png');
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 600));

  await browser.close();
  console.log('Comprehensive tests completed successfully!');
}

main().catch(console.error);
