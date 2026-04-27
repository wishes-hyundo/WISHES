'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): ListingEditSheet — 매물 편집 slide-over
//   옛날 content-v297-edit.js (slide-over 패널) 재현
//   - 모든 필드 수정 가능
//   - raw_fields READ-ONLY (크롤링 원본 보호)
//   - 상태 변경 (공개/비공개/계약중/계약완료)
//   - cascade 'broker' 자동 표시 (PATCH 시 field_sources='broker')
//   - 저장 시 toast (sonner)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Save, X, Lock } from 'lucide-react';
import { Dialog, SheetContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { ListingDetailData } from './ListingDetailSheet';

export interface ListingEditFormValues {
  type?: string;
  deal?: string;
  status?: string;
  address?: string;
  building_name?: string;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  area_m2?: number | null;
  floor_current?: number | null;
  floor_total?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  built_year?: number | null;
  direction?: string;
  heating_type?: string;
  available_date?: string;
  description?: string;
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
}

export interface ListingEditSheetProps {
  listing: ListingDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, values: ListingEditFormValues) => Promise<void> | void;
  saving?: boolean;
}

const TYPES = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라', '주택', '상가', '사무실', '토지'];
const DEALS = ['월세', '전세', '매매'];
const STATUSES = ['공개', '비공개', '계약중', '계약완료'];
const DIRECTIONS = ['남향', '동향', '서향', '북향', '남동향', '남서향', '북동향', '북서향'];

