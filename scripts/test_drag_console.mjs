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
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  const stageBox = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  const startX = stageBox.x + stageBox.width - 20;
  const startY = stageBox.y + 30;
  const endX = stageBox.x + stageBox.width * 0.45;
  const endY = stageBox.y + 100;

  console.log(`Starting drag...`);
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let i = 1; i <= 5; i++) {
    const cx = startX + (endX - startX) * (i / 5);
    const cy = startY + (endY - startY) * (i / 5);
    await page.mouse.move(cx, cy);
    await new Promise(r => setTimeout(r, 30));
  }

  await page.screenshot({ path: 'scripts/real_drag_screenshot.png' });
  console.log('Saved real_drag_screenshot.png');
  await browser.close();
}

main().catch(console.error);
