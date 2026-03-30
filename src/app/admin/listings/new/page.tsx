'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
const PROPERTY_TYPES = ['ìë£¸', 'í¬ë£¸', 'ì°ë¦¬ë£¸+', 'ì¤í¼ì¤í', 'ìíí¸', 'ë¹ë¼', 'ìê°', 'ì¬ë¬´ì¤'];
const DEAL_TYPES = ['ìì¸', 'ì ì¸', 'ë§¤ë§¤'];
const DIRECTIONS = ['ë', 'ì', 'ë¨', 'ë¶', 'ëë¨', 'ëë¶', 'ìë¨', 'ìë¶'];
const HEATING_TYPES = ['ê°ë³ëë°©', 'ì¤ìëë°©', 'ì§ì­ëë°©'];
const MAINTENANCE_OPTIONS = ['ìë', 'ì ê¸°', 'ê°ì¤', 'ì¸í°ë·', 'TV', 'ì²­ìë¹', 'ì£¼ì°¨ë¹', 'ìë¦¬ë² ì´í°ì ì§ë¹'];
const FEATURES_OPTIONS = ['íìµì', 'ì ì¶', 'ì­ì¸ê¶', 'ì£¼ì°¨ê°ë¥', 'ë°ë ¤ëë¬¼', 'ë² ëë¤', 'ìë¦¬ë² ì´í°', 'CCTV', 'ë¶ë¦¬ìê±°', 'ë¬´ì¸íë°°', 'ê±´ì¡°ê¸°', 'ì¸íê¸°'];

const STEPS = [
  { id: 1, label: 'íìì ë³´', icon: 'ð', desc: 'ìì¬ì§Â·ê±°ëÂ·ì í' },
  { id: 2, label: 'ê±´ì¶ë¬¼ëì¥', icon: 'ðï¸', desc: 'ìëì¡°íÂ·ì¸ë¶ì ë³´' },
  { id: 3, label: 'ì¬ì§ë±ë¡', icon: 'ð¸', desc: 'ì´ë¯¸ì§Â·íì§ê°ì ' },
  { id: 4, label: 'AIë±ë¡', icon: 'ð¤', desc: 'ìëìì±Â·ìë¡ë' },
];

