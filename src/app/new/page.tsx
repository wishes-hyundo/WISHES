'use client';

import { useEffect } from 'react';
import ListingNewPage from '../admin/listings/new/page';
import { extractFloorplanFromFile } from '@/lib/hooks/extractFloorplan';

/**
 * /new — 매물 등록 짧은 URL (사장님 명령 2026-04-28)
 * admin/listings/new 의 풀 form 재사용.
 *
 * L-Step4 (2026-04-29): wrapper 레벨에서 file 입력 감지 → Vision LLM 도면 자동 분석
 * (admin/listings/new/page.tsx 거대 파일 직접 수정 회피 — global event listener 패턴)
 */
export default function NewListingPage() {
  useEffect(() => {
    let _firedForFile: File | null = null;
    const handler = async (ev: Event) => {
      const target = ev.target as HTMLInputElement | null;
      if (!target || target.type !== 'file' || !target.files || target.files.length === 0) return;
      const f = target.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      // 같은 파일 중복 방지
      if (_firedForFile === f) return;
      _firedForFile = f;

      try {
        const fp = await extractFloorplanFromFile(f);
        if (!fp) return;

        // 사장님 폼 필드에 자동 채우기 — DOM 직접 조작 (admin/listings/new 의 React state 직접 못 건드려 — input value 변경 후 input 이벤트 발생시켜 React onChange 트리거)
        const setIfEmpty = (selector: string, value: string | number | null) => {
          if (value == null || value === '') return;
          const el = document.querySelector(selector) as HTMLInputElement | null;
          if (!el) return;
          if (el.value && el.value !== '0') return; // 이미 값 있으면 skip
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeSetter?.call(el, String(value));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        if (fp.rooms != null) setIfEmpty('input[name="rooms"], input[placeholder*="방"]', fp.rooms);
        if (fp.bathrooms != null) setIfEmpty('input[name="bathrooms"], input[placeholder*="화장실"]', fp.bathrooms);
        if (fp.direction) setIfEmpty('input[name="direction"], select[name="direction"]', fp.direction);

        // 토스트 유사 알림 (form 의 setToast 못 부르니 임시 div)
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2D5A27;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15)';
        toast.textContent = '🤖 도면 자동 분석: 방 ' + (fp.rooms ?? '?') + '개 · 화장실 ' + (fp.bathrooms ?? '?') + '개' + (fp.direction ? ' · ' + fp.direction : '');
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      } catch (e) {
        console.warn('[L-Step4 wrapper] auto-floorplan failed', e);
      }
    };

    document.addEventListener('change', handler, true);
    return () => document.removeEventListener('change', handler, true);
  }, []);

  return <ListingNewPage />;
}
