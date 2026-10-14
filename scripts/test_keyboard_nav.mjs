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

  const getSpreadInfo = async () => {
    return await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="physical-album-stage"]');
      const text = document.body.innerText;
      const images = Array.from(stage?.querySelectorAll('img') || []).map(img => ({
        alt: img.alt,
        vis: window.getComputedStyle(img.closest('div[style*="visibility"]') || img).visibility,
        parentClass: img.parentElement?.parentElement?.className,
      }));
      const l2 = stage?.querySelector('.z-20');
      const l2Imgs = Array.from(l2?.querySelectorAll('img') || []).map(img => img.alt);
      return { l2Imgs, allImgs: images };
    });
  };

  console.log('Initial at Spread 0:', await getSpreadInfo());

  // Press ArrowRight to go to Spread 1
  console.log('Pressing ArrowRight...');
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 1000));
  console.log('After ArrowRight (Spread 1):', await getSpreadInfo());

  // Press ArrowLeft to go back to Spread 0
  console.log('Pressing ArrowLeft...');
  await page.keyboard.press('ArrowLeft');
  await new Promise(r => setTimeout(r, 1000));
  console.log('After ArrowLeft (Spread 0):', await getSpreadInfo());

  await browser.close();
}

main().catch(console.error);
