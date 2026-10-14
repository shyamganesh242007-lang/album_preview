import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCancel() {
  console.log('--- Testing CANCEL EXPORT ---');
  const { data: recentPages } = await supabase
    .from('album_pages')
    .select('album_id')
    .order('created_at', { ascending: false })
    .limit(1);

  const albumId = recentPages?.[0]?.album_id;
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Open Export Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find((b) => b.textContent && b.textContent.includes('Export Video'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // Start Export
  await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    const btns = Array.from(modal.querySelectorAll('button'));
    const exportBtn = btns.find((b) => b.textContent && b.textContent.trim().startsWith('Export Video'));
    if (exportBtn) exportBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Find and click "Cancel Export"
  const clickedCancel = await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.includes('Cancel Export')
    );
    if (cancelBtn) {
      cancelBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Cancel Export:', clickedCancel);

  await new Promise((r) => setTimeout(r, 1000));

  // Verify modal is back in ready state and NOT broken
  const stateAfterCancel = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    const text = modal ? modal.innerText : '';
    const exportBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim().startsWith('Export Video')
    );
    return {
      hasModal: Boolean(modal),
      hasExportButton: Boolean(exportBtn),
      isBroken: text.includes('Crash') || text.includes('Error:'),
    };
  });

  console.log('State after cancel:', stateAfterCancel);
  if (clickedCancel && stateAfterCancel.hasModal && stateAfterCancel.hasExportButton && !stateAfterCancel.isBroken) {
    console.log('✅ CANCEL EXPORT PASSED: Cancel cleanly resets state and restores modal!');
  } else {
    throw new Error('Cancel export test failed');
  }

  await browser.close();
}

testCancel().catch((err) => {
  console.error(err);
  process.exit(1);
});
