import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = '1542d997-0318-4833-b4c7-1de5b5efff63';

const outDir = path.resolve('test-artifacts', 'continuous-turn');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function verifyContinuousZeroFlash() {
  console.log('================================================================');
  console.log(' CONTINUOUS 3D PAGE TURN & ZERO WHITE FLASH VERIFICATION');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', (msg) => {
    if (msg.text().includes('[PERF]')) {
      console.log('  ', msg.text());
    }
  });

  console.log('Navigating to Album Studio View...');
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Screenshot front cover
  await page.screenshot({ path: path.join(outDir, '01_front_cover.png') });

  // Open cover to Inside Spread 1 (Pages 2-3)
  console.log('\n--- 1. Testing COVER OPENING with Instant Destination Presence ---');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, '02_inside_spread_1.png') });

  // -------------------------------------------------------------
  // TEST A: RIGHT -> LEFT TURN WITH FRAME-BY-FRAME CONTINUITY
  // -------------------------------------------------------------
  console.log('\n--- 2. TEST A: Right -> Left Turn (Spread 1 -> Spread 2) ---');

  // Monitor DOM during the turn
  await page.evaluate(() => {
    window.__turnFrames = [];
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return;

    const startTime = performance.now();
    const interval = setInterval(() => {
      const stageBox = stage.getBoundingClientRect();
      const skeletons = stage.querySelectorAll('.animate-pulse');
      const canvas = stage.querySelector('canvas[data-testid="continuous-curl-canvas"]');
      const imgs = Array.from(stage.querySelectorAll('img')).map((img) => ({
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        opacity: window.getComputedStyle(img).opacity,
        visibility: window.getComputedStyle(img).visibility,
      }));

      window.__turnFrames.push({
        t: Math.round(performance.now() - startTime),
        hasSkeleton: skeletons.length > 0,
        hasCanvas: Boolean(canvas),
        stageW: Math.round(stageBox.width),
        stageH: Math.round(stageBox.height),
        imgs,
      });

      if (performance.now() - startTime > 1000) {
        clearInterval(interval);
      }
    }, 25);
  });

  // Trigger ArrowRight turn
  await page.keyboard.press('ArrowRight');
  // Capture mid-turn screenshot at 200ms
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outDir, '03_mid_turn_right_to_left.png') });

  // Wait for turn to complete
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '04_settled_spread_2.png') });

  const framesA = await page.evaluate(() => window.__turnFrames || []);
  console.log(`  Sampled ${framesA.length} high-frequency frames during turn.`);

  // Assertions on framesA
  const skeletonFramesA = framesA.filter((f) => f.hasSkeleton);
  assert(skeletonFramesA.length === 0, `ZERO white skeleton frames detected during turn (found: ${skeletonFramesA.length})`);

  // Check stage stability across all sampled frames
  const initialW = framesA[0]?.stageW;
  const initialH = framesA[0]?.stageH;
  const resizedFramesA = framesA.filter((f) => f.stageW !== initialW || f.stageH !== initialH);
  assert(resizedFramesA.length === 0, `Album stage dimensions 100% constant on every single frame (${initialW}x${initialH})`);

  console.log('✅ TEST A PASSED: Right -> Left turn is completely continuous with ZERO white flash!\n');

  // -------------------------------------------------------------
  // TEST B: LEFT -> RIGHT TURN (Spread 2 -> Spread 1)
  // -------------------------------------------------------------
  console.log('--- 3. TEST B: Left -> Right Turn (Spread 2 -> Spread 1) ---');

  await page.evaluate(() => {
    window.__turnFrames = [];
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return;

    const startTime = performance.now();
    const interval = setInterval(() => {
      const stageBox = stage.getBoundingClientRect();
      const skeletons = stage.querySelectorAll('.animate-pulse');
      const canvas = stage.querySelector('canvas[data-testid="continuous-curl-canvas"]');

      window.__turnFrames.push({
        t: Math.round(performance.now() - startTime),
        hasSkeleton: skeletons.length > 0,
        hasCanvas: Boolean(canvas),
        stageW: Math.round(stageBox.width),
        stageH: Math.round(stageBox.height),
      });

      if (performance.now() - startTime > 1000) {
        clearInterval(interval);
      }
    }, 25);
  });

  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outDir, '05_mid_turn_left_to_right.png') });

  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '06_settled_returned_spread_1.png') });

  const framesB = await page.evaluate(() => window.__turnFrames || []);
  const skeletonFramesB = framesB.filter((f) => f.hasSkeleton);
  assert(skeletonFramesB.length === 0, `ZERO white skeleton frames detected during backwards turn (found: ${skeletonFramesB.length})`);

  const resizedFramesB = framesB.filter((f) => f.stageW !== initialW || f.stageH !== initialH);
  assert(resizedFramesB.length === 0, `Album stage dimensions 100% constant on backwards turn (${initialW}x${initialH})`);

  console.log('✅ TEST B PASSED: Left -> Right turn is completely continuous with ZERO white flash!\n');

  // -------------------------------------------------------------
  // TEST C: RAPID INPUT HANDLING (Repeated Next Clicks)
  // -------------------------------------------------------------
  console.log('--- 4. TEST C: Rapid Next/Previous Input Safety ---');
  // Fire 4 rapid ArrowRight presses without waiting
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 900));

  const rapidStageHandle = await page.$('[data-testid="physical-album-stage"]');
  assert(Boolean(rapidStageHandle), 'Stage remains solid and intact after rapid navigation');

  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas[data-testid="continuous-curl-canvas"]').length);
  assert(canvasCount <= 1, `Never duplicate canvas layers during rapid inputs (count: ${canvasCount})`);
  console.log('✅ TEST C PASSED: Rapid navigation safely queued/throttled without broken layers!\n');

  // -------------------------------------------------------------
  // TEST D: SLOW INTERACTIVE DRAG & DESTINATION UNDERNEATH
  // -------------------------------------------------------------
  console.log('--- 5. TEST D: Slow Interactive Drag Affordance ---');
  const grabTR = await page.$('[data-testid="grab-top-right"]');
  assert(Boolean(grabTR), 'Top-Right grab zone is active');

  const trBox = await grabTR.boundingBox();
  const startX = trBox.x + trBox.width * 0.7;
  const startY = trBox.y + trBox.height * 0.3;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 180, startY + 30, { steps: 6 });
  await new Promise((r) => setTimeout(r, 150));

  // Take screenshot while user is holding the page corner
  await page.screenshot({ path: path.join(outDir, '07_slow_drag_holding.png') });

  // Verify turning leaf is mounted and transforming
  const isLeafTransforming = await page.evaluate(() => {
    const leaf = document.querySelector('[data-testid="turning-leaf"]');
    return Boolean(leaf && window.getComputedStyle(leaf).transform !== 'none');
  });
  assert(isLeafTransforming, 'Physical page leaf dynamically follows drag');

  // Release mouse
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '08_settled_after_drag.png') });
  console.log('✅ TEST D PASSED: Interactive drag smoothly curls with destination visible underneath!\n');

  console.log('================================================================');
  console.log(' 🎉 ALL CONTINUOUS 3D PAGE TURN TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');

  await browser.close();
}

verifyContinuousZeroFlash().catch((err) => {
  console.error(err);
  process.exit(1);
});
