import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = 'ecbaf9c8-4d5d-450d-a7a0-5e6330eae057';

async function main() {
  console.log('Launching browser to test 3D page-turn cover fix...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log(`Navigating to album page for album ${albumId}...`);
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Ensure album stage is loaded
  await page.waitForSelector('[data-testid="physical-album-stage"]', { timeout: 10000 });
  console.log('Album stage found.');

  // ========================================================
  // TEST A: FRONT COVER RESTING & PAGE TURN
  // ========================================================
  console.log('\n--- TEST A: Front Cover Resting State & Turn ---');
  
  // 1. Resting Front Cover inspection
  const coverInspect = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const canvas = stage.querySelector('canvas[data-testid="continuous-curl-canvas"]');
    // Check central spine seam
    const spineSeams = Array.from(stage.querySelectorAll('.w-px.bg-black\\/40, [class*="left-1/2"][class*="w-px"]'));
    const isSpineSeamVisible = spineSeams.some(s => {
      const style = window.getComputedStyle(s);
      return style.display !== 'none' && style.visibility !== 'hidden' && s.closest('.z-20');
    });
    const layer2 = stage.querySelector('.z-20');
    const fullCover = layer2?.querySelector('.w-full.h-full');
    const images = Array.from(stage.querySelectorAll('img')).map(img => ({
      alt: img.alt,
      src: img.src?.slice(0, 50),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      visible: window.getComputedStyle(img).visibility !== 'hidden'
    }));
    return {
      stageW: stage.clientWidth,
      stageH: stage.clientHeight,
      isCanvasActive: Boolean(canvas),
      isSpineSeamVisible,
      isFullCoverMounted: Boolean(fullCover),
      images
    };
  });
  console.log('Front Cover resting state:', JSON.stringify(coverInspect, null, 2));

  await page.screenshot({ path: 'scripts/testA_01_resting_front_cover.png' });
  console.log('Saved testA_01_resting_front_cover.png');

  // 2. Trigger Turn from Front Cover to Spread 1 and capture MID-TURN
  console.log('Triggering Front Cover page turn to Spread 1...');
  await page.keyboard.press('ArrowRight');
  
  // Wait ~170ms to capture mid-animation (around progress 0.45)
  await new Promise((r) => setTimeout(r, 170));

  const midTurnInspect = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const canvas = stage.querySelector('canvas[data-testid="continuous-curl-canvas"]');
    const layer1 = stage.querySelector('[style*="z-index: 15"], [style*="zIndex: 15"]');
    const layer2 = stage.querySelector('.z-20');
    return {
      hasCanvas: Boolean(canvas),
      canvasW: canvas?.width,
      canvasH: canvas?.height,
      layer2Visibility: layer2 ? window.getComputedStyle(layer2.firstElementChild || layer2).visibility : null,
      layer1Visibility: layer1 ? window.getComputedStyle(layer1).visibility : null,
    };
  });
  console.log('Mid-turn inspection:', JSON.stringify(midTurnInspect, null, 2));

  await page.screenshot({ path: 'scripts/testA_02_midturn_front_cover.png' });
  console.log('Saved testA_02_midturn_front_cover.png');

  // Wait for turn to complete and settle
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/testA_03_settled_inside_spread1.png' });
  console.log('Saved testA_03_settled_inside_spread1.png');

  // ========================================================
  // TEST B: FIRST INSIDE SPREAD -> NEXT SPREAD (MIDDLE SPREAD)
  // ========================================================
  console.log('\n--- TEST B: Middle Spread Turn ---');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 170));
  await page.screenshot({ path: 'scripts/testB_01_midturn_middle_spread.png' });
  console.log('Saved testB_01_midturn_middle_spread.png');

  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/testB_02_settled_middle_spread2.png' });
  console.log('Saved testB_02_settled_middle_spread2.png');

  // ========================================================
  // TEST D: MOUSE / TOUCH DRAG TURN
  // ========================================================
  console.log('\n--- TEST D: Mouse Drag Page Turn ---');
  // First navigate back to Front Cover using ArrowLeft
  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 800));

  console.log('Now at Front Cover. Performing mouse drag from right corner to left...');
  const stageBox = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  if (stageBox) {
    const startX = stageBox.x + stageBox.width - 20;
    const startY = stageBox.y + 40;
    const endX = stageBox.x + stageBox.width * 0.45;
    const endY = stageBox.y + 120;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Drag halfway across
    for (let step = 1; step <= 10; step++) {
      const curX = startX + (endX - startX) * (step / 10);
      const curY = startY + (endY - startY) * (step / 10);
      await page.mouse.move(curX, curY);
      await new Promise(r => setTimeout(r, 20));
    }

    // Capture screenshot during active mouse drag
    await page.screenshot({ path: 'scripts/testD_01_mousedrag_front_cover.png' });
    console.log('Saved testD_01_mousedrag_front_cover.png during mouse drag.');

    // Release mouse to complete turn
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'scripts/testD_02_settled_after_mousedrag.png' });
    console.log('Saved testD_02_settled_after_mousedrag.png');
  }

  await browser.close();
  console.log('\nAll tests completed successfully!');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
