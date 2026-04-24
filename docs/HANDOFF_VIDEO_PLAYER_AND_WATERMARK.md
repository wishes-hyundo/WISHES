# 다음 세션 핸드오프 — 동영상 공개 플레이어 + 워터마크 (2026-04-24 생성)

이 문서는 wishes.co.kr 의 **동영상 재생 / 워터마크 / 다운로드 방해** 를 한 번에 완성하는 작업용 핸드오프입니다. 이전 세션에서 사진 파이프라인은 이미 완료됐고, 동영상 쪽만 남아 있습니다. 문서 전체가 다음 세션 시작 컨텍스트입니다.

---

## 🏁 지금 production 상태 (이전 세션 마지막)

- **HEAD**: `e456046` (워터마크 폰트 URW Gothic Demi 로 교체, 테두리 제거)
- **사진 파이프라인**: ✅ 완료 (`src/lib/photoProcess.ts`)
  - Classic Negative 필름 시뮬레이션 + 중앙 WISHES 워터마크
  - `/api/admin/upload`, `/api/listings/[id]/images`, `/api/admin/listings` POST 3곳 통합
  - 실측: 픽셀 변화 Δ=11~95, 중앙 워터마크 정상 렌더, WebP q85 저장
- **사용 자산**:
  - `public/watermark-center.png` (1600×400, URW Gothic Demi, soft shadow, opacity 58/255)
  - `public/luts/classic-negative.cube` (33³ LUT, 미래 ffmpeg/Worker 이관 대비 보존)
- **동영상**: ❌ 미작업 (이 세션에서 진행)

---

## 🎯 이 세션의 목표

### 1) 공개 매물 상세 페이지에 **동영상 재생 플레이어 추가**
현재 `src/app/listings/[id]/page.tsx` 가 DB 에서 `listing_videos(id, url, poster_url, mime_type, sort_order)` 를 조인해서 가져오고 있지만, `ListingDetailClient.tsx` 에 재생 UI 가 없어서 **고객은 동영상 존재조차 모릅니다**.

- 사진 갤러리 아래 또는 옆에 동영상 섹션 신설
- HTML5 `<video>` + 썸네일(poster) + 제목/설명
- 여러 개 있으면 목록 → 선택하면 재생
- 모바일 fullscreen 지원

### 2) **CSS 워터마크 오버레이**
플레이어 재생 영역 위에 반투명 "WISHES" 중앙 텍스트를 `pointer-events: none` 로 띄움.
- 사진 워터마크와 동일한 톤: 흰색, opacity ~20%, URW Gothic Demi 느낌
- 스크린 녹화로는 우회되지만 일반 사용자의 스크린샷/캡처는 브랜드 인식
- `absolute` 로 `<video>` 위에 겹침 + `mix-blend-mode: soft-light` 또는 `screen` 실험

### 3) **다운로드 방해 레이어**
- `<video controlsList="nodownload" disablePictureInPicture disableRemotePlayback>`
- `onContextMenu={(e) => e.preventDefault()}` — 우클릭 저장 차단
- `src` 를 직접 노출하지 않도록 blob URL 방식 또는 signed URL 검토
  - 지금 R2 URL 은 public URL → 개발자 도구에서 쉽게 추출 가능
  - 완벽 차단 필요 시 /api/videos/[key] 프록시 엔드포인트 신설 (referer 검증)

### 4) **동영상 포스터 썸네일 자동 생성** (선택사항, 품질 이득 큼)
현재 `listing_videos.poster_url` 컬럼이 있지만 업로드 시 채워지지 않음.
- 방법 A: 클라이언트 `<video>` + Canvas 로 첫 프레임 캡처 → 이미지 파이프라인 통과 → poster_url 저장
- 방법 B: Cloudflare Worker + ffmpeg.wasm — 복잡하지만 품질 최고
- 방법 A 가 현실적. 업로드 완료 콜백에서 자동 실행.

---

## 🗺️ 관련 파일 위치

### 공개 플레이어를 넣을 곳
```
src/app/listings/[id]/page.tsx               — DB 조회 (listing_videos 이미 SELECT 함)
src/app/listings/[id]/ListingDetailClient.tsx — 61KB, 여기에 <VideoSection /> 컴포넌트 추가
```

### 동영상 플레이어가 이미 있는 곳 (레퍼런스 / CSS 공유 대상)
```
src/app/admin/listings/[id]/edit/page.tsx    — admin 편집, video 16 matches
public/search/content.js                      — /search 중개사 포털 (v240-detail.js 등), video 9 matches
```
→ 이미 있는 구현을 공용 React 컴포넌트로 추출하면 중복 줄고 일관성 확보.

### 백엔드 (건드릴 필요 거의 없음)
```
src/app/api/listings/[id]/videos/metadata/route.ts  — R2 upload 후 DB 저장
src/app/api/listings/[id]/videos/presign/route.ts   — R2 presign URL 발급
src/app/api/listings/[id]/videos/route.ts           — 목록 GET
src/app/api/admin/upload-video/route.ts             — legacy multipart 업로드
```

