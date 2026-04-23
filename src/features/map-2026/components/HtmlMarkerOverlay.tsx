// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HtmlMarkerOverlay — L-mapmarker1 (2026-04-23)
// Kakao CustomOverlay 로 Tier1 pill + Tier2 원 HTML 렌더.
// deck.gl item scatter 를 대체. 네이버·직방 스타일.
//
// 기존 KakaoDeckOverlay 는 건드리지 않고 이 컴포넌트를 sibling 으로
// 추가 mount. items prop 을 KakaoDeckOverlay 에 빈 배열로 넘기면 deck.gl
// item scatter/text 레이어가 비활성화되어 HTML 마커와 중복 렌더가 안 생김.
// cluster 레이어(deck.gl) 는 그대로 유지 — perf 최적화.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { MapListing } from '@/features/map-2026/store';
import {
  bucketListings,
  getTier1DotColor,
  getTier2BorderColor,
} from '@/features/map-2026/lib/markerTier';

// Kakao SDK 타입 최소 선언 (global.kakao 접근용).
interface KakaoCustomOverlay {
  setMap: (m: unknown) => void;
  setPosition?: (p: unknown) => void;
}
interface KakaoNamespace {
  maps?: {
    CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
    LatLng: new (lat: number, lng: number) => unknown;
  };
}

interface Props {
  map: unknown; // kakao.maps.Map instance (부모에서 이미 mount 된 것)
  listings: MapListing[];
  selectedListingId: number | null;
  onClickListing: (id: number) => void;
  /** 선택: 단지 pill 클릭 시 단지 drawer 오픈. 없으면 첫 매물 상세로 폴백. */
  onClickComplex?: (name: string, listings: MapListing[]) => void;
}

// Selected state — WISHES 브랜드 블루
const SEL_BG = '#185FA5';
const SEL_BD = '#0C447C';
const SEL_SHADOW = '0 4px 14px rgba(24,95,165,0.4)';
const DEFAULT_SHADOW = '0 1px 4px rgba(0,0,0,0.16)';

function makeTier1Element(opts: {
  name: string;
  count: number;
  dotColor: string;
  selected: boolean;
}): HTMLDivElement {
  const { name, count, dotColor, selected } = opts;
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    `background:${selected ? SEL_BG : '#fff'}`,
    'border-radius:999px',
    'padding:5px 4px 5px 12px',
    'font-size:12px',
    'font-weight:500',
    `color:${selected ? '#fff' : '#1a1a1a'}`,
    `border:0.5px solid ${selected ? SEL_BD : 'rgba(0,0,0,0.06)'}`,
    `box-shadow:${selected ? SEL_SHADOW : DEFAULT_SHADOW}`,
    'white-space:nowrap',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;background:${selected ? '#fff' : dotColor};flex-shrink:0;`;
  el.appendChild(dot);

  const label = document.createElement('span');
  label.textContent = name;
  el.appendChild(label);

  const badge = document.createElement('span');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `background:${selected ? 'rgba(255,255,255,0.22)' : '#EEF2F5'}`,
    `color:${selected ? '#fff' : '#1a1a1a'}`,
    'border-radius:999px',
    'padding:1px 7px',
    'font-size:11px',
    'font-weight:500',
    'margin-left:8px',
    'min-width:20px',
  ].join(';');
  badge.textContent = String(count);
  el.appendChild(badge);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.06)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

  return el;
}

function makeTier2Element(opts: {
  count: number;
  borderColor: string;
  selected: boolean;
}): HTMLDivElement {
  const { count, borderColor, selected } = opts;
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:36px',
    'height:36px',
    'border-radius:50%',
    `background:${selected ? SEL_BG : '#fff'}`,
    `color:${selected ? '#fff' : '#1a1a1a'}`,
    `border:2px solid ${selected ? SEL_BD : borderColor}`,
    `box-shadow:${selected ? SEL_SHADOW : DEFAULT_SHADOW}`,
    'font-size:12px',
    'font-weight:500',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
  ].join(';');
  el.textContent = String(count);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.06)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

  return el;
}

export default function HtmlMarkerOverlay({
  map,
  listings,
  selectedListingId,
  onClickListing,
  onClickComplex,
}: Props) {
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNamespace }).kakao;
    if (!kakao?.maps) return;

    // 기존 overlay cleanup
    for (const ov of overlaysRef.current) {
      try { ov.setMap(null); } catch { /* noop */ }
    }
    overlaysRef.current = [];

    if (!Array.isArray(listings) || listings.length === 0) {
      return () => {
        for (const ov of overlaysRef.current) {
          try { ov.setMap(null); } catch { /* noop */ }
        }
        overlaysRef.current = [];
      };
    }

    const { tier1Groups, tier2Listings } = bucketListings(listings);

    // Tier 1 — 브랜드 단지 pill
    for (const g of tier1Groups) {
      const selected = selectedListingId != null
        && g.listings.some((l) => l.id === selectedListingId);
      const el = makeTier1Element({
        name: g.name,
        count: g.count,
        dotColor: getTier1DotColor(g.type),
        selected,
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onClickComplex) {
          onClickComplex(g.name, g.listings);
        } else if (g.listings.length > 0) {
          onClickListing(g.listings[0].id);
        }
      });
      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(g.lat, g.lng),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 10,
          clickable: true,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      } catch { /* SDK race — skip */ }
    }

    // Tier 2 — 개별 매물 원
    for (const l of tier2Listings) {
      const selected = selectedListingId === l.id;
      const el = makeTier2Element({
        count: 1,
        borderColor: getTier2BorderColor(l.type),
        selected,
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClickListing(l.id);
      });
      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(l.lat, l.lng),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 10,
          clickable: true,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      } catch { /* SDK race — skip */ }
    }

    return () => {
      for (const ov of overlaysRef.current) {
        try { ov.setMap(null); } catch { /* noop */ }
      }
      overlaysRef.current = [];
    };
  }, [map, listings, selectedListingId, onClickListing, onClickComplex]);

  return null;
}
