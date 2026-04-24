'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VRTour (T2-5) — 매물 상세 VR·360° 뷰어
//   - 지원 프로바이더: Matterport(matterport.com/show), kuula.co, YouTube 360(youtube.com/embed),
//     roundme.com, tour360, klapty, 기타 임의 임베드 허용(iframe)
//   - 입력: vr_url (문자열). 비어있으면 렌더하지 않음.
//   - 크롤링 매물(source_site 있음)은 VR 미노출 — 자체 매물 품질만 보장
//   - 클릭 시 iframe 로드(지연 로드 = Vercel 대역폭 절약)
//   - 전체화면 토글 지원(requestFullscreen)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useRef, useState } from 'react';
import { Play, Maximize2, Box, ExternalLink } from 'lucide-react';
// L-sec95 (2026-04-22): vr_url 필드는 데이터베이스에서 오므로 http(s) 강제.
//   javascript: iframe src 이 동일 오리진에서 스크립트 실행 정지.
import { safeHttpUrl } from '@/lib/safe-url';

function normalizeVrUrl(raw: string): string | null {
  // L-sec95 (2026-04-22): 아예 통과 전 http(s) 확인. javascript:/data:/file: 등은 null.
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const h = url.hostname.toLowerCase();
    // L-sec58 (2026-04-22): hostname.includes() 서브스트링 매치 → 엄격한 hostname 검증.
    //   'matterport.com.attacker.com' / 'youtube.com.evil.tld' 같은 스푸핑 호스트가
    //   정상 프로바이더로 분류되어 iframe 에 임베드되는 것을 방지.
    // Matterport: matterport.com/show 또는 my.matterport.com — 그대로 사용
    if (h === 'matterport.com' || h.endsWith('.matterport.com')) return url.toString();
    // YouTube: watch?v= → embed/
    const isYt =
      h === 'youtube.com' || h.endsWith('.youtube.com') ||
      h === 'youtu.be' || h.endsWith('.youtu.be');
    if (isYt) {
      const vId = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
      if (vId) return `https://www.youtube.com/embed/${vId}?autoplay=1&rel=0`;
    }
    // kuula / roundme / 기타: 원본 그대로 (이미 http(s) 검증됨)
    return url.toString();
  } catch {
    // L-sec95: malformed URL 이면 렌더 자체 생략.
    return null;
  }
}

function detectProvider(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('matterport')) return 'Matterport 3D';
  if (lower.includes('kuula')) return 'Kuula 360°';
  if (lower.includes('roundme')) return 'Roundme';
  if (lower.includes('youtube') || lower.includes('youtu.be')) return 'YouTube 360°';
  if (lower.includes('klapty')) return 'Klapty';
  return '360° 투어';
}

export default function VRTour({
  vrUrl,
  isAd = false,
}: {
  vrUrl?: string | null;
  isAd?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 크롤링 매물(광고) 또는 URL 없음 → 미노출
  if (isAd || !vrUrl) return null;

  // L-sec95 (2026-04-22): http(s) 검증 실패 시 iframe/<a href> 둘 다 렌더 생략.
  const embedUrl = normalizeVrUrl(vrUrl);
  if (!embedUrl) return null;
  const provider = detectProvider(embedUrl);

  const enterFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <section
      id="vr"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      aria-label="VR 가상 투어"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-wishes-primary/[0.04]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-wishes-primary text-white text-[11px] font-bold">
            <Box className="w-3.5 h-3.5" /> VR 투어
          </span>
          <span className="text-xs text-gray-500">{provider}</span>
        </div>
        <div className="flex items-center gap-2">
          {loaded && (
            <button
              onClick={enterFullscreen}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-wishes-primary"
              aria-label="전체화면으로 보기"
            >
              <Maximize2 className="w-3.5 h-3.5" /> 전체화면
            </button>
          )}
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-wishes-primary"
            aria-label="새 창에서 보기"
          >
            <ExternalLink className="w-3.5 h-3.5" /> 새 창
          </a>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative bg-gradient-to-br from-wishes-primary/90 to-wishes-secondary aspect-video"
      >
        {!loaded ? (
          <button
            onClick={() => setLoaded(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white hover:bg-black/10 transition-colors"
            aria-label="VR 투어 재생"
          >
            <span className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center shadow-xl">
              <Play className="w-7 h-7 ml-1 fill-white" />
            </span>
            <span className="text-sm font-bold">클릭하여 VR 투어 시작</span>
            <span className="text-xs text-white/80">실제 공간을 360° 로 둘러보세요</span>
          </button>
        ) : (
          <iframe
            src={embedUrl}
            title={`${provider} 가상 투어`}
            allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; autoplay"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 w-full h-full border-0"
          />
        )}
      </div>
    </section>
  );
}
