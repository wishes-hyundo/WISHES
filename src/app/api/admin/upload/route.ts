import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function verifyAuth(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.split(' ')[1] === (process.env.ADMIN_TOKEN || 'wishes2026');
}

// Generate watermark SVG overlay
function createWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(Math.round(width * 0.04), 16);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face { font-family: 'sans'; }
        .wm-text { 
          fill: rgba(255,255,255,0.35); 
          font-family: Arial, sans-serif; 
          font-size: ${fontSize}px; 
          font-weight: bold;
          letter-spacing: 4px;
        }
        .wm-text-shadow {
          fill: rgba(0,0,0,0.15);
          font-family: Arial, sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          letter-spacing: 4px;
        }
      </style>
    </defs>
    <g transform="rotate(-25, ${width/2}, ${height/2})">
      ${Array.from({length: Math.ceil(height / (fontSize * 4))}, (_, row) =>
        Array.from({length: Math.ceil(width / (fontSize * 8))}, (_, col) => {
          const x = col * fontSize * 8 + (row % 2 ? fontSize * 4 : 0);
          const y = row * fontSize * 4;
          return `<text x="${x+1}" y="${y+1}" class="wm-text-shadow">WISHES</text>
                  <text x="${x}" y="${y}" class="wm-text">WISHES</text>`;
        }).join('')
      ).join('')}
    </g>
    <rect x="${width * 0.02}" y="${height - fontSize * 3}" width="${fontSize * 10}" height="${fontSize * 2.5}" rx="8" fill="rgba(0,0,0,0.4)"/>
    <text x="${width * 0.02 + fontSize * 0.5}" y="${height - fontSize * 1.2}" fill="rgba(255,255,255,0.8)" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.7)}px" font-weight="bold" letter-spacing="3px">WISHES</text>
    <text x="${width * 0.02 + fontSize * 0.5}" y="${height - fontSize * 0.4}" fill="rgba(255,255,255,0.5)" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.4)}px">wishes.co.kr</text>
  </svg>`;
  return Buffer.from(svg);
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const listingId = formData.get('listingId') as string;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'JPG, PNG, WebP, GIF만 허용됩니다.' }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 20MB 이하만 가능합니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    // === STEP 1: Optimize original image ===
    const metadata = await sharp(buffer).metadata();
    const maxWidth = 1920;
    const maxHeight = 1440;

    let optimized = sharp(buffer);
    if ((metadata.width || 0) > maxWidth || (metadata.height || 0) > maxHeight) {
      optimized = optimized.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true });
    }
    const optimizedBuffer = await optimized
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // === STEP 2: Create watermarked version ===
    const wmMetadata = await sharp(optimizedBuffer).metadata();
    const wmWidth = wmMetadata.width || 1920;
    const wmHeight = wmMetadata.height || 1440;
    const watermarkSvg = createWatermarkSvg(wmWidth, wmHeight);

    const watermarkedBuffer = await sharp(optimizedBuffer)
      .composite([{ input: watermarkSvg, top: 0, left: 0 }])
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    // === STEP 3: Upload original (for admin) ===
    const originalPath = `originals/listing-${timestamp}-${random}.jpg`;
    const { error: origError } = await supabase.storage
      .from('listing-images')
      .upload(originalPath, optimizedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });
    if (origError) throw origError;

    // === STEP 4: Upload watermarked (for public) ===
    const watermarkedPath = `watermarked/listing-${timestamp}-${random}.jpg`;
    const { error: wmError } = await supabase.storage
      .from('listing-images')
      .upload(watermarkedPath, watermarkedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });
    if (wmError) throw wmError;

    // Get public URLs
    const { data: origUrl } = supabase.storage.from('listing-images').getPublicUrl(originalPath);
    const { data: wmUrl } = supabase.storage.from('listing-images').getPublicUrl(watermarkedPath);

    // Save to DB if listingId provided
    if (listingId) {
      await supabase.from('listing_images').insert({
        listing_id: parseInt(listingId),
        image_url: wmUrl.publicUrl,
        display_order: 0,
      });
    }

    const compressionRatio = Math.round((1 - optimizedBuffer.length / buffer.length) * 100);

    return NextResponse.json({
      success: true,
      url: wmUrl.publicUrl,
      originalUrl: origUrl.publicUrl,
      watermarkedUrl: wmUrl.publicUrl,
      originalSize: buffer.length,
      optimizedSize: optimizedBuffer.length,
      watermarkedSize: watermarkedBuffer.length,
      compressionRatio: `${compressionRatio}% 절감`,
      dimensions: { width: wmWidth, height: wmHeight },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: '업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
