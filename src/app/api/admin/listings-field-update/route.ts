import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wishes2026';

const ALLOWED_FIELDS = [
  'title', 'description', 'type', 'deal',
  'deposit', 'monthly', 'price', 'maintenance_fee', 'maintenance_includes',
  'area_m2', 'area_supply_m2', 'area_land_m2',
  'floor_current', 'floor_total', 'rooms', 'bathrooms',
  'direction', 'heating_type', 'address', 'address_detail', 'dong', 'gu',
  'lat', 'lng', 'available_date', 'built_year',
  'parking', 'parking_spaces', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'contact', 'contact_role', 'building_name', 'entrance_type',
  'base_price', 'lease_period', 'building_purpose', 'rights_fee',
  'vat_included', 'electric_capacity', 'commission_fee',
  'registered_date', 'last_confirmed', 'special_notes',
  'previous_business', 'recommended_business', 'restricted_business',
  'status'
];

// PUT: Update single listing fields
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, fields } = body;

    if (!id) {
      return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Fields object is required' }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('listings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Bulk update multiple listings
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Updates array is required' }, { status: 400 });
    }

    if (updates.length > 50) {
      return NextResponse.json({ error: 'Max 50 updates per request' }, { status: 400 });
    }

    const supabase = createServerClient();
    const results: any[] = [];
    const errors: any[] = [];

    for (const item of updates) {
      const { id, fields } = item;
      if (!id || !fields) {
        errors.push({ id, error: 'Missing id or fields' });
        continue;
      }

      const updateData: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (ALLOWED_FIELDS.includes(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        errors.push({ id, error: 'No valid fields' });
        continue;
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', id)
        .select('id, title')
        .single();

      if (error) {
        errors.push({ id, error: error.message });
      } else {
        results.push({ id, success: true, title: data?.title });
      }
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}