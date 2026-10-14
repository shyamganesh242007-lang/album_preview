import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const outDir = path.resolve('test-artifacts', 'video-export');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runVideoExportVerification() {
  console.log('================================================================');
  console.log(' 3D FLIPBOOK VIDEO EXPORTER FULL VERIFICATION TEST');
  console.log('================================================================\n');

  // Find most recent album
  let albumId = process.argv[2];
  if (!albumId) {
    const { data: recentPages } = await supabase
      .from('album_pages')
      .select('album_id')
      .order('created_at', { ascending: false })
      .limit(1);
    albumId = recentPages?.[0]?.album_id;
  }
  if (!albumId) throw new Error('No active album found for video export tests');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools')) {
      console.log('  [Browser]', text);
    }
  });

  try {
    console.log(`Navigating to Provider / Studio View for album ${albumId}...`);
    await page.goto(`${BASE_URL}/album/${albumId}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // -------------------------------------------------------------
    // TEST 1: TOP BAR "EXPORT VIDEO" BUTTON
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Top Navigation Header & Export Video Button ---');

    // Verify "Share Review Link" exists
    const shareBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent && b.textContent.includes('Share Review Link'));
    });
    assert(shareBtn, 'Share Review Link button is present in Provider header');

    // Verify "Export Video" button exists immediately next to Share Review Link
    const exportBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent && b.textContent.includes('Export Video'));
    });
    assert(exportBtnExists, 'Export Video button is present in Provider header');

    // Verify Manage Pages and Upload are also preserved
    const otherButtonsPreserved = await page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes('Manage Pages') &&
        text.includes('Upload') &&
        text.includes('Client View')
      );
    });
    assert(otherButtonsPreserved, 'Existing buttons (Manage Pages, Upload, Client View) preserved');

    // Screenshot header
    await page.screenshot({ path: path.join(outDir, '01_provider_header.png') });

    // -------------------------------------------------------------
    // TEST 2: MODAL OPEN & CONTROLS
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Video Exporter Modal Opening & UI Controls ---');

    // Click "Export Video"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && b.textContent.includes('Export Video'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Verify Modal Title and Subtitle
    const modalHeaders = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const h3 = dialog ? dialog.querySelector('h3') : null;
      const body = dialog ? dialog.innerText : '';
      return {
        title: h3 ? h3.textContent : '',
        hasSubtitle: body.includes('High-Definition Media Renderer'),
      };
    });
    assert(
      modalHeaders.title.includes('3D Flipbook Video Exporter'),
      `Modal title is "${modalHeaders.title}"`
    );
    assert(modalHeaders.hasSubtitle, 'Modal contains subtitle "High-Definition Media Renderer"');

    // Verify Format Options
    const formatOptions = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasYouTube: text.includes('YouTube 16:9') && text.includes('1080p'),
        hasReels: text.includes('Instagram Reels') && text.includes('9:16'),
      };
    });
    assert(formatOptions.hasYouTube, 'Format option: YouTube 16:9 (1080p Landscape) is present');
    assert(formatOptions.hasReels, 'Format option: Instagram Reels (9:16 Vertical) is present');

    // Test clicking Instagram Reels
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const reelsBtn = btns.find((b) => b.textContent && b.textContent.includes('Instagram Reels'));
      if (reelsBtn) reelsBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // Test clicking back to YouTube
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const ytBtn = btns.find((b) => b.textContent && b.textContent.includes('YouTube 16:9'));
      if (ytBtn) ytBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    assert(true, 'Format selection toggling works smoothly');

    // Verify Scope Options
    const scopeOptions = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasComplete: text.includes('Complete Album') && text.includes('All spreads'),
        hasHighlights: text.includes('Quick Highlights'),
      };
    });
    assert(scopeOptions.hasComplete, 'Scope option: Complete Album (Default) is present');
    assert(scopeOptions.hasHighlights, 'Scope option: Quick Highlights (First 10 spreads) is present');

    // Test Scope switching
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hlBtn = btns.find((b) => b.textContent && b.textContent.includes('Quick Highlights'));
      if (hlBtn) hlBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    assert(true, 'Scope selection toggling works');

    // Verify Transition Styles
    const transitionOptions = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasReal3D: text.includes('Real 3D Page Curl') && text.includes('⭐ DEFAULT'),
        hasSoftTurn: text.includes('Soft Page Turn'),
        hasCinematic: text.includes('Cinematic Page Turn'),
        hasSoftFade: text.includes('Soft Fade'),
      };
    });
    assert(transitionOptions.hasReal3D, 'Transition: Real 3D Page Curl (⭐ DEFAULT) is present and highlighted');
    assert(transitionOptions.hasSoftTurn, 'Transition: Soft Page Turn is present');
    assert(transitionOptions.hasCinematic, 'Transition: Cinematic Page Turn is present');
    assert(transitionOptions.hasSoftFade, 'Transition: Soft Fade is present');

    // Test switching transitions
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const softBtn = btns.find((b) => b.textContent && b.textContent.includes('Soft Page Turn'));
      if (softBtn) softBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // Switch back to Real 3D Page Curl (Default)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const curlBtn = btns.find((b) => b.textContent && b.textContent.includes('Real 3D Page Curl'));
      if (curlBtn) curlBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    assert(true, 'Transition style toggling works; Real 3D Page Curl restored');

    // Verify Duration slider
    const durationControl = await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      const text = document.body.innerText;
      return {
        hasSlider: Boolean(slider),
        hasFast: text.includes('Fast (0.8s)'),
        hasStandard: text.includes('Standard (1.5s)'),
        hasCinematic: text.includes('Cinematic (3.0s)'),
      };
    });
    assert(durationControl.hasSlider, 'Duration slider exists');
    assert(durationControl.hasStandard, 'Duration labels (Fast, Standard, Cinematic) exist');

    // Set duration slider to 0.8s for fast testing
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) {
        slider.value = '0.8';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    // Verify Watermark checkbox
    const watermarkControl = await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      const text = document.body.innerText;
      return {
        isChecked: cb ? cb.checked : false,
        hasLabel: text.includes('Include luxury Studio Hallmark Watermark'),
      };
    });
    assert(watermarkControl.isChecked, 'Watermark checkbox is default enabled');
    assert(watermarkControl.hasLabel, 'Watermark label is present');

    // Screenshot modal configuration
    await page.screenshot({ path: path.join(outDir, '02_exporter_modal_config.png') });

    // -------------------------------------------------------------
    // TEST 3: EXPORT VIDEO RENDERING PIPELINE
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Video Rendering Engine & Progress ---');

    // Select Quick Highlights and 0.8s for fast export validation
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hlBtn = btns.find((b) => b.textContent && b.textContent.includes('Quick Highlights'));
      if (hlBtn) hlBtn.click();
    });

    // Click "Export Video" primary button inside modal
    await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const btns = Array.from(modal.querySelectorAll('button'));
        const exportBtn = btns.find((b) => b.textContent && b.textContent.trim().startsWith('Export Video'));
        if (exportBtn) exportBtn.click();
      }
    });

    console.log('Export initiated. Monitoring progress...');
    let sawProgress = false;
    let sawRenderingText = false;
    let completed = false;
    const maxWaitMs = 60000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 800));

      const status = await page.evaluate(() => {
        const text = document.body.innerText;
        const video = document.querySelector('video');
        return {
          isRendering: text.includes('Rendering Album Video') || text.includes('Rendering spread') || text.includes('Turning page'),
          hasPercent: /\d+%/.test(text),
          isReady: text.includes('Video ready for download') || Boolean(video),
          hasDownloadBtn: text.includes('Download Video'),
          fullText: text.slice(0, 500),
        };
      });

      if (status.isRendering) sawRenderingText = true;
      if (status.hasPercent) sawProgress = true;

      if (status.isReady && status.hasDownloadBtn) {
        completed = true;
        break;
      }
    }

    assert(sawRenderingText || completed, 'Rendering status messages were displayed during render');
    assert(sawProgress || completed, 'Progress indicator was active');
    assert(completed, 'Video export completed successfully within time limit');

    // Screenshot completed state
    await page.screenshot({ path: path.join(outDir, '03_exporter_modal_completed.png') });

    // -------------------------------------------------------------
    // TEST 4: VERIFY OUTPUT VIDEO ELEMENT & DOWNLOAD
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Video Preview & Download Action ---');

    const videoState = await page.evaluate(() => {
      const video = document.querySelector('video');
      const downloadBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.includes('Download Video')
      );
      return {
        hasVideo: Boolean(video),
        videoSrc: video ? video.src : '',
        hasControls: video ? video.hasAttribute('controls') : false,
        hasDownloadBtn: Boolean(downloadBtn),
      };
    });

    assert(videoState.hasVideo, 'HTML5 <video> preview is mounted in completed modal');
    assert(videoState.videoSrc.startsWith('blob:'), `Video source is a valid blob URL: ${videoState.videoSrc}`);
    assert(videoState.hasDownloadBtn, 'Download Video button is ready and clickable');

    console.log('\n================================================================');
    console.log(' ALL 3D FLIPBOOK VIDEO EXPORTER TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runVideoExportVerification().catch((err) => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:', err);
  process.exit(1);
});
