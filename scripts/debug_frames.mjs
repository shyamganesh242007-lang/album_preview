import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const albumId = 'ecbaf9c8-4d5d-450d-a7a0-5e6330eae057';

async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/album/' + albumId, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Pressing ArrowRight...');
  await page.keyboard.press('ArrowRight');
  
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 50));
    const data = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-testid="continuous-curl-canvas"]');
      if (!canvas) return { hasCanvas: false };
      return {
        hasCanvas: true,
        w: canvas.width,
        h: canvas.height,
      };
    });
    console.log(`Frame ${i}:`, JSON.stringify(data));
    await page.screenshot({ path: `scripts/frame_${i}.png` });
  }
  await browser.close();
}

run().catch(console.error);
