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

// WISHES 로고 워터마크 SVG 생성
function createWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(Math.round(width * 0.035), 14);
  const logoSize = Math.round(fontSize * 1.6);

  // 집 아이콘 SVG path
  const houseIcon = (x: number, y: number, size: number) => `
    <g transform="translate(${x}, ${y}) scale(${size / 24})">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" 
            fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .wm-text { fill: rgba(255,255,255,0.3); font-family: Arial, sans-serif; font-size: ${fontSize}px; font-weight: bold; letter-spacing: 3px; }
      .wm-shadow { fill: rgba(0,0,0,0.12); font-family: Arial, sans-serif; font-size: ${fontSize}px; font-weight: bold; letter-spacing: 3px; }
      .logo-text { fill: rgba(255,255,255,0.85); font-family: Arial, sans-serif; font-weight: bold; letter-spacing: 4px; }
      .logo-sub { fill: rgba(255,255,255,0.6); font-family: Arial, sans-serif; }
      .logo-kr { fill: rgba(255,255,255,0.5); font-family: Arial, sans-serif; }
    </style>
  </defs>

  <!-- 대각선 반복 워터마크 -->
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

  <!-- 하단 로고 배지 -->
  <defs>
    <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(30,30,60,0.75)"/>
      <stop offset="100%" stop-color="rgba(50,30,80,0.65)"/>
    </linearGradient>
  </defs>
  <rect x="${width * 0.02}" y="${height - logoSize * 3.2}" 
        width="${Math.min(logoSize * 11, width * 0.35)}" height="${logoSize * 2.8}" 
        rx="10" fill="url(#logoBg)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  
  <!-- 집 아이콘 -->
  ${houseIcon(width * 0.02 + logoSize * 0.4, height - logoSize * 2.8, logoSize * 0.9)}
  
  <!-- WISHES 로고 텍스트 -->
  <text x="${width * 0.02 + logoSize * 1.8}" y="${height - logoSize * 1.8}" 
        class="logo-text" font-size="${Math.round(fontSize * 0.9)}px">WISHES</text>
  
  <!-- 부제: 서울도에 신뢰를 짓다 -->
  <text x="${width * 0.02 + logoSize * 1.8}" y="${height - logoSize * 1.05}" 
        class="logo-sub" font-size="${Math.round(fontSize * 0.4)}px">wishes.co.kr</text>
  
  <!-- 한국어 부제 -->
  <text x="${width * 0.02 + logoSize * 1.8 + fontSize * 3}" y="${height - logoSize * 1.05}" 
        class="logo-kr" font-size="${Math.round(fontSize * 0.35)}px">서울도 종합부동산 서비스</text>

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

    // Public URL 생성
    const { data: origUrl } = supabase.storage.from('listing-images').getPublicUrl(originalPath);
    const { data: wmUrl } = supabase.storage.from('listing-images').getPublicUrl(watermarkedPath);

    // DB 저장
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
