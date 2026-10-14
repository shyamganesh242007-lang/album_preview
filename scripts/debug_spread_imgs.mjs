import puppeteer from 'puppeteer-core';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/album/1542d997-0318-4833-b4c7-1de5b5efff63', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  
  // Press ArrowRight to open cover
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 800));

  const infoSpread1 = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="physical-album-stage"]');
    const badge = document.querySelector('div.min-w-\\[130px\\]') || document.querySelector('div.text-xs.font-semibold.text-slate-800');
    const imgs = Array.from(stage.querySelectorAll('img')).map(i => {
      const r = i.getBoundingClientRect();
      return {
        alt: i.alt,
        src: i.src ? i.src.slice(-30) : '',
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        vis: window.getComputedStyle(i).visibility,
        parentVis: window.getComputedStyle(i.parentElement).visibility,
        parentParentVis: window.getComputedStyle(i.parentElement.parentElement).visibility,
        zIndex: window.getComputedStyle(i.closest('div[style*="z-index"]') || i).zIndex,
      };
    });
    return {
      label: badge?.textContent?.trim(),
      stageBox: stage.getBoundingClientRect(),
      imgs,
    };
  });
  console.log('Spread 1 info:', JSON.stringify(infoSpread1, null, 2));

  await browser.close();
})();
