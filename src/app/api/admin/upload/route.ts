import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2';
import sharp from 'sharp';

function verifyAuth(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth === 'wishes2026') return true;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.split(' ')[1] === (process.env.ADMIN_TOKEN || 'wishes2026');
  }
  const adminSession = request.cookies.get('admin_session');
  if (adminSession?.value === 'wishes2026') return true;
  return false;
}

// WISHES logo watermark SVG
function createWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(Math.round(width * 0.035), 14);
  const logoAreaH = Math.round(height * 0.12);

  const svg = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" style="stop-color:rgba(0,0,0,0.45)"/>' +
    '<stop offset="100%" style="stop-color:rgba(0,0,0,0.25)"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect x="0" y="' + (height - logoAreaH) + '" width="' + width + '" height="' + logoAreaH + '" fill="url(#g)"/>' +
    '<text x="' + Math.round(width * 0.03) + '" y="' + Math.round(height - logoAreaH / 2 + fontSize / 3) + '" ' +
    'font-family="Arial,Helvetica,sans-serif" font-size="' + fontSize + '" font-weight="bold" fill="white" opacity="0.9">' +
    'WISHES' +
    '</text>' +
    '<text x="' + Math.round(width * 0.03 + fontSize * 4.2) + '" y="' + Math.round(height - logoAreaH / 2 + fontSize / 3) + '" ' +
    'font-family="Arial,Helvetica,sans-serif" font-size="' + Math.round(fontSize * 0.65) + '" fill="white" opacity="0.7">' +
    'wishes.co.kr' +
    '</text>' +
    '</svg>';

  return Buffer.from(svg);
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    // Support both 'files' (plural) and 'file' (singular) field names
    let files = formData.getAll('files') as File[];
    if (files.length === 0) {
      files = formData.getAll('file') as File[];
    }
    const listingId = (formData.get('listingId') as string) || ('temp_' + Date.now());
    const addWatermark = formData.get('watermark') !== 'false';

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Resize to max 1920x1440
      let processed = sharp(buffer).resize(1920, 1440, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // Get resized dimensions for watermark
      const resizedBuf = await processed.clone().toBuffer({ resolveWithObject: true });
      const finalW = resizedBuf.info.width;
      const finalH = resizedBuf.info.height;

      // Add watermark if enabled
      if (addWatermark) {
        const watermarkSvg = createWatermarkSvg(finalW, finalH);
        processed = sharp(resizedBuf.data).composite([
          { input: watermarkSvg, gravity: 'southeast' }
        ]);
      }

      // Convert to WebP
      const compressed = await processed.webp({ quality: 82 }).toBuffer();

      const timestamp = Date.now();
      const key = 'listings/' + listingId + '/' + timestamp + '_' + i + '.webp';

      const url = await uploadToR2(key, compressed, 'image/webp');
      uploadedUrls.push(url);
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      url: uploadedUrls[0],
      data: { url: uploadedUrls[0], urls: uploadedUrls },
      count: uploadedUrls.length,
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