const AUTH_TOKEN = 'wishes2026';

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
  features: [], title: '', description: '', images: [], lat: null, lng: null, status: 'ììì ì¥',
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
export default function SmartListingNewPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ââ State ââ */
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [addressData, setAddressData] = useState<AddressData | null>(null);
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [buildingRawData, setBuildingRawData] = useState<Record<string, any> | null>(null);
  const [showBuildingDoc, setShowBuildingDoc] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [toast, setToast] = useState<{ type: string; text: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftListing[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiStyleOption, setAiStyleOption] = useState<AiStyle>('trendy');
  const [aiModel, setAiModel] = useState<AiModel>('template');
  const [showAddressModal, setShowAddressModal] = useState(false);
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
    return id;
  }, [form, buildingInfo, draftId, drafts]);

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
  const updateForm = (updates: Partial<FormData>) => {
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
        setToast({ type: 'error', text: 'ì£¼ì ê²ì ì¤í¬ë¦½í¸ë¥¼ ë¡ë© ì¤ìëë¤. ì ì í ë¤ì ìëí´ì£¼ì¸ì.' })
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

  /* ââ Step 2: ê±´ì¶ë¬¼ëì¥ ìë ì¡°í ââ */
  const fetchBuildingLedger = async () => {
    if (!addressData) return;

    setBuildingLoading(true);
    setBuildingError(null);

    try {
      const sigunguCd = addressData.sigunguCode || addressData.bcode?.substring(0, 5) || '';
      const bjdongCd = addressData.bcode?.substring(5, 10) || '';

      const res = await fetch('/api/building-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sigunguCd, bjdongCd,
          platGbCd: '0',
          bun: addressData.bun || '0000',
          ji: addressData.ji || '0000',
          operations: ['basis', 'recapTitle', 'title', 'floor'],
        }),
      });

      if (!res.ok) throw new Error(`건축물대장 API 오류 (${res.status})`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤í¨');

      const info: BuildingInfo = result.extracted;
      setBuildingInfo(info);
      setBuildingRawData(result.data);

      // í¼ ìë ìë ¥
      updateForm({
        building_name: info.ê±´ë¬¼ëª || form.building_name,
        building_purpose: info.ì£¼ì©ë,
        building_structure: info.ê±´ë¬¼êµ¬ì¡°,
        approval_date: info.ì¬ì©ì¹ì¸ì¼,
        site_area: info.ëì§ë©´ì  || null,
        total_floor_area: info.ì°ë©´ì  || null,
        building_coverage_ratio: info.ê±´íì¨ || null,
        floor_area_ratio: info.ì©ì ë¥  || null,
        elevator_count: (info.ì¹ì©ìë¦¬ë² ì´í° || 0) + (info.ë¹ìì©ìë¦¬ë² ì´í° || 0),
        parking_count: info.ì´ì£¼ì°¨ëì || null,
        underground_floors: info.ì§íì¸µì || null,
        household_count: info.ì¸ëì || null,
        unit_count: info.í¸ì || null,
        ground_floors: info.ì§ìì¸µì || null,
        floor_total: info.ì§ìì¸µì ? `${info.ì§ìì¸µì}` : '',
      });

      // ìë ììì ì¥
      await saveDraft();
      setToast({ type: 'success', text: 'ê±´ì¶ë¬¼ëì¥ ì¡°í ìë£ Â· ììì ì¥ë¨' });
    } catch (err: any) {
      setBuildingError(err.message || 'ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤ ì¤ë¥');
      setToast({ type: 'error', text: err.message || 'ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤í¨' });
    } finally {
      setBuildingLoading(false);
    }
  };

  /* ââ Step 2 â 3 ì í ì ìë ì¡°í ââ */
  const goToStep2 = async () => {
    setCurrentStep(2);
    if (addressData && !buildingInfo) {
      await fetchBuildingLedger();
    }
  };

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
    if (!printWin) { setToast({ type: 'error', text: 'íìì´ ì°¨ë¨ëììµëë¤. íì íì© í ë¤ì ìëí´ì£¼ì¸ì.' }) return; }
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
        if (!res.ok) throw new Error(`AI 생성 API 오류 (${res.status})`);
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
  const publishListing = async (mode: 'instant' | 'review') => {
    setIsPublishing(true);

    // 필수항목 검증
    if (!form.address?.trim()) {
      setToast({ type: 'error', text: '주소를 입력해주세요.' });
      setIsPublishing(false);
      return;
    }
    if (!form.type) {
      setToast({ type: 'error', text: '매물 유형을 선택해주세요.' });
      setIsPublishing(false);
      return;
    }
    if (!form.deal) {
      setToast({ type: 'error', text: '거래 유형을 선택해주세요.' });
      setIsPublishing(false);
      return;
    }
    if (form.deal === '매매' && !form.price) {
      setToast({ type: 'error', text: '매매가를 입력해주세요.' });
      setIsPublishing(false);
      return;
    }
    if ((form.deal === '전세' || form.deal === '월세') && !form.deposit) {
      setToast({ type: 'error', text: '보증금을 입력해주세요.' });
      setIsPublishing(false);
      return;
    }
    if (form.deal === '월세' && !form.monthly) {
      setToast({ type: 'error', text: '월세를 입력해주세요.' });
      setIsPublishing(false);
      return;
    }
    if (uploadedImages.length === 0) {
      setToast({ type: 'error', text: '이미지를 1장 이상 등록해주세요.' });
      setIsPublishing(false);
      return;
    }

    try {
      // FormData êµ¬ì± (ì´ë¯¸ì§ íì¼ + ë§¤ë¬¼ ë°ì´í°)
      const compressImage = async (f: File): Promise<Blob> => { if (!window.createImageBitmap) return f; const bmp = await createImageBitmap(f); const cv = document.createElement('canvas'); let w = bmp.width, h = bmp.height; if (w > 1600) { h = Math.round(h * 1600 / w); w = 1600; } if (h > 1600) { w = Math.round(w * 1600 / h); h = 1600; } cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0, w, h); bmp.close(); const wmImg = new Image(); wmImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAABXCAYAAACtHW8eAAAHg0lEQVR4AeyZi5IVKRBEr/v//7zOGU2jROgGmmdTE6bQRT2zUiN2/e/jP0UM/G9+igLdeQgDLughNHuRUQy4oAuZ/vH1Q8jX8YPTsRYDLui19uHdPGTABf2QQA9fiwEX9Fr76NjNGald0Gfs+ZgpXdDHrPqMQV3QZ+z5mCld0Mes+oxBXdBn7PmYKV3Qn8+nZNv8yzf+Ork71mHABV2wC0TMvxAKfBeEu+sABlzQGSQjXICQrTvf2IG1+30eAy7oG+4lVsQbc5VdfjEft41jwAWd4BqBAgQLEm7fZt4B/t8G/20aAy7oCPUSJiKNPCdN+BMLkk7+0JWBG0F3rb1ccoQIECaoaZA4QB5Qk8Nj6hlwQX9xh/AAQgRfpse/lIe8j5N5gmwGjhY0YgOwJQFybwVyAmqAVnk9T5qBIwWNuAC0IDjAvRfID6gJetXxvJ/PcYKWoBAYGCkC6gF6ACNrn1LrGEEjIICgwMwFUx/QD5jZy5/aL7m8XtAIBiAgsNLe6AfQH1ipt117ea2gEQhAMGDlBdEfoF+wcq+r9/Y6QSMIgEDA6guw/dEvoH9g3/yex8BrBI0AAIIAeeOv6UX/gHnAml2u2dXWgmbZAgIAa9Jc1xXzAM3IWZfpnKgtBc1iAWti4YB7J0xPy3yARjQ3d8e/DGwlaJYJGIMFA+6ngHkBHAinzJ475xaCtstjoSB3wDf6MT9gNssN36djaUFrWSxPOH1hdn7Libiy7yfelxS0XQ5LO3ExJTPDESDGcsf3aVhK0FoGyxFOW8iTeS1n4vJJvh1jnwm60cQi3y6kUeoj01gexe0pREwVtMi2CziF+BFzWl7F9Yi6M2tMEbTItYTPJOHttS3P4v6tMw8VtCUTkt9K6qpzwTmgP7sLvt+CIYK25EEoeAuBO84B/4De7W743h3dBQ1hkASBgLtjDQbYB6Ab7Yl7DLvYugkaggCEgV0IObFP9gPYF9iZg+aChhAAQWBnck7rnX0B9gd2nL+ZoCEAQAjYkQzv+RcD2h/7/GXZ5/fHgmZowMgigrtjbwbYJWC3YJdpHglagzI42GVo7zOfAfYK2DXIj5zjWSVoBgMMCua0vkrVM/pgz4C9g1WnLha0hmG4VYfyvvoxoL1LB/0q1WXOFjQDAAYCdeU86g0MsH+AHkDPmchvoVoxG29ZgiaYAQBBDmcABqQH9MF3K5APkI8aFtiAtckX+6WgcQQE4+xwBkIG0AZAJyB8z/0mViAfyI3Fl1j8k4LGAUeAo8MZuGJAOkE3V37hG/6AeCH0Kfn+R9AkByQvSRTzddtZDKAZgH7A1fS8A/zBlW/OGznI95egMRDMI6fDGahhQPqRnmwObAAfYN9a3P8IumeRFo16jr0YkFjRFZ1zAuwAW0so97eg9dGygOdyBhAuQF+wwZ2zBZSTXPb+LeiWhSjgcAYsA+gLWNvTO/kQMuAOyPktaC4OZ+ABA1NCETGwxV3Qlg2/b8+AC3r7FfoAlgEXtGXD79sz4ILefoU+gGXABf3FBv+lnMLX85G/UnxgX5mQW0EzQAk0bE0MsXdxOT5hDmJikF/sTbYrH71dnr8flY/ztynrwB9kOWc6kS8FpUi9Y8/xwW8GbgXN/xYRUg3qnVM+3AXZ7Kk3zpg9ZpMvp2D97F3vnNbOPbYQ/ELgKxCju0756zt2xnxiNhurd07ZuQuyhafeY2foG34zH7D2uzyhv42ddb8V9KzGetWNLYHF9ajXK2+PXsOcqd5T9jB+1vc0QceEFSNhJoEza8e46GXL3UWv+i3zNhH0mwhpSa7nGs9AkaBr/sZysY9faqxize5ieVa3FQm68TDJdCv9IUAIQrLhTR5azaE8nKuNPlXQd8IdRdhdH6straQfZgMlMfjWxBA3G8WCToksRoBsqZjZw9v69Aqs7fQ7fICdeCgWdO1wO4ia2Vgg4L47Ws1BHrADH8MEnUuGiOv1ByA3L32A3L539nsTJ1WCziFAYrjzld9IQdz1ZHt50h+xV7B1WtzDWiU5SzmhVn7+cZ5Vgk61t+qQsX5HLJAaV4j19cQW1irNRXxJzIr7biroOzJyCcv1u6t3904dcOd30jt8gNyZVxN1V0HnEiNSdOaS2cqPPsFdvln93fXV4x0+QI/cPXNWC/pq2F0Xz0ygJ+Ejc7eYhRxgZN9PalULOlX0Tsw7kLNDjyn+QzuzgNBe+n2V427npbWe+DcXdG0zIuWKuNrciqOGIFvq7NmHrTn6Hs6vb867Xnbg5JGgrwa8ersjzt/7MJAj2prKK+36kaBrhidmBQJ6LZf5dsUbOJki6NTCVxB6qje378FAF0G/QZixv612nis2T6lEYzlW4+SxoGcNBLkgtZSrt1SM7LHY1JwxX5sn9Z6yE8sb4B4iZcePtxR4zwHxMb+YPcVJLH6U7bGgaxsNyQi/P5905hi5MW/8gN6oAfTNWwx612ljZOMklvMOoV/4nYq3ftxByrfWzmzAxlMnhH3nHsZgWwFNBM1wFrmD1cSQ28bl3ImxiMXo/epNPjpjvimbYjhTPjE7/iD29sRGTotYLr1fvclnlfMnAAAA///aV8sfAAAABklEQVQDAFxMVPlUj304AAAAAElFTkSuQmCC'; await new Promise(r => { if (wmImg.complete) r(undefined); else wmImg.onload = () => r(undefined); }); ctx.save(); ctx.globalAlpha = 0.10; const wmW = Math.round(w * 0.22); const wmH = Math.round(wmW * wmImg.naturalHeight / wmImg.naturalWidth); const diag = Math.sqrt(w * w + h * h); const step = Math.round(w * 0.3); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); for (let y = -diag; y < diag; y += step) { for (let x = -diag; x < diag; x += step) { ctx.drawImage(wmImg, x - wmW / 2, y - wmH / 2, wmW, wmH); } } ctx.restore(); return new Promise(res => cv.toBlob(bl => res(bl!), 'image/jpeg', 0.7)); }; const fd = new window.FormData();

      // ì´ë¯¸ì§ íì¼ ì¶ê° (enhanced ì°ì , ìì¼ë©´ ìë³¸)
      for (const img of uploadedImages) {
        if (useEnhanced && img.enhanced) {
          try {
            const resp = await fetch(img.enhanced);
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

      // console.log('[publishListing] FormData, images:', uploadedImages.length, 'coords:', form.lat, form.lng);

      const res = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        body: fd,
      });

      if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Non-JSON response ' + res.status + ' ' + res.statusText }));
          console.error('[publishListing] ìë¬ ìëµ:', errBody);
          const errMsg = errBody?.error || errBody?.message || `ë§¤ë¬¼ ë±ë¡ ì¤í¨ (${res.status})`;
          throw new Error(errMsg);
        }

      // ììì ì¥ ì­ì 
      if (draftId) deleteDraft(draftId);

      const modeText = mode === 'instant' ? 'ë§¤ë¬¼ì´ ë±ë¡ëììµëë¤!' : 'ë§¤ë¬¼ì´ ì ì¥ëììµëë¤! (ê²ì ëê¸°)';
      setToast({ type: 'success', text: modeText });

      setTimeout(() => router.push('/admin/listings'), 1500);
    } catch (err: any) {
            console.error('[publishListing] error:', err); setToast({ type: 'error', text: `ë§¤ë¬¼ ë±ë¡ ì¤í¨: ${err?.message || String(err) || 'ì ì ìë ì¤ë¥'}` });
    } finally {
      setIsPublishing(false);
    }
  };

  /* ââ íìí­ëª© ì²´í¬ ââ */
  const isStep1Valid = form.address && form.deal && form.type &&
    ((form.deal === 'ë§¤ë§¤' && form.price) ||
     (form.deal === 'ì ì¸' && form.deposit) ||
     (form.deal === 'ìì¸' && form.deposit !== null && form.monthly !== null));

  /* ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
     ë ëë§
  ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {toast.text}
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
          </div>
        </div>

        {/* ì¤í ì¸ëì¼ì´í° */}
        <div className="max-w-6xl mx-auto px-6 pb-4">
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => (step.id <= currentStep || (step.id === 2 && isStep1Valid)) && setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    currentStep === step.id
                      ? 'bg-green-700 text-white shadow-md'
                      : step.id < currentStep
                        ? 'bg-green-100 text-green-800 cursor-pointer hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="text-base">{step.icon}</span>
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

      {/* ë©ì¸ ì»¨íì¸  */}
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ââââ STEP 1: íìì ë³´ ìë ¥ ââââ */}
        {currentStep === 1 && (
          <div className="space-y-6">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          <div className="space-y-6">
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
                      <div key={i} className="relative group">
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

                        {/* ìì íì */}
                        <div className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center">
                          {i + 1}
                        </div>

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
              {uploadedImages.length === 0 && (<div className="text-sm text-gray-400 flex items-center">ì¬ì§ì ìë¡ëíë©´ ë±ë¡ ë°©ìì ì íí  ì ììµëë¤</div>)}
            </div>
          </div>
        )}

        {/* ââââ STEP 4: ì§ì  ë±ë¡ ââââ */}
        {currentStep === 4 && (
          <div className="space-y-6">
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
                  {isPublishing && <div className="mt-2 text-xs text-green-600">ë±ë¡ ì¤...</div>}
                </button>

                <button onClick={() => publishListing('review')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-blue-400 rounded-2xl hover:bg-blue-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">ð</div>
                  <h3 className="font-bold text-blue-800 text-lg">ì§ì  ë±ë¡</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-blue-600 font-semibold">ë¹ê³µê°</span> ìíë¡ ì ì¥ í ê²ìí©ëë¤.
                    íì¸ í ìëì¼ë¡ ê³µê° ì íí©ëë¤.
                  </p>
                  {isPublishing && <div className="mt-2 text-xs text-blue-600">ì ì¥ ì¤...</div>}
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
