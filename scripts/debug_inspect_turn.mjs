import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = '1542d997-0318-4833-b4c7-1de5b5efff63';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  // Turn to Spread 1 (Pages 2-3)
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 800));

  // Now inspect layers right before turn
  const beforeTurn = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    return Array.from(stage.children).map((c, i) => {
      const cs = window.getComputedStyle(c);
      return {
        i,
        tag: c.tagName,
        className: c.className.slice(0, 60),
        zIndex: cs.zIndex,
        display: cs.display,
        visibility: cs.visibility,
        bg: cs.backgroundColor,
        imgs: Array.from(c.querySelectorAll('img')).map((img) => img.alt),
      };
    });
  });

  console.log('--- LAYERS ON RESTING SPREAD 1 ---');
  console.log(JSON.stringify(beforeTurn, null, 2));

  // Trigger next turn programmatically or via ArrowRight
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 150));

  const duringTurn = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return null;
    return Array.from(stage.children).map((c, i) => {
      const cs = window.getComputedStyle(c);
      return {
        i,
        tag: c.tagName,
        className: c.className.slice(0, 60),
        zIndex: cs.zIndex,
        display: cs.display,
        visibility: cs.visibility,
        bg: cs.backgroundColor,
        imgs: Array.from(c.querySelectorAll('img')).map((img) => img.alt),
        childVis: Array.from(c.children).map((ch) => ({
          tag: ch.tagName,
          vis: window.getComputedStyle(ch).visibility,
          bg: window.getComputedStyle(ch).backgroundColor,
          imgs: Array.from(ch.querySelectorAll('img')).map((img) => img.alt),
        })),
      };
    });
  });

  console.log('\n--- LAYERS DURING TURN (at 150ms) ---');
  console.log(JSON.stringify(duringTurn, null, 2));

  await browser.close();
}

main().catch(console.error);
