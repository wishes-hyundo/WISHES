'use client';

import { useEffect } from 'react';
import ListingNewPage from '../admin/listings/new/page';
import { extractFloorplanFromFile } from '@/lib/hooks/extractFloorplan';

/**
 * /new — 매물 등록 짧은 URL (사장님 명령 2026-04-28)
 * admin/listings/new 의 풀 form 재사용.
 *
 * L-Step4 (2026-04-29): wrapper 에 두 가지 자동화 추가
 * 1. file change listener → 도면 사진 업로드 시 자동 분석 + 폼 자동 채우기
 * 2. AutoFP 패널 → 사진 0장이면 SVG 자동 생성 평면도 표시 (사장님 평면도 못 구해도 OK)
 */
export default function NewListingPage() {
  useEffect(() => {
    let _firedForFile: File | null = null;

    // ─── 1. file change → Vision LLM 자동 분석 ───
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
        toast.textContent = '🤖 도면 자동 분석: 방 ' + (fp.rooms ?? '?') + '개 · 화장실 ' + (fp.bathrooms ?? '?') + '개' + (fp.direction ? ' · ' + fp.direction : '');
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      } catch (e) {
        console.warn('[L-Step4 wrapper] auto-floorplan failed', e);
      }
    };

    document.addEventListener('change', fileHandler, true);

    // ─── 2. AutoFP 패널 — STEP 3 (사진) 영역에 자동 SVG 평면도 미리보기 ───
    const autoFpPanelId = 'wishes-autofp-panel';
    let autoFpInjected = false;

    const renderAutoFpPanel = () => {
      try {
        if (autoFpInjected) return;
        // STEP 3 활성 시에만 동작 — currentStep === 3 라는 step-content 가 mount 됨
        const step3Node = document.querySelector('.step-content');
        if (!step3Node) return;
        // 이미지 업로드 영역 헤더 ("사진 등록" h2) 있을 때만 STEP 3 으로 간주
        const h2Texts = Array.from(step3Node.querySelectorAll('h2')).map(h => (h.textContent || '').trim());
        if (!h2Texts.some(t => t.includes('사진 등록') || t.includes('사진 업로드'))) return;
        // 이미 패널 있으면 skip
        if (document.getElementById(autoFpPanelId)) return;

        // 면적/방수/화장실/향 값 읽기
        const getNumByName = (n: string): number => {
          const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement | null;
          if (!el) return 0;
          return parseFloat(el.value) || 0;
        };
        const getStrByName = (n: string): string => {
          const el = document.querySelector(`input[name="${n}"], select[name="${n}"]`) as HTMLInputElement | null;
          return el?.value || '';
        };
        const areaM2 = getNumByName('area_m2');
        const rooms = getNumByName('rooms') || 2;
        const bathrooms = getNumByName('bathrooms') || 1;
        const direction = getStrByName('direction');
        const buildingName = getStrByName('building_name');
        if (!areaM2 || areaM2 < 5) return; // 면적 없으면 자동 생성 X

        const params = new URLSearchParams({
          areaM2: String(areaM2),
          rooms: String(rooms),
          bathrooms: String(bathrooms),
          direction,
          buildingName: buildingName || '매물',
        });
        const svgUrl = '/api/admin/generate-floorplan-svg?' + params.toString();

        // 토큰 헤더 필요 — fetch 로 SVG 가져온 뒤 inline
        const wsToken = (() => {
          try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
          catch { return ''; }
        })();
        if (!wsToken) return;

        fetch(svgUrl, { headers: { Authorization: 'Bearer ' + wsToken } })
          .then(res => res.ok ? res.text() : null)
          .then(svg => {
            if (!svg || svg.indexOf('<svg') < 0) return;
            const panel = document.createElement('div');
            panel.id = autoFpPanelId;
            panel.style.cssText = 'margin-top:20px;padding:16px;background:#f9faf6;border:2px dashed #2D5A27;border-radius:12px';
            panel.innerHTML =
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
                '<h3 style="font-weight:700;color:#2D5A27;font-size:14px;margin:0">🤖 AI 자동 생성 평면도 (사진 없을 때 사용)</h3>' +
                '<button type="button" id="wishes-autofp-toggle" style="padding:4px 10px;background:#2D5A27;color:#fff;border:0;border-radius:4px;font-size:11px;cursor:pointer">새로고침</button>' +
              '</div>' +
              '<div id="wishes-autofp-svg" style="background:#fff;border-radius:8px;padding:8px">' + svg + '</div>' +
              '<p style="margin-top:8px;font-size:11px;color:#888;line-height:1.5">' +
              '면적/방수/화장실/향 값으로 표준 평면도 자동 생성. 정확한 평면도 사진 있으면 위에 업로드 (자동 인식).' +
              '</p>';
            // STEP 3 영역의 마지막 자식으로 추가
            const card = step3Node.querySelector('.bg-white.rounded-2xl');
            (card || step3Node).appendChild(panel);
            autoFpInjected = true;

            // 새로고침 버튼
            const btn = document.getElementById('wishes-autofp-toggle');
            btn?.addEventListener('click', () => {
              autoFpInjected = false;
              panel.remove();
              setTimeout(renderAutoFpPanel, 100);
            });
          })
          .catch(() => {});
      } catch (e) {
        console.warn('[L-AutoFP] panel inject error', e);
      }
    };

    // STEP 변경 감지 — 1초마다 폴링 (간단)
    const interval = setInterval(renderAutoFpPanel, 1000);

    return () => {
      document.removeEventListener('change', fileHandler, true);
      clearInterval(interval);
    };
  }, []);

  return <ListingNewPage />;
}
