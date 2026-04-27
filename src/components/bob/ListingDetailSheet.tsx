'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): ListingDetailSheet — 매물 상세보기
//   옛날 content-v240-detail.js 의 6섹션 단일스크롤 재현
//   섹션: Hero, 기본정보, 옵션+설명, 위치, 유사매물, 중개사 전용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { MapPin, Maximize2, Building2, Bed, Calendar, Home, Lock, Phone, Edit3 } from 'lucide-react';
import { Dialog, SheetContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ListingCardBobData } from './ListingCardBob';

export interface ListingDetailData extends ListingCardBobData {
  description?: string;
  ai_description?: string;
  features?: string[];
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  direction?: string;
  heating_type?: string;
  available_date?: string;
  maintenance_fee?: number;
  raw_fields?: Record<string, unknown>;
  contacts?: Array<{ role?: string; phone?: string; safety?: boolean }>;
  field_sources?: Record<string, 'broker' | 'auto' | 'crawled'>;
}

export interface ListingDetailSheetProps {
  listing: ListingDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (listing: ListingDetailData) => void;
  onAIRegenerate?: (listing: ListingDetailData) => void;
  isAdmin?: boolean;
}

function formatPriceWon(amount: number | null | undefined): string {
  if (!amount) return '-';
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`;
  }
  return `${amount.toLocaleString()}만`;
}

function formatPrice(deal?: string, deposit?: number | null, monthly?: number | null, price?: number | null): string {
  if (deal === '매매') return formatPriceWon(price);
  if (deal === '전세') return formatPriceWon(deposit);
  if (deal === '월세') return `${formatPriceWon(deposit)} / ${formatPriceWon(monthly)}`;
  return formatPriceWon(deposit ?? price);
}

export function ListingDetailSheet({ listing, open, onOpenChange, onEdit, onAIRegenerate, isAdmin = true }: ListingDetailSheetProps) {
  if (!listing) return null;
  const placeText = [listing.gu, listing.dong, listing.building_name].filter(Boolean).join(' · ');
  const optionList = [
    listing.parking && '주차',
    listing.elevator && '엘리베이터',
    listing.pet && '반려동물',
    listing.balcony && '발코니',
    listing.full_option && '풀옵션',
    listing.loan_available && '대출가능',
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-2xl space-y-6">
        <DialogTitle className="sr-only">매물 상세 #{listing.id}</DialogTitle>

        {/* 1. Hero (이미지 + 가격) */}
        <section className="space-y-3">
          {listing.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[0]} alt={listing.building_name || '매물'} className="w-full aspect-[16/10] object-cover rounded-lg" />
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {listing.deal && <Badge>{listing.deal}</Badge>}
                {listing.type && <Badge variant="outline">{listing.type}</Badge>}
                {listing.status && <Badge variant={listing.status === '공개' ? 'success' : 'warning'}>{listing.status}</Badge>}
              </div>
              <h2 className="text-2xl font-bold text-wishes-primary">
                {formatPrice(listing.deal, listing.deposit, listing.monthly, listing.price)}
              </h2>
              <p className="text-sm text-wishes-text flex items-center gap-1">
                <MapPin className="h-4 w-4 text-wishes-muted" />
                {placeText || listing.address || '주소 미상'}
              </p>
            </div>
            {isAdmin && onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(listing)}>
                <Edit3 className="h-4 w-4 mr-1" />
                편집
              </Button>
            )}
          </div>
        </section>

        <Separator />

        {/* 2. 기본정보 (4열 grid) */}
        <section>
          <h3 className="text-sm font-semibold text-wishes-text mb-3">기본 정보</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoCell icon={Maximize2} label="면적" value={listing.area_m2 ? `${listing.area_m2}㎡ (${(listing.area_m2 / 3.3058).toFixed(1)}평)` : '-'} />
            <InfoCell icon={Building2} label="층" value={`${listing.floor_current ?? '?'}/${listing.floor_total ?? '?'}층`} />
            <InfoCell icon={Bed} label="방·욕실" value={`${listing.rooms ?? '?'}개 · 욕실 ${listing.bathrooms ?? '?'}개`} />
            <InfoCell icon={Calendar} label="건축년도" value={listing.built_year ? `${listing.built_year}년` : '-'} />
            <InfoCell icon={Home} label="방향" value={listing.direction || '-'} />
            <InfoCell icon={Home} label="난방" value={listing.heating_type || '-'} />
            <InfoCell icon={Calendar} label="입주가능" value={listing.available_date || '협의'} />
            <InfoCell icon={Home} label="관리비" value={listing.maintenance_fee ? `${listing.maintenance_fee.toLocaleString()}원` : '-'} />
          </div>
        </section>

        {/* 3. 옵션 + 상세설명 */}
        {(optionList.length > 0 || listing.description || listing.ai_description) && (
          <>
            <Separator />
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-wishes-text">옵션 · 설명</h3>
              {optionList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {optionList.map((opt) => <Badge key={opt} variant="secondary">{opt}</Badge>)}
                </div>
              )}
              {listing.description && (
                <p className="text-sm leading-7 text-wishes-text whitespace-pre-wrap">
                  {listing.description}
                </p>
              )}
              {listing.ai_description && listing.ai_description !== listing.description && (
                <details className="rounded-lg border border-wishes-border bg-wishes-cream p-3">
                  <summary className="text-xs font-medium text-wishes-muted cursor-pointer">✨ AI 매물설명</summary>
                  <p className="text-sm leading-7 text-wishes-text whitespace-pre-wrap mt-2">{listing.ai_description}</p>
                  {onAIRegenerate && isAdmin && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => onAIRegenerate(listing)}>
                      ✨ v2 AI 재생성
                    </Button>
                  )}
                </details>
              )}
              {/* AI 설명이 없으면 재생성 버튼만 노출 */}
              {!listing.ai_description && isAdmin && onAIRegenerate && (
                <Button size="sm" variant="outline" onClick={() => onAIRegenerate(listing)}>
                  ✨ v2 AI 재생성
                </Button>
              )}
            </section>
          </>
        )}

        {/* 4. 중개사 전용 (접힘) */}
        {isAdmin && (
          <>
            <Separator />
            <details className="space-y-3 rounded-lg border border-wishes-border p-3 bg-wishes-bg">
              <summary className="text-sm font-semibold text-wishes-text cursor-pointer flex items-center gap-1">
                <Lock className="h-4 w-4" />
                중개사 전용
              </summary>
              <div className="pt-3 space-y-3">
                {/* 관계자 연락처 */}
                {listing.contacts && listing.contacts.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-wishes-muted">관계자 연락처</div>
                    {listing.contacts.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-wishes-muted" />
                        <Badge variant="outline" className="text-xs">{c.role || '담당'}</Badge>
                        <span className="font-mono">{c.phone || '-'}</span>
                        {c.safety && <Badge variant="secondary" className="text-[10px]">050 안심</Badge>}
                      </div>
                    ))}
                  </div>
                )}
                {/* raw_fields */}
                {listing.raw_fields && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-wishes-muted">크롤링 원본 (READ-ONLY)</summary>
                    <pre className="mt-2 p-2 bg-white rounded border border-wishes-border overflow-x-auto">
                      {JSON.stringify(listing.raw_fields, null, 2)}
                    </pre>
                  </details>
                )}
                {/* field_sources cascade */}
                {listing.field_sources && (
                  <div className="text-xs text-wishes-muted">
                    필드 출처: {Object.entries(listing.field_sources).slice(0, 5).map(([k, v]) => (
                      <span key={k} className="inline-block mr-2">
                        <code>{k}</code>: <Badge variant={v === 'broker' ? 'default' : v === 'auto' ? 'secondary' : 'outline'} className="text-[10px]">{v}</Badge>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </SheetContent>
    </Dialog>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 mt-0.5 text-wishes-muted shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-wishes-muted">{label}</div>
        <div className="text-wishes-text font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
