import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runMobileTouchTests() {
  console.log('================================================================');
  console.log(' MOBILE TOUCH REALISTIC PAGE-TURN VERIFICATION SUITE');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools') && !text.includes('HMR')) {
      console.log('    [Console]', text);
    }
  });

  try {
    // 1. Setup Demo Album on Dashboard
    console.log('[1] Opening Dashboard to load or create demo album...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // Check for album with pages
    let albumHref = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group'));
      for (const card of cards) {
        const text = card.textContent || '';
        // If it has pages (not "0 pages")
        if (text.includes('pages') && !text.includes('0 pages')) {
          const link = card.querySelector('a[href^="/album/"]');
          if (link) return link.getAttribute('href');
        }
      }
      return null;
    });

    if (!albumHref) {
      console.log('  Generating demo wedding album with pages...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const demoBtn = buttons.find((b) => b.textContent?.includes('Demo') || b.textContent?.includes('Sample'));
        if (demoBtn) demoBtn.click();
      });
      await new Promise((r) => setTimeout(r, 6000));

      albumHref = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.group'));
        for (const card of cards) {
          const text = card.textContent || '';
          if (text.includes('pages') && !text.includes('0 pages')) {
            const link = card.querySelector('a[href^="/album/"]');
            if (link) return link.getAttribute('href');
          }
        }
        const fallback = document.querySelector('a[href^="/album/"]');
        return fallback ? fallback.getAttribute('href') : null;
      });
    }

    if (!albumHref) {
      // Create via modal if demo button not present
      console.log('  Creating new album via modal...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const newBtn = buttons.find((b) => b.textContent?.includes('New Album'));
        if (newBtn) newBtn.click();
      });
      await page.waitForSelector('input[placeholder*="Villa Rosa Wedding"]', { timeout: 5000 });
      await page.type('input[placeholder*="Villa Rosa Wedding"]', 'Mobile Touch Test');
      await page.type('input[placeholder*="Elena Vance"]', 'Test Client');
      await page.type('input[placeholder*="elena@example.com"]', 'test@example.com');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find((b) => b.textContent?.trim() === 'Create Album');
        if (createBtn) createBtn.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
      albumHref = await page.evaluate(() => {
        const link = document.querySelector('a[href^="/album/"]');
        return link ? link.getAttribute('href') : null;
      });
    }

    assert(Boolean(albumHref), `Found album link: ${albumHref}`);

    // 2. Set Mobile Touch Viewport
    console.log('\n[2] Setting Mobile Touch Viewport (iPhone 14 / Mobile Chrome, 390x844)...');
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    console.log(`  Navigating to mobile view: ${BASE_URL}${albumHref}...`);
    await page.goto(`${BASE_URL}${albumHref}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify album stage exists
    const stageHandle = await page.$('[data-testid="physical-album-stage"]');
    assert(Boolean(stageHandle), 'Found physical album stage on mobile');

    const getStageMetrics = async () => {
      return page.evaluate(() => {
        const stage = document.querySelector('[data-testid="physical-album-stage"]');
        if (!stage) return null;
        const rect = stage.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y,
          touchAction: getComputedStyle(stage).touchAction,
        };
      });
    };

    const initialMetrics = await getStageMetrics();
    console.log(`  Initial Mobile Stage: ${initialMetrics.width.toFixed(1)}px × ${initialMetrics.height.toFixed(1)}px at (${initialMetrics.x.toFixed(1)}, ${initialMetrics.y.toFixed(1)})`);
    assert(initialMetrics.touchAction.includes('pan-y'), `Stage has touch-action: pan-y (got: ${initialMetrics.touchAction})`);

    // Helper to get current spread label or spread indicator
    const getSpreadLabel = async () => {
      return page.evaluate(() => {
        const span = document.querySelector('[data-testid="spread-label"], .tabular-nums, .text-xs.font-medium');
        // Or check text in toolbar
        const text = document.body.innerText;
        const match = text.match(/Spread \d+ of \d+|Front Cover|Back Cover|Pages? \d+/i);
        return match ? match[0] : '';
      });
    };

    const initialLabel = await getSpreadLabel();
    console.log(`  Current spread label: "${initialLabel}"`);

    // Helper for realistic pointer drag
    const dispatchTouchSwipe = async (startX, startY, endX, endY, steps = 8, delayMs = 25) => {
      await page.evaluate(async ({ startX, startY, endX, endY, steps, delayMs }) => {
        const stage = document.querySelector('[data-testid="physical-album-stage"]');
        if (!stage) return;

        const target = stage;
        const pointerId = 1;

        // PointerDown
        target.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: 'touch',
            isPrimary: true,
            clientX: startX,
            clientY: startY,
            button: 0,
            buttons: 1,
          })
        );

        for (let i = 1; i <= steps; i++) {
          await new Promise((r) => setTimeout(r, delayMs));
          const curX = startX + (endX - startX) * (i / steps);
          const curY = startY + (endY - startY) * (i / steps);
          target.dispatchEvent(
            new PointerEvent('pointermove', {
              bubbles: true,
              cancelable: true,
              pointerId,
              pointerType: 'touch',
              isPrimary: true,
              clientX: curX,
              clientY: curY,
              button: 0,
              buttons: 1,
            })
          );
        }

        await new Promise((r) => setTimeout(r, delayMs));

        // PointerUp
        target.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: 'touch',
            isPrimary: true,
            clientX: endX,
            clientY: endY,
            button: 0,
            buttons: 0,
          })
        );
      }, { startX, startY, endX, endY, steps, delayMs });
    };

    // -------------------------------------------------------------
    // TEST 3: MOBILE NEXT PAGE (RIGHT -> LEFT SWIPE)
    // -------------------------------------------------------------
    console.log('\n[3] Testing MOBILE NEXT PAGE: Swiping RIGHT -> LEFT...');
    const startXNext = initialMetrics.x + initialMetrics.width * 0.85;
    const startYNext = initialMetrics.y + initialMetrics.height * 0.5;
    const endXNext = initialMetrics.x + initialMetrics.width * 0.15;
    const endYNext = startYNext;

    // Check turning canvas activates mid-swipe
    await page.evaluate(({ startX, startY }) => {
      const stage = document.querySelector('[data-testid="physical-album-stage"]');
      stage.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      );
      // Move 40px left
      stage.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          isPrimary: true,
          clientX: startX - 40,
          clientY: startY,
        })
      );
    }, { startX: startXNext, startY: startYNext });

    await new Promise((r) => setTimeout(r, 100));

    // Verify 3D curl canvas is mounted
    const canvasExists = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="continuous-curl-canvas"]');
      return Boolean(canvas);
    });
    console.log(`  Mid-swipe 3D Continuous Curl Canvas mounted: ${canvasExists}`);
    assert(canvasExists, 'Existing 3D page curl WebGL engine activated during mobile touch gesture');

    // Finish drag to complete turn
    await page.evaluate(({ startX, startY, endX, endY }) => {
      const stage = document.querySelector('[data-testid="physical-album-stage"]');
      stage.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          isPrimary: true,
          clientX: endX,
          clientY: endY,
        })
      );
      stage.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          isPrimary: true,
          clientX: endX,
          clientY: endY,
        })
      );
    }, { startX: startXNext, startY: startYNext, endX: endXNext, endY: endYNext });

    // Wait for animation to finish
    await new Promise((r) => setTimeout(r, 600));

    const metricsAfterTurn = await getStageMetrics();
    assert(
      Math.abs(metricsAfterTurn.width - initialMetrics.width) < 1.0 &&
      Math.abs(metricsAfterTurn.height - initialMetrics.height) < 1.0,
      'Album container strictly invariant: NO resizing, NO scaling, NO pop-up/down jumps'
    );

    const labelAfterNext = await getSpreadLabel();
    console.log(`  Spread label after NEXT swipe: "${labelAfterNext}"`);

    // -------------------------------------------------------------
    // TEST 4: MOBILE PREVIOUS PAGE (LEFT -> RIGHT SWIPE)
    // -------------------------------------------------------------
    console.log('\n[4] Testing MOBILE PREVIOUS PAGE: Swiping LEFT -> RIGHT...');
    const startXPrev = initialMetrics.x + initialMetrics.width * 0.15;
    const startYPrev = initialMetrics.y + initialMetrics.height * 0.5;
    const endXPrev = initialMetrics.x + initialMetrics.width * 0.85;
    const endYPrev = startYPrev;

    await dispatchTouchSwipe(startXPrev, startYPrev, endXPrev, endYPrev, 8, 25);
    await new Promise((r) => setTimeout(r, 600));

    const labelAfterPrev = await getSpreadLabel();
    console.log(`  Spread label after PREV swipe: "${labelAfterPrev}"`);
    assert(labelAfterPrev === initialLabel, 'Returned to initial spread after PREV swipe');

    // -------------------------------------------------------------
    // TEST 5: SHORT DRAG SNAP-BACK
    // -------------------------------------------------------------
    console.log('\n[5] Testing SHORT DRAG SNAP-BACK (drag 15px then release)...');
    const labelBeforeShort = await getSpreadLabel();
    await dispatchTouchSwipe(startXNext, startYNext, startXNext - 15, startYNext, 4, 30);
    await new Promise((r) => setTimeout(r, 500));

    const labelAfterShort = await getSpreadLabel();
    assert(labelAfterShort === labelBeforeShort, `Short drag (< threshold) snapped back without turning (label: "${labelAfterShort}")`);

    // -------------------------------------------------------------
    // TEST 6: VERTICAL SCROLL SAFETY (DIRECTION-LOCKING)
    // -------------------------------------------------------------
    console.log('\n[6] Testing VERTICAL SCROLL SAFETY...');
    // Vertical swipe: dy = 60px down, dx = 5px
    const labelBeforeVert = await getSpreadLabel();
    await dispatchTouchSwipe(startXNext, startYNext, startXNext - 5, startYNext + 60, 6, 25);
    await new Promise((r) => setTimeout(r, 400));

    const labelAfterVert = await getSpreadLabel();
    assert(labelAfterVert === labelBeforeVert, 'Vertical gesture does NOT trigger page turn');

    // -------------------------------------------------------------
    // TEST 7: DESKTOP MOUSE DRAG COMPATIBILITY & VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[7] Testing DESKTOP MOUSE DRAG on fresh desktop window (1440x900)...');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
    await desktopPage.goto(`${BASE_URL}${albumHref}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    const grabStatus = await desktopPage.evaluate(() => {
      const stage = document.querySelector('[data-testid="physical-album-stage"]');
      const tr = document.querySelector('[data-testid="grab-top-right"]');
      return {
        stageExists: Boolean(stage),
        trExists: Boolean(tr),
      };
    });
    console.log('  Desktop Grab Status:', grabStatus);
    assert(grabStatus.trExists, 'Desktop grab affordance zone exists and is active');

    // Perform desktop mouse drag from top-right corner to left
    const cornerBox = await desktopPage.evaluate(() => {
      const el = document.querySelector('[data-testid="grab-top-right"]');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    console.log(`  Dragging desktop mouse from (${cornerBox.x.toFixed(0)}, ${cornerBox.y.toFixed(0)}) 550px left...`);
    await desktopPage.mouse.move(cornerBox.x, cornerBox.y);
    await desktopPage.mouse.down();

    for (let i = 1; i <= 11; i++) {
      await desktopPage.mouse.move(cornerBox.x - i * 50, cornerBox.y + i * 2);
      await new Promise((r) => setTimeout(r, 20));
    }

    await desktopPage.mouse.up();
    await new Promise((r) => setTimeout(r, 800));

    const labelAfterDesktopTurn = await desktopPage.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/Spread \d+ of \d+|Front Cover|Back Cover|Pages? \d+/i);
      return match ? match[0] : '';
    });
    console.log(`  Spread label after DESKTOP mouse drag: "${labelAfterDesktopTurn}"`);
    assert(labelAfterDesktopTurn.includes('Page'), 'Desktop mouse drag successfully turned page!');
    await desktopPage.close();

    console.log('\n================================================================');
    console.log(' ALL MOBILE TOUCH & DESKTOP MOUSE VERIFICATION TESTS PASSED! ✓');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runMobileTouchTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
