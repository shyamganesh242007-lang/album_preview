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
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  const debugInfo = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return 'No stage found';
    
    return Array.from(stage.children).map((c, i) => {
      const style = window.getComputedStyle(c);
      return {
        i,
        tag: c.tagName,
        className: c.className,
        zIndex: style.zIndex,
        display: style.display,
        visibility: style.visibility,
        innerHTML: c.innerHTML.slice(0, 150),
        imgs: Array.from(c.querySelectorAll('img')).map(img => ({
          alt: img.alt,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          parentClass: img.parentElement?.className,
          grandParentClass: img.parentElement?.parentElement?.className,
          rect: img.getBoundingClientRect(),
        }))
      };
    });
  });

  console.log('DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
  await browser.close();
}

main().catch(console.error);
