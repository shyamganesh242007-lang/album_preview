import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';

async function testPdf() {
  const filePath = path.resolve('test-assets/test-multipage-album.pdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  console.log('Loading PDF from', filePath, 'bytes:', data.length);

  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully! numPages =', pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      console.log(`Page ${i}: width = ${vp.width}, height = ${vp.height}, ratio = ${(vp.width / vp.height).toFixed(2)}`);
    }
  } catch (err) {
    console.error('PDF loading error:', err);
  }
}

testPdf();
