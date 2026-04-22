import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';

// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN = 'wishes2026' 제거 → verifyAdminAuth
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await request.json();
    const { listings } = body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ error: 'listings array required' }, { status: 400 });
    }

    // Max 100 per request
    const batch = listings.slice(0, 100);
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const item of batch) {
      try {
        const updateData: Record<string, unknown> = {};
        
        // Building registry fields
        if (item.built_year !== undefined) updateData.built_year = item.built_year;
        if (item.floor_total !== undefined) updateData.floor_total = item.floor_total;
        if (item.bathrooms !== undefined) updateData.bathrooms = item.bathrooms;
        if (item.area_m2 !== undefined) updateData.area_m2 = item.area_m2;
        if (item.area_supply_m2 !== undefined) updateData.area_supply_m2 = item.area_supply_m2;
        if (item.area_land_m2 !== undefined) updateData.area_land_m2 = item.area_land_m2;
        if (item.elevator !== undefined) updateData.elevator = item.elevator;
        if (item.parking !== undefined) updateData.parking = item.parking;
        if (item.heating_type !== undefined) updateData.heating_type = item.heating_type;
        if (item.direction !== undefined) updateData.direction = item.direction;
        if (item.rooms !== undefined) updateData.rooms = item.rooms;
        
        // AI generated fields
        if (item.title !== undefined) updateData.title = item.title;
        if (item.description !== undefined) updateData.description = item.description;

        if (Object.keys(updateData).length === 0) {
          results.push({ id: item.id, success: false, error: 'No fields to update' });
          continue;
        }

        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('listings')
          .update(updateData)
          .eq('id', item.id);

        if (error) {
          // L-sec115 (2026-04-22): admin-gated defense-in-depth.
          const isDev = process.env.NODE_ENV !== 'production';
          results.push({ id: item.id, success: false, error: isDev ? error.message : '수정 실패' });
        } else {
          results.push({ id: item.id, success: true });
        }
      } catch (err) {
        results.push({ id: item.id, success: false, error: String(err) });
      }
    }

    const totalSuccess = results.filter(r => r.success).length;
    const totalFailed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      processed: batch.length,
      totalSuccess,
      totalFailed,
      results,
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    return NextResponse.json(
      { error: 'Bulk update failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return NextResponse.json({
    endpoint: '/api/admin/listings-bulk-update',
    method: 'POST',
    description: 'Bulk update listing fields (building registry + AI generated)',
    body: {
      listings: '[{id, built_year, floor_total, bathrooms, area_m2, area_supply_m2, elevator, parking, title, description, ...}]'
    },
    limits: { maxBatchSize: 100 }
  });
      }
