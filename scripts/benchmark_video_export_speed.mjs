import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runBenchmark() {
  console.log('================================================================');
  console.log(' 3D FLIPBOOK VIDEO EXPORT PERFORMANCE BENCHMARK (20+ SPREADS)');
  console.log('================================================================\n');

  const { data: recentPages } = await supabase
    .from('album_pages')
    .select('album_id')
    .order('created_at', { ascending: false })
    .limit(1);

  const albumId = recentPages?.[0]?.album_id;
  if (!albumId) throw new Error('No album found');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Opening Video Exporter modal...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find((b) => b.textContent && b.textContent.includes('Export Video'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Configure: Complete Album (all 20-46 spreads!), Real 3D Page Curl, 1080p YouTube
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const compBtn = btns.find((b) => b.textContent && b.textContent.includes('Complete Album'));
    if (compBtn) compBtn.click();
    const curlBtn = btns.find((b) => b.textContent && b.textContent.includes('Real 3D Page Curl'));
    if (curlBtn) curlBtn.click();
  });

  console.log('Starting full album export benchmark...');
  const tStart = Date.now();

  // Click Export Video
  await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    if (modal) {
      const btns = Array.from(modal.querySelectorAll('button'));
      const exportBtn = btns.find((b) => b.textContent && b.textContent.trim().startsWith('Export Video'));
      if (exportBtn) exportBtn.click();
    }
  });

  let completed = false;
  let lastProgress = '';
  const maxWaitMs = 180000; // 3 minutes max

  while (Date.now() - tStart < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 600));

    const status = await page.evaluate(() => {
      const text = document.body.innerText;
      const video = document.querySelector('video');
      const progressMatch = text.match(/Rendering spread (\d+) of (\d+)/) || text.match(/Turning page to spread (\d+) of (\d+)/);
      const percentMatch = text.match(/(\d+)%/);
      return {
        progressText: progressMatch ? progressMatch[0] : '',
        percent: percentMatch ? percentMatch[1] + '%' : '',
        isReady: text.includes('Video ready for download') || Boolean(video),
        videoSrc: video ? video.src : '',
      };
    });

    const currentMsg = `${status.progressText} [${status.percent}]`;
    if (currentMsg !== lastProgress && status.percent) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log(`  ⏱️ [${elapsed}s] ${currentMsg}`);
      lastProgress = currentMsg;
    }

    if (status.isReady) {
      completed = true;
      break;
    }
  }

  const tTotal = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log('\n----------------------------------------------------------------');
  console.log(`🎯 BENCHMARK RESULTS:`);
  console.log(`   Export Completed: ${completed ? 'YES ✅' : 'NO ❌'}`);
  console.log(`   Total Wall-Clock Time: ${tTotal} seconds`);
  console.log('----------------------------------------------------------------\n');

  await browser.close();
}

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
