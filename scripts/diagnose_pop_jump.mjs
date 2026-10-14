import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const albumId = '1542d997-0318-4833-b4c7-1de5b5efff63';

const outDir = path.resolve('test-artifacts', 'diagnose-pop');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function diagnose() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to album page...');
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Open to inside spread (e.g. Spread 2: Pages 4-5)
  console.log('Opening cover...');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 1200));

  console.log('Now at inside spread. Turning to next inside spread...');
  // Attach mutation observer and tracking
  await page.evaluate(() => {
    window.__log = [];
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    if (!stage) return;

    let startTime = performance.now();
    const interval = setInterval(() => {
      const rect = stage.getBoundingClientRect();
      const leftPage = stage.querySelector('.w-1\\/2');
      const leftRect = leftPage ? leftPage.getBoundingClientRect() : null;
      const imgs = Array.from(stage.querySelectorAll('img')).map((img) => {
        const r = img.getBoundingClientRect();
        return {
          alt: img.alt,
          src: img.src ? img.src.slice(-20) : '',
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          opacity: window.getComputedStyle(img).opacity,
          visibility: window.getComputedStyle(img).visibility,
        };
      });

      window.__log.push({
        t: Math.round(performance.now() - startTime),
        stageRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        leftRect: leftRect ? { x: Math.round(leftRect.x), y: Math.round(leftRect.y), w: Math.round(leftRect.width), h: Math.round(leftRect.height) } : null,
        imgs,
      });

      if (performance.now() - startTime > 1200) {
        clearInterval(interval);
      }
    }, 25);
  });

  // Trigger turn
  await page.keyboard.press('ArrowRight');

  // Capture snapshots at critical moments
  for (let i = 0; i <= 10; i++) {
    await page.screenshot({ path: path.join(outDir, `frame_${String(i).padStart(2, '0')}.png`) });
    await new Promise((r) => setTimeout(r, 60));
  }

  const logs = await page.evaluate(() => window.__log);
  console.log('Recorded timeline:');
  logs.forEach((l) => {
    console.log(`t=${String(l.t).padStart(4, ' ')}ms | Stage: (${l.stageRect.x}, ${l.stageRect.y}, ${l.stageRect.w}x${l.stageRect.h}) | Imgs: ${l.imgs.map(i => `${i.alt}: (${Math.round(i.rect.x)}, ${Math.round(i.rect.y)}, ${Math.round(i.rect.w)}x${Math.round(i.rect.h)}, op=${i.opacity})`).join(' | ')}`);
  });

  fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(logs, null, 2));

  await browser.close();
}

diagnose().catch(console.error);
