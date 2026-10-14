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
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Let's inspect React props on PhysicalPageTurnStage
  const stageInfo = await page.evaluate(() => {
    // Find the fiber node
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    const key = Object.keys(stage || {}).find(k => k.startsWith('__reactFiber'));
    if (!key) return 'No react fiber found';
    let fiber = stage[key];
    while (fiber && !fiber.memoizedProps?.currentSpread) {
      fiber = fiber.return;
    }
    const props = fiber ? fiber.memoizedProps : null;
    return {
      currentSpread: props?.currentSpread,
      nextSpread: props?.nextSpread,
      prevSpread: props?.prevSpread,
      fitWidth: props?.fitWidth,
      fitHeight: props?.fitHeight,
    };
  });

  console.log('STAGE PROPS:', JSON.stringify(stageInfo, null, 2));

  await browser.close();
}

main().catch(console.error);
