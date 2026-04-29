/**
 * BoB (Broker-Operations-Backed) Auto-enrichment System
 * Phases 3-5 Implementation
 *
 * Core functions:
 * - Phase 3: Review queue (broker verification workflow)
 * - Phase 4: Trust score calculation
 * - Phase 5: Display and confidence indicators
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type Listing = Database['public']['Tables']['listings']['Row'];
type ListingsAuditLog = Database['public']['Tables']['listings_audit_log']['Row'];

// ════════════════════════════════════════════════════════════════════════
// Phase 3: Review Queue Functions
// ════════════════════════════════════════════════════════════════════════

export interface ReviewQueueItem {
  id: string;
  address: string;
  enrichmentStatus: 'pending' | 'in_progress' | 'complete' | 'partial' | 'error';
  reviewNeeded: ReviewField[];
  priority: 'high' | 'medium' | 'low';
  lastAttempt?: Date;
  errorLog?: string;
}

export interface ReviewField {
  fieldName: string;
  label: string;
  currentValue: any;
  autoValue?: any;
  confidence?: number;
  source?: 'broker' | 'building_registry' | 'rtms' | 'crawler';
  isLocked: boolean;
  type: 'text' | 'number' | 'select' | 'date';
  options?: string[];
}

/**
 * Get review queue for a specific broker
 * Returns listings with low confidence fields or enrichment errors
 */
export async function getReviewQueue(
  brokerId: string,
  options: {
    limit?: number;
    minConfidence?: number;
  } = {}
): Promise<ReviewQueueItem[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const {
    limit = 20,
    minConfidence = 70
  } = options;

  // Fetch listings needing review
  const { data: listings, error } = await supabase
    .from('listings')
    .select('*')
    .eq('created_by', brokerId)
    .or(
      [
        `enrichment_status.eq.error`,
        `area_confidence.lt.${minConfidence}`,
        `orientation.is.null`,
        `heating.is.null`,
        `construction_year.is.null`
      ].join(',')
    )
    .order('enrichment_last_attempt', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[Review Queue Error]', error);
    return [];
  }

  // Transform to review items
  return (listings || []).map(listing => ({
    id: listing.id,
    address: listing.address || 'Unknown Address',
    enrichmentStatus: listing.enrichment_status as any,
    reviewNeeded: getReviewFields(listing),
    priority: calculateReviewPriority(listing),
    lastAttempt: listing.enrichment_last_attempt
      ? new Date(listing.enrichment_last_attempt)
      : undefined,
    errorLog: listing.enrichment_error_log || undefined
  }));
}

/**
 * Determine which fields need review for a listing
 */
function getReviewFields(listing: Listing): ReviewField[] {
  const fields: ReviewField[] = [];

  // Check area
  if (!listing.area || (listing.area_confidence || 0) < 80) {
    fields.push({
      fieldName: 'area',
      label: '면적 (㎡)',
      currentValue: listing.area,
      confidence: listing.area_confidence || 0,
      source: (listing.area_source as any) || undefined,
      isLocked: !!listing.area_locked_at,
      type: 'number'
    });
  }

  // Check orientation
  if (!listing.orientation) {
    fields.push({
      fieldName: 'orientation',
      label: '향',
      currentValue: listing.orientation,
      confidence: listing.orientation_confidence || 0,
      isLocked: !!listing.orientation_locked_at,
      type: 'select',
      options: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    });
  }

  // Check heating
  if (!listing.heating) {
    fields.push({
      fieldName: 'heating',
      label: '난방',
      currentValue: listing.heating,
      confidence: listing.heating_confidence || 0,
      isLocked: !!listing.heating_locked_at,
      type: 'select',
      options: ['중앙', '개별', '없음', '기타']
    });
  }

  // Check construction year
  if (!listing.construction_year) {
    fields.push({
      fieldName: 'construction_year',
      label: '건축연도',
      currentValue: listing.construction_year,
      confidence: listing.construction_year_confidence || 0,
      isLocked: !!listing.construction_year_locked_at,
      type: 'date'
    });
  }

  // Check enrichment errors
  if (listing.enrichment_status === 'error') {
    fields.push({
      fieldName: 'enrichment_error',
      label: '보강 오류',
      currentValue: listing.enrichment_error_log,
      confidence: 0,
      isLocked: false,
      type: 'text'
    });
  }

  return fields;
}