### 사진 파이프라인 (참고만, 건드리지 말 것)
```
src/lib/photoProcess.ts         — Classic Negative + 중앙 워터마크
public/watermark-center.png     — 워터마크 PNG (URW Gothic Demi)
public/luts/classic-negative.cube — LUT 예약
```

### DB 스키마
```sql
listing_videos (
  id             bigserial,
  listing_id     int,
  url            text,          -- R2 public URL
  poster_url     text,          -- 비어있음 — 이번 세션 기회
  mime_type      text,
  file_size      int,
  alt            text,          -- 제목
  sort_order     int,
  created_at     timestamptz
)
```

---

## 🧭 구현 가이드

### 단계 1 — 공용 VideoPlayer 컴포넌트
`src/components/VideoPlayer.tsx` 신설. Props:
```ts
interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  mimeType?: string;
  className?: string;
  /** 워터마크 비활성화 (관리자 편집 미리보기 등에만) */
  hideWatermark?: boolean;
}
```

구조:
```tsx
<div className="ws-video-wrap relative group">
  <video
    src={src}
    poster={poster}
    controls
    preload="metadata"
    playsInline
    controlsList="nodownload noremoteplayback"
    disablePictureInPicture
    onContextMenu={(e) => e.preventDefault()}
    className="w-full h-full rounded-xl bg-black"
  />
  {!hideWatermark && (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      aria-hidden
    >
      <span
        className="text-white/25 font-black text-4xl md:text-6xl tracking-[0.3em]"
        style={{
          fontFamily: "'URW Gothic', 'Futura', 'Montserrat', sans-serif",
          textShadow: '0 2px 10px rgba(0,0,0,0.35)',
          mixBlendMode: 'screen',
        }}
      >
        WISHES
      </span>
    </div>
  )}
</div>
```

CSS 는 Tailwind 로 충분. URW Gothic 은 없으면 시스템 fallback.

### 단계 2 — ListingDetailClient 에 동영상 섹션 삽입
`ListingDetailClient.tsx` 가 `listing.listing_videos` 배열을 props 로 받는지 확인. 없으면 page.tsx 에서 내려주도록 수정.

```tsx
{listing.listing_videos?.length > 0 && (
  <section className="my-8">
    <h2 className="text-lg font-bold mb-3">🎬 매물 영상</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {listing.listing_videos
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((v) => (
          <VideoPlayer
            key={v.id}
            src={v.url}
            poster={v.poster_url || undefined}
            title={v.alt}
            mimeType={v.mime_type}
          />
        ))}
    </div>
  </section>
)}
```

### 단계 3 — admin/search 기존 플레이어를 VideoPlayer 로 교체
- `src/app/admin/listings/[id]/edit/page.tsx` 의 `<video>` 들을 `<VideoPlayer hideWatermark />` 로 교체
- `public/search/content.js` 는 vanilla JS 라 리팩터 어려움 — 내부 플레이어에 CSS 클래스 `ws-video-wrap` 만 추가하고 동일 CSS 룰로 워터마크 오버레이

### 단계 4 — 포스터 자동 생성 (선택, 권장)
mobile-photo 의 동영상 업로드 완료 직후 + admin 편집의 동영상 업로드 완료 직후:
```ts
async function generatePosterFromVideo(videoFile: File): Promise<Blob> {
  const v = document.createElement('video');
  v.src = URL.createObjectURL(videoFile);
  v.muted = true; v.playsInline = true;
  await new Promise<void>((res) => { v.onloadedmetadata = () => res(); });
  v.currentTime = Math.min(1.5, (v.duration || 2) * 0.1);
  await new Promise<void>((res) => { v.onseeked = () => res(); });

  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext('2d')!.drawImage(v, 0, 0);
  URL.revokeObjectURL(v.src);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9));
}
```

이 blob 을 `/api/listings/[id]/images` 로 POST 하면 자동으로 Classic Negative + 중앙 워터마크 박힌 WebP 로 저장됨. 받은 URL 을 `/api/listings/[id]/videos/metadata` 호출 시 `posterUrl` 필드로 보내거나 별도 PATCH.

**백엔드 변경 필요**: `videos/metadata` 의 request body 에 `posterUrl` 받아서 `listing_videos.poster_url` 에 저장하도록 확장.

### 단계 5 — (선택) 원본 URL 프록시로 감싸 src 유출 약화
```ts
// src/app/api/videos/[id]/route.ts
export async function GET(req, { params }) {
  // referer/origin 검증, listing 공개 상태 검증, R2 스트림 → 클라이언트
}
```
비용: R2 egress 2배. 필요 없으면 skip.

---

## 🧪 검증 체크리스트

작업 완료 후 아래 전부 통과해야 합니다.

