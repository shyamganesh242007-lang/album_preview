import puppeteer from 'puppeteer-core';

async function testModal() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800)); // wait for React hydration

  // Click New Album using evaluate directly
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const newBtn = btns.find((b) => b.innerText.includes('New Album'));
    if (newBtn) newBtn.click();
  });

  await page.waitForSelector('form input', { timeout: 4000 });
  const inputs = await page.$$('form input');
  console.log('Success! Modal opened with', inputs.length, 'inputs');
  await browser.close();
}

testModal().catch(console.error);
