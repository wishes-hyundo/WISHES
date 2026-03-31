'use client';

// Debounce utility
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Area conversion: pyeong <-> sqm
function pyeongToSqm(p) { return (p * 3.305785).toFixed(2); }
function sqmToPyeong(s) { return (s / 3.305785).toFixed(2); }

// Retry wrapper for async operations
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
}

// Loading skeleton for step transitions
function StepSkeleton() {
  return React.createElement('div', { className: 'animate-pulse space-y-4 p-6' },
    React.createElement('div', { className: 'h-8 bg-gray-200 rounded w-1/3' }),
    React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded' }),
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded' }),
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded w-2/3' })
    )
  );
}




// Last updated: 2026-03-31 via GitHub API

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ExclusiveUnitSelector, { ExclusiveUnit, needsExclusivePart } from '@/components/ExclusiveUnitSelector';

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   íì ì ì
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
interface AddressData {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  sigunguCode: string;
  bcode: string;
  buildingName: string;
  bun: string;
  ji: string;
  sido: string;
  sigungu: string;
  bname: string;
}

interface BuildingInfo {h
  ê±´ë¬¼ëª: string;
  ì£¼ì©ë: string;
  ê¸°íì©ë: string;
  ê±´ë¬¼êµ¬ì¡°: string;
  ì§ë¶êµ¬ì¡°: string;
  ëì§ë©´ì : number;
  ê±´ì¶ë©´ì : number;
  ì°ë©´ì : number;
  ì©ì ë¥ ì°ì ì°ë©´ì : number;
  ê±´íì¨: number;
  ì©ì ë¥ : number;
  ì§ìì¸µì: number;
  ì§íì¸µì: number;
  ì¹ì©ìë¦¬ë² ì´í°: number;
  ë¹ìì©ìë¦¬ë² ì´í°: number;
  ì´ì£¼ì°¨ëì: number;
  ì¥ë´ê¸°ê³ìì£¼ì°¨: number;
  ì¥ë´ìì£¼ìì£¼ì°¨: number;
  ì¥ì¸ê¸°ê³ìì£¼ì°¨: number;
  ì¥ì¸ìì£¼ìì£¼ì°¨: number;
  íê°ì¼: string;
  ì°©ê³µì¼: string;
  ì¬ì©ì¹ì¸ì¼: string;
  ëì¥êµ¬ë¶: string;
  ëì¥ì¢ë¥: string;
  ëë¡ëªì£¼ì: string;
  ì§ë²ì£¼ì: string;
  ì¸ëì: number;
  í¸ì: number;
  ê°êµ¬ì: number;
  ì¸µë³ê°ì: Array<{ ì¸µë²í¸: string; ì¸µêµ¬ë¶: string; ì¸µì©ë: string; ë©´ì : number }>;
  집합건물여부: boolean;
  전유부: ExclusiveUnit[];
  _raw: Record<string, any>;
}

interface FormData {
  // ââ íì 3í­ëª© ââ
  address: string;
  addressDetail: string;
  dong: string;
  deal: string;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  type: string;
  // ââ ê±´ì¶ë¬¼ëì¥ ìëìë ¥ ââ
  building_name: string;
  building_purpose: string;
  building_structure: string;
  approval_date: string;
  site_area: number | null;
  total_floor_area: number | null;
  building_coverage_ratio: number | null;
  floor_area_ratio: number | null;
  elevator_count: number | null;
  parking_count: number | null;
  underground_floors: number | null;
  household_count: number | null;
  unit_count: number | null;
  ground_floors: number | null;
  road_address: string;
  jibun_address: string;
  sigungu_code: string;
  bcode: string;
  // ââ ì¸ë¶ì ë³´ ââ
  area_m2: number | null;
  area_supply_m2: number | null;
  floor_current: string;
  floor_total: string;
  rooms: number | null;
  bathrooms: number | null;
  direction: string;
  heating_type: string;
  maintenance_fee: number | null;
  maintenance_includes: string[];
  move_in_type: string;
  move_in_date: string;
  pet_allowed: boolean;
  parking_available: boolean;
  features: string[];
  // ââ AI ìì± ââ
  title: string;
  description: string;
  // ââ ì´ë¯¸ì§ ââ
  images: string[];
  // ââ ì¢í (Kakao Geocoder) ââ
  lat: number | null;
  lng: number | null;
  // ââ ê´ë¦¬ê·ì½ ââ
  has_management_rules: boolean;
  // ââ ìí ââ
  status: string;
}

interface UploadedImage {
  file: File;
  preview: string;
  enhanced: string | null;
  isEnhancing: boolean;
}

interface DraftListing {
  id: string;
  formData: FormData;
  buildingInfo: BuildingInfo | null;
  createdAt: string;
  updatedAt: string;
}

declare global {
  interface Window {
    daum: any;
  }
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   ìì
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
const PROPERTY_TYPES = ['ìë£¸', '1.5ë£¸', 'í¬ë£¸', 'ì°ë¦¬ë£¸+', 'ë³µì¸µ', 'ì¤í¼ì¤í', 'ìíí¸', 'ë¹ë¼', 'ìê°', 'ì¬ë¬´ì¤'];
const DEAL_TYPES = ['ìì¸', 'ì ì¸', 'ë§¤ë§¤'];
const DIRECTIONS = ['ë', 'ì', 'ë¨', 'ë¶', 'ë¨ë', 'ë¨ì', 'ë¶ë', 'ë¶ì'];
const HEATING_TYPES = ['ê°ë³ëë°©', 'ì¤ìëë°©', 'ì§ì­ëë°©'];
const MAINTENANCE_OPTIONS = ['ìë', 'ì ê¸°', 'ê°ì¤', 'ì¸í°ë·', 'TV', 'ì²­ìë¹', 'ì£¼ì°¨ë¹', 'ìë¦¬ë² ì´í°ì ì§ë¹'];
const FEATURES_OPTIONS = ['íìµì', 'ì ì¶', 'ì­ì¸ê¶', 'ì£¼ì°¨ê°ë¥', 'ë°ë ¤ëë¬¼', 'ë² ëë¤', 'ìë¦¬ë² ì´í°', 'CCTV', 'ë¶ë¦¬ìê±°', 'ë¬´ì¸íë°°', 'ê±´ì¡°ê¸°', 'ì¸íê¸°'];

const STEPS = [
  { id: 1, label: 'íìì ë³´', icon: 'ð', desc: 'ìì¬ì§Â·ê±°ëÂ·ì í' },
  { id: 2, label: 'ê±´ì¶ë¬¼ëì¥', icon: 'ðï¸', desc: 'ìëì¡°íÂ·ì¸ë¶ì ë³´' },
  { id: 3, label: 'ì¬ì§ë±ë¡', icon: 'ð¸', desc: 'ì´ë¯¸ì§Â·íì§ê°ì ' },
  { id: 4, label: 'AIë±ë¡', icon: 'ð¤', desc: 'ìëìì±Â·ìë¡ë' },
];

const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';

const INITIAL_FORM: FormData = {
  address: '', addressDetail: '', dong: '', deal: 'ìì¸',
  deposit: null, monthly: null, price: null, type: '',
  building_name: '', building_purpose: '', building_structure: '',
  approval_date: '', site_area: null, total_floor_area: null,
  building_coverage_ratio: null, floor_area_ratio: null,
  elevator_count: null, parking_count: null, underground_floors: null,
  household_count: null, unit_count: null, ground_floors: null,
  road_address: '', jibun_address: '', sigungu_code: '', bcode: '',
  area_m2: null, area_supply_m2: null, floor_current: '', floor_total: '',
  rooms: null, bathrooms: null, direction: '', heating_type: '',
  maintenance_fee: null, maintenance_includes: [], move_in_type: 'ì¦ì',
  move_in_date: '', pet_allowed: false, parking_available: false,
  features: [], title: '', description: '', images: [], lat: null, lng: null, has_management_rules: false,
  status: 'ììì ì¥',
};

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   ì í¸ë¦¬í° í¨ì
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
const formatAmount = (num: number | null | undefined): string => {
  if (num === null || num === undefined || num === 0) return '';
  if (num >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}ìµ`;
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}ì²ë§`;
  return `${num}ë§`;
};

const formatArea = (m2: number | null): string => {
  if (!m2) return '-';
  const py = (m2 / 3.3058).toFixed(1);
  return `${m2.toFixed(1)}ã¡ (${py}í)`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr.length < 8) return '-';
  return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
};