1. [ ] 공개 매물 상세 `wishes.co.kr/listings/52829` 같은 URL 에서 동영상 섹션이 보이는가
2. [ ] 재생 시 중앙에 "WISHES" 워터마크가 반투명으로 겹쳐 보이는가
3. [ ] 플레이어 우클릭 시 "비디오 저장" 메뉴가 **안 나오는가**
4. [ ] HTML 구조에서 `controlsList="nodownload"` 렌더링됨
5. [ ] 모바일 Safari / Chrome 에서 fullscreen 정상
6. [ ] 동영상이 없는 매물에서는 섹션이 렌더되지 않음 (빈 `<section>` 없음)
7. [ ] admin/search 내부 플레이어에도 `hideWatermark` 옵션으로 선택적 적용
8. [ ] typecheck 0 errors
9. [ ] Vercel 빌드 통과
10. [ ] (포스터 자동 생성 구현 시) 업로드 직후 `listing_videos.poster_url` 이 채워지는가
11. [ ] (포스터 구현 시) 포스터 이미지에도 Classic Negative + 중앙 워터마크 박혀 있는가

---

## ⚠️ 주의사항 (이전 세션 학습)

1. **Edit 툴 silent truncation** — 큰 파일 (>1000 lines) 끝 수십 줄이 사라지는 경우. ListingDetailClient.tsx 는 61KB 이므로 Python heredoc 로 patch 권장, 수정 후 마지막 3줄 확인.
2. **dynamic import 피하기** — `await import('@/lib/xxx')` 가 Vercel serverless 에서 fallback 유발. top-level import 사용.
3. **파일 끝 공백 garbage** — Write 툴이 쓰는 파일 끝에 공백 수만 byte 붙는 경우 있음. 쓰기 후 wc + tail 확인.
4. **origin 자주 변경됨** — push 전 항상 `git fetch --update-head-ok` + `git rebase origin/main`.
5. **Vercel 빌드 1~2분** — push 직후 테스트 금지. 최소 60~90s 대기.
6. **git commit/push 는 /tmp clone 에서** — sandbox mount `.git/` 가 HEAD.lock 0-byte 로 손상될 수 있음:
   ```
   cd /tmp && git clone --depth=5 "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" fresh_<ts>
   cp <mount_path>/<file> fresh_<ts>/<file>
   cd fresh_<ts> && git add -A && git commit -m "..." && git push origin HEAD:main
   ```
7. **이미 있는 동영상 플레이어 복제 금지** — admin/search 의 video 태그를 VideoPlayer 컴포넌트로 통합. 중복 구현 금지.
8. **사진 파이프라인 건드리지 말 것** — `src/lib/photoProcess.ts`, `public/watermark-center.png`, `public/luts/*` 완성된 상태 유지. 포스터 생성 시 `/api/listings/[id]/images` 호출로 재사용만.

---

## 📝 다음 세션 시작 시 첫 액션

```bash
# 1) 상태 스냅샷
cd <mount>/wishes-v2
git fetch origin main
git log --oneline origin/main -5
# 이상적으로 HEAD: e456046 이거나 그 이후

# 2) 동영상 업로드 데이터 확인 (listing 52829 에 이전 테스트 영상 있을 수 있음)
# Supabase SQL Editor 에서:
# SELECT id, listing_id, url, poster_url, mime_type, sort_order FROM listing_videos LIMIT 10;

# 3) 실제 동영상 URL 브라우저로 열어보기 (재생되는지, CORS 이슈 없는지)

# 4) 기존 admin/edit 플레이어 구현 확인
grep -n "<video" src/app/admin/listings/\[id\]/edit/page.tsx
```

완료 후 사용자에게 보고:
- 공개 매물 상세에서 동영상 재생 가능해졌음
- 워터마크 / 다운로드 방해 적용 확인 (3곳 플레이어 모두)
- (포스터 생성 구현했다면) 업로드 시 자동 포스터 표시

예상 작업 시간: **2~3시간** (포스터 자동 생성 포함 시 +30분).

---

## 관련 커밋 히스토리 (최근 10개)

```
e456046 style(photo): 워터마크 폰트·스타일 정리
fc96489 fix(map): L-filtercluster1
8f8cd7c fix(photo): 단일 Sharp 체인으로 재작성
30187ab fix(photo): top-level import + fetch fallback
2df9295 fix(map): L-clusterexact3 fix2
099f416 fix(photo): 중앙 워터마크 SVG -> PNG 전환
355b695 feat(photo): Classic Negative + 중앙 워터마크 통합 파이프라인
103bb87 fix(mobile-photo): 오타 + 관리자 복귀 URL
e096d3d fix(admin): 사이드바 '모바일 사진등록' 링크 404 해결
4fe1bd2 fix(admin): 전수 감사 결과 일괄 수정 (L-admin-audit)
```

이번 세션에서 추가될 커밋 예상:
- `feat(video): ListingDetailClient 에 공개 플레이어 + CSS 워터마크`
- `feat(video): VideoPlayer 공용 컴포넌트 + 다운로드 방해 레이어`
- `feat(video): 업로드 시 클라이언트 포스터 자동 생성` (선택)

---

Good luck. 사진 쪽은 이미 단단하니 참고만 하시고, 동영상 플레이어부터 깨끗하게 시작하세요.
