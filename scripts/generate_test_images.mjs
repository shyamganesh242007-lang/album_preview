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

  // 1. Generate Single Portrait Image (800 x 1200)
  const portraitBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, 800, 1200);
    
    // Border
    ctx.strokeStyle = '#d5c7b3';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 760, 1160);
    
    // Image box
    ctx.fillStyle = '#e5dacf';
    ctx.fillRect(100, 200, 600, 600);
    
    ctx.fillStyle = '#2c2825';
    ctx.font = 'italic 36px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('Bride & Groom Portrait', 400, 900);
    
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#8c7e6c';
    ctx.fillText('PAGE 01 - SINGLE PORTRAIT', 400, 950);
    
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });

  fs.writeFileSync(path.join(outDir, 'test-portrait.jpg'), Buffer.from(portraitBase64, 'base64'));
  console.log('Saved test-portrait.jpg (800x1200)');

  // 2. Generate Wide Spread (2400 x 1200, Aspect Ratio 2.0 -> 12x24 wedding spread)
  const spreadBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#f5f0eb';
    ctx.fillRect(0, 0, 2400, 1200);
    
    // Split line in center
    ctx.strokeStyle = '#c4b5a2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1200, 0);
    ctx.lineTo(1200, 1200);
    ctx.stroke();
    
    // Left Page content
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(80, 80, 1040, 1040);
    ctx.fillStyle = '#e0d5c5';
    ctx.fillRect(140, 140, 920, 700);
    ctx.fillStyle = '#2b2724';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEFT PAGE (PAGE A)', 600, 940);
    
    // Right Page content
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1280, 80, 1040, 1040);
    ctx.fillStyle = '#d5c7b5';
    ctx.fillRect(1340, 140, 920, 700);
    ctx.fillStyle = '#2b2724';
    ctx.fillText('RIGHT PAGE (PAGE B)', 1800, 940);
    
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });

  fs.writeFileSync(path.join(outDir, 'test-spread-12x24.jpg'), Buffer.from(spreadBase64, 'base64'));
  console.log('Saved test-spread-12x24.jpg (2400x1200, aspect ratio 2.0)');

  await browser.close();
}

main().catch(console.error);
