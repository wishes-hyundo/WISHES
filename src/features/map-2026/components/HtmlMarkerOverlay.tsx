// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HtmlMarkerOverlay — L-mapmarker1 v2 (2026-04-23)
// 네이버·직방·다방 100% 복제 스타일. 채워진 컬러 버블 + 줌 기반 클러스터링.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapListing } from '@/features/map-2026/store';
import {
  bucketListings,
  getTier1DotColor,
  getTier2BorderColor,
} from '@/features/map-2026/lib/markerTier';

interface KakaoCustomOverlay {
  setMap: (m: unknown) => void;
}
interface KakaoEvent {
  addListener: (target: unknown, type: string, fn: () => void) => void;
  removeListener: (target: unknown, type: string, fn: () => void) => void;
}
interface KakaoMaps {
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  event: KakaoEvent;
}
interface KakaoMapProj {
  getProjection?: () => {
    pointFromCoords: (c: unknown) => { x: number; y: number };
  };
}

interface Props {
  map: unknown;
  listings: MapListing[];
  selectedListingId: number | null;
  onClickListing: (id: number) => void;
  onClickComplex?: (name: string, listings: MapListing[]) => void;
}

const SEL_BG = '#185FA5';
const SEL_BD = '#0C447C';
const SEL_SHADOW = '0 4px 14px rgba(24,95,165,0.45)';
const CLUSTER_CELL_PX = 42;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
    'background:' + (selected ? SEL_BG : 'rgba(255,255,255,0.96)'),
    'border-radius:999px',
    'padding:5px 5px 5px 12px',
    'font-size:12px',
    'font-weight:500',
    'color:' + (selected ? '#fff' : '#1a1a1a'),
    'border:0.5px solid ' + (selected ? SEL_BD : 'rgba(0,0,0,0.08)'),
    'box-shadow:' + (selected ? SEL_SHADOW : '0 2px 6px rgba(0,0,0,0.18)'),
    'white-space:nowrap',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = 'display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:' + (selected ? '#fff' : dotColor) + ';flex-shrink:0;';
  el.appendChild(dot);

  const label = document.createElement('span');
  label.textContent = name;
  el.appendChild(label);

  const badge = document.createElement('span');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'background:' + (selected ? 'rgba(255,255,255,0.25)' : '#EEF2F5'),
    'color:' + (selected ? '#fff' : '#0C447C'),
    'border-radius:999px',
    'padding:1px 7px',
    'font-size:11px',
    'font-weight:600',
    'margin-left:8px',
    'min-width:18px',
  ].join(';');
  badge.textContent = String(count);
  el.appendChild(badge);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.06)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

  return el;
}

function makeTier2Element(opts: {
  count: number;
  categoryColor: string;
  selected: boolean;
  isCluster: boolean;
}): HTMLDivElement {
  const { count, categoryColor, selected, isCluster } = opts;
  let size: number;
  if (!isCluster) size = 28;
  else if (count < 10) size = 34;
  else if (count < 100) size = 42;
  else size = 52;

  const fontSize = size >= 42 ? 13 : size >= 34 ? 12 : 11;
  const bg = selected ? SEL_BG : hexToRgba(categoryColor, 0.92);
  const shadow = selected ? SEL_SHADOW : '0 2px 6px rgba(0,0,0,0.22)';

  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:' + size + 'px',
    'height:' + size + 'px',
    'border-radius:50%',
    'background:' + bg,
    'color:#fff',
    'border:1.5px solid #fff',
    'box-shadow:' + shadow,
    'font-size:' + fontSize + 'px',
    'font-weight:600',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
    'letter-spacing:-0.2px',
  ].join(';');
  el.textContent = String(count);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.08)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

  return el;
}

function dominantCategoryColor(listings: MapListing[]): string {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const color = getTier2BorderColor(l.type);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  let bestColor = '#888780';
  let bestN = 0;
  for (const [color, n] of counts) {
    if (n > bestN) { bestColor = color; bestN = n; }
  }
  return bestColor;
}