/**
 * Calculate priority for review item
 */
function calculateReviewPriority(
  listing: Listing
): 'high' | 'medium' | 'low' {
  if (listing.enrichment_status === 'error') return 'high';
  if (!listing.area || !listing.heating) return 'high';
  if ((listing.area_confidence || 0) < 60) return 'high';
  if ((listing.area_confidence || 0) < 80) return 'medium';
  return 'low';
}

/**
 * Mark a listing field as reviewed by broker
 * Locks the field and prevents automatic re-enrichment
 */
export async function markListingReviewed(
  listingId: string,
  fieldName: string,
  newValue: any,
  changedBy: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const lockColumnName = `${fieldName}_locked_at`;
  const updateData: Record<string, any> = {
    [fieldName]: newValue,
    [lockColumnName]: new Date().toISOString(),
    [`${fieldName}_source`]: 'broker',
    [`${fieldName}_confidence`]: 100
  };

  // Update listing
  const { error: updateError } = await supabase
    .from('listings')
    .update(updateData)
    .eq('id', listingId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log audit trail
  const { error: auditError } = await supabase
    .from('listings_audit_log')
    .insert({
      listing_id: listingId,
      field_name: fieldName,
      new_value: String(newValue),
      source: 'broker',
      changed_by: changedBy
    });

  if (auditError) {
    console.warn('[Audit Log Error]', auditError);
  }

  return { success: true };
}

// ════════════════════════════════════════════════════════════════════════
// Phase 4: Trust Score Calculation
// ════════════════════════════════════════════════════════════════════════

export interface TrustScore {
  overall: number; // 0-100
  breakdown: {
    area: number;
    price: number;
    orientation: number;
    heating: number;
    constructionYear: number;
    brokerVerified: number;
    registryChecked: number;
  };
  recommendations: string[];
}

/**
 * Calculate comprehensive trust score for a listing
 */
export function calculateTrustScore(listing: Listing): TrustScore {
  let score = 0;

  const weights = {
    area: 20,
    price: 20,
    orientation: 10,
    heating: 10,
    constructionYear: 10,
    brokerVerified: 15,
    registryChecked: 15
  };

  const breakdown = {
    area: 0,
    price: 0,
    orientation: 0,
    heating: 0,
    constructionYear: 0,
    brokerVerified: 0,
    registryChecked: 0
  };

  const recommendations: string[] = [];

  // Area scoring
  if (listing.area && listing.area_locked_at) {
    breakdown.area = weights.area;
    score += breakdown.area;
  } else if (listing.area && listing.area_source === 'building_registry') {
    breakdown.area = Math.round(weights.area * ((listing.area_confidence || 90) / 100));
    score += breakdown.area;
  } else if (listing.area && listing.area_source === 'rtms') {
    breakdown.area = Math.round(weights.area * ((listing.area_confidence || 80) / 100));
    score += breakdown.area;
  } else if (listing.area) {
    breakdown.area = Math.round(weights.area * ((listing.area_confidence || 60) / 100));
    score += breakdown.area;
  } else {
    recommendations.push('면적 정보가 필요합니다');
  }

  // Price scoring
  if (listing.price && listing.price_locked_at) {
    breakdown.price = weights.price;
    score += breakdown.price;
  } else if (listing.price && listing.price_source === 'broker') {
    breakdown.price = weights.price;
    score += breakdown.price;
  } else if (listing.price) {
    breakdown.price = Math.round(weights.price * 0.7);
    score += breakdown.price;
  }

  // Orientation scoring
  if (listing.orientation && listing.orientation_locked_at) {
    breakdown.orientation = weights.orientation;
    score += breakdown.orientation;
  } else if (listing.orientation) {
    breakdown.orientation = Math.round(weights.orientation * ((listing.orientation_confidence || 70) / 100));
    score += breakdown.orientation;
  } else {
    recommendations.push('향 정보가 필요합니다');
  }

  // Heating scoring
  if (listing.heating && listing.heating_locked_at) {
    breakdown.heating = weights.heating;
    score += breakdown.heating;
  } else if (listing.heating) {
    breakdown.heating = Math.round(weights.heating * ((listing.heating_confidence || 75) / 100));
    score += breakdown.heating;
  } else {
    recommendations.push('난방 정보가 필요합니다');
  }

  // Construction year scoring
  if (listing.construction_year && listing.construction_year_locked_at) {
    breakdown.constructionYear = weights.constructionYear;
    score += breakdown.constructionYear;
  } else if (listing.construction_year) {
    breakdown.constructionYear = Math.round(weights.constructionYear * ((listing.construction_year_confidence || 90) / 100));
    score += breakdown.constructionYear;
  }

  // Broker verification (from admin_users table - assumed)
  // This would require a JOIN in real implementation
  breakdown.brokerVerified = 0;

  // Registry checked (깡통전세 검사)
  if (listing.lease_type === 'jeonse' && listing.jeonse_price) {
    breakdown.registryChecked = weights.registryChecked * 0.5; // 미검사
    recommendations.push('등기부 확인 권장 (전세 매물)');
  } else {
    breakdown.registryChecked = 0;
  }

  return {
    overall: Math.min(Math.round(score), 100),
    breakdown,
    recommendations
  };
}

/**
 * Get readable trust score label
 */
export function getTrustScoreLabel(score: number): string {
  if (score >= 90) return '매우 신뢰함';
  if (score >= 75) return '신뢰함';
  if (score >= 60) return '보통';
  if (score >= 45) return '검토 필요';
  return '매우 부족함';
}

/**
 * Get trust score color for UI
 */
export function getTrustScoreColor(score: number): string {
  if (score >= 90) return 'rgb(34, 197, 94)';  // green-500
  if (score >= 75) return 'rgb(59, 130, 246)'; // blue-500
  if (score >= 60) return 'rgb(217, 119, 6)';  // amber-600
  if (score >= 45) return 'rgb(249, 115, 22)'; // orange-500
  return 'rgb(239, 68, 68)';                   // red-500
}

// ════════════════════════════════════════════════════════════════════════
// Phase 5: Utility Functions
// ════════════════════════════════════════════════════════════════════════

/**
 * Get cascade history for a specific field
 */
export async function getFieldCascadeHistory(
  listingId: string,
  fieldName: string
): Promise<ListingsAuditLog[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const { data, error } = await supabase
    .from('listings_audit_log')
    .select('*')
    .eq('listing_id', listingId)
    .eq('field_name', fieldName)
    .order('changed_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[Cascade History Error]', error);
    return [];
  }

  return data || [];
}

/**
 * Export listing enrichment report (CSV)
 */
export function exportEnrichmentReport(listings: Listing[]): string {
  const headers = [
    'ID',
    'Address',
    'Area',
    'Area Source',
    'Area Confidence',
    'Orientation',
    'Heating',
    'Construction Year',
    'Enrichment Status',
    'Last Attempt',
    'Trust Score'
  ];

  const rows = listings.map(listing => {
    const trustScore = calculateTrustScore(listing);
    return [
      listing.id,
      listing.address,
      listing.area,
      listing.area_source,
      listing.area_confidence,
      listing.orientation,
      listing.heating,
      listing.construction_year,
      listing.enrichment_status,
      listing.enrichment_last_attempt,
      trustScore.overall
    ];
  });

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}
