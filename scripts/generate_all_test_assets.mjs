import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test-assets');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Helper to draw canvas to JPEG buffer
  async function makeImage(width, height, drawFn) {
    const base64 = await page.evaluate(
      ({ w, h, code }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const fn = new Function('ctx', 'w', 'h', code);
        fn(ctx, w, h);
        return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      },
      { w: width, h: height, code: drawFn }
    );
    return Buffer.from(base64, 'base64');
  }

  // 1. Portrait JPG (800x1200, ratio 0.67)
  const portraitBuf = await makeImage(
    800,
    1200,
    `
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c4b5a2';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#2c2825';
    ctx.font = 'bold 36px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('PORTRAIT PAGE', w / 2, h / 2);
    ctx.font = '18px sans-serif';
    ctx.fillText('Aspect Ratio 0.67 (Single)', w / 2, h / 2 + 50);
  `
  );
  fs.writeFileSync(path.join(outDir, 'test-portrait.jpg'), portraitBuf);
  console.log('✓ Created test-assets/test-portrait.jpg (800x1200)');

  // 2. Wide Spread 12x24 JPG (2400x1200, ratio 2.0)
  const spreadBuf = await makeImage(
    2400,
    1200,
    `
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b0a290';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEFT HALF SPREAD', w / 4, h / 2);
    ctx.fillText('RIGHT HALF SPREAD', (3 * w) / 4, h / 2);

    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('12x24 Panoramic Layout (Ratio 2.0)', w / 2, h - 80);
  `
  );
  fs.writeFileSync(path.join(outDir, 'test-spread-12x24.jpg'), spreadBuf);
  console.log('✓ Created test-assets/test-spread-12x24.jpg (2400x1200, ratio 2.0)');

  // 3. Normal Landscape Single JPG (1500x1000, ratio 1.5, standard 3:2 landscape photo)
  const landscapeBuf = await makeImage(
    1500,
    1000,
    `
    ctx.fillStyle = '#f0f9ff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SINGLE LANDSCAPE PHOTO (3:2)', w / 2, h / 2);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#0284c7';
    ctx.fillText('Ratio 1.50 < 1.6 (Must Remain Single)', w / 2, h / 2 + 50);
  `
  );
  fs.writeFileSync(path.join(outDir, 'test-single-landscape.jpg'), landscapeBuf);
  console.log('✓ Created test-assets/test-single-landscape.jpg (1500x1000, ratio 1.5)');

  // 4. Wide Cover Image (2400x1200, ratio 2.0)
  const wideCoverBuf = await makeImage(
    2400,
    1200,
    `
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 44px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('WIDE FRONT COVER', w / 2, h / 2);
    ctx.font = '20px sans-serif';
    ctx.fillText('Wide Cover Must Remain SINGLE', w / 2, h / 2 + 50);
  `
  );
  fs.writeFileSync(path.join(outDir, 'test-wide-cover.jpg'), wideCoverBuf);
  console.log('✓ Created test-assets/test-wide-cover.jpg (2400x1200)');

  // 5. Wide Back Cover Image (2400x1200, ratio 2.0)
  const wideBackBuf = await makeImage(
    2400,
    1200,
    `
    ctx.fillStyle = '#f3e8ff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#9333ea';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#581c87';
    ctx.font = 'bold 44px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('WIDE BACK COVER', w / 2, h / 2);
    ctx.font = '20px sans-serif';
    ctx.fillText('Wide Back Cover Must Remain SINGLE', w / 2, h / 2 + 50);
  `
  );
  fs.writeFileSync(path.join(outDir, 'test-wide-backcover.jpg'), wideBackBuf);
  console.log('✓ Created test-assets/test-wide-backcover.jpg (2400x1200)');

  await browser.close();

  // 6. Valid 4-page PDF with mixed dimensions
  // Page 1: Portrait Cover (600x900)
  // Page 2: Wide Spread (1600x800, ratio 2.0)
  // Page 3: Portrait Single (600x900)
  // Page 4: Wide Back Cover (1600x800, ratio 2.0)
  const pdfSource = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 900] /Contents 4 0 R /Resources << /Font << /F1 11 0 R >> >> >>
endobj
4 0 obj
<< /Length 58 >>
stream
BT
/F1 24 Tf
150 750 Td
(PDF PAGE 1 - FRONT COVER) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1600 800] /Contents 6 0 R /Resources << /Font << /F1 11 0 R >> >> >>
endobj
6 0 obj
<< /Length 64 >>
stream
BT
/F1 28 Tf
450 650 Td
(PDF PAGE 2 - WIDE SPREAD SPREAD) Tj
ET
endstream
endobj

7 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 900] /Contents 8 0 R /Resources << /Font << /F1 11 0 R >> >> >>
endobj
8 0 obj
<< /Length 62 >>
stream
BT
/F1 24 Tf
150 750 Td
(PDF PAGE 3 - MIDDLE SINGLE PAGE) Tj
ET
endstream
endobj

9 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1600 800] /Contents 10 0 R /Resources << /Font << /F1 11 0 R >> >> >>
endobj
10 0 obj
<< /Length 57 >>
stream
BT
/F1 28 Tf
450 650 Td
(PDF PAGE 4 - WIDE BACK COVER) Tj
ET
endstream
endobj

11 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 12
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000130 00000 n 
0000000259 00000 n 
0000000368 00000 n 
0000000498 00000 n 
0000000613 00000 n 
0000000742 00000 n 
0000000855 00000 n 
0000000985 00000 n 
0000001093 00000 n 
trailer
<< /Size 12 /Root 1 0 R >>
startxref
1175
%%EOF`;

  fs.writeFileSync(path.join(outDir, 'test-multipage-album.pdf'), pdfSource);
  console.log('✓ Created test-assets/test-multipage-album.pdf (4 pages with mixed dimensions)');
}

main().catch(console.error);