export default function HtmlMarkerOverlay({
  map,
  listings,
  selectedListingId,
  onClickListing,
  onClickComplex,
}: Props) {
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const [projVer, setProjVer] = useState(0);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: { maps?: KakaoMaps } }).kakao;
    if (!kakao?.maps?.event) return;

    let rafId: number | null = null;
    const schedule = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setProjVer((v) => v + 1);
      });
    };
    kakao.maps.event.addListener(map, 'zoom_changed', schedule);
    kakao.maps.event.addListener(map, 'idle', schedule);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      try { kakao.maps.event.removeListener(map, 'zoom_changed', schedule); } catch { /* noop */ }
      try { kakao.maps.event.removeListener(map, 'idle', schedule); } catch { /* noop */ }
    };
  }, [map]);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: { maps?: KakaoMaps } }).kakao;
    if (!kakao?.maps) return;

    for (const ov of overlaysRef.current) {
      try { ov.setMap(null); } catch { /* noop */ }
    }
    overlaysRef.current = [];

    if (!Array.isArray(listings) || listings.length === 0) return;

    const { tier1Groups, tier2Listings } = bucketListings(listings);

    const projection = (map as KakaoMapProj).getProjection?.();
    const clusters: { lat: number; lng: number; listings: MapListing[] }[] = [];
    const singletons: MapListing[] = [];

    if (projection && tier2Listings.length > 0) {
      const cells = new Map<string, MapListing[]>();
      for (const l of tier2Listings) {
        try {
          const latlng = new kakao.maps.LatLng(l.lat, l.lng);
          const p = projection.pointFromCoords(latlng);
          const cx = Math.floor(p.x / CLUSTER_CELL_PX);
          const cy = Math.floor(p.y / CLUSTER_CELL_PX);
          const key = cx + ',' + cy;
          const arr = cells.get(key);
          if (arr) arr.push(l);
          else cells.set(key, [l]);
        } catch {
          singletons.push(l);
        }
      }
      for (const arr of cells.values()) {
        if (arr.length >= 2) {
          let latSum = 0;
          let lngSum = 0;
          for (const l of arr) { latSum += l.lat; lngSum += l.lng; }
          clusters.push({
            lat: latSum / arr.length,
            lng: lngSum / arr.length,
            listings: arr,
          });
        } else {
          singletons.push(arr[0]);
        }
      }
    } else {
      for (const l of tier2Listings) singletons.push(l);
    }

    for (const g of tier1Groups) {
      const selected = selectedListingId != null && g.listings.some((l) => l.id === selectedListingId);
      const el = makeTier1Element({
        name: g.name,
        count: g.count,
        dotColor: getTier1DotColor(g.type),
        selected,
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onClickComplex) onClickComplex(g.name, g.listings);
        else if (g.listings.length > 0) onClickListing(g.listings[0].id);
      });
      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(g.lat, g.lng),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 20,
          clickable: true,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      } catch { /* SDK race */ }
    }

    for (const c of clusters) {
      const color = dominantCategoryColor(c.listings);
      const selected = selectedListingId != null && c.listings.some((l) => l.id === selectedListingId);
      const el = makeTier2Element({
        count: c.listings.length,
        categoryColor: color,
        selected,
        isCluster: true,
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.listings.length > 0) onClickListing(c.listings[0].id);
      });
      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(c.lat, c.lng),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 15,
          clickable: true,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      } catch { /* SDK race */ }
    }

    for (const l of singletons) {
      const selected = selectedListingId === l.id;
      const el = makeTier2Element({
        count: 1,
        categoryColor: getTier2BorderColor(l.type),
        selected,
        isCluster: false,
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
      } catch { /* SDK race */ }
    }

    return () => {
      for (const ov of overlaysRef.current) {
        try { ov.setMap(null); } catch { /* noop */ }
      }
      overlaysRef.current = [];
    };
  }, [map, listings, selectedListingId, onClickListing, onClickComplex, projVer]);

  return null;
}
