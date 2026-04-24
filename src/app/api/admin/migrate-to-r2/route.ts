import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '15');

    const supabase = getSupabase();
    const r2 = getR2Client();
    const bucketName = process.env.R2_BUCKET_NAME || 'wishes-listings';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

    const { data: images, error: fetchError, count } = await supabase
      .from('listing_images')
      .select('id, listing_id, url, is_thumbnail, sort_order', { count: 'exact' })
      .like('url', '%supabase.co/storage%')
      .order('id', { ascending: true })
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch images', details: fetchError }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ message: 'All images migrated', migrated: 0, totalRemaining: 0 });
    }

    const results: { id: number; status: string; oldUrl: string; newUrl?: string; error?: string }[] = [];

    // L-sec52 (2026-04-22): SSRF guard. admin/DB 가 오염되면 img.url 이
    //   169.254.169.254/latest/meta-data 같은 internal endpoint 로 우회될 수 있음.
    //   migration 목적상 supabase.co/storage 호스트만 허용.
    const isSupabaseStorageUrl = (u: string): boolean => {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'https:') return false;
        if (!parsed.hostname.endsWith('.supabase.co')) return false;
        if (!parsed.pathname.startsWith('/storage/')) return false;
        return true;
      } catch { return false; }
    };

    for (const img of images) {
      try {
        const storagePath = img.url.split('/storage/v1/object/public/listing-images/')[1];
        if (!storagePath) {
          results.push({ id: img.id, status: 'skipped', oldUrl: img.url, error: 'parse error' });
          continue;
        }
        if (!isSupabaseStorageUrl(img.url)) {
          results.push({ id: img.id, status: 'skipped', oldUrl: img.url, error: 'disallowed host' });
          continue;
        }

        const dl = await fetch(img.url);
        if (!dl.ok) {
          results.push({ id: img.id, status: 'failed', oldUrl: img.url, error: 'dl:' + dl.status });
          continue;
        }

        const buf = Buffer.from(await dl.arrayBuffer());
        const ct = dl.headers.get('content-type') || 'image/jpeg';

        await r2.send(new PutObjectCommand({
          Bucket: bucketName, Key: storagePath, Body: buf, ContentType: ct,
        }));

        const newUrl = siteUrl + '/api/images/' + storagePath;

        const { error: ue } = await supabase
          .from('listing_images')
          .update({ url: newUrl })
          .eq('id', img.id);

        results.push({ id: img.id, status: ue ? 'db_fail' : 'success', oldUrl: img.url, newUrl });
      } catch (err) {
        results.push({ id: img.id, status: 'error', oldUrl: img.url, error: String(err).substring(0, 100) });
      }
    }

    const ok = results.filter(r => r.status === 'success').length;
    return NextResponse.json({
      message: ok + '/' + images.length + ' migrated',
      totalRemaining: (count || 0) - ok,
      success: ok,
      failed: images.length - ok,
      results,
    });
  } catch (error) {
    // L-sec52 (2026-04-22): prod 에서 details 스택 누출 방지
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      isDev
        ? { error: 'Migration failed', details: String(error) }
        : { error: 'Migration failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { count: supabaseCount } = await supabase
    .from('listing_images')
    .select('id', { count: 'exact', head: true })
    .like('url', '%supabase.co/storage%');

  const { count: r2Count } = await supabase
    .from('listing_images')
    .select('id', { count: 'exact', head: true })
    .like('url', '%/api/images/%');

  const { count: totalCount } = await supabase
    .from('listing_images')
    .select('id', { count: 'exact', head: true });

  return NextResponse.json({
    total: totalCount || 0,
    supabaseUrls: supabaseCount || 0,
    r2Urls: r2Count || 0,
    migrationComplete: (supabaseCount || 0) === 0,
  });
}
