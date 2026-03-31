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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   타입 정의
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
  건물명: string;
  주용도: string;
  기타용도: string;
  건물구조: string;
  지붕구조: string;
  대지면적: number;
  건축면적: number;
  연면적: number;
  용적률산정연면적: number;
  건폐율: number;
  용적률: number;
  지상층수: number;
  지하층수: number;
  승용엘리베이터: number;
  비상용엘리베이터: number;
  총주차대수: number;
  옥내기계식주차: number;
  옥내자주식주차: number;
  옥외기계식주차: number;
  옥외자주식주차: number;
  허가일: string;
  착공일: string;
  사용승인일: string;
  대장구분: string;
  대장종류: string;
  도로명주소: string;
  지번주소: string;
  세대수: number;
  호수: number;
  가구수: number;
  층별개요: Array<{ 층번호: string; 층구분: string; 층용도: string; 면적: number }>;
  _raw: Record<string, any>;
}

interface FormData {
  // ── 필수 3항목 ──
  address: string;
  addressDetail: string;
  dong: string;
  deal: string;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  type: string;
  // ── 건축물대장 자동입력 ──
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
  // ── 세부정보 ──
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
  // ── AI 생성 ──
  title: string;
  description: string;
  // ── 이미지 ──
  images: string[];
  // ── 좌표 (Kakao Geocoder) ──
  lat: number | null;
  lng: number | null;
  // ── 상태 ──
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   상수
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PROPERTY_TYPES = ['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라', '상가', '사무실'];
const DEAL_TYPES = ['월세', '전세', '매매'];
const DIRECTIONS = ['동', '서', '남', '북', '동남', '동북', '서남', '서북'];
const HEATING_TYPES = ['개별난방', '중앙난방', '지역난방'];
const MAINTENANCE_OPTIONS = ['수도', '전기', '가스', '인터넷', 'TV', '청소비', '주차비', '엘리베이터유지비'];
const FEATURES_OPTIONS = ['풀옵션', '신축', '역세권', '주차가능', '반려동물', '베란다', '엘리베이터', 'CCTV', '분리수거', '무인택배', '건조기', '세탁기'];

const STEPS = [
  { id: 1, label: '필수정보', icon: '📋', desc: '소재지·거래·유형' },
  { id: 2, label: '건축물대장', icon: '🏛️', desc: '자동조회·세부정보' },
  { id: 3, label: '사진등록', icon: '📸', desc: '이미지·품질개선' },
  { id: 4, label: 'AI등록', icon: '🤖', desc: '자동완성·업로드' },
];

const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';

const INITIAL_FORM: FormData = {
  address: '', addressDetail: '', dong: '', deal: '월세',
  deposit: null, monthly: null, price: null, type: '',
  building_name: '', building_purpose: '', building_structure: '',
  approval_date: '', site_area: null, total_floor_area: null,
  building_coverage_ratio: null, floor_area_ratio: null,
  elevator_count: null, parking_count: null, underground_floors: null,
  household_count: null, unit_count: null, ground_floors: null,
  road_address: '', jibun_address: '', sigungu_code: '', bcode: '',
  area_m2: null, area_supply_m2: null, floor_current: '', floor_total: '',
  rooms: null, bathrooms: null, direction: '', heating_type: '',
  maintenance_fee: null, maintenance_includes: [], move_in_type: '즉시',
  move_in_date: '', pet_allowed: false, parking_available: false,
  features: [], title: '', description: '', images: [], lat: null, lng: null, status: '임시저장',
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   유틸리티 함수
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const formatAmount = (num: number | null | undefined): string => {
  if (num === null || num === undefined || num === 0) return '';
  if (num >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}억`;
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}천만`;
  return `${num}만`;
};

const formatArea = (m2: number | null): string => {
  if (!m2) return '-';
  const py = (m2 / 3.3058).toFixed(1);
  return `${m2.toFixed(1)}㎡ (${py}평)`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr.length < 8) return '-';
  return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
};

/* ── 이미지 자동 품질 개선 (Canvas API) ── */
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

        // 1단계: 원본 그리기
        ctx.drawImage(img, 0, 0);

        // 2단계: 밝기 + 대비 보정
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 히스토그램 분석 (자동 밝기 보정)
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = sum / (data.length / 4);

        // 적응형 밝기 보정 (어두운 사진일수록 더 밝게)
        const brightnessAdjust = avgBrightness < 100 ? 25 : avgBrightness < 130 ? 10 : 0;
        // 대비 강화 계수
        const contrastFactor = 1.15;
        const contrastCenter = 128;
        // 채도 강화
        const saturationBoost = 1.12;

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];

          // 밝기 보정
          r += brightnessAdjust; g += brightnessAdjust; b += brightnessAdjust;

          // 대비 보정
          r = contrastCenter + (r - contrastCenter) * contrastFactor;
          g = contrastCenter + (g - contrastCenter) * contrastFactor;
          b = contrastCenter + (b - contrastCenter) * contrastFactor;

          // 채도 강화 (HSL 기반 간소화)
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * saturationBoost;
          g = gray + (g - gray) * saturationBoost;
          b = gray + (b - gray) * saturationBoost;

          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
        }

        ctx.putImageData(imageData, 0, 0);

        // 3단계: 샤프닝 (언샤프 마스크 간소화)
        const sharpCanvas = document.createElement('canvas');
        const sharpCtx = sharpCanvas.getContext('2d');
        if (sharpCtx) {
          sharpCanvas.width = canvas.width;
          sharpCanvas.height = canvas.height;
          // 블러 후 차이 합성으로 샤프닝 효과
          sharpCtx.filter = 'blur(1px)';
          sharpCtx.drawImage(canvas, 0, 0);
          // 원본과 블러의 차이를 원본에 합성
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.15;
          ctx.drawImage(canvas, 0, 0);
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
        }

        // 최대 해상도 제한 (2048px)
        let finalCanvas = canvas;
        if (canvas.width > 2048 || canvas.height > 2048) {
          finalCanvas = document.createElement('canvas');
          const fCtx = finalCanvas.getContext('2d')!;
          const scale = Math.min(2048 / canvas.width, 2048 / canvas.height);
          finalCanvas.width = canvas.width * scale;
          finalCanvas.height = canvas.height * scale;
          fCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
        }

        // 4단계: WISHES 워터마크 적용
        const wCtx = finalCanvas.getContext('2d');
        if (wCtx) {
          const w = finalCanvas.width;
          const h = finalCanvas.height;
          const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.028));
          wCtx.save();
          wCtx.font = `bold ${fontSize}px "Pretendard", "Apple SD Gothic Neo", sans-serif`;
          wCtx.textBaseline = 'middle';
          // 반투명 배경 배너 (하단 우측)
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
          // 둥근 사각형 배경
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
          // 텍스트
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

/* ── AI 매물 제목 생성 ── */
function generateTitle(form: FormData, buildingInfo: BuildingInfo | null): string {
  const parts: string[] = [];

  // 동 이름 추출
  const dong = form.dong || form.address.split(' ').find(s => s.endsWith('동')) || '';
  if (dong) parts.push(dong);

  // 역세권/특징
  if (form.features.includes('역세권')) parts.push('역세권');
  if (form.features.includes('신축')) parts.push('신축');
  else if (buildingInfo?.사용승인일) {
    const year = parseInt(buildingInfo.사용승인일.substring(0, 4));
    if (year >= new Date().getFullYear() - 3) parts.push('신축');
  }

  // 매물유형
  if (form.type) parts.push(form.type);

  // 거래유형
  if (form.deal) parts.push(form.deal);

  // 금액은 제목에 포함하지 않음 (별도 표시)

  return parts.join(' ') || '새 매물';
}

