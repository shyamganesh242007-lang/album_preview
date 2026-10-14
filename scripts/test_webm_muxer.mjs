import puppeteer from 'puppeteer-core';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    // Dynamic import of webm-muxer
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'V_VP9',
        width: 1920,
        height: 1080,
        frameRate: 30,
      },
    });

    const init = {
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        console.error(e);
      },
    };

    const encoder = new VideoEncoder(init);
    encoder.configure({
      codec: 'vp09.00.10.08',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    const t0 = performance.now();
    const frameCount = 60; // 2 seconds of video
    for (let i = 0; i < frameCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#111827' : '#1e293b';
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px sans-serif';
      ctx.fillText(`Frame ${i}`, 100, 200);

      const timestamp = (i * 1_000_000) / 30; // microseconds
      const frame = new VideoFrame(canvas, { timestamp });
      encoder.encode(frame, { keyFrame: i % 30 === 0 });
      frame.close();
    }

    await encoder.flush();
    muxer.finalize();
    const t1 = performance.now();

    const buffer = muxer.target.buffer;
    return {
      success: true,
      bufferSize: buffer.byteLength,
      durationMs: t1 - t0,
      fps: (frameCount / ((t1 - t0) / 1000)).toFixed(1),
    };
  });

  console.log('Test result:', result);
  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
