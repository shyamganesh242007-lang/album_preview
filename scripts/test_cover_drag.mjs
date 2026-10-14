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

  // Ensure we are at Front Cover
  const stageBox = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  console.log('Stage box on Front Cover:', stageBox);

  // Mouse drag on Front Cover: start at top-right corner (x = right - 20, y = top + 30)
  const startX = stageBox.x + stageBox.width - 20;
  const startY = stageBox.y + 30;
  // Drag leftwards across the full stage to x = stageBox.x + stageBox.width * 0.4
  const endX = stageBox.x + stageBox.width * 0.45;
  const endY = stageBox.y + 100;

  console.log(`Starting drag from (${startX}, ${startY}) to (${endX}, ${endY})...`);
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Move in steps
  for (let i = 1; i <= 10; i++) {
    const cx = startX + (endX - startX) * (i / 10);
    const cy = startY + (endY - startY) * (i / 10);
    await page.mouse.move(cx, cy);
    await new Promise(r => setTimeout(r, 25));
  }

  // Inspect during active mouse drag
  const dragInspect = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    const canvas = stage?.querySelector('canvas[data-testid="continuous-curl-canvas"]');
    return {
      hasCanvas: Boolean(canvas),
      canvasW: canvas?.width,
      canvasH: canvas?.height,
    };
  });
  console.log('Active drag state:', dragInspect);

  await page.screenshot({ path: 'scripts/cover_drag_active.png' });
  console.log('Saved scripts/cover_drag_active.png');

  // Now release mouse to complete turn
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 800));

  await page.screenshot({ path: 'scripts/cover_drag_completed.png' });
  console.log('Saved scripts/cover_drag_completed.png');

  await browser.close();
}

main().catch(console.error);