/* ── AI 매물 설명 생성 (소재지/면적/층 등 건대장 데이터 제외) ── */
function generateDescription(form: FormData, buildingInfo: BuildingInfo | null): string {
  const lines: string[] = [];

  // 교통 편의성 (주소에서 역/정류장 추론)
  const address = form.address || '';
  if (address.includes('역')) {
    const stationMatch = address.match(/(\S+역)/);
    if (stationMatch) lines.push(`${stationMatch[1]} 도보 이용 가능한 역세권 매물입니다.`);
  }

  // 특장점
  const highlights: string[] = [];
  if (form.features.includes('풀옵션')) highlights.push('풀옵션(에어컨, 냉장고, 세탁기 등 구비)');
  if (form.features.includes('신축')) highlights.push('깨끗한 신축 건물');
  if (form.features.includes('주차가능') || form.parking_available) highlights.push('주차 가능');
  if (form.features.includes('반려동물') || form.pet_allowed) highlights.push('반려동물 동반 가능');
  if (form.features.includes('엘리베이터')) highlights.push('엘리베이터 완비');
  if (form.features.includes('베란다')) highlights.push('넓은 베란다');
  if (form.features.includes('CCTV')) highlights.push('CCTV 보안 시스템');
  if (form.features.includes('무인택배')) highlights.push('무인택배함 설치');
  if (form.features.includes('분리수거')) highlights.push('분리수거 시설 완비');

  if (highlights.length > 0) {
    lines.push(`주요 특징: ${highlights.join(', ')}`);
  }

  // 난방
  if (form.heating_type) lines.push(`${form.heating_type} 방식으로 쾌적한 실내환경을 유지합니다.`);

  // 관리비
  if (form.maintenance_fee && form.maintenance_fee > 0) {
    const includes = form.maintenance_includes.length > 0
      ? ` (${form.maintenance_includes.join(', ')} 포함)`
      : '';
    lines.push(`관리비 ${form.maintenance_fee}만원${includes}`);
  }

  // 입주
  if (form.move_in_type === '즉시') {
    lines.push('즉시 입주 가능합니다.');
  } else if (form.move_in_date) {
    lines.push(`${form.move_in_date} 이후 입주 가능합니다.`);
  }

  // 방향
  if (form.direction) lines.push(`${form.direction}향으로 채광이 좋습니다.`);

  // 주변환경 (주소 기반 추론)
  if (address.includes('대학') || address.includes('학교')) {
    lines.push('학교 인근에 위치하여 통학이 편리합니다.');
  }

  if (lines.length === 0) {
    lines.push('깨끗하고 관리 잘 된 매물입니다. 자세한 사항은 문의 바랍니다.');
  }

  return lines.join('\n');
}

/* ── AI 스타일별 제목 생성 (2026 트렌드) ── */
type AiStyle = 'trendy' | 'premium' | 'clean';
type AiModel = 'template' | 'best' | 'latest';

function generateStyledTitle(form: FormData, buildingInfo: BuildingInfo | null, style: AiStyle): string {
  const dong = form.dong || form.address.split(' ').find(s => s.endsWith('동')) || '';
  const isNew = buildingInfo?.사용승인일
    ? (parseInt(buildingInfo.사용승인일.substring(0, 4)) >= new Date().getFullYear() - 3)
    : form.features.includes('신축');
  const hasStation = form.features.includes('역세권') || form.address.includes('역');
  const hasFull = form.features.includes('풀옵션');
  const hasParking = form.features.includes('주차가능') || form.parking_available || (buildingInfo && buildingInfo.총주차대수 > 0);
  // 금액은 제목에 포함하지 않음 (별도 표시)
  // 랜덤 변형을 위한 헬퍼
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch (style) {
    case 'trendy': {
      const tags: string[] = [];
      if (hasStation) tags.push('역세권');
      if (isNew) tags.push(pick(['신축', '새아파트', '신규']));
      if (hasFull) tags.push(pick(['풀옵션', '올옵션']));
      const vibes: string[] = [];
      if (form.direction === '남향' || form.direction === '남동향') vibes.push(pick(['채광맛집', '햇살가득', '남향채광']));
      if (buildingInfo && buildingInfo.지상층수 >= 20) vibes.push(pick(['뷰맛집', '탁트인뷰', '전망좋은']));
      if (hasParking) vibes.push(pick(['주차OK', '주차가능', '주차편한']));
      const allTags = [...tags, ...vibes];
      const endings = ['꽀매물', '추천매물', '핫매물', '급매', '강추!', '필수 체크!'];
      const typeStr = form.type || '';
      const formats = [
        `${dong ? dong + ' ' : ''}${allTags.join(' ')} ${typeStr} ${pick(endings)}`,
        `✨ ${dong} ${typeStr} | ${allTags.length > 0 ? allTags.join(' · ') : pick(endings)}`,
        `[${dong || '역세권'}] ${typeStr} ${allTags.join(' ')} ${pick(endings)}`,
        `${dong} ${pick(endings)} ${typeStr} ${allTags.length > 0 ? ' #' + allTags.join(' #') : ''}`,
      ];
      return pick(formats).replace(/\s+/g, ' ').trim();
    }
    case 'premium': {
      const name = buildingInfo?.건물명 || dong;
      const adj: string[] = [];
      if (isNew) adj.push('신축');
      adj.push(form.type || '매물');
      if (form.direction) adj.push(form.direction);
      if (hasFull) adj.push('풀옵션');
      const formats = [
        `${name} 프리미엄 ${adj.join(' ')}`,
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

/* ── AI 스타일별 설명 생성 (건축물대장 정보 제외) ── */
function generateStyledDescription(form: FormData, buildingInfo: BuildingInfo | null, style: AiStyle): string {
  const isNew = buildingInfo?.사용승인일
    ? (parseInt(buildingInfo.사용승인일.substring(0, 4)) >= new Date().getFullYear() - 3)
    : form.features.includes('신축');
  const hasStation = form.features.includes('역세권') || form.address.includes('역');
  const station = form.address.match(/(\S+역)/);
  // 랜덤 변형을 위한 헬퍼
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch (style) {
    case 'trendy': {
      const lines: string[] = [];
      const hooks = ['자취생/직장인 주목!', '이 가격에 이 퀴리티? 실화?', '놓치면 후회할 꽀매물!', '이거 진짜 빨리 나갑니다!', '가성비 끝판왕 매물!', '이 조건 다시 안나와요!', '지금 바로 입주 가능!', '바로 입주 가능한 꽀매물!'];
      lines.push(pick(hooks));
      lines.push('');

      // 기본 매물 정보 (항상 표시)
      const dong = form.dong || form.address.split(' ').find((s: string) => s.endsWith('동')) || '';
      if (dong) lines.push(`📍 위치: ${dong}${form.addressDetail ? ' ' + form.addressDetail : ''}`);

      if (form.deal === '월세') {
        lines.push(`💰 월세 ${form.deposit ? form.deposit + '/': ''}${form.monthly || ''}만원`);
      } else if (form.deal === '전세') {
        lines.push(`💰 전세 ${form.deposit || ''}만원`);
      } else if (form.deal === '매매') {
        lines.push(`💰 매매 ${form.price || ''}만원`);
      }

      if (form.area_m2) lines.push(`📏 전용면적 ${form.area_m2}㎡${form.area_supply_m2 ? ` (공급 ${form.area_supply_m2}㎡)` : ''}`);
      if (form.type) lines.push(`🏠 매물유형: ${form.type}`);
      lines.push('');

      // 조건부 항목
      if (hasStation) lines.push(`🚇 ${station ? station[1] : '지하철역'} 도보 이용 가능`);
      if (form.features.includes('풀옵션')) lines.push(pick(['🏠 풀옵션 (에어컨·냉장고·세탁기·인덕션)', '🏠 옵션 완비 - 입주 시 추가 비용 없음!']));
      if (isNew) lines.push(pick(['✨ 깔끔한 신축 컨디션', '✨ 신축 건물로 상태 최상!']));
      if (form.parking_available || form.features.includes('주차가능')) lines.push('🅿️ 주차 가능');
      if (form.features.includes('엘리베이터') || (buildingInfo && buildingInfo.승용엘리베이터 > 0)) lines.push('🛗 엘리베이터 완비');
      if (form.direction === '남향' || form.direction === '남동향') lines.push(pick(['☀️ 남향 채광 최고', '☀️ 햇살 가득한 남향 배치']));
      if (form.features.includes('CCTV')) lines.push('📹 CCTV 보안');
      if (form.features.includes('무인택배')) lines.push('📦 무인택배함');
      if (form.features.includes('반려동물') || form.pet_allowed) lines.push('🐾 반려동물 OK');
      if (form.floor_current) lines.push(`🏢 ${form.floor_current}층${form.floor_total ? '/' + form.floor_total + '층' : ''}`);
      if (form.rooms) lines.push(`🛏️ 방 ${form.rooms}개${form.bathrooms ? ' / 화장실 ' + form.bathrooms + '개' : ''}`);

      lines.push('');

      // 마무리 멘트
      const closings = [
        '👉 문의주세요! 상담 바로 가능합니다.',
        '👉 빠른 입주 원하시면 지금 문의하세요!',
        '👉 상담 문의 환영합니다. 빠른 답변 드리겠습니다!',
        '👉 좋은 조건, 만족스러운 입주! 문의하세요.',
        '👉 상세 사진과 정보는 문의 시 안내드립니다!',
      ];
      lines.push(pick(closings));

      return lines.join('\n');
    }
    case 'premium': {
      const lines: string[] = [];
      const bName = buildingInfo?.건물명;
      lines.push(bName ? `${bName} 내 프리미엄 매물을 소개드립니다.` : '엄선된 프리미엄 매물을 소개드립니다.');
      lines.push('');
      lines.push('[ 주요 특징 ]');
      if (hasStation) lines.push(`• 교통: ${station ? station[1] : '지하철역'} 도보권 역세권 입지`);
      if (form.direction) lines.push(`• 향: ${form.direction} 배치로 우수한 채광 확보`);
      if (form.features.includes('풀옵션')) lines.push('• 옵션: 에어컨, 냉장고, 세탁기 등 풀옵션 완비');
      if (form.parking_available || form.features.includes('주차가능')) lines.push('• 주차: 전용 주차 공간 확보');
      if (form.features.includes('CCTV')) lines.push('• 보안: CCTV 설치');
      lines.push('');
      lines.push('[ 비용 안내 ]');
      if (form.maintenance_fee && form.maintenance_fee > 0) {
        const inc = form.maintenance_includes.length > 0 ? ` (${form.maintenance_includes.join(', ')} 포함)` : '';
        lines.push(`• 관리비: 월 ${form.maintenance_fee}만원${inc}`);
      }
      if (form.heating_type) lines.push(`• 난방: ${form.heating_type}`);
      lines.push('');
      if (form.move_in_type === '즉시') lines.push('즉시 입주 가능하오니, 상세 문의는 연락 부탁드립니다.');
      else if (form.move_in_date) lines.push(`${form.move_in_date} 이후 입주 가능합니다. 상세 문의는 연락 부탁드립니다.`);
      else lines.push('상세 문의는 연락 부탁드립니다.');
      return lines.join('\n');
    }
    case 'clean':
    default:
      return generateDescription(form, buildingInfo);
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   메인 컴포넌트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function SmartListingNewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCopyMode, setIsCopyMode] = useState(false)
  const [copySourceId, setCopySourceId] = useState(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 복사 등록 (Copy Listing) Feature ===
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
          alert('복사할 매물을 불러올 수 없습니다.');
          setIsCopyMode(false);
          return;
        }
        const data = await res.json();
        const listing = data.listing || data;
        
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
          title: (listing.title ? listing.title + ' (복사)' : ''),
          description: ''
        }));
        
        if (listing.address) {
          setAddressData({ address: listing.address, roadAddress: listing.road_address || '', jibunAddress: listing.jibun_address || '' });
        }
      } catch (err) {
        alert('복사 중 오류가 발생했습니다: ' + err.message);
        setIsCopyMode(false);
      }
    };
    
    fetchListingForCopy();
  }, [searchParams]);


  /* ── State ── */
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [touchedFields, setTouchedFields] = useState({});
  const [dragIndex, setDragIndex] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const abortRef = React.useRef(null);

  // Hydration fix
  React.useEffect(() => { setIsMounted(true); }, []);

  // Real-time field validation
  const fieldErrors = React.useMemo(() => {
    const errors = {};
    if (touchedFields.address && !form.address) errors.address = '주소를 입력해주세요';
    if (touchedFields.type && !form.type) errors.type = '매물 유형을 선택해주세요';
    if (touchedFields.deal && !form.deal) errors.deal = '거래 유형을 선택해주세요';
    if (touchedFields.price && form.deal === 'sale' && !form.price) errors.price = '매매가를 입력해주세요';
    if (touchedFields.deposit && (form.deal === 'jeonse' || form.deal === 'monthly') && !form.deposit) errors.deposit = '보증금을 입력해주세요';
    if (touchedFields.monthly && form.deal === 'monthly' && !form.monthly) errors.monthly = '월세를 입력해주세요';
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

  /* ── 주소 검색 팝업 메시지 수신 ── */
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [])

  /* ── Toast 자동 닫기 ── */
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /* ── 키보드 단축키 (Alt+좌우 화살표로 스텝 이동) ── */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (formHistory.length > 0) {
          const prev = formHistory[formHistory.length - 1];
          setForm(prev);
          setFormHistory(h => h.slice(0, -1));
          setCanUndo(formHistory.length > 1);
          setToast({ type: 'info', message: '되돌리기 완료' });
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

  /* ── 스텝 변경 시 스크롤 & 포커스 ── */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const timer = setTimeout(() => {
      const firstInput = document.querySelector('.step-content input:not([type=hidden]), .step-content select, .step-content textarea');
      if (firstInput) firstInput.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [currentStep]);

  /* ── 임시저장 관리 (localStorage) ── */
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
    setToast({ type: 'success', text: '임시저장 완료' });
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
      title: (draft.title || '') + ' (복사)',
    }));
    setCurrentStep(1);
    setDraftId(null);
    toast({ type: 'success', message: '매물이 복사되었습니다. 수정 후 등록해주세요.' });
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
    // 단계 자동 판단
    if (draft.formData.images.length > 0) setCurrentStep(4);
    else if (draft.formData.building_name || draft.buildingInfo) setCurrentStep(3);
    else setCurrentStep(1);
    setToast({ type: 'info', text: '임시저장 매물을 불러왔습니다' });
  };

  const deleteDraft = (id: string) => {
    const newDrafts = drafts.filter(d => d.id !== id);
    setDrafts(newDrafts);
    localStorage.setItem('wishes_drafts', JSON.stringify(newDrafts));
    if (draftId === id) setDraftId(null);
  };

  /* ── 폼 업데이트 헬퍼 ── */
    /* ── Undo 기능 (Ctrl+Z) ── */
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
    setToast({ type: 'info', message: '되돌리기 완료' });
  };