export function ListingEditSheet({ listing, open, onOpenChange, onSave, saving = false }: ListingEditSheetProps) {
  const { register, handleSubmit, reset, watch } = useForm<ListingEditFormValues>({
    defaultValues: {},
  });

  // listing 변경 시 폼 reset
  React.useEffect(() => {
    if (listing) {
      reset({
        type: listing.type,
        deal: listing.deal,
        status: listing.status,
        address: listing.address,
        building_name: listing.building_name,
        deposit: listing.deposit,
        monthly: listing.monthly,
        price: listing.price,
        area_m2: listing.area_m2,
        floor_current: listing.floor_current,
        floor_total: listing.floor_total,
        rooms: listing.rooms,
        bathrooms: listing.bathrooms,
        built_year: listing.built_year,
        direction: listing.direction,
        heating_type: listing.heating_type,
        available_date: listing.available_date,
        description: listing.description,
        parking: listing.parking,
        elevator: listing.elevator,
        pet: listing.pet,
        balcony: listing.balcony,
        full_option: listing.full_option,
        loan_available: listing.loan_available,
      });
    }
  }, [listing, reset]);

  if (!listing) return null;

  const onSubmit = async (values: ListingEditFormValues) => {
    await onSave(listing.id, values);
  };

  const watchedDeal = watch('deal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-2xl">
        <DialogTitle className="text-lg font-bold">
          매물 편집 #{listing.id}
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-20">
          {/* 상태 / 거래유형 / 매물유형 */}
          <section className="grid grid-cols-3 gap-3">
            <Field label="상태">
              <select {...register('status')} className="flex h-10 w-full rounded-md border border-wishes-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wishes-primary">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="거래유형">
              <select {...register('deal')} className="flex h-10 w-full rounded-md border border-wishes-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wishes-primary">
                {DEALS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="매물유형">
              <select {...register('type')} className="flex h-10 w-full rounded-md border border-wishes-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wishes-primary">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </section>

          <Separator />

          {/* 가격 (거래유형별 동적) */}
          <section className="space-y-3">
            <div className="text-sm font-semibold text-wishes-text">가격</div>
            <div className="grid grid-cols-3 gap-3">
              {(watchedDeal === '월세' || watchedDeal === '전세') && (
                <Field label="보증금 (만원)">
                  <Input type="number" inputMode="numeric" {...register('deposit', { valueAsNumber: true })} />
                </Field>
              )}
              {watchedDeal === '월세' && (
                <Field label="월세 (만원)">
                  <Input type="number" inputMode="numeric" {...register('monthly', { valueAsNumber: true })} />
                </Field>
              )}
              {watchedDeal === '매매' && (
                <Field label="매매가 (만원)">
                  <Input type="number" inputMode="numeric" {...register('price', { valueAsNumber: true })} />
                </Field>
              )}
            </div>
          </section>

          <Separator />

          {/* 주소 */}
          <section className="space-y-3">
            <Field label="주소">
              <Input {...register('address')} placeholder="도로명 주소" />
            </Field>
            <Field label="건물명">
              <Input {...register('building_name')} placeholder="예: 신림동 OOO 빌라" />
            </Field>
          </section>

          <Separator />

          {/* 면적 / 층 / 방 */}
          <section className="grid grid-cols-2 gap-3">
            <Field label="전용면적 (m²)">
              <Input type="number" step="0.1" {...register('area_m2', { valueAsNumber: true })} />
            </Field>
            <Field label="건축년도">
              <Input type="number" {...register('built_year', { valueAsNumber: true })} placeholder="예: 2010" />
            </Field>
            <Field label="층수 (현재)">
              <Input type="number" {...register('floor_current', { valueAsNumber: true })} />
            </Field>
            <Field label="층수 (총)">
              <Input type="number" {...register('floor_total', { valueAsNumber: true })} />
            </Field>
            <Field label="방 수">
              <Input type="number" {...register('rooms', { valueAsNumber: true })} />
            </Field>
            <Field label="욕실 수">
              <Input type="number" {...register('bathrooms', { valueAsNumber: true })} />
            </Field>
          </section>

          <Separator />

          {/* 추가 정보 */}
          <section className="grid grid-cols-2 gap-3">
            <Field label="방향">
              <select {...register('direction')} className="flex h-10 w-full rounded-md border border-wishes-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wishes-primary">
                <option value="">선택</option>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="난방">
              <Input {...register('heating_type')} placeholder="예: 도시가스 / 개별난방" />
            </Field>
            <Field label="입주가능일">
              <Input {...register('available_date')} placeholder="예: 즉시입주 / 2026-06-01" />
            </Field>
          </section>

          <Separator />

          {/* 옵션 */}
          <section>
            <div className="text-sm font-semibold text-wishes-text mb-2">옵션</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['parking', '주차'],
                ['elevator', '엘리베이터'],
                ['pet', '반려동물'],
                ['balcony', '발코니'],
                ['full_option', '풀옵션'],
                ['loan_available', '대출가능'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...register(key)} className="rounded border-wishes-border" />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <Separator />

          {/* 설명 */}
          <Field label="상세 설명">
            <textarea
              {...register('description')}
              rows={6}
              className="flex w-full rounded-md border border-wishes-border bg-white px-3 py-2 text-sm placeholder:text-wishes-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wishes-primary focus-visible:ring-offset-2"
              placeholder="매물 상세 설명..."
            />
          </Field>

          {/* raw_fields READ-ONLY */}
          {listing.raw_fields && (
            <details className="rounded-lg border border-wishes-border bg-wishes-bg p-3">
              <summary className="text-xs font-medium text-wishes-muted cursor-pointer flex items-center gap-1">
                <Lock className="h-3 w-3" />
                크롤링 원본 (수정 불가)
              </summary>
              <pre className="mt-2 p-2 bg-white rounded border border-wishes-border overflow-x-auto text-xs">
                {JSON.stringify(listing.raw_fields, null, 2)}
              </pre>
            </details>
          )}

          {/* cascade 안내 */}
          <div className="text-xs text-wishes-muted bg-wishes-cream p-2 rounded">
            💡 저장 시 변경된 필드는 자동으로 <Badge variant="default" className="text-[10px]">중개사</Badge> 출처로 표시됩니다.
          </div>
        </form>

        {/* 하단 고정 버튼 */}
        <div className="absolute bottom-0 inset-x-0 p-4 bg-white border-t border-wishes-border flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1" />
            취소
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>

      </SheetContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
