import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testWebCodecs() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000');

  const result = await page.evaluate(async () => {
    if (typeof VideoEncoder === 'undefined') {
      return { supported: false, reason: 'VideoEncoder undefined' };
    }

    try {
      const config = {
        codec: 'vp09.00.10.08', // VP9 Profile 0, Level 1.0, 8-bit
        width: 1920,
        height: 1080,
        bitrate: 6_000_000,
        framerate: 30,
      };

      const support = await VideoEncoder.isConfigSupported(config);
      return { supported: true, support };
    } catch (err) {
      return { supported: false, error: err.message };
    }
  });

  console.log('WebCodecs support test result:', JSON.stringify(result, null, 2));
  await browser.close();
}

testWebCodecs().catch(console.error);
