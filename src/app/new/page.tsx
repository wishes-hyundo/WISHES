'use client';

import { useEffect } from 'react';
import ListingNewPage from '../admin/listings/new/page';
import { extractFloorplanFromFile } from '@/lib/hooks/extractFloorplan';

/**
 * /new — 매물 등록 짧은 URL.
 *
 * L-Step4-rev2 (2026-04-29 사장님 지적 반영):
 *   "100% 확실한 정보 바탕으로 근거와 이유 확실해야"
 *
 * 자동 SVG 평면도 폐기 — 사장님 입력값 기반 추정은 부정확.
 *
 * 유지:
 * 1. file change listener — 사장님이 평면도 사진 직접 업로드 시 자동 분석 (사진 = 100% 진짜 데이터)
 *
 * 추가:
 * 2. STEP 3 사진 영역에 외부 평면도 검색 링크 (네이버 부동산 / 호갱노노 / 다방) — 사장님이 직접 확인
 */
export default function NewListingPage() {
  useEffect(() => {
    let _firedForFile: File | null = null;

    const fileHandler = async (ev: Event) => {
      const target = ev.target as HTMLInputElement | null;
      if (!target || target.type !== 'file' || !target.files || target.files.length === 0) return;
      const f = target.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      if (_firedForFile === f) return;
      _firedForFile = f;

      try {
        const fp = await extractFloorplanFromFile(f);
        if (!fp) return;

        const setIfEmpty = (selector: string, value: string | number | null) => {
          if (value == null || value === '') return;
          const el = document.querySelector(selector) as HTMLInputElement | null;
          if (!el) return;
          if (el.value && el.value !== '0') return;
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeSetter?.call(el, String(value));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        if (fp.rooms != null) setIfEmpty('input[name="rooms"], input[placeholder*="방"]', fp.rooms);
        if (fp.bathrooms != null) setIfEmpty('input[name="bathrooms"], input[placeholder*="화장실"]', fp.bathrooms);
        if (fp.direction) setIfEmpty('input[name="direction"], select[name="direction"]', fp.direction);

        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2D5A27;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15)';
        toast.textContent = '🤖 도면 자동 분석 (Gemini Vision): 방 ' + (fp.rooms ?? '?') + '개 · 화장실 ' + (fp.bathrooms ?? '?') + '개' + (fp.direction ? ' · ' + fp.direction : '');
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      } catch (e) {
        console.warn('[L-Step4] auto-floorplan failed', e);
      }
    };

    document.addEventListener('change', fileHandler, true);

    // ─── STEP 3 영역에 외부 평면도 검색 링크 inject ───
    const panelId = 'wishes-fp-search-panel';
    let injected = false;
    const renderSearchPanel = () => {
      try {
        if (injected) return;
        const step3Node = document.querySelector('.step-content');
        if (!step3Node) return;
        const h2Texts = Array.from(step3Node.querySelectorAll('h2')).map(h => (h.textContent || '').trim());
        if (!h2Texts.some(t => t.includes('사진 등록') || t.includes('사진 업로드'))) return;
        if (document.getElementById(panelId)) return;

        // 주소 + 단지명 추출
        const getStrByName = (n: string): string => {
          const el = document.querySelector(`input[name="${n}"], select[name="${n}"]`) as HTMLInputElement | null;
          return el?.value || '';
        };
        const address = getStrByName('address');
        const buildingName = getStrByName('building_name');
        const query = encodeURIComponent((buildingName || address || '평면도').trim());

        const naverUrl = 'https://land.naver.com/search/result.naver?searchType=APT&query=' + query;
        const hogangUrl = 'https://hogangnono.com/search/' + query;
        const dabangUrl = 'https://www.dabangapp.com/search?q=' + query;

        const panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText = 'margin-top:20px;padding:16px;background:#f9faf6;border:1px solid #d0e0c8;border-radius:12px';
        panel.innerHTML =
          '<div style="font-weight:700;color:#2D5A27;font-size:13px;margin-bottom:10px">📐 평면도 검색 (외부 사이트)</div>' +
          '<p style="font-size:11px;color:#666;margin-bottom:12px;line-height:1.6">' +
          '⚠️ 위시스는 평면도 자동 생성 안 함 (정확한 정보만 제공 정책).<br>' +
          '아래 외부 사이트에서 진짜 평면도 확인 후, 캡처해서 위에 업로드 → AI 가 자동 분석합니다.' +
          '</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">' +
            '<a href="' + naverUrl + '" target="_blank" rel="noopener" style="display:block;padding:8px;background:#03C75A;color:#fff;border-radius:6px;text-decoration:none;text-align:center;font-size:12px;font-weight:600">네이버 부동산</a>' +
            '<a href="' + hogangUrl + '" target="_blank" rel="noopener" style="display:block;padding:8px;background:#FFB800;color:#000;border-radius:6px;text-decoration:none;text-align:center;font-size:12px;font-weight:600">호갱노노</a>' +
            '<a href="' + dabangUrl + '" target="_blank" rel="noopener" style="display:block;padding:8px;background:#FF6B6B;color:#fff;border-radius:6px;text-decoration:none;text-align:center;font-size:12px;font-weight:600">다방</a>' +
          '</div>';
        const card = step3Node.querySelector('.bg-white.rounded-2xl');
        (card || step3Node).appendChild(panel);
        injected = true;
      } catch (e) {
        console.warn('[L-FP-search] inject error', e);
      }
    };
    const interval = setInterval(renderSearchPanel, 1000);

    return () => {
      document.removeEventListener('change', fileHandler, true);
      clearInterval(interval);
    };
  }, []);

  return <ListingNewPage />;
}
