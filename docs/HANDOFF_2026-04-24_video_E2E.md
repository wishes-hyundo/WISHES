# Video E2E Audit — 2026-04-24

## 요약

c8d15e8a 에서 도입된 공개 매물 상세 VideoPlayer 컴포넌트 E2E 검증.
- 코드/컴포넌트 자체는 완벽.
- **L-sec101 (`/api/images/[...path]/route.ts`) 의 `SAFE_IMAGE_TYPES` 화이트리스트에 video/* 가 빠져있어 모든 동영상이 `application/octet-stream` 강등 서빙 → HTML5 `<video>` 재생 차단** 이라는 P0 버그가 숨어있었음. 이 세션에서 `baa932f` 로 fix 배포 완료.
- 추가로 R2 presign 직접 PUT 경로(mobile-photo.html / 클라이언트 직접 업로드)가 브라우저에서 503 으로 실패하는 증상 발견 — **모바일 영상 등록이 망가져 있음**. 다음 세션 과제.

## 배포 변경 — baa932f

### L-video3: /api/images Content-Type 강등 버그 수정

파일: `src/app/api/images/[...path]/route.ts`

BEFORE (L-sec101 원본):
```ts
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const rawCT = (response.ContentType || 'image/webp').toLowerCase().split(';')[0].trim();
const safeCT = SAFE_IMAGE_TYPES.has(rawCT) ? rawCT : 'application/octet-stream';
return new NextResponse(..., { headers: {
  'Content-Type': safeCT,
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
  ...
}});
```

AFTER:
```ts
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const SAFE_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska']);
const rawCT = (response.ContentType || 'image/webp').toLowerCase().split(';')[0].trim();
const isImage = SAFE_IMAGE_TYPES.has(rawCT);
const isVideo = SAFE_VIDEO_TYPES.has(rawCT);
const safeCT = isImage || isVideo ? rawCT : 'application/octet-stream';

const headers: Record<string, string> = {
  'Content-Type': safeCT,
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
  'Content-Length': String(bytes.length),
};
// image 와 허용 않은 타입은 기존 CSP 유지, video 만 sandbox 제거
if (!isVideo) {
  headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; sandbox";
}
```

**왜 이 fix 가 안전한가**: 원래 L-sec101 의 목적은 R2 에 업로드될 수 있는 `image/svg+xml` 류 스크립트 실행 포맷을 octet-stream 으로 강등시켜 XSS 경로 차단. `video/*` (mp4/quicktime/webm/m4v/mkv) 는 `<script>` 실행 가능한 표면이 없어 통과시켜도 XSS 리스크 없음. SVG 등 알 수 없는 타입은 여전히 `safeCT=octet-stream` + CSP sandbox + nosniff 로 보호.

### 검증 결과
- `curl -I https://wishes.co.kr/api/images/listings/54854/video-1777027299117_0.mp4` → **200 video/mp4** (5회 연속)
- `curl -I ... -H "Range: bytes=0-99"` → **206** with content-range, content-type: video/mp4
- `curl -o file ... && ffprobe` → **h264 320x180 12fps duration=2.0s** 정상
- `/api/version` → commit=baa932f, 메시지 "fix(video): L-video3..." 확인

### 선행 검증: VideoPlayer 컴포넌트 자체는 완벽

`src/components/VideoPlayer.tsx` (117 lines) DOM/속성 감사:

- `<video>` 속성: controls / preload=metadata / playsInline
- controlsList: `nodownload noremoteplayback noplaybackrate` ✓
- disablePictureInPicture / disableRemotePlayback ✓ (React spread 로 속성 attach)
- `onContextMenu={preventDefault}` + `onDragStart={preventDefault}` — DOM 이벤트 dispatch 테스트로 `defaultPrevented=true` 확인
- 워터마크 `<span>` 중앙:
  - text = "WISHES"
  - color rgba(255, 255, 255, 0.2)
  - letterSpacing 21.6px, fontSize clamp(22, 7vw, 72px) → 1288px 뷰포트에서 72px
  - mix-blend-mode: screen
  - pointer-events: none, user-select: none
- 공개 상세 페이지 : aspect-ratio 16:9 정확 (w=601 h=338 ratio=1.778)
- admin edit (`hideWatermark={true}`) : 워터마크 div 자체가 DOM 에서 미렌더 — controlsList/PiP/RemotePlayback 보호는 그대로 유지
- 광고 매물 (`source_site`) 은 ListingDetailClient.tsx:555 에서 video 섹션 자체 스킵

## 현재 상태 (2026-04-24 11시 기준)

- **origin/main HEAD**: `baa932f` fix(video): L-video3
- **테스트 매물 54854**: status=공개, source_site=null, listing_videos row id=2 (url: `https://wishes.co.kr/api/images/listings/54854/video-1777027299117_0.mp4`, mp4 4970 bytes, 2s duration)
  - 이 매물 title 은 "[TEST] 동영상 플레이어 검증용 - 삭제 예정"
  - 검증이 끝났으므로 **삭제 or 정리해도 무방**. 테스트 영상만 지우거나, 매물 자체를 unpublish 추천.
- **L-sec80 rate limit (5분 120건/IP)** — 이 세션에서 Chrome MCP IP 가 많은 진단 요청으로 소진. 3~5분 후 자연 해소. 일반 방문자 브라우저는 영향 없음.

## ⚠️ 다음 세션 과제: R2 presign PUT 503

**증상**: 브라우저(Chrome)에서 `/api/listings/[id]/videos/presign` 으로 받은 presigned URL 에 XHR PUT → R2 가 503 반환 (최초 3회 재현). mobile-photo.html v2.3.8+ 가 동일 경로 → 모바일 사용자 영상 업로드 망가짐.

**증명됐음**:
- R2 CORS preflight OPTIONS → 204 ACAO: https://wishes.co.kr, Allow-Methods PUT/GET/HEAD/POST 정상.
- R2 endpoint 자체는 건강 (무서명 PUT 은 `InvalidArgument` 400 깔끔 반환).
- 실제 presigned PUT 응답: 브라우저에서 status=0, body="" (CORS 로 응답 차단) / Chrome DevTools Network 탭 기준 503.
- 서버 multipart 경로 (`POST /api/listings/[id]/videos` with FormData) 는 정상 동작 — 우리가 이 세션에서 업로드한 테스트 영상이 이 경로로 들어감.

**가설**:
1. aws-sdk v3 `getSignedUrl` 이 `SignedHeaders=host` + `UNSIGNED-PAYLOAD` 조합으로 서명하는데, R2 는 ContentType 이 request 에 있을 때 서명된 영역과 mismatch 로 503 반환.
2. r2.ts v2.3.11 가 이미 `requestChecksumCalculation: 'WHEN_REQUIRED'` 로 checksum 이슈는 해결. 그 외 signing 옵션 조정 필요.
3. aws-sdk-js-v3 의 `@aws-sdk/s3-request-presigner` 에 `signableHeaders` 옵션이 있음 → `content-type` 를 포함시켜 다시 시도.

**조사 플랜**:
1. sandbox 에서 `R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` env 를 임시 세팅(사용자가 Vercel dashboard 에서 복사해 주면 됨 — 또는 Vercel CLI 로 덤프) → Node 로 `getSignedUrl` 재현 → curl 로 PUT → body 확인 (CORS 영향 없음).
2. Cloudflare R2 문서에서 503 반환 조건 재확인 (SlowDown, Internal Error, Signature mismatch 등).
3. aws-sdk 를 v3 최신으로 업그레이드 또는 `signableHeaders: new Set(['host', 'content-type'])` 로 변경해 재배포.
4. 혹은 Cloudflare Worker 를 앞단에 두어 서명된 PUT 을 서버가 대신 수행하는 패턴으로 대체 (Vercel 4.5MB limit 회피).

**우선순위**: 사용자가 모바일에서 영상 업로드 시도한 흔적이 있으면 P0. `listing_videos` 테이블 최근 row 가 거의 없으니 당장은 P1 ~ P2 로 보이지만, mobile-photo 사용 빈도 증가 시 즉시 문제화.

## 파일 변경

- `src/app/api/images/[...path]/route.ts` — L-video3 fix (20 insertions / 8 deletions)

기타 파일 변경 없음.

## 사이드 이펙트 체크

L-video3 수정이 다른 경로에 미칠 영향:
- `/api/images` 로 image 요청 → `isImage=true` → 기존과 동일 (safeCT, sandbox CSP).
- `/api/images` 로 unknown 타입 → `safeCT=octet-stream` + sandbox CSP → L-sec101 의 XSS 보호 유지.
- `/api/images` 로 video → `safeCT=video/mp4` + CSP sandbox 없음 → HTML5 video 재생 가능.
- `/api/wm/[...path]`, `/api/img-proxy` 는 별도 경로 — 영향 없음.
- Vercel Edge CDN 은 1y immutable cache 였기 때문에, 이미 **octet-stream 으로 캐시된 기존 영상 URL 은 해당 캐시가 expires 될 때까지 octet-stream 을 계속 반환**. 다만 listing_videos 의 url 은 timestamp 포함 unique path 라서 새 업로드에는 즉시 new fresh response 가 HIT 됨.
- 기존에 올라와 있던 영상이 재생 안 되는 경우: Vercel Cache Purge API 로 수동 invalidate 가능 (또는 업로드 유저에게 다시 등록 요청). 일단 현재 시점 listing_videos 에 실운영 row 수가 적은 것으로 보임.

## 오늘 하루 요약 (넣어둠)

사용자는 "이어서" 요청. 이전 세션의 핸드오프가 video player 를 "남은 작업" 으로 적어놨는데 실제 git log 확인 결과 c8d15e8a 에서 이미 구현·배포됨. 진짜 문제는 배포된 코드 자체가 아니라 서빙 레이어(/api/images) 의 Content-Type 강등 부작용이라는 점을 이번 세션에서 밝혀냄. 근본 수정 배포 완료.