const updateForm = (updates: Partial<FormData>) => {
    pushHistory(form);
    setForm(prev => ({ ...prev, ...updates }));
  };

  /* ── Step 1: 주소 검색 (embed 모달 방식) ── */
  const openAddressSearch = () => {
    setShowAddressModal(true);
    setTimeout(() => {
      const container = postcodeContainerRef.current;
      if (!container) return;
      const w = window as unknown as { daum?: { Postcode: new (opts: Record<string, unknown>) => { embed: (el: HTMLElement) => void } } };
      if (!w.daum?.Postcode) {
        alert('주소 검색 스크립트를 로딩 중입니다. 잠시 후 다시 시도해주세요.');
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

          // Kakao Geocoder로 좌표 변환 (지도 마커용)
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

  /* ── Step 2: 건축물대장 자동 조회 ── */
  const fetchBuildingLedger = async () => {
    if (!addressData) return;

    setBuildingLoading(true);
    setBuildingError(null);

    try {
      const sigunguCd = addressData.sigunguCode || addressData.bcode?.substring(0, 5) || '';
      const bjdongCd = addressData.bcode?.substring(5, 10) || '';

      if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const res = await fetch('/api/building-ledger', {
        signal: abortRef.current.signal,
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
      if (!result.success) throw new Error(result.error || '건축물대장 조회 실패');

      const info: BuildingInfo = result.extracted;
      setBuildingInfo(info);
      setBuildingRawData(result.data);

      // 폼 자동 입력
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

      // 자동 임시저장
      await saveDraft();
      setToast({ type: 'success', text: '건축물대장 조회 완료 · 임시저장됨' });
    } catch (err: any) {
      setBuildingError(err.message || '건축물대장 조회 중 오류');
      setToast({ type: 'error', text: err.message || '건축물대장 조회 실패' });
    } finally {
      setBuildingLoading(false);
    }
  };

  /* ── Step 2 → 3 전환 시 자동 조회 ── */
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

  /* ── 건축물대장 PDF 다운로드 ── */
  const downloadBuildingPdf = () => {
    if (!buildingInfo) return;
    const bi = buildingInfo;
    const fmtDate = (d: string) => d ? `${d.substring(0,4)}.${d.substring(4,6)}.${d.substring(6,8)}` : '-';
    const fmtArea = (v: number) => v ? `${v.toFixed(2)}㎡` : '0.00㎡';
    const floorRows = (bi.층별개요 || []).map(f =>
      `<tr><td style="padding:4px 6px;border:1px solid #333;text-align:center;">${f.층번호}</td><td style="padding:4px 6px;border:1px solid #333;">${f.층구분}</td><td style="padding:4px 6px;border:1px solid #333;">${f.층용도}</td><td style="padding:4px 6px;border:1px solid #333;text-align:right;">${f.면적?.toFixed(2)}㎡</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>건축물대장 - ${bi.건물명||bi.지번주소||'조회결과'}</title>
<style>@page{size:A4;margin:15mm}body{font-family:'Batang','NanumMyeongjo',serif;font-size:11px;color:#000;margin:0;padding:15mm}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;border:1px solid #333}.label{background:#f0f0f0;font-weight:bold;width:80px}
h2{font-size:20px;border-bottom:3px double #000;padding-bottom:8px;margin:8px 0 4px}
@media print{body{padding:0}}</style></head><body>
<div style="text-align:center;margin-bottom:20px">

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
                <div style={{ fontWeight: '700', fontSize: '14px' }}>복사 등록 모드</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>기존 매물 정보가 자동 입력되었습니다. 호수/층수 등만 수정하세요.</div>
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
              일반 등록으로 전환
            </button>
          </div>
        )}
<div style="font-size:9px;color:#888">국토교통부 건축물대장 정보</div>
<h2>건 축 물 대 장</h2>
<div style="font-size:9px;color:#aaa">(건축물대장HUB 서비스 API 조회 결과)</div></div>
<table style="margin-bottom:12px">
<tr><td class="label">대장 구분</td><td>${bi.대장구분||'-'}</td><td class="label">대장 종류</td><td>${bi.대장종류||'-'}</td></tr>
<tr><td class="label">도로명주소</td><td colspan="3">${bi.도로명주소||form.road_address||'-'}</td></tr>
<tr><td class="label">지번주소</td><td colspan="3">${bi.지번주소||form.jibun_address||'-'}</td></tr>
<tr><td class="label">건물명</td><td>${bi.건물명||'-'}</td><td class="label">주용도</td><td>${bi.주용도||'-'}</td></tr>
<tr><td class="label">기타용도</td><td colspan="3">${bi.기타용도||'-'}</td></tr>
<tr><td class="label">건물구조</td><td>${bi.건물구조||'-'}</td><td class="label">지붕구조</td><td>${bi.지붕구조||'-'}</td></tr>
<tr><td class="label">대지면적</td><td>${fmtArea(bi.대지면적)}</td><td class="label">건축면적</td><td>${fmtArea(bi.건축면적)}</td></tr>
<tr><td class="label">연면적</td><td>${fmtArea(bi.연면적)}</td><td class="label">용적률산정연면적</td><td>${fmtArea(bi.용적률산정연면적)}</td></tr>
<tr><td class="label">건폐율</td><td>${bi.건폐율?.toFixed(2)||'0.00'}%</td><td class="label">용적률</td><td>${bi.용적률?.toFixed(2)||'0.00'}%</td></tr>
<tr><td class="label">지상층수</td><td>${bi.지상층수}층</td><td class="label">지하층수</td><td>${bi.지하층수}층</td></tr>
<tr><td class="label">승강기</td><td>승용 ${bi.승용엘리베이터}대 / 비상 ${bi.비상용엘리베이터}대</td><td class="label">총주차</td><td>${bi.총주차대수}대</td></tr>
<tr><td class="label">세대수</td><td>${bi.세대수}세대</td><td class="label">호수</td><td>${bi.호수}호</td></tr>
<tr><td class="label">허가일</td><td>${fmtDate(bi.허가일)}</td><td class="label">착공일</td><td>${fmtDate(bi.착공일)}</td></tr>
<tr><td class="label">사용승인일</td><td colspan="3">${fmtDate(bi.사용승인일)}</td></tr>
</table>
${floorRows ? `<div style="margin-top:16px">
<h3 style="font-size:13px;font-weight:bold;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:8px">층별 개요</h3>
<table style="font-size:10px">
<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:4px 6px;border:1px solid #333;text-align:center;width:60px">층</td><td style="padding:4px 6px;border:1px solid #333;width:80px">구분</td><td style="padding:4px 6px;border:1px solid #333">용도</td><td style="padding:4px 6px;border:1px solid #333;text-align:right;width:80px">면적</td></tr>
${floorRows}</table></div>` : ''}
<div style="margin-top:20px;text-align:center;font-size:9px;color:#999">
조회일시: ${new Date().toLocaleString('ko-KR')} | 출처: 국토교통부 건축물대장정보 서비스</div>
</body></html>`;
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return; }
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => { printWin.print(); };
  };

  /* ── Step 3: 이미지 업로드 + 자동 품질 개선 ── */
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

    // 자동 품질 개선
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

  /* ── AI 자동 완성 (스타일별) ── */
  const runAiAutoFill = async (style: AiStyle = 'trendy', model: AiModel = 'template') => {
    setAiGenerating(true);
    try {
      // 이전 결과 클리어
      updateForm({ title: '', description: '' });
      await new Promise(r => setTimeout(r, 300));

      if (model === 'template') {
        // 빠른생성: 로컬 템플릿 기반
        const newTitle = generateStyledTitle(form, buildingInfo, style);
        const newDesc = generateStyledDescription(form, buildingInfo, style);
        updateForm({ title: newTitle, description: newDesc });
      } else {
        // AI 생성: API 호출 (best=Opus, latest=Sonnet)
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
        if (!res.ok) throw new Error(`AI 생성 API 오류 (${res.status})`);
        const data = await res.json();
        if (data.success && data.title) {
          const aiTitle = generateStyledTitle(form, buildingInfo, style);
          updateForm({ title: aiTitle, description: data.description || '' });
        } else if (data.success && data.description) {
          const newTitle = generateStyledTitle(form, buildingInfo, style);
          updateForm({ title: newTitle, description: data.description });
        } else {
          throw new Error(data.error || 'AI 생성 실패');
        }
      }
    } catch (err) {
      console.error('AI auto fill error:', err);
      // AI 실패시 템플릿 폴백
      const newTitle = generateStyledTitle(form, buildingInfo, style);
      const newDesc = generateStyledDescription(form, buildingInfo, style);
      updateForm({ title: newTitle, description: newDesc });
    } finally {
      setAiGenerating(false);
    }
  };

  /* ── 매물 업로드 (서버 등록) ── */
  const publishListing = async (mode: 'instant' | 'review') => {
    setIsPublishing(true);

    if (!form.address?.trim()) { setToast({ type: 'error', text: '주소를 입력해주세요.' }); setIsPublishing(false); return; }
    if (!form.type) { setToast({ type: 'error', text: '매물 유형을 선택해주세요.' }); setIsPublishing(false); return; }
    if (!form.deal) { setToast({ type: 'error', text: '거래 유형을 선택해주세요.' }); setIsPublishing(false); return; }
    if (form.deal === '매매' && !form.price) { setToast({ type: 'error', text: '매매가를 입력해주세요.' }); setIsPublishing(false); return; }
    if ((form.deal === '전세' || form.deal === '월세') && !form.deposit) { setToast({ type: 'error', text: '보증금을 입력해주세요.' }); setIsPublishing(false); return; }
    if (form.deal === '월세' && !form.monthly) { setToast({ type: 'error', text: '월세를 입력해주세요.' }); setIsPublishing(false); return; }
    if (uploadedImages.length === 0) { setToast({ type: 'error', text: '이미지를 1장 이상 등록해주세요.' }); setIsPublishing(false); return; }

    try {
      // FormData 구성 (이미지 파일 + 매물 데이터)
      const compressImage = async (f: File): Promise<Blob> => { if (!window.createImageBitmap) return f; const bmp = await createImageBitmap(f); const cv = document.createElement('canvas'); let w = bmp.width, h = bmp.height; if (w > 1600) { h = Math.round(h * 1600 / w); w = 1600; } if (h > 1600) { w = Math.round(w * 1600 / h); h = 1600; } cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0, w, h); bmp.close(); const wmImg = new Image(); wmImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAABXCAYAAACtHW8eAAAHg0lEQVR4AeyZi5IVKRBEr/v//7zOGU2jROgGmmdTE6bQRT2zUiN2/e/jP0UM/G9+igLdeQgDLughNHuRUQy4oAuZ/vH1Q8jX8YPTsRYDLui19uHdPGTABf2QQA9fiwEX9Fr76NjNGald0Gfs+ZgpXdDHrPqMQV3QZ+z5mCld0Mes+oxBXdBn7PmYKV3Qn8+nZNv8yzf+Ork71mHABV2wC0TMvxAKfBeEu+sABlzQGSQjXICQrTvf2IG1+30eAy7oG+4lVsQbc5VdfjEft41jwAWd4BqBAgQLEm7fZt4B/t8G/20aAy7oCPUSJiKNPCdN+BMLkk7+0JWBG0F3rb1ccoQIECaoaZA4QB5Qk8Nj6hlwQX9xh/AAQgRfpse/lIe8j5N5gmwGjhY0YgOwJQFybwVyAmqAVnk9T5qBIwWNuAC0IDjAvRfID6gJetXxvJ/PcYKWoBAYGCkC6gF6ACNrn1LrGEEjIICgwMwFUx/QD5jZy5/aL7m8XtAIBiAgsNLe6AfQH1ipt117ea2gEQhAMGDlBdEfoF+wcq+r9/Y6QSMIgEDA6guw/dEvoH9g3/yex8BrBI0AAIIAeeOv6UX/gHnAml2u2dXWgmbZAgIAa9Jc1xXzAM3IWZfpnKgtBc1iAWti4YB7J0xPy3yARjQ3d8e/DGwlaJYJGIMFA+6ngHkBHAinzJ475xaCtstjoSB3wDf6MT9gNssN36djaUFrWSxPOH1hdn7Libiy7yfelxS0XQ5LO3ExJTPDESDGcsf3aVhK0FoGyxFOW8iTeS1n4vJJvh1jnwm60cQi3y6kUeoj01gexe0pREwVtMi2CziF+BFzWl7F9Yi6M2tMEbTItYTPJOHttS3P4v6tMw8VtCUTkt9K6qpzwTmgP7sLvt+CIYK25EEoeAuBO84B/4De7W743h3dBQ1hkASBgLtjDQbYB6Ab7Yl7DLvYugkaggCEgV0IObFP9gPYF9iZg+aChhAAQWBnck7rnX0B9gd2nL+ZoCEAQAjYkQzv+RcD2h/7/GXZ5/fHgmZowMgigrtjbwbYJWC3YJdpHglagzI42GVo7zOfAfYK2DXIj5zjWSVoBgMMCua0vkrVM/pgz4C9g1WnLha0hmG4VYfyvvoxoL1LB/0q1WXOFjQDAAYCdeU86g0MsH+AHkDPmchvoVoxG29ZgiaYAQBBDmcABqQH9MF3K5APkI8aFtiAtckX+6WgcQQE4+xwBkIG0AZAJyB8z/0mViAfyI3Fl1j8k4LGAUeAo8MZuGJAOkE3V37hG/6AeCH0Kfn+R9AkByQvSRTzddtZDKAZgH7A1fS8A/zBlW/OGznI95egMRDMI6fDGahhQPqRnmwObAAfYN9a3P8IumeRFo16jr0YkFjRFZ1zAuwAW0so97eg9dGygOdyBhAuQF+wwZ2zBZSTXPb+LeiWhSjgcAYsA+gLWNvTO/kQMuAOyPktaC4OZ+ABA1NCETGwxV3Qlg2/b8+AC3r7FfoAlgEXtGXD79sz4ILefoU+gGXABf3FBv+lnMLX85G/UnxgX5mQW0EzQAk0bE0MsXdxOT5hDmJikF/sTbYrH71dnr8flY/ztynrwB9kOWc6kS8FpUi9Y8/xwW8GbgXN/xYRUg3qnVM+3AXZ7Kk3zpg9ZpMvp2D97F3vnNbOPbYQ/ELgKxCju0756zt2xnxiNhurd07ZuQuyhafeY2foG34zH7D2uzyhv42ddb8V9KzGetWNLYHF9ajXK2+PXsOcqd5T9jB+1vc0QceEFSNhJoEza8e46GXL3UWv+i3zNhH0mwhpSa7nGs9AkaBr/sZysY9faqxize5ieVa3FQm68TDJdCv9IUAIQrLhTR5azaE8nKuNPlXQd8IdRdhdH6straQfZgMlMfjWxBA3G8WCToksRoBsqZjZw9v69Aqs7fQ7fICdeCgWdO1wO4ia2Vgg4L47Ws1BHrADH8MEnUuGiOv1ByA3L32A3L539nsTJ1WCziFAYrjzld9IQdz1ZHt50h+xV7B1WtzDWiU5SzmhVn7+cZ5Vgk61t+qQsX5HLJAaV4j19cQW1irNRXxJzIr7biroOzJyCcv1u6t3904dcOd30jt8gNyZVxN1V0HnEiNSdOaS2cqPPsFdvln93fXV4x0+QI/cPXNWC/pq2F0Xz0ygJ+Ejc7eYhRxgZN9PalULOlX0Tsw7kLNDjyn+QzuzgNBe+n2V427npbWe+DcXdG0zIuWKuNrciqOGIFvq7NmHrTn6Hs6vb867Xnbg5JGgrwa8ersjzt/7MJAj2prKK+36kaBrhidmBQJ6LZf5dsUbOJki6NTCVxB6qje378FAF0G/QZixv612nis2T6lEYzlW4+SxoGcNBLkgtZSrt1SM7LHY1JwxX5sn9Z6yE8sb4B4iZcePtxR4zwHxMb+YPcVJLH6U7bGgaxsNyQi/P5905hi5MW/8gN6oAfTNWwx612ljZOMklvMOoV/4nYq3ftxByrfWzmzAxlMnhH3nHsZgWwFNBM1wFrmD1cSQ28bl3ImxiMXo/epNPjpjvimbYjhTPjE7/iD29sRGTotYLr1fvclnlfMnAAAA///aV8sfAAAABklEQVQDAFxMVPlUj304AAAAAElFTkSuQmCC'; await new Promise(r => { if (wmImg.complete) r(undefined); else wmImg.onload = () => r(undefined); }); ctx.save(); ctx.globalAlpha = 0.10; const wmW = Math.round(w * 0.22); const wmH = Math.round(wmW * wmImg.naturalHeight / wmImg.naturalWidth); const diag = Math.sqrt(w * w + h * h); const step = Math.round(w * 0.3); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); for (let y = -diag; y < diag; y += step) { for (let x = -diag; x < diag; x += step) { ctx.drawImage(wmImg, x - wmW / 2, y - wmH / 2, wmW, wmH); } } ctx.restore(); return new Promise(res => cv.toBlob(bl => res(bl!), 'image/jpeg', 0.7)); }; const fd = new window.FormData();

      // 이미지 파일 추가 (enhanced 우선, 없으면 원본)
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

      // 매물 데이터 필드
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

      const res = await withRetry(() => fetch('/api/admin/listings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        body: fd,
      }), 2, 1500);

      if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Non-JSON response ' + res.status + ' ' + res.statusText }));
          console.error('[publishListing] 에러 응답:', errBody);
          const errMsg = errBody?.error || errBody?.message || `매물 등록 실패 (${res.status})`;
          throw new Error(errMsg);
        }

      // 임시저장 삭제
      if (draftId) deleteDraft(draftId);

      const modeText = mode === 'instant' ? '매물이 등록되었습니다!' : '매물이 저장되었습니다! (검수 대기)';
      setToast({ type: 'success', text: modeText });

      setTimeout(() => router.push('/admin/listings'), 1500);
    } catch (err: any) {
            console.error('[publishListing] error:', err); setToast({ type: 'error', text: `매물 등록 실패: ${err?.message || String(err) || '알 수 없는 오류'}` });
    } finally {
      setIsPublishing(false);
    }
  };

  /* ── 필수항목 체크 ── */
  // Step completion validation for checkmarks
    const isStepComplete = (stepId: number): boolean => {
      switch (stepId) {
        case 1: return !!(form.address && form.deal && form.type && ((form.deal === '매매' && form.price) || (form.deal === '전세' && form.deposit) || (form.deal === '월세' && form.deposit !== null && form.monthly !== null)));
        case 2: return !!buildingInfo;
        case 3: return uploadedImages.length > 0;
        case 4: return !!form.title;
        default: return false;
      }
    };

  /* ── 필드 유효성 시각 피드백 ── */
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
      return <span className="text-xs text-red-500 mt-1">{label} 입력이 필요합니다</span>;
    }
    return null;
  };

    const isStep1Valid = form.address && form.deal && form.type &&
    ((form.deal === '매매' && form.price) ||
     (form.deal === '전세' && form.deposit) ||
     (form.deal === '월세' && form.deposit !== null && form.monthly !== null));

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     렌더링
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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

      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/listings')}
              className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">스마트 매물 등록</h1>
          </div>
          <div className="flex items-center gap-2">
            {canUndo && (
                <button
                  type="button"
                  onClick={undoLastChange}
                  className="p-2 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                  title="되돌리기 (Ctrl+Z)"
                  aria-label="되돌리기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                </button>
              )}
              <div className="relative group">
                <button type="button" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="단축키 안내">
                  <span className="text-sm font-mono">?</span>
                </button>
                <div className="absolute right-0 top-full mt-1 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div className="font-semibold mb-2 text-green-400">단축키 안내</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>다음 단계</span><kbd className="px-1 bg-gray-700 rounded">Alt + &rarr;</kbd></div>
                    <div className="flex justify-between"><span>이전 단계</span><kbd className="px-1 bg-gray-700 rounded">Alt + &larr;</kbd></div>
                    <div className="flex justify-between"><span>임시저장</span><kbd className="px-1 bg-gray-700 rounded">Ctrl + S</kbd></div>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowDrafts(!showDrafts)}
              className="relative px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition">
              📂 임시저장 목록
              {drafts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {drafts.length}
                </span>
              )}
            </button>
            <button onClick={() => saveDraft()}
              className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              💾 임시저장
            </button>
            {lastSavedAt && (
              <span className="text-xs text-gray-400 hidden sm:inline">🟢 {lastSavedAt} 저장됨</span>
            )}
          </div>
        </div>

        
            {/* 자동저장 상태 표시 */}
            {lastSavedAt && (
              <div className="flex items-center justify-end text-xs text-gray-400 mb-2 -mt-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5 animate-pulse" />
                자동저장됨 {new Date(lastSavedAt).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}
              </div>
            )}
{/* 스텝 인디케이터 */}
        <div role="navigation" aria-label="매물 등록 단계" className="max-w-6xl mx-auto px-6 pb-4">
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
                  <span className="text-base">{isStepComplete(step.id) && currentStep !== step.id ? '✅' : step.icon}</span>
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

      {/* 임시저장 드롭다운 */}
      {showDrafts && (
        <div className="fixed inset-0 z-30" onClick={() => setShowDrafts(false)}>
          <div className="absolute top-24 right-6 w-96 bg-white rounded-xl shadow-2xl border max-h-[500px] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b font-semibold text-gray-800">📂 임시저장 목록 ({drafts.length}건)</div>
            {drafts.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">임시저장된 매물이 없습니다</div>
            ) : (
              drafts.map(draft => (
                <div key={draft.id} className="p-4 border-b hover:bg-gray-50 transition">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 cursor-pointer" onClick={() => loadDraft(draft)}>
                      <div className="font-medium text-sm text-gray-900">
                        {draft.formData.address || '주소 미입력'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {draft.formData.type || '유형 미선택'} · {draft.formData.deal} ·{' '}
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

      
            {/* 전체 진행률 바 */}
            <div className="w-full bg-gray-100 rounded-full h-1 mb-6 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-600 h-1 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${([1,2,3,4].filter(s => isStepComplete(s)).length / 4) * 100}%` }}
              />
            </div>
{/* 메인 컨텐츠 */}
      <div role="main" aria-label="매물 등록 폼" className="max-w-6xl mx-auto px-6 py-8">

        {/* ━━━━ STEP 1: 필수정보 입력 ━━━━ */}
        {currentStep === 1 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">1</span>
                  필수 정보 입력
                </h2>
                <p className="text-sm text-gray-500 mt-1 ml-10">3가지 필수 항목만 입력하면 나머지는 자동으로 채워집니다</p>
              </div>

              {/* 소재지 */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📍 소재지 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={form.address}
                      readOnly
                      placeholder="주소를 검색해주세요"
                      className="w-full px-4 py-3 border rounded-xl bg-gray-50 text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                      onClick={openAddressSearch}
                    />
                    {addressData && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        <div>도로명: {addressData.roadAddress}</div>
                        <div>지번: {addressData.jibunAddress}</div>
                        <div>동: {form.dong} | 우편번호: {addressData.zonecode}</div>
                      </div>
                    )}
                  </div>
                  <button onClick={openAddressSearch}
                    className="px-5 py-3 bg-green-700 text-white rounded-xl font-medium hover:bg-green-800 transition shrink-0">
                    🔍 주소 검색
                  </button>
                </div>
                <input
                  type="text"
                  value={form.addressDetail}
                  onChange={e => updateForm({ addressDetail: e.target.value })}
                  placeholder="상세주소 (동/호수)"
                  className="w-full mt-2 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* 거래가격 */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  💰 거래유형 및 가격 <span className="text-red-500">*</span>
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
                  {(form.deal === '월세' || form.deal === '전세') && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">보증금 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.deposit != null ? form.deposit.toLocaleString() : ''}
                        placeholder="예: 1,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ deposit: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === '월세' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">월세 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.monthly != null ? form.monthly.toLocaleString() : ''}
                        placeholder="예: 50"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ monthly: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === '매매' && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">매매가 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.price != null ? form.price.toLocaleString() : ''}
                        placeholder="예: 30,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ price: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                </div>
                {/* 가격 미리보기 */}
                {(form.deposit || form.monthly || form.price) && (
                  <div className="mt-2 text-sm text-green-700 font-medium">
                    💵 {form.deal === '매매' ? `매매가 ${formatAmount(form.price)}` :
                         form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` :
                         `보증금 ${formatAmount(form.deposit)} / 월세 ${formatAmount(form.monthly)}`}
                  </div>
                )}
              </div>

              {/* 매물유형 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  🏠 매물유형 <span className="text-red-500">*</span>
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

              {/* 입력 진행 상태 */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                <div className={`w-2 h-2 rounded-full ${form.address ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.address ? 'text-green-700' : 'text-gray-400'}>소재지</span>
                <div className={`w-2 h-2 rounded-full ${form.transactionType ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.transactionType ? 'text-green-700' : 'text-gray-400'}>거래유형</span>
                <div className={`w-2 h-2 rounded-full ${form.propertyType ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={form.propertyType ? 'text-green-700' : 'text-gray-400'}>매물유형</span>
              </div>
              {/* 다음 버튼 */}
              <div className="flex justify-end pt-4 border-t">
                <button onClick={goToStep2} disabled={!isStep1Valid}
                  className={`px-8 py-3 rounded-xl font-semibold text-white transition ${
                    isStep1Valid ? 'bg-green-700 hover:bg-green-800 shadow-lg' : 'bg-gray-300 cursor-not-allowed'
                  }`}>
                  다음 → 건축물대장 자동조회
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━ STEP 2: 건축물대장 + 세부정보 ━━━━ */}
        {currentStep === 2 && (
          <div className="step-content animate-[fadeIn_0.3s_ease-in-out] grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 좌측: 건축물대장 */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">2</span>
                    건축물대장 정보
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={fetchBuildingLedger} disabled={buildingLoading}
                      className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                      {buildingLoading ? '⏳ 조회 중...' : '🔄 재조회'}
                    </button>
                    <button onClick={() => setShowBuildingDoc(!showBuildingDoc)}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                      📄 {showBuildingDoc ? '정보 보기' : '원본 보기'}
                    </button>
                    {buildingInfo && (
                      <button onClick={downloadBuildingPdf}
                        className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                        📥 PDF 저장
                      </button>
                    )}
                  </div>
                </div>

                {buildingLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-3 border-green-700 border-t-transparent rounded-full" />
                    <span className="ml-3 text-gray-500">건축물대장 조회 중...</span>
                  </div>
                )}

                {buildingError && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
                    ⚠️ {buildingError}
                    <button onClick={fetchBuildingLedger} className="ml-2 underline">재시도</button>
                  </div>
                )}

                {buildingInfo && !showBuildingDoc && (
                  <div className="space-y-4 text-sm">
                    {/* 기본 정보 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">🏢 건물 기본정보</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">건물명:</span> {buildingInfo.건물명 || '-'}</div>
                        <div><span className="text-gray-400">주용도:</span> {buildingInfo.주용도 || '-'}</div>
                        <div><span className="text-gray-400">구조:</span> {buildingInfo.건물구조 || '-'}</div>
                        <div><span className="text-gray-400">지붕:</span> {buildingInfo.지붕구조 || '-'}</div>
                        <div><span className="text-gray-400">사용승인:</span> {formatDate(buildingInfo.사용승인일)}</div>
                        <div><span className="text-gray-400">대장구분:</span> {buildingInfo.대장구분 || '-'}</div>
                      </div>
                    </div>

                    {/* 면적/비율 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">📐 면적 · 비율</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">대지면적:</span> {formatArea(buildingInfo.대지면적)}</div>
                        <div><span className="text-gray-400">건축면적:</span> {formatArea(buildingInfo.건축면적)}</div>
                        <div><span className="text-gray-400">연면적:</span> {formatArea(buildingInfo.연면적)}</div>
                        <div><span className="text-gray-400">건폐율:</span> {buildingInfo.건폐율?.toFixed(1)}%</div>
                        <div><span className="text-gray-400">용적률:</span> {buildingInfo.용적률?.toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* 층수/승강기/주차 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">🔢 층수 · 시설</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">지상/지하:</span> {buildingInfo.지상층수}층 / B{buildingInfo.지하층수}</div>
                        <div><span className="text-gray-400">승강기:</span> {(buildingInfo.승용엘리베이터||0) + (buildingInfo.비상용엘리베이터||0)}대</div>
                        <div><span className="text-gray-400">주차:</span> {buildingInfo.총주차대수}대</div>
                        <div><span className="text-gray-400">세대/호수:</span> {buildingInfo.세대수}세대 / {buildingInfo.호수}호</div>
                      </div>
                    </div>

                    {/* 층별 개요 */}
                    {buildingInfo.층별개요 && buildingInfo.층별개요.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h3 className="font-semibold text-gray-800 mb-2">📊 층별개요</h3>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400 border-b">
                              <th className="text-left py-1">층</th><th className="text-left py-1">구분</th>
                              <th className="text-left py-1">용도</th><th className="text-right py-1">면적(㎡)</th>
                            </tr></thead>
                            <tbody>
                              {buildingInfo.층별개요.map((f, i) => (
                                <tr key={i} className="text-gray-600 border-b border-gray-100">
                                  <td className="py-1">{f.층번호}</td><td className="py-1">{f.층구분}</td>
                                  <td className="py-1">{f.층용도}</td><td className="text-right py-1">{f.면적?.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 건축물대장 원본 이미지 (공문서 스타일) */}
                {buildingInfo && showBuildingDoc && (
                  <div className="border-2 border-gray-800 rounded-lg bg-white p-6 text-sm font-['Batang','serif']">
                    <div className="text-center mb-4">
                      <div className="text-xs text-gray-500 mb-1">국토교통부 건축물대장 정보</div>
                      <h3 className="text-lg font-bold border-b-2 border-black pb-2">건 축 물 대 장</h3>
                      <div className="text-xs text-gray-400 mt-1">
                        (건축물대장HUB 서비스 API 조회 결과)
                      </div>
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">대장 구분</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.대장구분}</td>
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">대장 종류</td>
                          <td className="p-2">{buildingInfo.대장종류}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">도로명주소</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.도로명주소 || form.road_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지번주소</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.지번주소 || form.jibun_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건물명</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.건물명 || '-'}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">주용도</td>
                          <td className="p-2">{buildingInfo.주용도}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건물구조</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.건물구조}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지붕구조</td>
                          <td className="p-2">{buildingInfo.지붕구조 || '-'}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">대지면적</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.대지면적?.toFixed(2)}㎡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건축면적</td>
                          <td className="p-2">{buildingInfo.건축면적?.toFixed(2)}㎡</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">연면적</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.연면적?.toFixed(2)}㎡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건폐율</td>
                          <td className="p-2">{buildingInfo.건폐율?.toFixed(2)}%</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">용적률</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.용적률?.toFixed(2)}%</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">사용승인일</td>
                          <td className="p-2">{formatDate(buildingInfo.사용승인일)}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지상층수</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.지상층수}층</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지하층수</td>
                          <td className="p-2">{buildingInfo.지하층수}층</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">승강기</td>
                          <td className="p-2 border-r border-gray-600">승용 {buildingInfo.승용엘리베이터}대 / 비상 {buildingInfo.비상용엘리베이터}대</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">총주차</td>
                          <td className="p-2">{buildingInfo.총주차대수}대</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">세대수</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.세대수}세대</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">호수</td>
                          <td className="p-2">{buildingInfo.호수}호</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">허가일</td>
                          <td className="p-2 border-r border-gray-600">{formatDate(buildingInfo.허가일)}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">착공일</td>
                          <td className="p-2">{formatDate(buildingInfo.착공일)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="mt-4 text-center text-xs text-gray-400">
                      조회일시: {new Date().toLocaleString('ko-KR')} | 출처: 국토교통부 건축물대장정보 서비스
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 우측: 세부정보 */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h3 className="font-bold text-gray-900 mb-4">📝 세부정보 (수정 가능)</h3>

                <div className="space-y-4">
                  {/* 면적 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">전용면적 (㎡)</label>
                      <input type="number" step="0.1" value={form.area_m2 ?? ''} placeholder="예: 33.5"
                        onChange={e => updateForm({ area_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">공급면적 (㎡)</label>
                      <input type="number" step="0.1" value={form.area_supply_m2 ?? ''} placeholder="예: 45.2"
                        onChange={e => updateForm({ area_supply_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* 층 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">해당층</label>
                      <input type="text" value={form.floor_current} placeholder="예: 5"
                        onChange={e => updateForm({ floor_current: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">전체층</label>
                      <input type="text" value={form.floor_total} readOnly
                        className="w-full px-3 py-2.5 border rounded-lg bg-gray-50 text-sm text-gray-500" />
                    </div>
                  </div>

                  {/* 방/욕실 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">방 개수</label>
                      <input type="number" value={form.rooms ?? ''} placeholder="예: 2"
                        onChange={e => updateForm({ rooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">욕실 수</label>
                      <input type="number" value={form.bathrooms ?? ''} placeholder="예: 1"
                        onChange={e => updateForm({ bathrooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* 방향 / 난방 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">방향</label>
                      <select value={form.direction} onChange={e => updateForm({ direction: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">선택</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">난방방식</label>
                      <select value={form.heating_type} onChange={e => updateForm({ heating_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">선택</option>
                        {HEATING_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 관리비 */}
              {/* 관리비 도움말 */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">관리비 (만원)</label>
                    <input type="text" inputMode="numeric" value={form.maintenance_fee != null ? form.maintenance_fee.toLocaleString() : ''} placeholder="예: 5"
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

                  {/* 입주 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">입주유형</label>
                      <select value={form.move_in_type} onChange={e => updateForm({ move_in_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="즉시">즉시 입주</option>
                        <option value="협의">협의</option>
                        <option value="날짜지정">날짜 지정</option>
                      </select>
                    </div>
                    {form.move_in_type === '날짜지정' && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">입주예정일</label>
                        <input type="date" value={form.move_in_date}
                          onChange={e => updateForm({ move_in_date: e.target.value })}
                          className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                      </div>
                    )}
                  </div>

                  {/* 특징 */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">특징 태그</label>
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

              {/* 다음 버튼 */}
              <div className="flex justify-between">
                <button onClick={() => setCurrentStep(1)}
                  className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">
                  ← 이전
                </button>
                <button onClick={() => { saveDraft(); setCurrentStep(3); }}
                  className="px-8 py-3 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition shadow-lg">
                  다음 → 사진 등록
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━ STEP 3: 사진 등록 + 자동 품질 개선 ━━━━ */}
        {currentStep === 3 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">3</span>
                  사진 등록
                </h2>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={useEnhanced} onChange={e => setUseEnhanced(e.target.checked)}
                    className="accent-green-700 w-4 h-4" />
                  <span className="text-gray-700">✨ 자동 품질 개선 사용</span>
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                사진을 업로드하면 <strong>밝기, 대비, 선명도, 색감</strong>이 자동으로 보정됩니다.
                원본과 보정본을 비교하고 선택할 수 있습니다.
              </p>

              {/* 드래그 앤 드롭 영역 */}
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
                  isDragOver ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); handleImageFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl mb-2">📷</div>
                <div className="text-sm text-gray-600 font-medium">
                  클릭하여 사진을 선택하거나, 여기에 드래그하세요
                </div>
                <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP 지원 · 최대 20장</div>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => e.target.files && handleImageFiles(e.target.files)} />
              </div>

              {/* 이미지 일괄 작업 */}
              {uploadedImages.length > 1 && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-sm text-gray-500">{uploadedImages.length}장 업로드됨</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const sorted = [...uploadedImages].sort((a, b) => (b.enhanced ? 1 : 0) - (a.enhanced ? 1 : 0));
                        setUploadedImages(sorted);
                      }}
                      className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      aria-label="개선된 사진 우선 정렬"
                    >
                      개선순 정렬
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm('모든 사진을 삭제하시겠습니까?')) setUploadedImages([]); }}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      aria-label="모든 사진 삭제"
                    >
                      전체 삭제
                    </button>
                  </div>
                </div>
              )}
              {/* 업로드된 이미지 */}
              {uploadedImages.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      업로드된 사진 ({uploadedImages.length}장)
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {uploadedImages.map((img, i) => (
                      <div key={i} className={`image-card relative group ${dragIndex === i ? 'opacity-50 scale-95' : ''} transition-all cursor-grab active:cursor-grabbing`}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => { e.preventDefault(); }}
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
                                <div className="text-xs text-gray-400 mt-2">품질 개선 중...</div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={(useEnhanced && img.enhanced) ? img.enhanced : img.preview}
                              alt={`사진 ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>

                        {/* 원본/개선 토글 배지 */}
                        {img.enhanced && !img.isEnhancing && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-600 text-white">
                            {useEnhanced ? '✨ 개선' : '원본'}
                          </div>
                        )}

                        {/* 순서 표시 */}
                        <div className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center">
                          {i + 1}
                        </div>

                        {/* 호버 액션 */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {i > 0 && (
                            <button onClick={() => moveImage(i, i - 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">←</button>
                          )}
                          <button onClick={() => removeImage(i)}
                            className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow text-sm">✕</button>
                          {i < uploadedImages.length - 1 && (
                            <button onClick={() => moveImage(i, i + 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">→</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 사진 등록 후: AI자동등록 / 직접 등록 선택 ── */}
            {uploadedImages.length > 0 && !showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8">
                <h3 className="text-base font-bold text-gray-800 mb-4 text-center">매물 등록 방식을 선택하세요</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setShowAiPanel(true)}
                    className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left group">
                    <div className="text-3xl mb-2">🤖</div>
                    <h3 className="font-bold text-green-800 text-lg group-hover:text-green-900">AI 자동등록</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      AI가 <span className="text-green-600 font-semibold">제목과 설명</span>을 자동으로 생성합니다.
                      2026 트렌드에 맞는 센스 있는 매물 소개글을 만들어 드립니다.
                    </p>
                  </button>
                  <button onClick={() => { saveDraft(); setCurrentStep(4); }}
                    className="p-6 border-2 border-gray-300 rounded-2xl hover:bg-gray-50 transition text-left group">
                    <div className="text-3xl mb-2">✍️</div>
                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-gray-900">직접 등록</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      매물 제목과 설명을 <span className="text-gray-700 font-semibold">직접 작성</span>합니다.
                      원하는 대로 자유롭게 입력할 수 있습니다.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* ── AI 자동등록 패널 ── */}
            {showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">🤖 AI 자동등록</h3>
                  <button onClick={() => setShowAiPanel(false)} className="text-sm text-gray-400 hover:text-gray-600 transition">✕ 닫기</button>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">AI 스타일을 선택하세요</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setAiStyleOption('trendy')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'trendy' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">🔥</div>
                      <div className="font-bold text-sm text-gray-800">트렌디 2026</div>
                      <div className="text-xs text-gray-500 mt-0.5">MZ세대 감성, 꿀매물·맛집 등 트렌드 키워드</div>
                    </button>
                    <button onClick={() => setAiStyleOption('premium')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'premium' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">✨</div>
                      <div className="font-bold text-sm text-gray-800">프리미엄</div>
                      <div className="text-xs text-gray-500 mt-0.5">고급스럽고 격식 있는 프로페셔널 톤</div>
                    </button>
                    <button onClick={() => setAiStyleOption('clean')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'clean' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">📋</div>
                      <div className="font-bold text-sm text-gray-800">클린 정석</div>
                      <div className="text-xs text-gray-500 mt-0.5">깔끔하고 정돈된 기본 포맷</div>
                    </button>
                  </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">AI 모델 선택</label>
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
              📝 빠른생성
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
              ✨ 최고 AI
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
              ⚡ 최신 AI
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {aiModel === 'template' ? '템플릿 기반 즉시 생성' : aiModel === 'best' ? 'Claude Opus - 최고 품질 AI 작성' : 'Claude Sonnet - 빠르고 스마트한 AI'}
          </p>
        </div>

                </div>
                {!form.title && (
                  <div className="text-center">
                    <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)} disabled={aiGenerating} className="px-10 py-3.5 bg-green-700 text-white rounded-xl font-semibold hover:bg-green-800 transition shadow-lg disabled:bg-gray-400 text-base">
                      {aiGenerating ? (<span className="flex items-center gap-2"><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />AI가 매물 정보를 분석 중...</span>) : '🤖 AI 자동완성 실행'}
                    </button>
                  </div>
                )}
                {form.title && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">📌 매물 제목 <span className="text-green-600 text-xs font-normal ml-1">AI 생성됨</span></label>
                        <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)}
                          disabled={aiGenerating}
                          className="text-xs text-gray-400 hover:text-green-600 transition disabled:opacity-50">
                          {aiGenerating ? '생성 중...' : '🔄 다시 생성'}</button>
                      </div>
                      <input type="text" value={form.title} onChange={e => updateForm({ title: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">📝 매물 설명 <span className="text-green-600 text-xs font-normal ml-1">AI 생성됨</span></label>
                      <p className="text-xs text-gray-400 mb-1">※ 소재지, 면적, 층수 등 건축물대장에서 확인 가능한 정보는 제외됩니다</p>
                      <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })} rows={8} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y text-sm leading-relaxed" />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5">
                      <h4 className="font-semibold text-gray-800 text-sm mb-3">📋 등록 정보 요약</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">소재지</div><div className="font-medium text-gray-800 truncate">{form.address || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">거래</div><div className="font-medium text-gray-800">{form.deal === '매매' ? `매매 ${formatAmount(form.price)}` : form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` : `월세 ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">유형</div><div className="font-medium text-gray-800">{form.type || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">면적</div><div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}㎡` : '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">층</div><div className="font-medium text-gray-800">{form.floor_current || '-'}층 / {form.floor_total || '-'}층</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">사진</div><div className="font-medium text-gray-800">{uploadedImages.length}장</div></div>
                      </div>
                      {form.features.length > 0 && (<div className="mt-3 flex flex-wrap gap-1">{form.features.map(f => (<span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>))}</div>)}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => { setShowAiPanel(false); setCurrentStep(2); }} className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">← 이전</button>
              {<button onClick={() => { saveDraft(); setCurrentStep(4); }} className="px-6 py-3 rounded-xl bg-black text-white hover:bg-gray-800 transition">다음 →</button>}
            </div>
          </div>
        )}

        {/* ━━━━ STEP 4: 직접 등록 ━━━━ */}
        {currentStep === 4 && (
          <div className="space-y-6 step-content animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-6">
                <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">4</span>
                직접 등록
              </h2>

              {/* 매물 제목 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📌 매물 제목
                </label>
                <input type="text" value={form.title}
                  onChange={e => updateForm({ title: e.target.value })}
                  placeholder="예: 신림역 역세권 신축 원룸 월세"
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* 매물 설명 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 매물 설명
                </label>
                <p className="text-xs text-gray-400 mb-1">※ 소재지, 면적, 층수 등 건축물대장에서 확인 가능한 정보는 자동 포함되므로 별도 입력 불필요</p>
                <textarea value={form.description}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="매물의 특장점, 주변 편의시설, 교통 등을 입력하세요"
                  rows={6}
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
              </div>

              {/* 등록 요약 미리보기 */}
              <div className="bg-gray-50 rounded-xl p-5 mb-6">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">📋 등록 정보 요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">소재지</div>
                    <div className="font-medium text-gray-800 truncate">{form.address || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">거래</div>
                    <div className="font-medium text-gray-800">
                      {form.deal === '매매' ? `매매 ${formatAmount(form.price)}` :
                       form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` :
                       `월세 ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">유형</div>
                    <div className="font-medium text-gray-800">{form.type || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">면적</div>
                    <div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}㎡` : '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">층</div>
                    <div className="font-medium text-gray-800">{form.floor_current || '-'}층 / {form.floor_total || '-'}층</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">사진</div>
                    <div className="font-medium text-gray-800">{uploadedImages.length}장</div>
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

              {/* 등록 방식 선택 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => publishListing('instant')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">🚀</div>
                  <h3 className="font-bold text-green-800 text-lg">즉시 업로드</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    바로 <span className="text-green-600 font-semibold">공개</span> 상태로 매물을 등록합니다.
                    즉시 홈페이지에 노출됩니다.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-green-700 font-medium">
                      <span>업로드 진행중...</span>
                      <span>${uploadProgress}/${uploadedImages.length}</span>
                    </div>
                    <div className="w-full bg-green-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-green-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadedImages.length > 0 ? (uploadProgress / uploadedImages.length) * 100 : 0}%` }} />
                    </div>
                  </div>}
                </button>

                <button onClick={() => publishListing('review')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-blue-400 rounded-2xl hover:bg-blue-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">🔍</div>
                  <h3 className="font-bold text-blue-800 text-lg">직접 등록</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-blue-600 font-semibold">비공개</span> 상태로 저장 후 검수합니다.
                    확인 후 수동으로 공개 전환합니다.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-blue-700 font-medium">
                      <span>업로드 진행중...</span>
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
                ← 이전
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
              <span className="font-semibold text-sm flex items-center gap-2">{String.fromCodePoint(0x1F4CD)} 주소 검색</span>
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
          React.createElement('h2', {className: 'text-xl font-bold mb-4'}, '오류가 발생했습니다'),
          React.createElement('button', {onClick: () => this.setState({hasError: false}), className: 'px-4 py-2 bg-black text-white rounded-lg'}, '다시 시도')
        )
      );
    }
    return this.props.children;
  }
}

export default function SmartListingNewPageWithErrorBoundary() {
  return React.createElement(ListingErrorBoundary, null, React.createElement(Suspense, {fallback: React.createElement('div', {style:{padding:'40px',textAlign:'center'}}, '로딩 중...')}, React.createElement(SmartListingNewPage)));
}
