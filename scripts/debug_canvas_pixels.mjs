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

  // Hook into canvas or WebGL
  const canvasDebug = await page.evaluate(async () => {
    // Trigger turnNext
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    // Let's inspect getImgElement for Page 1
    const img1 = stage.querySelector('img[alt="Page 1"]');
    return {
      img1: {
        complete: img1?.complete,
        naturalWidth: img1?.naturalWidth,
        naturalHeight: img1?.naturalHeight,
        src: img1?.src?.slice(0, 80),
      }
    };
  });
  console.log('IMG1 STATE:', canvasDebug);

  // Now press ArrowRight and check canvas immediately
  page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 80));

  const duringTurnDebug = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    const canvas = stage?.querySelector('canvas[data-testid="continuous-curl-canvas"]');
    if (!canvas) return 'NO CANVAS FOUND';
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const ctx2d = canvas.getContext('2d');
    
    // Check if any pixels are drawn
    let samplePixels = null;
    if (gl) {
      const pixels = new Uint8Array(4 * 4 * 4); // 4x4 sample
      gl.readPixels(canvas.width / 2, canvas.height / 2, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      samplePixels = Array.from(pixels);
    }
    return {
      canvasW: canvas.width,
      canvasH: canvas.height,
      hasGL: Boolean(gl),
      has2D: Boolean(ctx2d),
      samplePixels,
    };
  });
  console.log('DURING TURN CANVAS DEBUG:', duringTurnDebug);

  await browser.close();
}

main().catch(console.error);
