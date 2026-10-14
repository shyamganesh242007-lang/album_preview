import { storage } from '@/services/storage';
import { Album, AlbumPage, Correction } from '@/types/album';
import { processImageFile } from './imageProcessing';

/**
 * Renders a canvas directly to a binary WebP Blob
 */
function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create Blob from canvas'));
      },
      'image/webp',
      0.82
    );
  });
}

/**
 * Generates a wedding album front cover image blob using Canvas 2D
 */
async function generateCoverImageBlob(): Promise<Blob> {
  const width = 900;
  const height = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fdfbf7');
  gradient.addColorStop(1, '#f3ede2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Outer and inner double borders
  ctx.strokeStyle = '#d5c7b3';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  ctx.lineWidth = 1;
  ctx.strokeRect(55, 55, width - 110, height - 110);

  // Photo frame
  ctx.fillStyle = '#e8dfd3';
  ctx.fillRect(150, 220, 600, 580);

  // Photo placeholder silhouette
  ctx.fillStyle = '#d9cdbf';
  ctx.beginPath();
  ctx.arc(450, 460, 130, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#c4b5a2';
  ctx.beginPath();
  ctx.arc(410, 430, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(490, 430, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8c7e6c';
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PORTRAIT SESSION', 450, 720);

  // Typography
  ctx.fillStyle = '#2d2926';
  ctx.font = 'italic 44px Georgia, serif';
  ctx.fillText('Victoria & James', 450, 880);

  ctx.fillStyle = '#8c7e6c';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('OCTOBER TWELFTH, TWO THOUSAND TWENTY SIX', 450, 930);

  ctx.fillStyle = '#716250';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('Villa Rosa Estate • Tuscany', 450, 970);

  ctx.fillStyle = '#a4937f';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('ZEEBOOK STUDIO • LUXURY ALBUM PROOF', 450, 1100);

  return canvasToWebpBlob(canvas);
}

/**
 * Generates a wide 12x24 panoramic wedding spread (2000x1000, aspect ratio 2.0)
 * Designed to be split exactly through the center into Left Page and Right Page
 */
async function generateWideSpreadBlob(
  spreadTitle: string,
  leftHeading: string,
  rightHeading: string
): Promise<Blob> {
  const width = 2000;
  const height = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Spread background
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, width, height);

  // Central fold line indicator
  ctx.strokeStyle = '#e0d6c7';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(1000, 0);
  ctx.lineTo(1000, height);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- LEFT PAGE (0 to 1000) ---
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e8e0d5';
  ctx.lineWidth = 1;
  ctx.fillRect(80, 80, 840, 840);
  ctx.strokeRect(80, 80, 840, 840);

  ctx.fillStyle = '#ece4d8';
  ctx.fillRect(120, 120, 760, 580);

  ctx.fillStyle = '#dacdbc';
  ctx.beginPath();
  ctx.arc(500, 380, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2c2825';
  ctx.font = 'italic 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(leftHeading, 500, 770);

  ctx.fillStyle = '#8c7e6c';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('THE SACRED MOMENT • EXCHANGE OF RINGS', 500, 810);

  // --- RIGHT PAGE (1000 to 2000) ---
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1080, 80, 840, 840);
  ctx.strokeRect(1080, 80, 840, 840);

  // 2 photo frames on right page
  ctx.fillStyle = '#ece4d8';
  ctx.fillRect(1120, 120, 360, 520);

  ctx.fillStyle = '#e5dbce';
  ctx.fillRect(1520, 120, 360, 520);

  ctx.fillStyle = '#dacdbc';
  ctx.beginPath();
  ctx.arc(1300, 360, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(1700, 360, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#82725e';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('First Kiss', 1300, 560);
  ctx.fillText('Celebration', 1700, 560);

  ctx.fillStyle = '#2c2825';
  ctx.font = 'italic 30px Georgia, serif';
  ctx.fillText(rightHeading, 1500, 740);

  ctx.fillStyle = '#8c7e6c';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('HAPPILY EVER AFTER • TUSCANY VILLA ROSA', 1500, 780);

  // Bottom watermark
  ctx.fillStyle = '#b0a290';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${spreadTitle} (12 × 24 PANORAMIC SPREAD)`, 1000, 965);

  return canvasToWebpBlob(canvas);
}

/**
 * Generates a wedding album back cover image blob using Canvas 2D
 */
async function generateBackCoverImageBlob(): Promise<Blob> {
  const width = 900;
  const height = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f8f5ee');
  gradient.addColorStop(1, '#ece3d4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = '#d5c7b3';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  // Studio Seal / Monogram
  ctx.fillStyle = '#c4b5a2';
  ctx.beginPath();
  ctx.arc(450, 600, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Z', 450, 612);

  ctx.fillStyle = '#8c7e6c';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('ZEEBOOK LUXURY ALBUMS', 450, 710);
  ctx.fillText('HANDMADE IN FLORENCE • ITALIAN LEATHER', 450, 735);

  return canvasToWebpBlob(canvas);
}

/**
 * Creates and stores a complete demo wedding album with split spreads,
 * sample correction pins, and status.
 */
export async function createDemoWeddingAlbum(): Promise<Album> {
  const album = await storage.createAlbum({
    title: 'Victoria & James — Villa Rosa Wedding',
    clientName: 'Victoria Sterling',
    clientEmail: 'victoria.sterling@example.com',
    notes: '12x24 flush-mount album, silk cover, 20 panoramic spreads',
    status: 'In Review',
    pages: [],
    corrections: [],
    approvedAt: null,
    sourceType: 'images',
  });

  // 1. Generate Cover Blob
  const coverBlob = await generateCoverImageBlob();
  const coverFile = new File([coverBlob], 'Victoria_and_James_Cover.jpg', { type: 'image/jpeg' });
  const coverPages = await processImageFile(coverFile, album.id, 1, { isCover: true });

  // 2. Generate Panoramic Spread 1 (12x24 aspect ratio 2.0 -> will be split into Left and Right!)
  const spread1Blob = await generateWideSpreadBlob(
    'SPREAD 01',
    'The Vows & Promises',
    'Mr. & Mrs. Sterling'
  );
  const spread1File = new File([spread1Blob], 'Spread_01_Ceremony_12x24.jpg', { type: 'image/jpeg' });
  const spread1Pages = await processImageFile(spread1File, album.id, 2, false);

  // 3. Generate Panoramic Spread 2 (Reception & First Dance)
  const spread2Blob = await generateWideSpreadBlob(
    'SPREAD 02',
    'The First Dance',
    'Sunset & Champagne Toast'
  );
  const spread2File = new File([spread2Blob], 'Spread_02_Reception_12x24.jpg', { type: 'image/jpeg' });
  const spread2Pages = await processImageFile(spread2File, album.id, 4, false);

  // 4. Generate Back Cover Blob (Single Back Cover)
  const backCoverBlob = await generateBackCoverImageBlob();
  const backCoverFile = new File([backCoverBlob], 'Victoria_and_James_Back_Cover.jpg', { type: 'image/jpeg' });
  const backCoverPages = await processImageFile(backCoverFile, album.id, 6, { isBackCover: true });

  const allPages = [...coverPages, ...spread1Pages, ...spread2Pages, ...backCoverPages].map((p, idx) => ({
    ...p,
    order: idx + 1,
  }));

  // Create sample client correction pins
  const now = Date.now();
  const corrections: Correction[] = [];

  if (allPages[1]) {
    // Pin on Page 2 (Left page of spread 1)
    corrections.push({
      id: `corr_demo_1_${now}`,
      pageId: allPages[1].id,
      x: 0.5,
      y: 0.4,
      category: 'Photo Correction',
      comment: 'Could we soften the sun flare on the bride veil slightly?',
      status: 'Open',
      author: 'Victoria Sterling',
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
    });
  }

  if (allPages[2]) {
    // Pin on Page 3 (Right page of spread 1)
    corrections.push({
      id: `corr_demo_2_${now}`,
      pageId: allPages[2].id,
      x: 0.72,
      y: 0.38,
      category: 'Color Correction',
      comment: 'Please adjust color balance to be slightly warmer in this frame.',
      status: 'Open',
      author: 'Victoria Sterling',
      createdAt: now - 1800000,
      updatedAt: now - 1800000,
    });
  }

  const updatedAlbum = await storage.updateAlbum(album.id, {
    pages: allPages,
    corrections,
    updatedAt: now,
  });

  return updatedAlbum;
}
