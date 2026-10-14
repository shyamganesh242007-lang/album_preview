import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = '1542d997-0318-4833-b4c7-1de5b5efff63';

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function verifyBidirectional() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to album page...');
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  const stage = await page.$('[data-testid="physical-album-stage"]');
  const stageBox0 = await stage.boundingBox();
  console.log(`Front Cover Stage: ${stageBox0.width}x${stageBox0.height} at (${stageBox0.x}, ${stageBox0.y})`);

  // 1. TURN NEXT: Front Cover -> Spread 1
  console.log('\n--- TEST A: Right -> Left (Front Cover -> Spread 1) ---');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 700));

  const stageBox1 = await stage.boundingBox();
  console.log(`Spread 1 Stage: ${stageBox1.width}x${stageBox1.height} at (${stageBox1.x}, ${stageBox1.y})`);
  assert(Math.abs(stageBox1.width - stageBox0.width) < 1, 'Stage width invariant between cover and spread');
  assert(Math.abs(stageBox1.height - stageBox0.height) < 1, 'Stage height invariant between cover and spread');
  assert(Math.abs(stageBox1.x - stageBox0.x) < 1, 'Stage X invariant');
  assert(Math.abs(stageBox1.y - stageBox0.y) < 1, 'Stage Y invariant');

  // 2. TURN NEXT: Spread 1 -> Spread 2
  console.log('\n--- TEST B: Right -> Left (Spread 1 -> Spread 2) ---');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 700));

  const stageBox2 = await stage.boundingBox();
  console.log(`Spread 2 Stage: ${stageBox2.width}x${stageBox2.height} at (${stageBox2.x}, ${stageBox2.y})`);
  assert(Math.abs(stageBox2.width - stageBox1.width) < 1, 'Stage width invariant between inside spreads');
  assert(Math.abs(stageBox2.height - stageBox1.height) < 1, 'Stage height invariant between inside spreads');

  // 3. TURN PREV: Spread 2 -> Spread 1 (Left -> Right)
  console.log('\n--- TEST C: Left -> Right (Spread 2 -> Spread 1) ---');
  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 700));

  const stageBox3 = await stage.boundingBox();
  console.log(`Returned Spread 1 Stage: ${stageBox3.width}x${stageBox3.height} at (${stageBox3.x}, ${stageBox3.y})`);
  assert(Math.abs(stageBox3.width - stageBox2.width) < 1, 'Stage width invariant on backwards turn');
  assert(Math.abs(stageBox3.height - stageBox2.height) < 1, 'Stage height invariant on backwards turn');

  // 4. TURN PREV: Spread 1 -> Front Cover (Left -> Right)
  console.log('\n--- TEST D: Left -> Right (Spread 1 -> Front Cover) ---');
  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 700));

  const stageBox4 = await stage.boundingBox();
  console.log(`Returned Cover Stage: ${stageBox4.width}x${stageBox4.height} at (${stageBox4.x}, ${stageBox4.y})`);
  assert(Math.abs(stageBox4.width - stageBox0.width) < 1, 'Stage width invariant returning to cover');
  assert(Math.abs(stageBox4.height - stageBox0.height) < 1, 'Stage height invariant returning to cover');
  assert(Math.abs(stageBox4.x - stageBox0.x) < 1, 'Stage X invariant returning to cover');
  assert(Math.abs(stageBox4.y - stageBox0.y) < 1, 'Stage Y invariant returning to cover');

  console.log('\n🎉 ALL BIDIRECTIONAL ZERO-JUMP VERIFICATIONS PASSED (100%)!');
  await browser.close();
}

verifyBidirectional().catch((err) => {
  console.error(err);
  process.exit(1);
});
