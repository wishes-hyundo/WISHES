// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map — 서버 엔트리 (RSC)
//
//   2026-04-21 마이그레이션: 레거시 /map 페이지를 제거하고 MAP 2026
//   (Phase A~F, Category-First + Semantic Zoom + Hero Pin + 3D +
//   Cinematic Motion + Comparable-Aware) 을 canonical /map 경로로 승격.
//
//   2026-04-30 PR-D2: /listings/:id → /map?listing=:id 301 영구 redirect
//   (next.config.js). 본 page 의 generateMetadata 가 listing query 받으면
//   매물별 SSR metadata + RealEstateListing JSON-LD 생성 (SEO 보존).
//
//   기본 metadata 는 src/app/map/layout.tsx 가 fallback.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import MapClientWrapper from './MapClientWrapper';

type Props = {
  searchParams: Promise<{ listing?: string; [k: string]: string | string[] | undefined }>;
};

// 5초 타임아웃 래퍼 (Supabase PostgrestBuilder 가 PromiseLike)
const withTimeout = <T,>(promise: PromiseLike<T>, ms = 5000): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

function formatPrice(price: number): string {
  if (price >= 10000) {
    const uk = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? uk + '억 ' + remainder.toLocaleString() : uk + '억';
  }
  return price