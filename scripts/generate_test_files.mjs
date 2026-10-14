import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test-assets');

// 1. Valid PNG (Red/Gold wedding motif 200x200 RGBA)
// We can construct a minimal valid PNG or use a known valid PNG header + IDAT
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(pngBase64, 'base64');
fs.writeFileSync(path.join(outDir, 'test-photo.png'), pngBuffer);
console.log('✓ Created test-assets/test-photo.png');

// 2. Valid PDF (Single page wedding proof)
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Wedding Album Test PDF) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000337 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
419
%%EOF`;

fs.writeFileSync(path.join(outDir, 'test-album.pdf'), pdfContent);
console.log('✓ Created test-assets/test-album.pdf');
