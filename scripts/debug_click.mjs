import puppeteer from 'puppeteer-core';

async function debugPage() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  
  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('Evaluating click on New Album button...');
  const res = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.innerText.includes('New Album'));
    if (!b) return 'Button not found';
    b.click();
    return 'Clicked button: ' + b.innerText;
  });
  console.log('Click result:', res);

  await new Promise((r) => setTimeout(r, 1000));
  const hasModal = await page.evaluate(() => {
    return document.body.innerText.includes('Create New Wedding Album');
  });
  console.log('Modal visible in body text?', hasModal);

  await browser.close();
}

debugPage().catch(console.error);
