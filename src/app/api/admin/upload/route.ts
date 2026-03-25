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

// WISHES 공식 로고 워터마크 SVG
function createWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(Math.round(width * 0.035), 14);
  const logoAreaH = Math.round(height * 0.12);
  const logoSize = Math.round(logoAreaH * 0.7);

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .wm-text { fill: rgba(255,255,255,0.25); font-family: Arial, sans-serif; font-size: ${fontSize}px; font-weight: bold; letter-spacing: 3px; }
      .wm-shadow { fill: rgba(0,0,0,0.1); font-family: Arial, sans-serif; font-size: ${fontSize}px; font-weight: bold; letter-spacing: 3px; }
    </style>
    <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(20,50,45,0.8)"/>
      <stop offset="100%" stop-color="rgba(30,70,60,0.7)"/>
    </linearGradient>
  </defs>
  <g transform="rotate(-25, ${width/2}, ${height/2})">
    ${Array.from({length: Math.ceil(height / (fontSize * 5))}, (_, row) =>
      Array.from({length: Math.ceil(width / (fontSize * 9))}, (_, col) => {
        const x = col * fontSize * 9 + (row % 2 ? fontSize * 4.5 : 0);
        const y = row * fontSize * 5;
        return `<text x="${x+1}" y="${y+1}" class="wm-shadow">WISHES</text>
                <text x="${x}" y="${y}" class="wm-text">WISHES</text>`;
      }).join('')
    ).join('')}
  </g>
  <rect x="${Math.round(width * 0.015)}" y="${height - logoAreaH - Math.round(height * 0.015)}"
        width="${Math.round(Math.min(logoSize * 5, width * 0.32))}" height="${logoAreaH}"
        rx="8" fill="url(#logoBg)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <g transform="translate(${Math.round(width * 0.015) + Math.round(logoAreaH * 0.15)}, ${height - logoAreaH - Math.round(height * 0.015) + Math.round(logoAreaH * 0.12)}) scale(${logoSize * 0.008})">
    <rect x="2" y="22" width="22" height="22" rx="2" fill="rgba(255,255,255,0.7)"/>
    <circle cx="13" cy="33" r="6" fill="none" stroke="rgba(20,50,45,0.9)" stroke-width="2"/>
    <rect x="2" y="46" width="10" height="10" rx="1" fill="rgba(255,255,255,0.7)"/>
    <rect x="14" y="46" width="10" height="10" rx="1" fill="rgba(255,255,255,0.7)"/>
    <rect x="26" y="15" width="15" height="41" rx="1" fill="rgba(255,255,255,0.7)"/>
    <path d="M29 33 L33.5 24 L38 33" fill="none" stroke="rgba(20,50,45,0.9)" stroke-width="2" stroke-linejoin="round"/>
    <rect x="43" y="8" width="37" height="48" rx="3" fill="rgba(255,255,255,0.7)"/>
    <path d="M48 33 L58 20 L68 33" fill="none" stroke="rgba(20,50,45,0.9)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M68 33 L78 20" fill="none" stroke="rgba(20,50,45,0.9)" stroke-width="2"/>
    <rect x="2" y="58" width="78" height="10" rx="2" fill="rgba(255,255,255,0.7)"/>
  </g>
  <text x="${Math.round(width * 0.015) + Math.round(logoSize * 1.6)}"
        y="${height - logoAreaH * 0.5 - Math.round(height * 0.015) + Math.round(fontSize * 0.15)}"
        fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif"
        font-size="${Math.round(fontSize * 0.85)}px" font-weight="bold" letter-spacing="4px">WISHES</text>
  <text x="${Math.round(width * 0.015) + Math.round(logoSize * 1.6)}"
        y="${height - logoAreaH * 0.5 - Math.round(height * 0.015) + Math.round(fontSize * 0.7)}"
        fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif"
        font-size="${Math.round(fontSize * 0.38)}px">wishes.co.kr  |  서울도 종합부동산</text>
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

    // === STEP 1: 이미지 최적화 ===
    const metadata = await sharp(buffer).metadata();
    const maxWidth = 1920;
    const maxHeight = 1440;

    let optimized = sharp(buffer);
    if ((metadata.width || 0) > maxWidth || (metadata.height || 0) > maxHeight) {
      optimized = optimized.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const optimizedBuffer = await optimized
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // === STEP 2: WISHES 로고 워터마크 적용 ===
    const wmMetadata = await sharp(optimizedBuffer).metadata();
    const wmWidth = wmMetadata.width || 1920;
    const wmHeight = wmMetadata.height || 1440;

    const watermarkSvg = createWatermarkSvg(wmWidth, wmHeight);

    const watermarkedBuffer = await sharp(optimizedBuffer)
      .composite([{ input: watermarkSvg, top: 0, left: 0 }])
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    // === STEP 3: 원본 업로드 (관리자용) ===
    const originalPath = `originals/listing-${timestamp}-${random}.jpg`;
    const { error: origError } = await supabase.storage
      .from('listing-images')
      .upload(originalPath, optimizedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });

    if (origError) throw origError;

    // === STEP 4: 워터마크 버전 업로드 (공개용) ===
    const watermarkedPath = `watermarked/listing-${timestamp}-${random}.jpg`;
    const { error: wmError } = await supabase.storage
      .from('listing-images')
      .upload(watermarkedPath, watermarkedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });

    if (wmError) throw wmError;

    const { data: origUrl } = supabase.storage.from('listing-images').getPublicUrl(originalPath);
    const { data: wmUrl } = supabase.storage.from('listing-images').getPublicUrl(watermarkedPath);

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