/* ââ ì´ë¯¸ì§ ìë íì§ ê°ì  (Canvas API) ââ */
function enhanceImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(img.src); return; }

        canvas.width = img.width;
        canvas.height = img.height;

        // 1ë¨ê³: ìë³¸ ê·¸ë¦¬ê¸°
        ctx.drawImage(img, 0, 0);

        // 2ë¨ê³: ë°ê¸° + ëë¹ ë³´ì 
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // íì¤í ê·¸ë¨ ë¶ì (ìë ë°ê¸° ë³´ì )
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = sum / (data.length / 4);

        // ì ìí ë°ê¸° ë³´ì  (ì´ëì´ ì¬ì§ì¼ìë¡ ë ë°ê²)
        const brightnessAdjust = avgBrightness < 100 ? 25 : avgBrightness < 130 ? 10 : 0;
        // ëë¹ ê°í ê³ì
        const contrastFactor = 1.15;
        const contrastCenter = 128;
        // ì±ë ê°í
        const saturationBoost = 1.12;

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];

          // ë°ê¸° ë³´ì 
          r += brightnessAdjust; g += brightnessAdjust; b += brightnessAdjust;

          // ëë¹ ë³´ì 
          r = contrastCenter + (r - contrastCenter) * contrastFactor;
          g = contrastCenter + (g - contrastCenter) * contrastFactor;
          b = contrastCenter + (b - contrastCenter) * contrastFactor;

          // ì±ë ê°í (HSL ê¸°ë° ê°ìí)
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * saturationBoost;
          g = gray + (g - gray) * saturationBoost;
          b = gray + (b - gray) * saturationBoost;

          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
        }

        ctx.putImageData(imageData, 0, 0);

        // 3ë¨ê³: ì¤íë (ì¸ì¤í ë§ì¤í¬ ê°ìí)
        const sharpCanvas = document.createElement('canvas');
        const sharpCtx = sharpCanvas.getContext('2d');
        if (sharpCtx) {
          sharpCanvas.width = canvas.width;
          sharpCanvas.height = canvas.height;
          // ë¸ë¬ í ì°¨ì´ í©ì±ì¼ë¡ ì¤íë í¨ê³¼
          sharpCtx.filter = 'blur(1px)';
          sharpCtx.drawImage(canvas, 0, 0);
          // ìë³¸ê³¼ ë¸ë¬ì ì°¨ì´ë¥¼ ìë³¸ì í©ì±
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.15;
          ctx.drawImage(canvas, 0, 0);
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
        }

        // ìµë í´ìë ì í (2048px)
        let finalCanvas = canvas;
        if (canvas.width > 2048 || canvas.height > 2048) {
          finalCanvas = document.createElement('canvas');
          const fCtx = finalCanvas.getContext('2d')!;
          const scale = Math.min(2048 / canvas.width, 2048 / canvas.height);
          finalCanvas.width = canvas.width * scale;
          finalCanvas.height = canvas.height * scale;
          fCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
        }

        // 4ë¨ê³: WISHES ìí°ë§í¬ ì ì©
        const wCtx = finalCanvas.getContext('2d');
        if (wCtx) {
          const w = finalCanvas.width;
          const h = finalCanvas.height;
          const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.028));
          wCtx.save();
          wCtx.font = `bold ${fontSize}px "Pretendard", "Apple SD Gothic Neo", sans-serif`;
          wCtx.textBaseline = 'middle';
          // ë°í¬ëª ë°°ê²½ ë°°ë (íë¨ ì°ì¸¡)
          const text = 'WISHES';
          const subText = 'wishes.co.kr';
          const tm = wCtx.measureText(text);
          const sm = wCtx.measureText(subText);
          const maxTw = Math.max(tm.width, sm.width);
          const padX = fontSize * 0.8;
          const padY = fontSize * 0.5;
          const bannerW = maxTw + padX * 2;
          const bannerH = fontSize * 2.6 + padY * 2;
          const bx = w - bannerW - fontSize * 0.6;
          const by = h - bannerH - fontSize * 0.6;
          // ë¥ê·¼ ì¬ê°í ë°°ê²½
          wCtx.globalAlpha = 0.55;
          wCtx.fillStyle = '#1a3a1a';
          wCtx.beginPath();
          const r = fontSize * 0.4;
          wCtx.moveTo(bx + r, by);
          wCtx.lineTo(bx + bannerW - r, by);
          wCtx.quadraticCurveTo(bx + bannerW, by, bx + bannerW, by + r);
          wCtx.lineTo(bx + bannerW, by + bannerH - r);
          wCtx.quadraticCurveTo(bx + bannerW, by + bannerH, bx + bannerW - r, by + bannerH);
          wCtx.lineTo(bx + r, by + bannerH);
          wCtx.quadraticCurveTo(bx, by + bannerH, bx, by + bannerH - r);
          wCtx.lineTo(bx, by + r);
          wCtx.quadraticCurveTo(bx, by, bx + r, by);
          wCtx.closePath();
          wCtx.fill();
          // íì¤í¸
          wCtx.globalAlpha = 0.9;
          wCtx.fillStyle = '#ffffff';
          wCtx.font = `bold ${fontSize}px "Pretendard", "Apple SD Gothic Neo", sans-serif`;
          wCtx.fillText(text, bx + padX, by + padY + fontSize * 0.6);
          wCtx.font = `${Math.round(fontSize * 0.65)}px "Pretendard", "Apple SD Gothic Neo", sans-serif`;
          wCtx.globalAlpha = 0.7;
          wCtx.fillText(subText, bx + padX, by + padY + fontSize * 1.8);
          wCtx.restore();
        }

        resolve(finalCanvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ââ AI ë§¤ë¬¼ ì ëª© ìì± ââ */
function generateTitle(form: FormData, buildingInfo: BuildingInfo | null): string {
  const parts: string[] = [];

  // ë ì´ë¦ ì¶ì¶
  const dong = form.dong || form.address.split(' ').find(s => s.endsWith('ë')) || '';
  if (dong) parts.push(dong);

  // ì­ì¸ê¶/í¹ì§
  if (form.features.includes('ì­ì¸ê¶')) parts.push('ì­ì¸ê¶');
  if (form.features.includes('ì ì¶')) parts.push('ì ì¶');
  else if (buildingInfo?.ì¬ì©ì¹ì¸ì¼) {
    const year = parseInt(buildingInfo.ì¬ì©ì¹ì¸ì¼.substring(0, 4));
    if (year >= new Date().getFullYear() - 3) parts.push('ì ì¶');
  }

  // ë§¤ë¬¼ì í
  if (form.type) parts.push(form.type);

  // ê±°ëì í
  if (form.deal) parts.push(form.deal);

  // ê¸ì¡ì ì ëª©ì í¬í¨íì§ ìì (ë³ë íì)

  return parts.join(' ') || 'ì ë§¤ë¬¼';
}

/* ââ AI ë§¤ë¬¼ ì¤ëª ìì± (ìì¬ì§/ë©´ì /ì¸µ ë± ê±´ëì¥ ë°ì´í° ì ì¸) ââ */
function generateDescription(form: FormData, buildingInfo: BuildingInfo | null): string {
  const lines: string[] = [];

  // êµíµ í¸ìì± (ì£¼ììì ì­/ì ë¥ì¥ ì¶ë¡ )
  const address = form.address || '';
  if (address.includes('ì­')) {
    const stationMatch = address.match(/(\S+ì­)/);
    if (stationMatch) lines.push(`${stationMatch[1]} ëë³´ ì´ì© ê°ë¥í ì­ì¸ê¶ ë§¤ë¬¼ìëë¤.`);
  }

  // í¹ì¥ì 
  const highlights: string[] = [];
  if (form.features.includes('íìµì')) highlights.push('íìµì(ìì´ì»¨, ëì¥ê³ , ì¸íê¸° ë± êµ¬ë¹)');
  if (form.features.includes('ì ì¶')) highlights.push('ê¹¨ëí ì ì¶ ê±´ë¬¼');
  if (form.features.includes('ì£¼ì°¨ê°ë¥') || form.parking_available) highlights.push('ì£¼ì°¨ ê°ë¥');
  if (form.features.includes('ë°ë ¤ëë¬¼') || form.pet_allowed) highlights.push('ë°ë ¤ëë¬¼ ëë° ê°ë¥');
  if (form.features.includes('ìë¦¬ë² ì´í°')) highlights.push('ìë¦¬ë² ì´í° ìë¹');
  if (form.features.includes('ë² ëë¤')) highlights.push('ëì ë² ëë¤');
  if (form.features.includes('CCTV')) highlights.push('CCTV ë³´ì ìì¤í');
  if (form.features.includes('ë¬´ì¸íë°°')) highlights.push('ë¬´ì¸íë°°í¨ ì¤ì¹');
  if (form.features.includes('ë¶ë¦¬ìê±°')) highlights.push('ë¶ë¦¬ìê±° ìì¤ ìë¹');

  if (highlights.length > 0) {
    lines.push(`ì£¼ì í¹ì§: ${highlights.join(', ')}`);
  }

  // ëë°©
  if (form.heating_type) lines.push(`${form.heating_type} ë°©ìì¼ë¡ ì¾ì í ì¤ë´íê²½ì ì ì§í©ëë¤.`);

  // ê´ë¦¬ë¹
  if (form.maintenance_fee && form.maintenance_fee > 0) {
    const includes = form.maintenance_includes.length > 0
      ? ` (${form.maintenance_includes.join(', ')} í¬í¨)`
      : '';
    lines.push(`ê´ë¦¬ë¹ ${form.maintenance_fee}ë§ì${includes}`);
  }

  // ìì£¼
  if (form.move_in_type === 'ì¦ì') {
    lines.push('ì¦ì ìì£¼ ê°ë¥í©ëë¤.');
  } else if (form.move_in_date) {
    lines.push(`${form.move_in_date} ì´í ìì£¼ ê°ë¥í©ëë¤.`);
  }

  // ë°©í¥
  if (form.direction) lines.push(`${form.direction}í¥ì¼ë¡ ì±ê´ì´ ì¢ìµëë¤.`);

  // ì£¼ë³íê²½ (ì£¼ì ê¸°ë° ì¶ë¡ )
  if (address.includes('ëí') || address.includes('íêµ')) {
    lines.push('íêµ ì¸ê·¼ì ìì¹íì¬ íµíì´ í¸ë¦¬í©ëë¤.');
  }

  if (lines.length === 0) {
    lines.push('ê¹¨ëíê³  ê´ë¦¬ ì ë ë§¤ë¬¼ìëë¤. ìì¸í ì¬í­ì ë¬¸ì ë°ëëë¤.');
  }

  return lines.join('\n');
}

/* ââ AI ì¤íì¼ë³ ì ëª© ìì± (2026 í¸ë ë) ââ */
type AiStyle = 'trendy' | 'premium' | 'clean';
type AiModel = 'template' | 'best' | 'latest';

function generateStyledTitle(form: FormData, buildingInfo: BuildingInfo | null, style: AiStyle): string {
  const dong = form.dong || form.address.split(' ').find(s => s.endsWith('ë')) || '';
  const isNew = buildingInfo?.ì¬ì©ì¹ì¸ì¼
    ? (parseInt(buildingInfo.ì¬ì©ì¹ì¸ì¼.substring(0, 4)) >= new Date().getFullYear() - 3)
    : form.features.includes('ì ì¶');
  const hasStation = form.features.includes('ì­ì¸ê¶') || form.address.includes('ì­');
  const hasFull = form.features.includes('íìµì');
  const hasParking = form.features.includes('ì£¼ì°¨ê°ë¥') || form.parking_available || (buildingInfo && buildingInfo.ì´ì£¼ì°¨ëì > 0);
  // ê¸ì¡ì ì ëª©ì í¬í¨íì§ ìì (ë³ë íì)
  // ëë¤ ë³íì ìí í¬í¼
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch (style) {
    case 'trendy': {
      const tags: string[] = [];
      if (hasStation) tags.push('ì­ì¸ê¶');
      if (isNew) tags.push(pick(['ì ì¶', 'ììíí¸', 'ì ê·']));
      if (hasFull) tags.push(pick(['íìµì', 'ì¬ìµì']));
      const vibes: string[] = [];
      if (form.direction === 'ë¨í¥' || form.direction === 'ë¨ëí¥') vibes.push(pick(['ì±ê´ë§ì§', 'íì´ê°ë', 'ë¨í¥ì±ê´']));
      if (buildingInfo && buildingInfo.ì§ìì¸µì >= 20) vibes.push(pick(['ë·°ë§ì§', 'íí¸ì¸ë·°', 'ì ë§ì¢ì']));
      if (hasParking) vibes.push(pick(['ì£¼ì°¨OK', 'ì£¼ì°¨ê°ë¥', 'ì£¼ì°¨í¸í']));
      const allTags = [...tags, ...vibes];
      const endings = ['ê½ë§¤ë¬¼', 'ì¶ì²ë§¤ë¬¼', 'í«ë§¤ë¬¼', 'ê¸ë§¤', 'ê°ì¶!', 'íì ì²´í¬!'];
      const typeStr = form.type || '';
      const formats = [
        `${dong ? dong + ' ' : ''}${allTags.join(' ')} ${typeStr} ${pick(endings)}`,
        `â¨ ${dong} ${typeStr} | ${allTags.length > 0 ? allTags.join(' Â· ') : pick(endings)}`,
        `[${dong || 'ì­ì¸ê¶'}] ${typeStr} ${allTags.join(' ')} ${pick(endings)}`,
        `${dong} ${pick(endings)} ${typeStr} ${allTags.length > 0 ? ' #' + allTags.join(' #') : ''}`,
      ];
      return pick(formats).replace(/\s+/g, ' ').trim();
    }
    case 'premium': {
      const name = buildingInfo?.ê±´ë¬¼ëª || dong;
      const adj: string[] = [];
      if (isNew) adj.push('ì ì¶');
      adj.push(form.type || 'ë§¤ë¬¼');
      if (form.direction) adj.push(form.direction);
      if (hasFull) adj.push('íìµì');
      const formats = [
        `${name} íë¦¬ë¯¸ì ${adj.join(' ')}`,
        `[${name}] ${adj.join(' ')} `,
        `${name} ${adj.join(' ')}`,
      ];
      return pick(formats).trim();
    }
    case 'clean':
    default:
      return generateTitle(form, buildingInfo);
  }
}

/* ââ AI ì¤íì¼ë³ ì¤ëª ìì± (ê±´ì¶ë¬¼ëì¥ ì ë³´ ì ì¸) ââ */
function generateStyledDescription(form: FormData, buildingInfo: BuildingInfo | null, style: AiStyle): string {
  const isNew = buildingInfo?.ì¬ì©ì¹ì¸ì¼
    ? (parseInt(buildingInfo.ì¬ì©ì¹ì¸ì¼.substring(0, 4)) >= new Date().getFullYear() - 3)
    : form.features.includes('ì ì¶');
  const hasStation = form.features.includes('ì­ì¸ê¶') || form.address.includes('ì­');
  const station = form.address.match(/(\S+ì­)/);
  // ëë¤ ë³íì ìí í¬í¼
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch (style) {
    case 'trendy': {
      const lines: string[] = [];
      const hooks = ['ìì·¨ì/ì§ì¥ì¸ ì£¼ëª©!', 'ì´ ê°ê²©ì ì´ í´ë¦¬í°? ì¤í?', 'ëì¹ë©´ ííí  ê½ë§¤ë¬¼!', 'ì´ê±° ì§ì§ ë¹¨ë¦¬ ëê°ëë¤!', 'ê°ì±ë¹ ëíì ë§¤ë¬¼!', 'ì´ ì¡°ê±´ ë¤ì ìëìì!', 'ì§ê¸ ë°ë¡ ìì£¼ ê°ë¥!', 'ë°ë¡ ìì£¼ ê°ë¥í ê½ë§¤ë¬¼!'];
      lines.push(pick(hooks));
      lines.push('');

      // ê¸°ë³¸ ë§¤ë¬¼ ì ë³´ (í­ì íì)
      const dong = form.dong || form.address.split(' ').find((s: string) => s.endsWith('ë')) || '';
      if (dong) lines.push(`ð ìì¹: ${dong}${form.addressDetail ? ' ' + form.addressDetail : ''}`);

      if (form.deal === 'ìì¸') {
        lines.push(`ð° ìì¸ ${form.deposit ? form.deposit + '/': ''}${form.monthly || ''}ë§ì`);
      } else if (form.deal === 'ì ì¸') {
        lines.push(`ð° ì ì¸ ${form.deposit || ''}ë§ì`);
      } else if (form.deal === 'ë§¤ë§¤') {
        lines.push(`ð° ë§¤ë§¤ ${form.price || ''}ë§ì`);
      }

      if (form.area_m2) lines.push(`ð ì ì©ë©´ì  ${form.area_m2}ã¡${form.area_supply_m2 ? ` (ê³µê¸ ${form.area_supply_m2}ã¡)` : ''}`);
      if (form.type) lines.push(`ð  ë§¤ë¬¼ì í: ${form.type}`);
      lines.push('');

      // ì¡°ê±´ë¶ í­ëª©
      if (hasStation) lines.push(`ð ${station ? station[1] : 'ì§íì² ì­'} ëë³´ ì´ì© ê°ë¥`);
      if (form.features.includes('íìµì')) lines.push(pick(['ð  íìµì (ìì´ì»¨Â·ëì¥ê³ Â·ì¸íê¸°Â·ì¸ëì)', 'ð  ìµì ìë¹ - ìì£¼ ì ì¶ê° ë¹ì© ìì!']));
      if (isNew) lines.push(pick(['â¨ ê¹ëí ì ì¶ ì»¨ëì', 'â¨ ì ì¶ ê±´ë¬¼ë¡ ìí ìµì!']));
      if (form.parking_available || form.features.includes('ì£¼ì°¨ê°ë¥')) lines.push('ð¿ï¸ ì£¼ì°¨ ê°ë¥');
      if (form.features.includes('ìë¦¬ë² ì´í°') || (buildingInfo && buildingInfo.ì¹ì©ìë¦¬ë² ì´í° > 0)) lines.push('ð ìë¦¬ë² ì´í° ìë¹');
      if (form.direction === 'ë¨í¥' || form.direction === 'ë¨ëí¥') lines.push(pick(['âï¸ ë¨í¥ ì±ê´ ìµê³ ', 'âï¸ íì´ ê°ëí ë¨í¥ ë°°ì¹']));
      if (form.features.includes('CCTV')) lines.push('ð¹ CCTV ë³´ì');
      if (form.features.includes('ë¬´ì¸íë°°')) lines.push('ð¦ ë¬´ì¸íë°°í¨');
      if (form.features.includes('ë°ë ¤ëë¬¼') || form.pet_allowed) lines.push('ð¾ ë°ë ¤ëë¬¼ OK');
      if (form.floor_current) lines.push(`ð¢ ${form.floor_current}ì¸µ${form.floor_total ? '/' + form.floor_total + 'ì¸µ' : ''}`);
      if (form.rooms) lines.push(`ðï¸ ë°© ${form.rooms}ê°${form.bathrooms ? ' / íì¥ì¤ ' + form.bathrooms + 'ê°' : ''}`);

      lines.push('');

      // ë§ë¬´ë¦¬ ë©í¸
      const closings = [
        'ð ë¬¸ìì£¼ì¸ì! ìë´ ë°ë¡ ê°ë¥í©ëë¤.',
        'ð ë¹ ë¥¸ ìì£¼ ìíìë©´ ì§ê¸ ë¬¸ìíì¸ì!',
        'ð ìë´ ë¬¸ì íìí©ëë¤. ë¹ ë¥¸ ëµë³ ëë¦¬ê² ìµëë¤!',
        'ð ì¢ì ì¡°ê±´, ë§ì¡±ì¤ë¬ì´ ìì£¼! ë¬¸ìíì¸ì.',
        'ð ìì¸ ì¬ì§ê³¼ ì ë³´ë ë¬¸ì ì ìë´ëë¦½ëë¤!',
      ];
      lines.push(pick(closings));

      return lines.join('\n');
    }
    case 'premium': {
      const lines: string[] = [];
      const bName = buildingInfo?.ê±´ë¬¼ëª;
      lines.push(bName ? `${bName} ë´ íë¦¬ë¯¸ì ë§¤ë¬¼ì ìê°ëë¦½ëë¤.` : 'ìì ë íë¦¬ë¯¸ì ë§¤ë¬¼ì ìê°ëë¦½ëë¤.');
      lines.push('');
      lines.push('[ ì£¼ì í¹ì§ ]');
      if (hasStation) lines.push(`â¢ êµíµ: ${station ? station[1] : 'ì§íì² ì­'} ëë³´ê¶ ì­ì¸ê¶ ìì§`);
      if (form.direction) lines.push(`â¢ í¥: ${form.direction} ë°°ì¹ë¡ ì°ìí ì±ê´ íë³´`);
      if (form.features.includes('íìµì')) lines.push('â¢ ìµì: ìì´ì»¨, ëì¥ê³ , ì¸íê¸° ë± íìµì ìë¹');
      if (form.parking_available || form.features.includes('ì£¼ì°¨ê°ë¥')) lines.push('â¢ ì£¼ì°¨: ì ì© ì£¼ì°¨ ê³µê° íë³´');
      if (form.features.includes('CCTV')) lines.push('â¢ ë³´ì: CCTV ì¤ì¹');
      lines.push('');
      lines.push('[ ë¹ì© ìë´ ]');
      if (form.maintenance_fee && form.maintenance_fee > 0) {
        const inc = form.maintenance_includes.length > 0 ? ` (${form.maintenance_includes.join(', ')} í¬í¨)` : '';
        lines.push(`â¢ ê´ë¦¬ë¹: ì ${form.maintenance_fee}ë§ì${inc}`);
      }
      if (form.heating_type) lines.push(`â¢ ëë°©: ${form.heating_type}`);
      lines.push('');
      if (form.move_in_type === 'ì¦ì') lines.push('ì¦ì ìì£¼ ê°ë¥íì¤ë, ìì¸ ë¬¸ìë ì°ë½ ë¶íëë¦½ëë¤.');
      else if (form.move_in_date) lines.push(`${form.move_in_date} ì´í ìì£¼ ê°ë¥í©ëë¤. ìì¸ ë¬¸ìë ì°ë½ ë¶íëë¦½ëë¤.`);
      else lines.push('ìì¸ ë¬¸ìë ì°ë½ ë¶íëë¦½ëë¤.');
      return lines.join('\n');
    }
    case 'clean':
    default:
      return generateDescription(form, buildingInfo);
  }
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   ë©ì¸ ì»´í¬ëí¸
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function SmartListingNewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCopyMode, setIsCopyMode] = useState(false)
  const [copySourceId, setCopySourceId] = useState(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === ë³µì¬ ë±ë¡ (Copy Listing) Feature ===
  useEffect(() => {
    const copyFrom = searchParams.get('copyFrom');
    if (!copyFrom) return;
    setCopySourceId(copyFrom);
    setIsCopyMode(true);
    
    const fetchListingForCopy = async () => {
      try {
        const res = await fetch('/api/admin/listings/' + copyFrom, {
          headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
        });
        if (!res.ok) {
          alert('ë³µì¬í  ë§¤ë¬¼ì ë¶ë¬ì¬ ì ììµëë¤.');
          setIsCopyMode(false);
          return;
        }
        const data = await res.json();
        const listing = data.data || data;
        
        setForm(prev => ({
          ...prev,
          type: listing.type || '',
          deal: listing.deal || '',
          address: listing.address || '',
          addressDetail: '',
          dong: listing.dong || '',
          building_name: listing.building_name || '',
          road_address: listing.road_address || '',
          jibun_address: listing.jibun_address || '',
          deposit: listing.deposit || '',
          price: listing.price || '',
          monthly: listing.monthly || '',
          area_m2: listing.area_m2 || '',
          area_supply_m2: listing.area_supply_m2 || '',
          floor_current: '',
          floor_total: listing.floor_total || '',
          rooms: listing.rooms || '',
          bathrooms: listing.bathrooms || '',
          parking_available: listing.parking_available !== undefined ? listing.parking_available : '',
          heating_type: listing.heating_type || '',
          direction: listing.direction || '',
          maintenance_fee: listing.maintenance_fee || '',
          maintenance_includes: listing.maintenance_includes || '',
          move_in_type: listing.move_in_type || '',
          move_in_date: listing.move_in_date || '',
          features: listing.features || '',
          title: (listing.title ? listing.title + ' (ë³µì¬)' : ''),
          description: ''
        }));
        
        if (listing.address) {
          setAddressData({ address: listing.address, roadAddress: listing.road_address || '', jibunAddress: listing.jibun_address || '' });
        }
      } catch (err) {
        alert('ë³µì¬ ì¤ ì¤ë¥ê° ë°ìíìµëë¤: ' + err.message);
        setIsCopyMode(false);
      }
    };
    
    fetchListingForCopy();
  }, [searchParams]);


  /* ââ State ââ */
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [addressData, setAddressData] = useState<AddressData | null>(null);
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [buildingRawData, setBuildingRawData] = useState<Record<string, any> | null>(null);
  const [exclusiveUnits, setExclusiveUnits] = useState<ExclusiveUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<ExclusiveUnit | null>(null);
  const [isCollectiveBuilding, setIsCollectiveBuilding] = useState(false);
  const [showBuildingDoc, setShowBuildingDoc] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [touchedFields, setTouchedFields] = useState({});
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const abortRef = React.useRef(null);

  // Hydration fix
  React.useEffect(() => { setIsMounted(true); }, []);

  // Real-time field validation
  const fieldErrors = React.useMemo(() => {
    const errors = {};
    if (touchedFields.address && !form.address) errors.address = 'ì£¼ìë¥¼ ìë ¥í´ì£¼ì¸ì';
    if (touchedFields.type && !form.type) errors.type = 'ë§¤ë¬¼ ì íì ì íí´ì£¼ì¸ì';
    if (touchedFields.deal && !form.deal) errors.deal = 'ê±°ë ì íì ì íí´ì£¼ì¸ì';
    if (touchedFields.price && form.deal === 'sale' && !form.price) errors.price = 'ë§¤ë§¤ê°ë¥¼ ìë ¥í´ì£¼ì¸ì';
    if (touchedFields.deposit && (form.deal === 'jeonse' || form.deal === 'monthly') && !form.deposit) errors.deposit = 'ë³´ì¦ê¸ì ìë ¥í´ì£¼ì¸ì';
    if (touchedFields.monthly && form.deal === 'monthly' && !form.monthly) errors.monthly = 'ìì¸ë¥¼ ìë ¥í´ì£¼ì¸ì';
    return errors;
  }, [form, touchedFields]);
  const [toast, setToast] = useState<{ type: string; text: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftListing[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiStyleOption, setAiStyleOption] = useState<AiStyle>('trendy');
  const [aiModel, setAiModel] = useState<AiModel>('template');
  const [showAddressModal, setShowAddressModal] = useState(false);

  const [formHistory, setFormHistory] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  /* ââ ì£¼ì ê²ì íì ë©ìì§ ìì  ââ */
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [])

  /* ââ Toast ìë ë«ê¸° ââ */
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /* ââ í¤ë³´ë ë¨ì¶í¤ (Alt+ì¢ì° íì´íë¡ ì¤í ì´ë) ââ */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (formHistory.length > 0) {
          const prev = formHistory[formHistory.length - 1];
          setForm(prev);
          setFormHistory(h => h.slice(0, -1));
          setCanUndo(formHistory.length > 1);
          setToast({ type: 'info', message: 'ëëë¦¬ê¸° ìë£' });
        }
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey && e.key === 'ArrowRight' && currentStep < 4) {
        e.preventDefault();
        setCurrentStep(prev => Math.min(prev + 1, 4));
      }
      if (e.altKey && e.key === 'ArrowLeft' && currentStep > 1) {
        e.preventDefault();
        setCurrentStep(prev => Math.max(prev - 1, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  /* ââ ì¤í ë³ê²½ ì ì¤í¬ë¡¤ & í¬ì»¤ì¤ ââ */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const timer = setTimeout(() => {
      const firstInput = document.querySelector('.step-content input:not([type=hidden]), .step-content select, .step-content textarea');
      if (firstInput) firstInput.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [currentStep]);

  /* ââ ììì ì¥ ê´ë¦¬ (localStorage) ââ */
  const loadDrafts = () => {
    try {
      const saved = localStorage.getItem('wishes_drafts');
      if (saved) setDrafts(JSON.parse(saved));
    } catch {}
  };

  const saveDraft = useCallback(async (formToSave?: FormData) => {
    const data = formToSave || form;
    const id = draftId || `draft_${Date.now()}`;
    const draft: DraftListing = {
      id, formData: data, buildingInfo,
      createdAt: draftId ? (drafts.find(d => d.id === id)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = drafts.filter(d => d.id !== id);
    const newDrafts = [draft, ...existing];
    setDrafts(newDrafts);
    setDraftId(id);
    localStorage.setItem('wishes_drafts', JSON.stringify(newDrafts));
    setToast({ type: 'success', text: 'ììì ì¥ ìë£' });
      setLastSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    return id;
  }, [form, buildingInfo, draftId, drafts]);

  // Warn before leaving with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (form.address || uploadedImages.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form.address, uploadedImages.length]);

  // Auto-save every 30 seconds
  React.useEffect(() => {
    if (!form.address) return;
    const timer = setInterval(() => { saveDraft(); }, 30000);
    return () => clearInterval(timer);
  }, [saveDraft, form.address]);

  
  // Duplicate listing from existing draft
  const duplicateListing = React.useCallback((draft) => {
    if (!draft) return;
    setForm(prev => ({
      ...prev,
      ...draft,
      title: (draft.title || '') + ' (ë³µì¬)',
    }));
    setCurrentStep(1);
    setDraftId(null);
    toast({ type: 'success', message: 'ë§¤ë¬¼ì´ ë³µì¬ëììµëë¤. ìì  í ë±ë¡í´ì£¼ì¸ì.' });
  }, [toast]);

// Keyboard shortcuts: Ctrl+S save, Ctrl+Enter next step
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDraft();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (currentStep < 4) setCurrentStep(prev => Math.min(prev + 1, 4));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveDraft, currentStep]);

  const loadDraft = (draft: DraftListing) => {
    setForm(draft.formData);
    setBuildingInfo(draft.buildingInfo);
    setDraftId(draft.id);
    setShowDrafts(false);
    // ë¨ê³ ìë íë¨
    if (draft.formData.images.length > 0) setCurrentStep(4);
    else if (draft.formData.building_name || draft.buildingInfo) setCurrentStep(3);
    else setCurrentStep(1);
    setToast({ type: 'info', text: 'ììì ì¥ ë§¤ë¬¼ì ë¶ë¬ììµëë¤' });
  };

  const deleteDraft = (id: string) => {
    const newDrafts = drafts.filter(d => d.id !== id);
    setDrafts(newDrafts);
    localStorage.setItem('wishes_drafts', JSON.stringify(newDrafts));
    if (draftId === id) setDraftId(null);
  };

  /* ââ í¼ ìë°ì´í¸ í¬í¼ ââ */
    /* ââ Undo ê¸°ë¥ (Ctrl+Z) ââ */
  const pushHistory = (prevForm) => {
    setFormHistory(h => [...h.slice(-9), prevForm]);
    setCanUndo(true);
  };

  const undoLastChange = () => {
    if (formHistory.length === 0) return;
    const prev = formHistory[formHistory.length - 1];
    setForm(prev);
    setFormHistory(h => h.slice(0, -1));
    setCanUndo(formHistory.length > 1);
    setToast({ type: 'info', message: 'ëëë¦¬ê¸° ìë£' });
  };

const updateForm = (updates: Partial<FormData>) => {
    pushHistory(form);
    setForm(prev => ({ ...prev, ...updates }));
  };

  /* ââ Step 1: ì£¼ì ê²ì (embed ëª¨ë¬ ë°©ì) ââ */
  const openAddressSearch = () => {
    setShowAddressModal(true);
    setTimeout(() => {
      const container = postcodeContainerRef.current;
      if (!container) return;
      const w = window as unknown as { daum?: { Postcode: new (opts: Record<string, unknown>) => { embed: (el: HTMLElement) => void } } };
      if (!w.daum?.Postcode) {
        alert('ì£¼ì ê²ì ì¤í¬ë¦½í¸ë¥¼ ë¡ë© ì¤ìëë¤. ì ì í ë¤ì ìëí´ì£¼ì¸ì.');
        setShowAddressModal(false);
        return;
      }
      container.innerHTML = '';
      new w.daum.Postcode({
        oncomplete: (data: AddressData & Record<string, string>) => {
          const addr: AddressData = {
            roadAddress: data.roadAddress || '',
            jibunAddress: data.jibunAddress || '',
            zonecode: data.zonecode || '',
            sigugunCode: data.sigunguCode || '',
            bcode: data.bcode || '',
            buildingName: data.buildingName || '',
            bun: (() => { const m = (data.jibunAddress || '').match(/(\d+)(-\d+)?$/); return m ? m[1].padStart(4, '0') : ''; })(),
            ji: (() => { const m = (data.jibunAddress || '').match(/\d+-(\d+)$/); return m ? m[1].padStart(4, '0') : '0000'; })(),
            sido: data.sido || '',
            sigungu: data.sigungu || '',
            bname: data.bname || '',
          };
          setAddressData(addr);
          setShowAddressModal(false);
          const selectedAddr = data.roadAddress || data.jibunAddress;
          updateForm({
            address: selectedAddr,
            addressDetail: '',
            jibunAddress: data.jibunAddress,
            zonecode: data.zonecode,
            dong: data.bname || '',
          });

          // Kakao Geocoderë¡ ì¢í ë³í (ì§ë ë§ì»¤ì©)
          if (selectedAddr && typeof window !== 'undefined' && window.kakao?.maps?.services) {
            try {
              const geocoder = new window.kakao.maps.services.Geocoder();
              geocoder.addressSearch(selectedAddr, (result: any[], status: string) => {
                if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
                  const lat = parseFloat(result[0].y);
                  const lng = parseFloat(result[0].x);
                  updateForm({ lat, lng });
                  // console.log('[Geocoding] success:', { lat, lng });
                }
              });
            } catch (e) {
              // console.warn('[Geocoding] error:', e);
            }
          }
        },
        width: '100%',
        height: '100%',
      }).embed(container);
    }, 100);
  };

  /* —— Step 2: 건축물대장 자동 조회 —— */
  const fetchBuildingLedger = async () => {
    if (!addressData) return;
    setBuildingLoading(true);
    setBuildingError(null);
    setSelectedUnit(null);
    setExclusiveUnits([]);
    setIsCollectiveBuilding(false);

    try {
      const sigunguCd = addressData.sigunguCode || addressData.bcode?.substring(0, 5) || '';
      const bjdongCd = addressData.bcode?.substring(5, 10) || '';

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const preCheck = needsExclusivePart(form.type || '');
      const ops = ['basis', 'recapTitle', 'title', 'floor'];
      if (preCheck === true) {
        ops.push('exposPubuseArea');
      }

      const res = await fetch('/api/building-ledger', {
        signal: abortRef.current.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sigunguCd,
          bjdongCd,
          platGbCd: '0',
          bun: addressData.bun || '0000',
          ji: addressData.ji || '0000',
          operations: ops,
        }),
      });

      if (!res.ok) throw new Error(`건축물대장 API 오류 (${res.status})`);

      const result = await res.json();
      if (!result.success) throw new Error(result.error || '건축물대장 조회 실패');

      const info: BuildingInfo = result.extracted;

      const isCollective = info.집합건물여부 || info.대장구분 === '집합';
      setIsCollectiveBuilding(isCollective);

      if (isCollective && preCheck !== true) {
        try {
          const exRes = await fetch('/api/building-ledger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sigunguCd,
              bjdongCd,
              platGbCd: '0',
              bun: addressData.bun || '0000',
              ji: addressData.ji || '0000',
              operations: ['exposPubuseArea'],
            }),
          });
          if (exRes.ok) {
            const exResult = await exRes.json();
            if (exResult.success && exResult.extracted?.전유부?.length > 0) {
              info.전유부 = exResult.extracted.전유부;
              info.집합건물여부 = true;
            }
          }
        } catch (e) {
          console.warn('[전유부] 추가 조회 실패:', e);
        }
      }

      if (info.전유부 && info.전유부.length > 0) {
        setExclusiveUnits(info.전유부);
      }

      setBuildingInfo(info);
      setBuildingRawData(result.data);

      updateForm({
        building_name: info.건물명 || form.building_name,
        building_purpose: info.주용도,
        building_structure: info.건물구조,
        approval_date: info.사용승인일,
        site_area: info.대지면적 || null,
        total_floor_area: info.연면적 || null,
        building_coverage_ratio: info.건폐율 || null,
        floor_area_ratio: info.용적률 || null,
        elevator_count: (info.승용엘리베이터 || 0) + (info.비상용엘리베이터 || 0),
        parking_count: info.총주차대수 || null,
        underground_floors: info.지하층수 || null,
        household_count: info.세대수 || null,
        unit_count: info.호수 || null,
        ground_floors: info.지상층수 || null,
        floor_total: info.지상층수 ? `${info.지상층수}` : '',
      });

      await saveDraft();
      setToast({ type: 'success', text: '건축물대장 조회 완료 · 임시저장됨' });
    } catch (err: any) {
      setBuildingError(err.message || '건축물대장 조회 중 오류');
      setToast({ type: 'error', text: err.message || '건축물대장 조회 실패' });
    } finally {
      setBuildingLoading(false);
    }
  };

  /* 전유부 호실 선택 핸들러 */
  const handleSelectUnit = (unit: ExclusiveUnit) => {
    setSelectedUnit(unit);
    updateForm({
      area_m2: unit.exclusiveArea,
      area_supply_m2: unit.totalArea,
      floor_current: String(unit.floorNum),
    });
    setToast({ type: 'success', text: `${unit.dongNm ? unit.dongNm + ' ' : ''}${unit.hoNm} 선택 → 면적/층수 자동입력` });
  };

  /* ââ Step 2 â 3 ì í ì ìë ì¡°í ââ */
  const goToStep2 = async () => {
    setCurrentStep(2);
    if (addressData && !buildingInfo) {
      await fetchBuildingLedger();
    }
  };

    // Auto-fetch building ledger when address is selected
    React.useEffect(() => {
      if (addressData && !buildingInfo && !buildingLoading) {
        fetchBuildingLedger();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressData]);

  /* ââ ê±´ì¶ë¬¼ëì¥ PDF ë¤ì´ë¡ë ââ */
  const downloadBuildingPdf = () => {
    if (!buildingInfo) return;
    const bi = buildingInfo;
    const fmtDate = (d: string) => d ? `${d.substring(0,4)}.${d.substring(4,6)}.${d.substring(6,8)}` : '-';
    const fmtArea = (v: number) => v ? `${v.toFixed(2)}ã¡` : '0.00ã¡';
    const floorRows = (bi.ì¸µë³ê°ì || []).map(f =>
      `<tr><td style="padding:4px 6px;border:1px solid #333;text-align:center;">${f.ì¸µë²í¸}</td><td style="padding:4px 6px;border:1px solid #333;">${f.ì¸µêµ¬ë¶}</td><td style="padding:4px 6px;border:1px solid #333;">${f.ì¸µì©ë}</td><td style="padding:4px 6px;border:1px solid #333;text-align:right;">${f.ë©´ì ?.toFixed(2)}ã¡</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ê±´ì¶ë¬¼ëì¥ - ${bi.ê±´ë¬¼ëª||bi.ì§ë²ì£¼ì||'ì¡°íê²°ê³¼'}</title>
<style>@page{size:A4;margin:15mm}body{font-family:'Batang','NanumMyeongjo',serif;font-size:11px;color:#000;margin:0;padding:15mm}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;border:1px solid #333}.label{background:#f0f0f0;font-weight:bold;width:80px}
h2{font-size:20px;border-bottom:3px double #000;padding-bottom:8px;margin:8px 0 4px}
@media print{body{padding:0}}</style></head><body>
<div style="text-align:center;margin-bottom:20px">

<div style="font-size:9px;color:#888">êµ­í êµíµë¶ ê±´ì¶ë¬¼ëì¥ ì ë³´</div>
<h2>ê±´ ì¶ ë¬¼ ë ì¥</h2>
<div style="font-size:9px;color:#aaa">(ê±´ì¶ë¬¼ëì¥HUB ìë¹ì¤ API ì¡°í ê²°ê³¼)</div></div>
<table style="margin-bottom:12px">
<tr><td class="label">ëì¥ êµ¬ë¶</td><td>${bi.ëì¥êµ¬ë¶||'-'}</td><td class="label">ëì¥ ì¢ë¥</td><td>${bi.ëì¥ì¢ë¥||'-'}</td></tr>
<tr><td class="label">ëë¡ëªì£¼ì</td><td colspan="3">${bi.ëë¡ëªì£¼ì||form.road_address||'-'}</td></tr>
<tr><td class="label">ì§ë²ì£¼ì</td><td colspan="3">${bi.ì§ë²ì£¼ì||form.jibun_address||'-'}</td></tr>
<tr><td class="label">ê±´ë¬¼ëª</td><td>${bi.ê±´ë¬¼ëª||'-'}</td><td class="label">ì£¼ì©ë</td><td>${bi.ì£¼ì©ë||'-'}</td></tr>
<tr><td class="label">ê¸°íì©ë</td><td colspan="3">${bi.ê¸°íì©ë||'-'}</td></tr>
<tr><td class="label">ê±´ë¬¼êµ¬ì¡°</td><td>${bi.ê±´ë¬¼êµ¬ì¡°||'-'}</td><td class="label">ì§ë¶êµ¬ì¡°</td><td>${bi.ì§ë¶êµ¬ì¡°||'-'}</td></tr>
<tr><td class="label">ëì§ë©´ì </td><td>${fmtArea(bi.ëì§ë©´ì )}</td><td class="label">ê±´ì¶ë©´ì </td><td>${fmtArea(bi.ê±´ì¶ë©´ì )}</td></tr>
<tr><td class="label">ì°ë©´ì </td><td>${fmtArea(bi.ì°ë©´ì )}</td><td class="label">ì©ì ë¥ ì°ì ì°ë©´ì </td><td>${fmtArea(bi.ì©ì ë¥ ì°ì ì°ë©´ì )}</td></tr>
<tr><td class="label">ê±´íì¨</td><td>${bi.ê±´íì¨?.toFixed(2)||'0.00'}%</td><td class="label">ì©ì ë¥ </td><td>${bi.ì©ì ë¥ ?.toFixed(2)||'0.00'}%</td></tr>
<tr><td class="label">ì§ìì¸µì</td><td>${bi.ì§ìì¸µì}ì¸µ</td><td class="label">ì§íì¸µì</td><td>${bi.ì§íì¸µì}ì¸µ</td></tr>
<tr><td class="label">ì¹ê°ê¸°</td><td>ì¹ì© ${bi.ì¹ì©ìë¦¬ë² ì´í°}ë / ë¹ì ${bi.ë¹ìì©ìë¦¬ë² ì´í°}ë</td><td class="label">ì´ì£¼ì°¨</td><td>${bi.ì´ì£¼ì°¨ëì}ë</td></tr>
<tr><td class="label">ì¸ëì</td><td>${bi.ì¸ëì}ì¸ë</td><td class="label">í¸ì</td><td>${bi.í¸ì}í¸</td></tr>
<tr><td class="label">íê°ì¼</td><td>${fmtDate(bi.íê°ì¼)}</td><td class="label">ì°©ê³µì¼</td><td>${fmtDate(bi.ì°©ê³µì¼)}</td></tr>
<tr><td class="label">ì¬ì©ì¹ì¸ì¼</td><td colspan="3">${fmtDate(bi.ì¬ì©ì¹ì¸ì¼)}</td></tr>
</table>
${floorRows ? `<div style="margin-top:16px">
<h3 style="font-size:13px;font-weight:bold;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:8px">ì¸µë³ ê°ì</h3>
<table style="font-size:10px">
<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:4px 6px;border:1px solid #333;text-align:center;width:60px">ì¸µ</td><td style="padding:4px 6px;border:1px solid #333;width:80px">êµ¬ë¶</td><td style="padding:4px 6px;border:1px solid #333">ì©ë</td><td style="padding:4px 6px;border:1px solid #333;text-align:right;width:80px">ë©´ì </td></tr>
${floorRows}</table></div>` : ''}
<div style="margin-top:20px;text-align:center;font-size:9px;color:#999">
ì¡°íì¼ì: ${new Date().toLocaleString('ko-KR')} | ì¶ì²: êµ­í êµíµë¶ ê±´ì¶ë¬¼ëì¥ì ë³´ ìë¹ì¤</div>
</body></html>`;
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('íìì´ ì°¨ë¨ëììµëë¤. íì íì© í ë¤ì ìëí´ì£¼ì¸ì.'); return; }
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => { printWin.print(); };
  };

  /* ââ Step 3: ì´ë¯¸ì§ ìë¡ë + ìë íì§ ê°ì  ââ */
  const handleImageFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    const newImages: UploadedImage[] = fileArray.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      enhanced: null,
      isEnhancing: true,
    }));

    setUploadedImages(prev => [...prev, ...newImages]);

    // ìë íì§ ê°ì 
    for (let i = 0; i < fileArray.length; i++) {
      try {
        const enhanced = await enhanceImage(fileArray[i]);
        setUploadedImages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(img => img.file === fileArray[i]);
          if (idx >= 0) { updated[idx] = { ...updated[idx], enhanced, isEnhancing: false }; }
          return updated;
        });
      } catch {
        setUploadedImages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(img => img.file === fileArray[i]);
          if (idx >= 0) { updated[idx] = { ...updated[idx], isEnhancing: false }; }
          return updated;
        });
      }
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= uploadedImages.length) return;
    setUploadedImages(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
  };

  /* ââ AI ìë ìì± (ì¤íì¼ë³) ââ */
  const runAiAutoFill = async (style: AiStyle = 'trendy', model: AiModel = 'template') => {
    setAiGenerating(true);
    try {
      // ì´ì  ê²°ê³¼ í´ë¦¬ì´
      updateForm({ title: '', description: '' });
      await new Promise(r => setTimeout(r, 300));

      if (model === 'template') {
        // ë¹ ë¥¸ìì±: ë¡ì»¬ ííë¦¿ ê¸°ë°
        const newTitle = generateStyledTitle(form, buildingInfo, style);
        const newDesc = generateStyledDescription(form, buildingInfo, style);
        updateForm({ title: newTitle, description: newDesc });
      } else {
        // AI ìì±: API í¸ì¶ (best=Opus, latest=Sonnet)
        const res = await fetch('/api/admin/generate-description', {
          signal: abortRef.current?.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: form.address,
            dong: form.dong,
            type: form.type,
            deal: form.deal,
            deposit: form.deposit,
            monthly: form.monthly,
            price: form.price,
            area_m2: form.area_m2,
            area_supply_m2: form.area_supply_m2,
            floor_current: form.floor_current,
            floor_total: form.floor_total,
            direction: form.direction,
            rooms: form.rooms,
            bathrooms: form.bathrooms,
            features: form.features,
            parking_available: form.parking_available,
            buildingInfo: buildingInfo,
            style: style,
            aiModel: model,
          }),
        });
        if (!res.ok) throw new Error(`AI ìì± API ì¤ë¥ (${res.status})`);
        const data = await res.json();
        if (data.success && data.title) {
          const aiTitle = generateStyledTitle(form, buildingInfo, style);
          updateForm({ title: aiTitle, description: data.description || '' });
        } else if (data.success && data.description) {
          const newTitle = generateStyledTitle(form, buildingInfo, style);
          updateForm({ title: newTitle, description: data.description });
        } else {
          throw new Error(data.error || 'AI ìì± ì¤í¨');
        }
      }
    } catch (err) {
      console.error('AI auto fill error:', err);
      // AI ì¤í¨ì ííë¦¿ í´ë°±
      const newTitle = generateStyledTitle(form, buildingInfo, style);
      const newDesc = generateStyledDescription(form, buildingInfo, style);
      updateForm({ title: newTitle, description: newDesc });
    } finally {
      setAiGenerating(false);
    }
  };

  /* ââ ë§¤ë¬¼ ìë¡ë (ìë² ë±ë¡) ââ */
  const publishListing = async (mode: 'instant' | 'review' | 'draft') => {
    setIsPublishing(true);

    if (mode !== 'draft') {
    if (!form.address?.trim()) { setToast({ type: 'error', text: 'ì£¼ìë¥¼ ìë ¥í´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if (!form.type) { setToast({ type: 'error', text: 'ë§¤ë¬¼ ì íì ì íí´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if (!form.deal) { setToast({ type: 'error', text: 'ê±°ë ì íì ì íí´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if (form.deal === 'ë§¤ë§¤' && !form.price) { setToast({ type: 'error', text: 'ë§¤ë§¤ê°ë¥¼ ìë ¥í´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if ((form.deal === 'ì ì¸' || form.deal === 'ìì¸') && !form.deposit) { setToast({ type: 'error', text: 'ë³´ì¦ê¸ì ìë ¥í´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if (form.deal === 'ìì¸' && !form.monthly) { setToast({ type: 'error', text: 'ìì¸ë¥¼ ìë ¥í´ì£¼ì¸ì.' }); setIsPublishing(false); return; }
      if (uploadedImages.length === 0) { setToast({ type: 'error', text: 'ì´ë¯¸ì§ë¥¼ 1ì¥ ì´ì ë±ë¡í´ì£¼ì¸ì.' }); setIsPublishing(false); return; }

      }

    try {
      // FormData êµ¬ì± (ì´ë¯¸ì§ íì¼ + ë§¤ë¬¼ ë°ì´í°)
      const compressImage = async (f: File): Promise<Blob> => { if (!window.createImageBitmap) return f; const bmp = await createImageBitmap(f); const cv = document.createElement('canvas'); let w = bmp.width, h = bmp.height; if (w > 1600) { h = Math.round(h * 1600 / w); w = 1600; } if (h > 1600) { w = Math.round(w * 1600 / h); h = 1600; } cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0, w, h); bmp.close(); const wmImg = new Image(); wmImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAABXCAYAAACtHW8eAAAHg0lEQVR4AeyZi5IVKRBEr/v//7zOGU2jROgGmmdTE6bQRT2zUiN2/e/jP0UM/G9+igLdeQgDLughNHuRUQy4oAuZ/vH1Q8jX8YPTsRYDLui19uHdPGTABf2QQA9fiwEX9Fr76NjNGald0Gfs+ZgpXdDHrPqMQV3QZ+z5mCld0Mes+oxBXdBn7PmYKV3Qn8+nZNv8yzf+Ork71mHABV2wC0TMvxAKfBeEu+sABlzQGSQjXICQrTvf2IG1+30eAy7oG+4lVsQbc5VdfjEft41jwAWd4BqBAgQLEm7fZt4B/t8G/20aAy7oCPUSJiKNPCdN+BMLkk7+0JWBG0F3rb1ccoQIECaoaZA4QB5Qk8Nj6hlwQX9xh/AAQgRfpse/lIe8j5N5gmwGjhY0YgOwJQFybwVyAmqAVnk9T5qBIwWNuAC0IDjAvRfID6gJetXxvJ/PcYKWoBAYGCkC6gF6ACNrn1LrGEEjIICgwMwFUx/QD5jZy5/aL7m8XtAIBiAgsNLe6AfQH1ipt117ea2gEQhAMGDlBdEfoF+wcq+r9/Y6QSMIgEDA6guw/dEvoH9g3/yex8BrBI0AAIIAeeOv6UX/gHnAml2u2dXWgmbZAgIAa9Jc1xXzAM3IWZfpnKgtBc1iAWti4YB7J0xPy3yARjQ3d8e/DGwlaJYJGIMFA+6ngHkBHAinzJ475xaCtstjoSB3wDf6MT9gNssN36djaUFrWSxPOH1hdn7Libiy7yfelxS0XQ5LO3ExJTPDESDGcsf3aVhK0FoGyxFOW8iTeS1n4vJJvh1jnwm60cQi3y6kUeoj01gexe0pREwVtMi2CziF+BFzWl7F9Yi6M2tMEbTItYTPJOHttS3P4v6tMw8VtCUTkt9K6qpzwTmgP7sLvt+CIYK25EEoeAuBO84B/4De7W743h3dBQ1hkASBgLtjDQbYB6Ab7Yl7DLvYugkaggCEgV0IObFP9gPYF9iZg+aChhAAQWBnck7rnX0B9gd2nL+ZoCEAQAjYkQzv+RcD2h/7/GXZ5/fHgmZowMgigrtjbwbYJWC3YJdpHglagzI42GVo7zOfAfYK2DXIj5zjWSVoBgMMCua0vkrVM/pgz4C9g1WnLha0hmG4VYfyvvoxoL1LB/0q1WXOFjQDAAYCdeU86g0MsH+AHkDPmchvoVoxG29ZgiaYAQBBDmcABqQH9MF3K5APkI8aFtiAtckX+6WgcQQE4+xwBkIG0AZAJyB8z/0mViAfyI3Fl1j8k4LGAUeAo8MZuGJAOkE3V37hG/6AeCH0Kfn+R9AkByQvSRTzddtZDKAZgH7A1fS8A/zBlW/OGznI95egMRDMI6fDGahhQPqRnmwObAAfYN9a3P8IumeRFo16jr0YkFjRFZ1zAuwAW0so97eg9dGygOdyBhAuQF+wwZ2zBZSTXPb+LeiWhSjgcAYsA+gLWNvTO/kQMuAOyPktaC4OZ+ABA1NCETGwxV3Qlg2/b8+AC3r7FfoAlgEXtGXD79sz4ILefoU+gGXABf3FBv+lnMLX85G/UnxgX5mQW0EzQAk0bE0MsXdxOT5hDmJikF/sTbYrH71dnr8flY/ztynrwB9kOWc6kS8FpUi9Y8/xwW8GbgXN/xYRUg3qnVM+3AXZ7Kk3zpg9ZpMvp2D97F3vnNbOPbYQ/ELgKxCju0756zt2xnxiNhurd07ZuQuyhafeY2foG34zH7D2uzyhv42ddb8V9KzGetWNLYHF9ajXK2+PXsOcqd5T9jB+1vc0QceEFSNhJoEza8e46GXL3UWv+i3zNhH0mwhpSa7nGs9AkaBr/sZysY9faqxize5ieVa3FQm68TDJdCv9IUAIQrLhTR5azaE8nKuNPlXQd8IdRdhdH6straQfZgMlMfjWxBA3G8WCToksRoBsqZjZw9v69Aqs7fQ7fICdeCgWdO1wO4ia2Vgg4L47Ws1BHrADH8MEnUuGiOv1ByA3L32A3L539nsTJ1WCziFAYrjzld9IQdz1ZHt50h+xV7B1WtzDWiU5SzmhVn7+cZ5Vgk61t+qQsX5HLJAaV4j19cQW1irNRXxJzIr7biroOzJyCcv1u6t3904dcOd30jt8gNyZVxN1V0HnEiNSdOaS2cqPPsFdvln93fXV4x0+QI/cPXNWC/pq2F0Xz0ygJ+Ejc7eYhRxgZN9PalULOlX0Tsw7kLNDjyn+QzuzgNBe+n2V427npbWe+DcXdG0zIuWKuNrciqOGIFvq7NmHrTn6Hs6vb867Xnbg5JGgrwa8ersjzt/7MJAj2prKK+36kaBrhidmBQJ6LZf5dsUbOJki6NTCVxB6qje378FAF0G/QZixv612nis2T6lEYzlW4+SxoGcNBLkgtZSrt1SM7LHY1JwxX5sn9Z6yE8sb4B4iZcePtxR4zwHxMb+YPcVJLH6U7bGgaxsNyQi/P5905hi5MW/8gN6oAfTNWwx612ljZOMklvMOoV/4nYq3ftxByrfWzmzAxlMnhH3nHsZgWwFNBM1wFrmD1cSQ28bl3ImxiMXo/epNPjpjvimbYjhTPjE7/iD29sRGTotYLr1fvclnlfMnAAAA///aV8sfAAAABklEQVQDAFxMVPlUj304AAAAAElFTkSuQmCC'; await new Promise(r => { if (wmImg.complete) r(undefined); else wmImg.onload = () => r(undefined); }); ctx.save(); ctx.globalAlpha = 0.10; const wmW = Math.round(w * 0.22); const wmH = Math.round(wmW * wmImg.naturalHeight / wmImg.naturalWidth); const diag = Math.sqrt(w * w + h * h); const step = Math.round(w * 0.3); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); for (let y = -diag; y < diag; y += step) { for (let x = -diag; x < diag; x += step) { ctx.drawImage(wmImg, x - wmW / 2, y - wmH / 2, wmW, wmH); } } ctx.restore(); return new Promise(res => cv.toBlob(bl => res(bl!), 'image/jpeg', 0.7)); }; const fd = new window.FormData();

      // ì´ë¯¸ì§ íì¼ ì¶ê° (enhanced ì°ì , ìì¼ë©´ ìë³¸)
      setUploadProgress(0);
      for (const img of uploadedImages) {
        setUploadProgress(prev => prev + 1);
        if (useEnhanced && img.enhanced) {
          try {
            const resp = await withRetry(() => fetch(img.enhanced), 2, 500);
            const blob = await resp.blob();
            fd.append('images', blob, img.file.name.replace(/\.\w+$/, '.webp'));
          } catch (e) {
            // console.warn('[Enhanced fetch failed, using original]', e);
            fd.append('images', await compressImage(img.file), img.file.name);
          }
        } else {
          fd.append('images', await compressImage(img.file), img.file.name);
        }
      }

      // ë§¤ë¬¼ ë°ì´í° íë
      fd.append('title', form.title || generateTitle(form, buildingInfo));
      fd.append('address', form.address.trim());
      fd.append('address_detail', form.addressDetail || '');
      fd.append('dong', form.dong || '');
      fd.append('type', form.type);
      fd.append('deal', form.deal);
      fd.append('deposit', String(Number(form.deposit) || 0));
      fd.append('monthly', form.monthly ? String(Number(form.monthly)) : '');
      fd.append('price', form.price ? String(Number(form.price)) : '');
      fd.append('maintenance_fee', String(Number(form.maintenance_fee) || 0));
      fd.append('maintenance_includes', JSON.stringify(form.maintenance_includes?.length > 0 ? form.maintenance_includes : []));
      fd.append('features', JSON.stringify(form.features || []));
      fd.append('area_m2', String(Number(form.area_m2) || 0));
      fd.append('area_supply_m2', form.area_supply_m2 ? String(Number(form.area_supply_m2)) : '');
      fd.append('floor_current', form.floor_current || '');
      fd.append('floor_total', form.floor_total || '');
      fd.append('rooms', form.rooms ? String(Number(form.rooms)) : '');
      fd.append('bathrooms', form.bathrooms ? String(Number(form.bathrooms)) : '');
      fd.append('direction', form.direction || '');
      fd.append('description', form.description || generateDescription(form, buildingInfo));
      fd.append('parking', String(!!(form.parking_available || (form.parking_count && form.parking_count > 0))));
      fd.append('elevator', String(!!(form.elevator_count && form.elevator_count > 0)));
      fd.append('built_year', form.approval_date || '');
      fd.append('heating_type', form.heating_type || '');
      fd.append('pet', String(!!form.pet_allowed));
      if (form.lat) fd.append('lat', String(form.lat));
      if (form.lng) fd.append('lng', String(form.lng));
      if (mode === 'draft') {
        fd.append('status', 'ë¹ê³µê°');
      }

      // console.log('[publishListing] FormData, images:', uploadedImages.length, 'coords:', form.lat, form.lng);

      const res = await withRetry(() => fetch('/api/admin/listings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        body: fd,
      }), 2, 1500);

      if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Non-JSON response ' + res.status + ' ' + res.statusText }));
          console.error('[publishListing] ìë¬ ìëµ:', errBody);
          const errMsg = errBody?.error || errBody?.message || `ë§¤ë¬¼ ë±ë¡ ì¤í¨ (${res.status})`;
          throw new Error(errMsg);
        }

      // ììì ì¥ ì­ì 
      if (draftId) deleteDraft(draftId);

      const modeText = mode === 'draft' ? 'ììì ì¥ ìë£! (ë¹ê³µê° ìí)' : mode === 'instant' ? 'ë§¤ë¬¼ì´ ë±ë¡ëììµëë¤!' : 'ë§¤ë¬¼ì´ ì ì¥ëììµëë¤! (ê²ì ëê¸°)';
      setToast({ type: 'success', text: modeText });

      setTimeout(() => router.push('/admin/listings'), 1500);
    } catch (err: any) {
            console.error('[publishListing] error:', err); setToast({ type: 'error', text: `ë§¤ë¬¼ ë±ë¡ ì¤í¨: ${err?.message || String(err) || 'ì ì ìë ì¤ë¥'}` });
    } finally {
      setIsPublishing(false);
    }
  };

  /* ââ íìí­ëª© ì²´í¬ ââ */
  // Step completion validation for checkmarks
    const isStepComplete = (stepId: number): boolean => {
      switch (stepId) {
        case 1: return !!(form.address && form.deal && form.type && ((form.deal === 'ë§¤ë§¤' && form.price) || (form.deal === 'ì ì¸' && form.deposit) || (form.deal === 'ìì¸' && form.deposit !== null && form.monthly !== null)));
        case 2: return !!buildingInfo;
        case 3: return uploadedImages.length > 0;
        case 4: return !!form.title;
        default: return false;
      }
    };

  /* ââ íë ì í¨ì± ìê° í¼ëë°± ââ */
  const fieldError = (fieldName) => {
    if (!touchedFields[fieldName]) return '';
    const value = form[fieldName];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return 'ring-2 ring-red-300 border-red-300';
    }
    return 'ring-2 ring-green-200 border-green-300';
  };

  const showFieldHint = (fieldName, label) => {
    if (!touchedFields[fieldName]) return null;
    const value = form[fieldName];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return <span className="text-xs text-red-500 mt-1">{label} ìë ¥ì´ íìí©ëë¤</span>;
    }
    return null;
  };

    const isStep1Valid = form.address && form.deal && form.type &&
    ((form.deal === 'ë§¤ë§¤' && form.price) ||
     (form.deal === 'ì ì¸' && form.deposit) ||
     (form.deal === 'ìì¸' && form.deposit !== null && form.monthly !== null));

  /* ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
     ë ëë§
  ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-gray-50" suppressHydrationWarning>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-border { 0%, 100% { border-color: #86efac; } 50% { border-color: #22c55e; } }
        .field-success { animation: pulse-border 2s ease-in-out; }
        .drag-overlay-active { backdrop-filter: blur(4px); }
        .step-content { animation: fadeIn 0.3s ease-in-out; }
        .image-card:hover { transform: scale(1.02); transition: transform 0.2s ease; }
      `}</style>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {toast.text}
        </div>
      )}


      {/* ë³µì¬ ë±ë¡ ëª¨ë ë°°ë */}
      {isCopyMode && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 15px rgba(102,126,234,0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px' }}>ë³µì¬ ë±ë¡ ëª¨ë</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>ê¸°ì¡´ ë§¤ë¬¼ ì ë³´ê° ìë ìë ¥ëììµëë¤. í¸ì/ì¸µì ë±ë§ ìì íì¸ì.</div>
            </div>
          </div>
          <button
            onClick={() => { setIsCopyMode(false); setCopySourceId(null); window.history.replaceState({}, '', '/admin/listings/new'); }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            ì¼ë° ë±ë¡ì¼ë¡ ì í
          </button>
        </div>
      )}

      {/* í¤ë */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/listings')}
              className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">ì¤ë§í¸ ë§¤ë¬¼ ë±ë¡</h1>
          </div>
          <div className="flex items-center gap-2">
            {canUndo && (
                <button
                  type="button"
                  onClick={undoLastChange}
                  className="p-2 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                  title="ëëë¦¬ê¸° (Ctrl+Z)"
                  aria-label="ëëë¦¬ê¸°"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                </button>
              )}
              <div className="relative group">
                <button type="button" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="ë¨ì¶í¤ ìë´">
                  <span className="text-sm font-mono">?</span>
                </button>
                <div className="absolute right-0 top-full mt-1 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div className="font-semibold mb-2 text-green-400">ë¨ì¶í¤ ìë´</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>ë¤ì ë¨ê³</span><kbd className="px-1 bg-gray-700 rounded">Alt + &rarr;</kbd></div>
                    <div className="flex justify-between"><span>ì´ì  ë¨ê³</span><kbd className="px-1 bg-gray-700 rounded">Alt + &larr;</kbd></div>
                    <div className="flex justify-between"><span>ììì ì¥</span><kbd className="px-1 bg-gray-700 rounded">Ctrl + S</kbd></div>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowDrafts(!showDrafts)}
              className="relative px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition">
              ð ììì ì¥ ëª©ë¡
              {drafts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {drafts.length}
                </span>
              )}
            </button>
            <button onClick={() => saveDraft()}
              className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              ð¾ ììì ì¥
            </button>
            {lastSavedAt && (
              <span className="text-xs text-gray-400 hidden sm:inline">ð¢ {lastSavedAt} ì ì¥ë¨</span>
            )}
          </div>
        </div>

        
            {/* ìëì ì¥ ìí íì */}
            {lastSavedAt && (
              <div className="flex items-center justify-end text-xs text-gray-400 mb-2 -mt-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5 animate-pulse" />
                ìëì ì¥ë¨ {new Date(lastSavedAt).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}
              </div>
            )}
{/* ì¤í ì¸ëì¼ì´í° */}
        <div role="navigation" aria-label="ë§¤ë¬¼ ë±ë¡ ë¨ê³" className="max-w-6xl mx-auto px-6 pb-4">
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => (step.id <= currentStep + 1 || (step.id === 2 && isStep1Valid)) && setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    currentStep === step.id
                      ? 'bg-green-700 text-white shadow-md'
                      : step.id < currentStep
                        ? 'bg-green-100 text-green-800 cursor-pointer hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="text-base">{isStepComplete(step.id) && currentStep !== step.id ? 'â' : step.icon}</span>
                  <div className="text-left">
                    <div className="font-semibold text-xs leading-tight">STEP {step.id}</div>
                    <div className="text-[10px] leading-tight opacity-80">{step.label}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${step.id < currentStep ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ììì ì¥ ëë¡­ë¤ì´ */}
      {showDrafts && (
        <div className="fixed inset-0 z-30" onClick={() => setShowDrafts(false)}>
          <div className="absolute top-24 right-6 w-96 bg-white rounded-xl shadow-2xl border max-h-[500px] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b font-semibold text-gray-800">ð ììì ì¥ ëª©ë¡ ({drafts.length}ê±´)</div>
            {drafts.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">ììì ì¥ë ë§¤ë¬¼ì´ ììµëë¤</div>
            ) : (
              drafts.map(draft => (
                <div key={draft.id} className="p-4 border-b hover:bg-gray-50 transition">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 cursor-pointer" onClick={() => loadDraft(draft)}>
                      <div className="font-medium text-sm text-gray-900">
                        {draft.formData.address || 'ì£¼ì ë¯¸ìë ¥'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {draft.formData.type || 'ì í ë¯¸ì í'} Â· {draft.formData.deal} Â·{' '}
                        {new Date(draft.updatedAt).toLocaleString('ko-KR')}
                      </div>
                    </div>
                    <button onClick={() => deleteDraft(draft.id)}
                      className="text-red-400 hover:text-red-600 p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      
            {/* ì ì²´ ì§íë¥  ë° */}
            <div className="w-full bg-gray-100 rounded-full h-1 mb-6 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-600 h-1 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${([1,2,3,4].filter(s => isStepComplete(s)).length / 4) * 100}%` }}
              />
            </div>
{/* ë©ì¸ ì»¨íì¸  */}
      <div role="main" aria-label="ë§¤ë¬¼ ë±ë¡ í¼" className="max-w-6xl mx-auto px-6 py-8">

        {/* ââââ STEP 1: íìì ë³´ ìë ¥ ââââ */}
        {currentStep === 1 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">1</span>
                  íì ì ë³´ ìë ¥
                </h2>
                <p className="text-sm text-gray-500 mt-1 ml-10">3ê°ì§ íì í­ëª©ë§ ìë ¥íë©´ ëë¨¸ì§ë ìëì¼ë¡ ì±ìì§ëë¤</p>
              </div>

              {/* ìì¬ì§ */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ð ìì¬ì§ <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={form.address}
                      readOnly
                      placeholder="ì£¼ìë¥¼ ê²ìí´ì£¼ì¸ì"
                      className="w-full px-4 py-3 border rounded-xl bg-gray-50 text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                      onClick={openAddressSearch}
                    />
                    {addressData && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        <div>ëë¡ëª: {addressData.roadAddress}</div>
                        <div>ì§ë²: {addressData.jibunAddress}</div>
                        <div>ë: {form.dong} | ì°í¸ë²í¸: {addressData.zonecode}</div>
                      </div>
                    )}
                  </div>
                  <button onClick={openAddressSearch}
                    className="px-5 py-3 bg-green-700 text-white rounded-xl font-medium hover:bg-green-800 transition shrink-0">
                    ð ì£¼ì ê²ì
                  </button>
                </div>
                <input
                  type="text"
                  value={form.addressDetail}
                  onChange={e => updateForm({ addressDetail: e.target.value })}
                  placeholder="ìì¸ì£¼ì (ë/í¸ì)"
                  className="w-full mt-2 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* ê±°ëê°ê²© */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ð° ê±°ëì í ë° ê°ê²© <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 mb-3">
                  {DEAL_TYPES.map(d => (
                    <button key={d} onClick={() => updateForm({ deal: d, deposit: null, monthly: null, price: null })}
                      className={`flex-1 py-3 rounded-xl font-semibold transition ${
                        form.deal === d ? 'bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(form.deal === 'ìì¸' || form.deal === 'ì ì¸') && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ë³´ì¦ê¸ (ë§ì)</label>
                      <input type="text" inputMode="numeric"
                        value={form.deposit != null ? form.deposit.toLocaleString() : ''}
                        placeholder="ì: 1,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ deposit: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === 'ìì¸' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ìì¸ (ë§ì)</label>
                      <input type="text" inputMode="numeric"
                        value={form.monthly != null ? form.monthly.toLocaleString() : ''}
                        placeholder="ì: 50"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ monthly: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === 'ë§¤ë§¤' && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">ë§¤ë§¤ê° (ë§ì)</label>
                      <input type="text" inputMode="numeric"
                        value={form.price != null ? form.price.toLocaleString() : ''}
                        placeholder="ì: 30,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ price: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                </div>
                {/* ê°ê²© ë¯¸ë¦¬ë³´ê¸° */}
                {(form.deposit || form.monthly || form.price) && (
                  <div className="mt-2 text-sm text-green-700 font-medium">
                    ðµ {form.deal === 'ë§¤ë§¤' ? `ë§¤ë§¤ê° ${formatAmount(form.price)}` :
                         form.deal === 'ì ì¸' ? `ì ì¸ ${formatAmount(form.deposit)}` :
                         `ë³´ì¦ê¸ ${formatAmount(form.deposit)} / ìì¸ ${formatAmount(form.monthly)}`}
                  </div>
                )}
              </div>

              {/* ë§¤ë¬¼ì í */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ð  ë§¤ë¬¼ì í <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PROPERTY_TYPES.map(t => (
                    <button key={t} onClick={() => updateForm({ type: t })}
                      className={`py-3 rounded-xl font-medium text-sm transition ${
                        form.type === t ? 'bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* ìë ¥ ì§í ìí */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                <div className={`w-2 h-2 rounded-full ${form.address ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.address ? 'text-green-700' : 'text-gray-400'}>ìì¬ì§</span>
                <div className={`w-2 h-2 rounded-full ${form.transactionType ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.transactionType ? 'text-green-700' : 'text-gray-400'}>ê±°ëì í</span>
                <div className={`w-2 h-2 rounded-full ${form.propertyType ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.propertyType ? 'text-green-700' : 'text-gray-400'}>ë§¤ë¬¼ì í</span>
              </div>
              {/* ë¤ì ë²í¼ */}
              <div className="flex justify-end pt-4 border-t">
                <button onClick={goToStep2} disabled={!isStep1Valid}
                  className={`px-8 py-3 rounded-xl font-semibold text-white transition ${
                    isStep1Valid ? 'bg-green-700 hover:bg-green-800 shadow-lg' : 'bg-gray-300 cursor-not-allowed'
                  }`}>
                  ë¤ì â ê±´ì¶ë¬¼ëì¥ ìëì¡°í
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ââââ STEP 2: ê±´ì¶ë¬¼ëì¥ + ì¸ë¶ì ë³´ ââââ */}
        {currentStep === 2 && (
          <div className="step-content animate-[fadeIn_0.3s_ease-in-out] grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ì¢ì¸¡: ê±´ì¶ë¬¼ëì¥ */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">2</span>
                    ê±´ì¶ë¬¼ëì¥ ì ë³´
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={fetchBuildingLedger} disabled={buildingLoading}
                      className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                      {buildingLoading ? 'â³ ì¡°í ì¤...' : 'ð ì¬ì¡°í'}
                    </button>
                    <button onClick={() => setShowBuildingDoc(!showBuildingDoc)}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                      ð {showBuildingDoc ? 'ì ë³´ ë³´ê¸°' : 'ìë³¸ ë³´ê¸°'}
                    </button>
                    {buildingInfo && (
                      <button onClick={downloadBuildingPdf}
                        className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                        ð¥ PDF ì ì¥
                      </button>
                    )}
                  </div>
                </div>

                {buildingLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-3 border-green-700 border-t-transparent rounded-full" />
                    <span className="ml-3 text-gray-500">ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤...</span>
                  </div>
                )}

                {buildingError && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
                    â ï¸ {buildingError}
                    <button onClick={fetchBuildingLedger} className="ml-2 underline">ì¬ìë</button>
                  </div>
                )}

                {buildingInfo && !showBuildingDoc && (
                  <div className="space-y-4 text-sm">
                    {/* ê¸°ë³¸ ì ë³´ */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">ð¢ ê±´ë¬¼ ê¸°ë³¸ì ë³´</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">ê±´ë¬¼ëª:</span> {buildingInfo.ê±´ë¬¼ëª || '-'}</div>
                        <div><span className="text-gray-400">ì£¼ì©ë:</span> {buildingInfo.ì£¼ì©ë || '-'}</div>
                        <div><span className="text-gray-400">êµ¬ì¡°:</span> {buildingInfo.ê±´ë¬¼êµ¬ì¡° || '-'}</div>
                        <div><span className="text-gray-400">ì§ë¶:</span> {buildingInfo.ì§ë¶êµ¬ì¡° || '-'}</div>
                        <div><span className="text-gray-400">ì¬ì©ì¹ì¸:</span> {formatDate(buildingInfo.ì¬ì©ì¹ì¸ì¼)}</div>
                        <div><span className="text-gray-400">ëì¥êµ¬ë¶:</span> {buildingInfo.ëì¥êµ¬ë¶ || '-'}</div>
                      </div>
                    </div>

                    {/* ë©´ì /ë¹ì¨ */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">ð ë©´ì  Â· ë¹ì¨</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">ëì§ë©´ì :</span> {formatArea(buildingInfo.ëì§ë©´ì )}</div>
                        <div><span className="text-gray-400">ê±´ì¶ë©´ì :</span> {formatArea(buildingInfo.ê±´ì¶ë©´ì )}</div>
                        <div><span className="text-gray-400">ì°ë©´ì :</span> {formatArea(buildingInfo.ì°ë©´ì )}</div>
                        <div><span className="text-gray-400">ê±´íì¨:</span> {buildingInfo.ê±´íì¨?.toFixed(1)}%</div>
                        <div><span className="text-gray-400">ì©ì ë¥ :</span> {buildingInfo.ì©ì ë¥ ?.toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* ì¸µì/ì¹ê°ê¸°/ì£¼ì°¨ */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">ð¢ ì¸µì Â· ìì¤</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">ì§ì/ì§í:</span> {buildingInfo.ì§ìì¸µì}ì¸µ / B{buildingInfo.ì§íì¸µì}</div>
                        <div><span className="text-gray-400">ì¹ê°ê¸°:</span> {(buildingInfo.ì¹ì©ìë¦¬ë² ì´í°||0) + (buildingInfo.ë¹ìì©ìë¦¬ë² ì´í°||0)}ë</div>
                        <div><span className="text-gray-400">ì£¼ì°¨:</span> {buildingInfo.ì´ì£¼ì°¨ëì}ë</div>
                        <div><span className="text-gray-400">ì¸ë/í¸ì:</span> {buildingInfo.ì¸ëì}ì¸ë / {buildingInfo.í¸ì}í¸</div>
                      </div>
                    </div>

                    {/* ì¸µë³ ê°ì */}
                    {buildingInfo.ì¸µë³ê°ì && buildingInfo.ì¸µë³ê°ì.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h3 className="font-semibold text-gray-800 mb-2">ð ì¸µë³ê°ì</h3>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400 border-b">
                              <th className="text-left py-1">ì¸µ</th><th className="text-left py-1">êµ¬ë¶</th>
                              <th className="text-left py-1">ì©ë</th><th className="text-right py-1">ë©´ì (ã¡)</th>
                            </tr></thead>
                            <tbody>
                              {buildingInfo.ì¸µë³ê°ì.map((f, i) => (
                                <tr key={i} className="text-gray-600 border-b border-gray-100">
                                  <td className="py-1">{f.ì¸µë²í¸}</td><td className="py-1">{f.ì¸µêµ¬ë¶}</td>
                                  <td className="py-1">{f.ì¸µì©ë}</td><td className="text-right py-1">{f.ë©´ì ?.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ê±´ì¶ë¬¼ëì¥ ìë³¸ ì´ë¯¸ì§ (ê³µë¬¸ì ì¤íì¼) */}

              {/* 전유부 호실 선택 (집합건물일 때) */}
              {exclusiveUnits.length > 0 && (
                <ExclusiveUnitSelector
                  units={exclusiveUnits}
                  onSelectUnit={handleSelectUnit}
                  selectedUnit={selectedUnit}
                  propertyType={form.type}
                />
              )}

              {/* 집합건물인데 전유부 없는 경우 안내 */}
              {isCollectiveBuilding && exclusiveUnits.length === 0 && buildingInfo && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 text-xs text-amber-700 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>집합건물로 확인되었으나 전유부 데이터를 불러오지 못했습니다. 면적 정보를 직접 입력해주세요.</span>
                </div>
              )}

              {/* 일반건물 안내 */}
              {buildingInfo && !isCollectiveBuilding && !showBuildingDoc && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mt-3 text-xs text-gray-500 flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>일반건축물입니다. 면적 정보를 직접 입력합니다.</span>
                </div>
              )}

                {buildingInfo && showBuildingDoc && (
                  <div className="border-2 border-gray-800 rounded-lg bg-white p-6 text-sm font-['Batang','serif']">
                    <div className="text-center mb-4">
                      <div className="text-xs text-gray-500 mb-1">êµ­í êµíµë¶ ê±´ì¶ë¬¼ëì¥ ì ë³´</div>
                      <h3 className="text-lg font-bold border-b-2 border-black pb-2">ê±´ ì¶ ë¬¼ ë ì¥</h3>
                      <div className="text-xs text-gray-400 mt-1">
                        (ê±´ì¶ë¬¼ëì¥HUB ìë¹ì¤ API ì¡°í ê²°ê³¼)
                      </div>
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">ëì¥ êµ¬ë¶</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ëì¥êµ¬ë¶}</td>
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">ëì¥ ì¢ë¥</td>
                          <td className="p-2">{buildingInfo.ëì¥ì¢ë¥}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ëë¡ëªì£¼ì</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.ëë¡ëªì£¼ì || form.road_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì§ë²ì£¼ì</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.ì§ë²ì£¼ì || form.jibun_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ê±´ë¬¼ëª</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ê±´ë¬¼ëª || '-'}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì£¼ì©ë</td>
                          <td className="p-2">{buildingInfo.ì£¼ì©ë}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ê±´ë¬¼êµ¬ì¡°</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ê±´ë¬¼êµ¬ì¡°}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì§ë¶êµ¬ì¡°</td>
                          <td className="p-2">{buildingInfo.ì§ë¶êµ¬ì¡° || '-'}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ëì§ë©´ì </td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ëì§ë©´ì ?.toFixed(2)}ã¡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ê±´ì¶ë©´ì </td>
                          <td className="p-2">{buildingInfo.ê±´ì¶ë©´ì ?.toFixed(2)}ã¡</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì°ë©´ì </td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ì°ë©´ì ?.toFixed(2)}ã¡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ê±´íì¨</td>
                          <td className="p-2">{buildingInfo.ê±´íì¨?.toFixed(2)}%</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì©ì ë¥ </td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ì©ì ë¥ ?.toFixed(2)}%</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì¬ì©ì¹ì¸ì¼</td>
                          <td className="p-2">{formatDate(buildingInfo.ì¬ì©ì¹ì¸ì¼)}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì§ìì¸µì</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ì§ìì¸µì}ì¸µ</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì§íì¸µì</td>
                          <td className="p-2">{buildingInfo.ì§íì¸µì}ì¸µ</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì¹ê°ê¸°</td>
                          <td className="p-2 border-r border-gray-600">ì¹ì© {buildingInfo.ì¹ì©ìë¦¬ë² ì´í°}ë / ë¹ì {buildingInfo.ë¹ìì©ìë¦¬ë² ì´í°}ë</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì´ì£¼ì°¨</td>
                          <td className="p-2">{buildingInfo.ì´ì£¼ì°¨ëì}ë</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì¸ëì</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.ì¸ëì}ì¸ë</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">í¸ì</td>
                          <td className="p-2">{buildingInfo.í¸ì}í¸</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">íê°ì¼</td>
                          <td className="p-2 border-r border-gray-600">{formatDate(buildingInfo.íê°ì¼)}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">ì°©ê³µì¼</td>
                          <td className="p-2">{formatDate(buildingInfo.ì°©ê³µì¼)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="mt-4 text-center text-xs text-gray-400">
                      ì¡°íì¼ì: {new Date().toLocaleString('ko-KR')} | ì¶ì²: êµ­í êµíµë¶ ê±´ì¶ë¬¼ëì¥ì ë³´ ìë¹ì¤
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ì°ì¸¡: ì¸ë¶ì ë³´ */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h3 className="font-bold text-gray-900 mb-4">ð ì¸ë¶ì ë³´ (ìì  ê°ë¥)</h3>

                <div className="space-y-4">
                  {/* ë©´ì  */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ì ì©ë©´ì  (ã¡)</label>
                      <input type="number" step="0.1" value={form.area_m2 ?? ''} placeholder="ì: 33.5"
                        onChange={e => updateForm({ area_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ê³µê¸ë©´ì  (ã¡)</label>
                      <input type="number" step="0.1" value={form.area_supply_m2 ?? ''} placeholder="ì: 45.2"
                        onChange={e => updateForm({ area_supply_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* ì¸µ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">í´ë¹ì¸µ</label>
                      <input type="text" value={form.floor_current} placeholder="ì: 5"
                        onChange={e => updateForm({ floor_current: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ì ì²´ì¸µ</label>
                      <input type="text" value={form.floor_total} readOnly
                        className="w-full px-3 py-2.5 border rounded-lg bg-gray-50 text-sm text-gray-500" />
                    </div>
                  </div>

                  {/* ë°©/ìì¤ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ë°© ê°ì</label>
                      <input type="number" value={form.rooms ?? ''} placeholder="ì: 2"
                        onChange={e => updateForm({ rooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ìì¤ ì</label>
                      <input type="number" value={form.bathrooms ?? ''} placeholder="ì: 1"
                        onChange={e => updateForm({ bathrooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* ë°©í¥ / ëë°© */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ë°©í¥</label>
                      <select value={form.direction} onChange={e => updateForm({ direction: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">ì í</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ëë°©ë°©ì</label>
                      <select value={form.heating_type} onChange={e => updateForm({ heating_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">ì í</option>
                        {HEATING_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ê´ë¦¬ë¹ */}
              {/* ê´ë¦¬ë¹ ëìë§ */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ê´ë¦¬ë¹ (ë§ì)</label>
                    <input type="text" inputMode="numeric" value={form.maintenance_fee != null ? form.maintenance_fee.toLocaleString() : ''} placeholder="ì: 5"
                      onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateForm({ maintenance_fee: raw ? Number(raw) : null }); }}
                      className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MAINTENANCE_OPTIONS.map(opt => (
                        <button key={opt} onClick={() => {
                          const arr = form.maintenance_includes.includes(opt)
                            ? form.maintenance_includes.filter(o => o !== opt)
                            : [...form.maintenance_includes, opt];
                          updateForm({ maintenance_includes: arr });
                        }}
                          className={`px-2 py-1 text-xs rounded-md transition ${
                            form.maintenance_includes.includes(opt) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>


                  {/* ê´ë¦¬ê·ì½ (ì¤í¼ì¤í) */}
                  {form.type === 'ì¤í¼ì¤í' && (
                    <div className="flex items-center gap-2 mt-1 mb-2">
                      <input
                        type="checkbox"
                        id="management_rules"
                        checked={form.has_management_rules}
                        onChange={e => updateForm({ has_management_rules: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <label htmlFor="management_rules" className="text-sm text-gray-700">ê´ë¦¬ê·ì½ íì¸</label>
                    </div>
                  )}

                  {/* ìì£¼ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">ìì£¼ì í</label>
                      <select value={form.move_in_type} onChange={e => updateForm({ move_in_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="ì¦ì">ì¦ì ìì£¼</option>
                        <option value="íì">íì</option>
                        <option value="ë ì§ì§ì ">ë ì§ ì§ì </option>
                      </select>
                    </div>
                    {form.move_in_type === 'ë ì§ì§ì ' && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">ìì£¼ìì ì¼</label>
                        <input type="date" value={form.move_in_date}
                          onChange={e => updateForm({ move_in_date: e.target.value })}
                          className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                      </div>
                    )}
                  </div>

                  {/* í¹ì§ */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">í¹ì§ íê·¸</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FEATURES_OPTIONS.map(f => (
                        <button key={f} onClick={() => {
                          const arr = form.features.includes(f)
                            ? form.features.filter(x => x !== f)
                            : [...form.features, f];
                          updateForm({ features: arr });
                        }}
                          className={`px-3 py-1.5 text-xs rounded-full transition ${
                            form.features.includes(f)
                              ? 'bg-green-700 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ë¤ì ë²í¼ */}
              <div className="flex justify-between">
                <button onClick={() => setCurrentStep(1)}
                  className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">
                  â ì´ì 
                </button>
                <button onClick={() => { saveDraft(); setCurrentStep(3); }}
                  className="px-8 py-3 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition shadow-lg">
                  ë¤ì â ì¬ì§ ë±ë¡
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ââââ STEP 3: ì¬ì§ ë±ë¡ + ìë íì§ ê°ì  ââââ */}
        {currentStep === 3 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">3</span>
                  ì¬ì§ ë±ë¡
                </h2>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={useEnhanced} onChange={e => setUseEnhanced(e.target.checked)}
                    className="accent-green-700 w-4 h-4" />
                  <span className="text-gray-700">â¨ ìë íì§ ê°ì  ì¬ì©</span>
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                ì¬ì§ì ìë¡ëíë©´ <strong>ë°ê¸°, ëë¹, ì ëªë, ìê°</strong>ì´ ìëì¼ë¡ ë³´ì ë©ëë¤.
                ìë³¸ê³¼ ë³´ì ë³¸ì ë¹êµíê³  ì íí  ì ììµëë¤.
              </p>

              {/* ëëê·¸ ì¤ ëë¡­ ìì­ */}
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
                  isDragOver ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); handleImageFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl mb-2">ð·</div>
                <div className="text-sm text-gray-600 font-medium">
                  í´ë¦­íì¬ ì¬ì§ì ì ííê±°ë, ì¬ê¸°ì ëëê·¸íì¸ì
                </div>
                <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP ì§ì Â· ìµë 20ì¥</div>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => e.target.files && handleImageFiles(e.target.files)} />
              </div>

              {/* ì´ë¯¸ì§ ì¼ê´ ìì */}
              {uploadedImages.length > 1 && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-sm text-gray-500">{uploadedImages.length}ì¥ ìë¡ëë¨</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const sorted = [...uploadedImages].sort((a, b) => (b.enhanced ? 1 : 0) - (a.enhanced ? 1 : 0));
                        setUploadedImages(sorted);
                      }}
                      className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      aria-label="ê°ì ë ì¬ì§ ì°ì  ì ë ¬"
                    >
                      ê°ì ì ì ë ¬
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm('ëª¨ë  ì¬ì§ì ì­ì íìê² ìµëê¹?')) setUploadedImages([]); }}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      aria-label="ëª¨ë  ì¬ì§ ì­ì "
                    >
                      ì ì²´ ì­ì 
                    </button>
                  </div>
                </div>
              )}
              {/* ìë¡ëë ì´ë¯¸ì§ */}
              {uploadedImages.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      ìë¡ëë ì¬ì§ ({uploadedImages.length}ì¥)
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {uploadedImages.map((img, i) => (
                      <div key={i} className={`image-card relative group ${dragIndex === i ? 'opacity-40 scale-95' : ''} ${dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-green-500 ring-offset-2 scale-[1.02]' : ''} transition-all cursor-grab active:cursor-grabbing`}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                    onDrop={() => {
                      if (dragIndex === null || dragIndex === i) return;
                      const newImages = [...uploadedImages];
                      const [moved] = newImages.splice(dragIndex, 1);
                      newImages.splice(i, 0, moved);
                      setUploadedImages(newImages);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}>
                        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border">
                          {img.isEnhancing ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50">
                              <div className="text-center">
                                <div className="animate-spin w-6 h-6 border-2 border-green-700 border-t-transparent rounded-full mx-auto" />
                                <div className="text-xs text-gray-400 mt-2">íì§ ê°ì  ì¤...</div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={(useEnhanced && img.enhanced) ? img.enhanced : img.preview}
                              alt={`ì¬ì§ ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>

                        {/* ìë³¸/ê°ì  í ê¸ ë°°ì§ */}
                        {img.enhanced && !img.isEnhancing && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-600 text-white">
                            {useEnhanced ? 'â¨ ê°ì ' : 'ìë³¸'}
                          </div>
                        )}

                        {/* ìì íì + ëíì´ë¯¸ì§ ë³ì§ */}
                        {i === 0 ? (
                          <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-600 text-white text-[10px] rounded-full font-bold shadow">ëí</div>
                        ) : (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center">
                            {i + 1}
                          </div>
                        )}

                        {/* í¸ë² ì¡ì */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {i > 0 && (
                            <button onClick={() => moveImage(i, i - 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">â</button>
                          )}
                          <button onClick={() => removeImage(i)}
                            className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow text-sm">â</button>
                          {i < uploadedImages.length - 1 && (
                            <button onClick={() => moveImage(i, i + 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">â</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ââ ì¬ì§ ë±ë¡ í: AIìëë±ë¡ / ì§ì  ë±ë¡ ì í ââ */}
            {uploadedImages.length > 0 && !showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8">
                <h3 className="text-base font-bold text-gray-800 mb-4 text-center">ë§¤ë¬¼ ë±ë¡ ë°©ìì ì ííì¸ì</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setShowAiPanel(true)}
                    className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left group">
                    <div className="text-3xl mb-2">ð¤</div>
                    <h3 className="font-bold text-green-800 text-lg group-hover:text-green-900">AI ìëë±ë¡</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      AIê° <span className="text-green-600 font-semibold">ì ëª©ê³¼ ì¤ëª</span>ì ìëì¼ë¡ ìì±í©ëë¤.
                      2026 í¸ë ëì ë§ë ì¼ì¤ ìë ë§¤ë¬¼ ìê°ê¸ì ë§ë¤ì´ ëë¦½ëë¤.
                    </p>
                  </button>
                  <button onClick={() => { saveDraft(); setCurrentStep(4); }}
                    className="p-6 border-2 border-gray-300 rounded-2xl hover:bg-gray-50 transition text-left group">
                    <div className="text-3xl mb-2">âï¸</div>
                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-gray-900">ì§ì  ë±ë¡</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      ë§¤ë¬¼ ì ëª©ê³¼ ì¤ëªì <span className="text-gray-700 font-semibold">ì§ì  ìì±</span>í©ëë¤.
                      ìíë ëë¡ ìì ë¡­ê² ìë ¥í  ì ììµëë¤.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* ââ AI ìëë±ë¡ í¨ë ââ */}
            {showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">ð¤ AI ìëë±ë¡</h3>
                  <button onClick={() => setShowAiPanel(false)} className="text-sm text-gray-400 hover:text-gray-600 transition">â ë«ê¸°</button>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">AI ì¤íì¼ì ì ííì¸ì</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setAiStyleOption('trendy')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'trendy' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">ð¥</div>
                      <div className="font-bold text-sm text-gray-800">í¸ë ë 2026</div>
                      <div className="text-xs text-gray-500 mt-0.5">MZì¸ë ê°ì±, ê¿ë§¤ë¬¼Â·ë§ì§ ë± í¸ë ë í¤ìë</div>
                    </button>
                    <button onClick={() => setAiStyleOption('premium')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'premium' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">â¨</div>
                      <div className="font-bold text-sm text-gray-800">íë¦¬ë¯¸ì</div>
                      <div className="text-xs text-gray-500 mt-0.5">ê³ ê¸ì¤ë½ê³  ê²©ì ìë íë¡íìë í¤</div>
                    </button>
                    <button onClick={() => setAiStyleOption('clean')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'clean' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">ð</div>
                      <div className="font-bold text-sm text-gray-800">í´ë¦° ì ì</div>
                      <div className="text-xs text-gray-500 mt-0.5">ê¹ëíê³  ì ëë ê¸°ë³¸ í¬ë§·</div>
                    </button>
                  </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">AI ëª¨ë¸ ì í</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAiModel('template')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'template'
                  ? 'bg-gray-600 text-white ring-2 ring-gray-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              ð ë¹ ë¥¸ìì±
            </button>
            <button
              type="button"
              onClick={() => setAiModel('best')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'best'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              â¨ ìµê³  AI
            </button>
            <button
              type="button"
              onClick={() => setAiModel('latest')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'latest'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              â¡ ìµì  AI
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {aiModel === 'template' ? 'ííë¦¿ ê¸°ë° ì¦ì ìì±' : aiModel === 'best' ? 'Claude Opus - ìµê³  íì§ AI ìì±' : 'Claude Sonnet - ë¹ ë¥´ê³  ì¤ë§í¸í AI'}
          </p>
        </div>

                </div>
                {!form.title && (
                  <div className="text-center">
                    <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)} disabled={aiGenerating} className="px-10 py-3.5 bg-green-700 text-white rounded-xl font-semibold hover:bg-green-800 transition shadow-lg disabled:bg-gray-400 text-base">
                      {aiGenerating ? (<span className="flex items-center gap-2"><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />AIê° ë§¤ë¬¼ ì ë³´ë¥¼ ë¶ì ì¤...</span>) : 'ð¤ AI ìëìì± ì¤í'}
                    </button>
                  </div>
                )}
                {form.title && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">ð ë§¤ë¬¼ ì ëª© <span className="text-green-600 text-xs font-normal ml-1">AI ìì±ë¨</span></label>
                        <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)}
                          disabled={aiGenerating}
                          className="text-xs text-gray-400 hover:text-green-600 transition disabled:opacity-50">
                          {aiGenerating ? 'ìì± ì¤...' : 'ð ë¤ì ìì±'}</button>
                      </div>
                      <input type="text" value={form.title} onChange={e => updateForm({ title: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ð ë§¤ë¬¼ ì¤ëª <span className="text-green-600 text-xs font-normal ml-1">AI ìì±ë¨</span></label>
                      <p className="text-xs text-gray-400 mb-1">â» ìì¬ì§, ë©´ì , ì¸µì ë± ê±´ì¶ë¬¼ëì¥ìì íì¸ ê°ë¥í ì ë³´ë ì ì¸ë©ëë¤</p>
                      <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })} rows={8} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y text-sm leading-relaxed" />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5">
                      <h4 className="font-semibold text-gray-800 text-sm mb-3">ð ë±ë¡ ì ë³´ ìì½</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ìì¬ì§</div><div className="font-medium text-gray-800 truncate">{form.address || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ê±°ë</div><div className="font-medium text-gray-800">{form.deal === 'ë§¤ë§¤' ? `ë§¤ë§¤ ${formatAmount(form.price)}` : form.deal === 'ì ì¸' ? `ì ì¸ ${formatAmount(form.deposit)}` : `ìì¸ ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ì í</div><div className="font-medium text-gray-800">{form.type || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ë©´ì </div><div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}ã¡` : '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ì¸µ</div><div className="font-medium text-gray-800">{form.floor_current || '-'}ì¸µ / {form.floor_total || '-'}ì¸µ</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">ì¬ì§</div><div className="font-medium text-gray-800">{uploadedImages.length}ì¥</div></div>
                      </div>
                      {form.features.length > 0 && (<div className="mt-3 flex flex-wrap gap-1">{form.features.map(f => (<span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>))}</div>)}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => { setShowAiPanel(false); setCurrentStep(2); }} className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">â ì´ì </button>
              {<button onClick={() => { saveDraft(); setCurrentStep(4); }} className="px-6 py-3 rounded-xl bg-black text-white hover:bg-gray-800 transition">ë¤ì â</button>}
            </div>
          </div>
        )}

        {/* ââââ STEP 4: ì§ì  ë±ë¡ ââââ */}
        {currentStep === 4 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-6">
                <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">4</span>
                ì§ì  ë±ë¡
              </h2>

              {/* ë§¤ë¬¼ ì ëª© */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ð ë§¤ë¬¼ ì ëª©
                </label>
                <input type="text" value={form.title}
                  onChange={e => updateForm({ title: e.target.value })}
                  placeholder="ì: ì ë¦¼ì­ ì­ì¸ê¶ ì ì¶ ìë£¸ ìì¸"
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* ë§¤ë¬¼ ì¤ëª */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ð ë§¤ë¬¼ ì¤ëª
                </label>
                <p className="text-xs text-gray-400 mb-1">â» ìì¬ì§, ë©´ì , ì¸µì ë± ê±´ì¶ë¬¼ëì¥ìì íì¸ ê°ë¥í ì ë³´ë ìë í¬í¨ëë¯ë¡ ë³ë ìë ¥ ë¶íì</p>
                <textarea value={form.description}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="ë§¤ë¬¼ì í¹ì¥ì , ì£¼ë³ í¸ììì¤, êµíµ ë±ì ìë ¥íì¸ì"
                  rows={6}
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
              </div>

              {/* ë±ë¡ ìì½ ë¯¸ë¦¬ë³´ê¸° */}
              <div className="bg-gray-50 rounded-xl p-5 mb-6">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">ð ë±ë¡ ì ë³´ ìì½</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ìì¬ì§</div>
                    <div className="font-medium text-gray-800 truncate">{form.address || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ê±°ë</div>
                    <div className="font-medium text-gray-800">
                      {form.deal === 'ë§¤ë§¤' ? `ë§¤ë§¤ ${formatAmount(form.price)}` :
                       form.deal === 'ì ì¸' ? `ì ì¸ ${formatAmount(form.deposit)}` :
                       `ìì¸ ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ì í</div>
                    <div className="font-medium text-gray-800">{form.type || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ë©´ì </div>
                    <div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}ã¡` : '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ì¸µ</div>
                    <div className="font-medium text-gray-800">{form.floor_current || '-'}ì¸µ / {form.floor_total || '-'}ì¸µ</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">ì¬ì§</div>
                    <div className="font-medium text-gray-800">{uploadedImages.length}ì¥</div>
                  </div>
                </div>
                {form.features.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {form.features.map(f => (
                      <span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* ë¯¸ë¦¬ë³´ê¸° ë²í¼ */}
                  <div className="flex justify-center mb-6">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      ê³ ê° íë©´ ë¯¸ë¦¬ë³´ê¸°
                    </button>
                  </div>

                  {/* ììì ì¥ */}
                <div className="mb-4">
                  <button onClick={() => publishListing('draft')} disabled={isPublishing} className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-50 transition-all disabled:opacity-50">
                    {isPublishing ? 'ì ì¥ ì¤...' : 'ð¾ ììì ì¥ (ë¹ê³µê°)'}
                    <span className="block text-xs mt-1 text-gray-400">ì ë³´ ìì§ì´ ë¯¸í¡í  ë ììë¡ ì ì¥í©ëë¤. ê´ê³ ì ë¸ì¶ëì§ ììµëë¤.</span>
                  </button>
                </div>

                {/* ë±ë¡ ë°©ì ì í */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => publishListing('instant')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">ð</div>
                  <h3 className="font-bold text-green-800 text-lg">ì¦ì ìë¡ë</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ë°ë¡ <span className="text-green-600 font-semibold">ê³µê°</span> ìíë¡ ë§¤ë¬¼ì ë±ë¡í©ëë¤.
                    ì¦ì ííì´ì§ì ë¸ì¶ë©ëë¤.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-green-700 font-medium">
                      <span>ìë¡ë ì§íì¤...</span>
                      <span>${uploadProgress}/${uploadedImages.length}</span>
                    </div>
                    <div className="w-full bg-green-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-green-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadedImages.length > 0 ? (uploadProgress / uploadedImages.length) * 100 : 0}%` }} />
                    </div>
                  </div>}
                </button>

                <button onClick={() => publishListing('review')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-blue-400 rounded-2xl hover:bg-blue-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">ð</div>
                  <h3 className="font-bold text-blue-800 text-lg">ì§ì  ë±ë¡</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-blue-600 font-semibold">ë¹ê³µê°</span> ìíë¡ ì ì¥ í ê²ìí©ëë¤.
                    íì¸ í ìëì¼ë¡ ê³µê° ì íí©ëë¤.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-blue-700 font-medium">
                      <span>ìë¡ë ì§íì¤...</span>
                      <span>${uploadProgress}/${uploadedImages.length}</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadedImages.length > 0 ? (uploadProgress / uploadedImages.length) * 100 : 0}%` }} />
                    </div>
                  </div>}
                </button>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep(3)}
                className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">
                â ì´ì 
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ââââ ë¯¸ë¦¬ë³´ê¸° ëª¨ë¬ ââââ */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* ëª¨ë¬ í¤ë */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                ê³ ê° íë©´ ë¯¸ë¦¬ë³´ê¸°
              </h2>
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-lg transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            {/* ì´ë¯¸ì§ ì¬ë¼ì´ë */}
            {uploadedImages.length > 0 && (
              <div className="relative aspect-video bg-gray-100 overflow-hidden">
                <img src={(useEnhanced && uploadedImages[0]?.enhanced) ? uploadedImages[0].enhanced : uploadedImages[0]?.preview} alt="ëí ì´ë¯¸ì§" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">ì¬ì§ {uploadedImages.length}ì¥</div>
              </div>
            )}
            {/* ë§¤ë¬¼ ì ë³´ */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">{form.deal || 'ìì¸'}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{form.type || 'ìë£¸'}</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">{form.title || '(ì ëª© ë¯¸ìë ¥)'}</h1>
              <p className="text-sm text-gray-500 mb-4">{form.address} {form.addressDetail}</p>
              {/* ê°ê²© */}
              <div className="bg-green-50 rounded-xl p-4 mb-4">
                <div className="text-2xl font-bold text-green-800">
                  {form.deal === 'ë§¤ë§¤' ? `ë§¤ë§¤ ${form.price ? (form.price >= 10000 ? (form.price/10000).toFixed(form.price%10000===0?0:1)+'ìµ' : form.price+'ë§') + 'ì' : '-'}` : form.deal === 'ì ì¸' ? `ì ì¸ ${form.deposit ? (form.deposit >= 10000 ? (form.deposit/10000).toFixed(form.deposit%10000===0?0:1)+'ìµ' : form.deposit >= 1000 ? (form.deposit/1000).toFixed(form.deposit%1000===0?0:1)+'ì²ë§' : form.deposit+'ë§') + 'ì' : '-'}` : `ë³´ì¦ê¸ ${form.deposit ? (form.deposit >= 10000 ? (form.deposit/10000).toFixed(form.deposit%10000===0?0:1)+'ìµ' : form.deposit >= 1000 ? (form.deposit/1000).toFixed(form.deposit%1000===0?0:1)+'ì²ë§' : form.deposit+'ë§') + 'ì' : '-'} / ìì¸ ${form.monthly ? form.monthly+'ë§ì' : '-'}`}
                </div>
                {form.maintenance_fee ? <div className="text-sm text-green-600 mt-1">ê´ë¦¬ë¹ {form.maintenance_fee}ë§ì</div> : null}
              </div>
              {/* ìì¸ ì ë³´ ê·¸ë¦¬ë */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {form.area_m2 && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ë©´ì </div><div className="font-semibold text-gray-800">{form.area_m2}ã¡ {form.area_supply_m2 ? `(ê³µê¸ ${form.area_supply_m2}ã¡)` : ''}</div></div>}
                {form.floor_current && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ì¸µì</div><div className="font-semibold text-gray-800">{form.floor_current}ì¸µ{form.floor_total ? ` / ${form.floor_total}ì¸µ` : ''}</div></div>}
                {form.rooms && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ë°©/ìì¤</div><div className="font-semibold text-gray-800">{form.rooms}ë°© {form.bathrooms ? `/ ${form.bathrooms}ìì¤` : ''}</div></div>}
                {form.direction && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ë°©í¥</div><div className="font-semibold text-gray-800">{form.direction}</div></div>}
                {form.heating_type && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ëë°©</div><div className="font-semibold text-gray-800">{form.heating_type}</div></div>}
                {form.move_in_date && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">ìì£¼ê°ë¥ì¼</div><div className="font-semibold text-gray-800">{form.move_in_date}</div></div>}
              </div>
              {/* í¹ì§ */}
              {form.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {form.features.map(f => <span key={f} className="px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>)}
                </div>
              )}
              {/* ì¤ëª */}
              {form.description && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-800 mb-2">ìì¸ ì¤ëª</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{form.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddressModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ width: '420px', height: '520px', maxWidth: '95vw', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-4 py-3 bg-green-700 text-white">
              <span className="font-semibold text-sm flex items-center gap-2">{String.fromCodePoint(0x1F4CD)} ì£¼ì ê²ì</span>
              <button onClick={() => setShowAddressModal(false)} className="text-white/80 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div ref={postcodeContainerRef} className="w-full" style={{ height: 'calc(100% - 48px)' }} />
          </div>
        </div>
      )}
    </div>
  );
     }

class ListingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {className: 'min-h-screen flex items-center justify-center'},
        React.createElement('div', {className: 'text-center p-8'},
          React.createElement('h2', {className: 'text-xl font-bold mb-4'}, 'ì¤ë¥ê° ë°ìíìµëë¤'),
          React.createElement('button', {onClick: () => this.setState({hasError: false}), className: 'px-4 py-2 bg-black text-white rounded-lg'}, 'ë¤ì ìë')
        )
      );
    }
    return this.props.children;
  }
}

export default function SmartListingNewPageWithErrorBoundary() {
  return React.createElement(ListingErrorBoundary, null, React.createElement(Suspense, {fallback: React.createElement('div', {style:{padding:'40px',textAlign:'center'}}, 'ë¡ë© ì¤...')}, React.createElement(SmartListingNewPage)));
}
h
