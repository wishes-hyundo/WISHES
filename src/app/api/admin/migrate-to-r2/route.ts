import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// R2 Client
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

// Supabase Client (service role for DB updates)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (token !== process.env.ADMIN_TOKEN) {
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

    const results = [];

    for (const img of images) {
      try {
        const storagePath = img.url.split('/storage/v1/object/public/listing-images/')[1];
        if (!storagePath) {
          results.push({ id: img.id, status: 'skipped', error: 'parse error' });
          continue;
        }

        const dl = await fetch(img.url);
        if (!dl.ok) {
          results.push({ id: img.id, status: 'failed', error: 'dl:' + dl.status });
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

        results.push({ id: img.id, status: ue ? 'db_fail' : 'success', newUrl });
      } catch (err) {
        results.push({ id: img.id, status: 'error', error: String(err).substring(0, 100) });
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
    return NextResponse.json({ error: 'Migration failed', details: String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_TOKEN) {
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
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// R2 Client
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

// Supabase Client (service role for DB updates)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (token !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const r2 = getR2Client();
    const bucketName = process.env.R2_BUCKET_NAME || 'wishes-listings';
    const r2PublicUrl = process.env.R2_PUBLIC_URL || 'https://pub-e16c7a50584c4db7be35717d6cd80716.r2.dev';

    // 1. Get all images with Supabase Storage URLs
    const { data: images, error: fetchError } = await supabase
      .from('listing_images')
      .select('id, listing_id, url, is_thumbnail, sort_order')
      .like('url', '%supabase.co/storage%')
      .order('listing_id', { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch images', details: fetchError }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ message: 'No Supabase Storage images to migrate', migrated: 0 });
    }

    const results: Array<{ id: number; status: string; oldUrl: string; newUrl?: string; error?: string }> = [];

    // 2. Migrate each image
    for (const img of images) {
      try {
        // Extract storage path from Supabase URL
        // URL format: https://xxx.supabase.co/storage/v1/object/public/listing-images/listings/62/1.jpg
        const storagePath = img.url.split('/storage/v1/object/public/listing-images/')[1];
        if (!storagePath) {
          results.push({ id: img.id, status: 'skipped', oldUrl: img.url, error: 'Could not parse storage path' });
          continue;
        }

        // Download from Supabase Storage
        const downloadResponse = await fetch(img.url);
        if (!downloadResponse.ok) {
          results.push({ id: img.id, status: 'failed', oldUrl: img.url, error: `Download failed: ${downloadResponse.status}` });
          continue;
        }

        const imageBuffer = Buffer.from(await downloadResponse.arrayBuffer());
        const contentType = downloadResponse.headers.get('content-type') || 'image/jpeg';

        // Determine R2 key - keep same path structure
        const r2Key = storagePath;

        // Upload to R2
        await r2.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Key,
          Body: imageBuffer,
          ContentType: contentType,
        }));

        // Build new R2 URL
        const newUrl = `${r2PublicUrl}/${r2Key}`;

        // Update DB
        const { error: updateError } = await supabase
          .from('listing_images')
          .update({ url: newUrl })
          .eq('id', img.id);

        if (updateError) {
          results.push({ id: img.id, status: 'uploaded_but_db_failed', oldUrl: img.url, newUrl, error: updateError.message });
        } else {
          results.push({ id: img.id, status: 'success', oldUrl: img.url, newUrl });
        }
      } catch (err) {
        results.push({ id: img.id, status: 'error', oldUrl: img.url, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status !== 'success').length;

    return NextResponse.json({
      message: `Migration complete: ${successCount} succeeded, ${failCount} failed`,
      total: images.length,
      success: successCount,
      failed: failCount,
      results,
    });

  } catch (error) {
    return NextResponse.json({ error: 'Migration failed', details: String(error) }, { status: 500 });
  }
}
