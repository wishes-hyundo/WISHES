# 동영상 플레이어 작업 — Session 2 핸드오프 (2026-04-24)

이 문서는 이전 세션(`HANDOFF_VIDEO_PLAYER_AND_WATERMARK.md`)의 후속이자 복구 세션용입니다.
**이전 세션 결과: push 한 feat(video) 커밋 `0c73c4d` 가 Vercel 빌드 실패 → 사용자가 `76786a3b` 로 revert.**
정확한 실패 원인을 못 짚었기 때문에 재도전 전 Vercel 로그 확인이 필요합니다.

---

## 1. 최초 시도 기록

### 1-a. push 된 커밋 (이후 revert 됨)
`0c73c4d feat(video): 공개 매물 상세 + admin/edit 공용 동영상 플레이어`

### 1-b. 결과
- fd32413 (직전 커밋): ✅ 빌드 success
- **0c73c4d (내 커밋): ❌ FAILURE**
- 42b7245, 695d643, 99e250e, fab0368, 02d66f0 (이후 커밋): ❌ 연쇄 실패
- 768167b (debug dump 만 revert): ❌ 여전히 실패 → 내 video 코드가 원인 확정
- 76786a3b (video revert): ✅ 성공 → 내 변경사항만 전부 제거됨

### 1-c. Vercel 로그 URL (접근 필요)
```
dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg  — 0c73c4d 의 실패 빌드
npx vercel inspect dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg --logs
```
또는 Vercel Dashboard → wishes.co.kr 프로젝트 → Deployments → 실패 빌드 → Build Logs

---

## 2. 의심 원인 (확인 필요 — 로그 없이 단정 불가)

로컬 `tsc --noEmit --skipLibCheck` 는 통과했으나 Vercel 빌드 (strict mode, ESLint 포함) 에서 실패.
가장 의심스러운 후보 순서:

### 후보 A: `adminFetch as typeof fetch` 타입 캐스팅
```tsx
const posterUrl = await uploadPosterToR2(
  posterBlob,
  adminFetch as typeof fetch,  // ← strictFunctionTypes 위반 가능
  { ...authHeader() }
);
```
`adminFetch` 의 `init: AdminFetchOptions` 는 좁은 타입, `typeof fetch` 는 `init?: RequestInit` (넓은 타입).
`strict: true` 에서 contravariant 위반으로 거부 가능.

### 후보 B: JSX 내부 `{/* eslint-disable-next-line jsx-a11y/media-has-caption */}`
Flat Config + ESLint 9.x 에서 JSX 내부 주석으로 disable 이 안 먹을 수 있음.
→ `<track kind="captions" />` 를 `<video>` 안에 추가하면 rule 자체가 만족됨.

### 후보 C: `{...({ disableRemotePlayback: true } as Record<string, unknown>)}` 스프레드
React 의 JSX spread 는 Record<string, unknown> 를 받지만 `react/no-unknown-property` 가 여전히 에러 낼 수도 있음.

### 후보 D: `React.MouseEvent` / `React.DragEvent` 네임스페이스 참조
```tsx
import { useMemo, useRef, useState } from 'react';  // React 자체는 import 안 함
const handleContextMenu = (e: React.MouseEvent) => { ... };
```
isolatedModules + strict 에서 TS2686 (React refers to UMD global...) 가능.
→ `import type { MouseEvent as ReactMouseEvent } from 'react'` 로 우회.

---

## 3. 현재 로컬 상태 (push 되지 않음)

아래 파일들은 로컬 디스크에만 존재하며 origin/main 에는 없음.
**"후보 A/B/C/D 전부 수정한 두 번째 버전"** 이 남아 있음:

| 파일 | 상태 | 비고 |
|------|------|------|
| `src/components/VideoPlayer.tsx` | 🆕 존재 (117줄) | 두 번째 rewrite — `import type { MouseEvent... }`, `<track kind="captions" />`, spread 제거 |
| `src/lib/generateVideoPoster.ts` | 🆕 존재 (117줄) | `UploadFetcher` 타입 신설, `typeof fetch` 캐스트 제거 |
| `src/app/admin/listings/[id]/edit/page.tsx` | 🔄 수정됨 (1449줄) | 포스터 hook 포함, `adminFetch as typeof fetch` → `adminFetch` 로 단순화 |
| `src/app/listings/[id]/ListingDetailClient.tsx` | ↻ origin/main 복원됨 | 내 video 섹션 없음 (revert 됨) |

---

## 4. 다음 세션 첫 액션

### Step 1 — Vercel 로그 확보
```bash
# 사용자가 Vercel Dashboard 에서 dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg 빌드 로그 복사 필요
# 또는 vercel CLI 로:
npx vercel inspect dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg --logs | grep -iE "error|failed|typescript|eslint"
```

### Step 2 — 로그 기반 정확한 수정
로그의 첫 번째 error 메시지가 원인. 후보 A~D 중 일치하는 것 수정.

### Step 3 — 로컬 파일 상태 결정
옵션 1: 현재 로컬 파일 (두 번째 rewrite) 을 기반으로 패치 후 push
옵션 2: 로컬 파일 삭제 → 로그 기반 새 버전 작성

### Step 4 — 커밋 + push
단, 이번엔 **한 파일씩 개별 커밋** 으로 분리:
1. `feat(video): VideoPlayer 단일 컴포넌트만` (ListingDetailClient/admin/edit 건드리지 않음)
2. 빌드 확인 후 `feat(video): ListingDetailClient 에 섹션 추가`
3. 빌드 확인 후 `feat(video): admin/edit 통합`
4. 빌드 확인 후 `feat(video): 포스터 자동 생성` (선택)

각 단계에서 Vercel 빌드 확인. 어떤 단계가 깨지는지 좁히기.

---

## 5. 기술적 세부사항

### 5-a. 파일별 변경 요약 (최초 commit 기준)

```
src/components/VideoPlayer.tsx                  | +132 (신규)
src/lib/generateVideoPoster.ts                  | +125 (신규)
src/app/listings/[id]/ListingDetailClient.tsx   | +46 (섹션)
src/app/admin/listings/[id]/edit/page.tsx       | +72 (포스터 hook + VideoPlayer 교체)
```

### 5-b. Backend 변경 없음
`/api/listings/[id]/videos` PATCH 는 이미 `poster_url` 필드 수신/저장 지원 (route.ts 220줄 부근).
`/api/admin/upload` 는 listingId 없이 호출 시 DB insert 건너뜀 → 포스터 전용 경로로 재사용.

### 5-c. 포스터 생성 플로우
```
admin/edit 에서 비디오 업로드 성공
  ↓
generateVideoPoster(file) → Canvas 로 1.5s 프레임 Blob 추출
  ↓
uploadPosterToR2(blob, adminFetch, authHeader)
  → POST /api/admin/upload (listingId 없음) → Classic Negative+워터마크 WebP URL 받음
  ↓
PATCH /api/listings/[id]/videos { videos: [{ id: videoId, poster_url: url }] }
  ↓
setPreviewVideos 로 UI 즉시 업데이트
```

### 5-d. 검증 체크리스트 (Session 1 그대로, 여전히 적용)
1. [ ] 공개 매물 상세 에서 동영상 섹션 표시
2. [ ] 재생 중 중앙 WISHES 워터마크 반투명 표시
3. [ ] 우클릭 "비디오 저장" 메뉴 차단
4. [ ] HTML 에 `controlsList="nodownload"` 렌더링
5. [ ] 모바일 Safari/Chrome fullscreen 정상
6. [ ] 동영상 없는 매물은 섹션 자체 안 보임
7. [ ] admin/edit 플레이어 `hideWatermark` 로 통합
8. [ ] typecheck 0 errors
9. [ ] Vercel 빌드 통과
10. [ ] (포스터) 업로드 직후 `listing_videos.poster_url` 자동 채워짐
11. [ ] (포스터) 포스터 이미지에 Classic Negative + 워터마크 박힘

---

## 6. 사용자에게 전달 필요한 정보

```
1. Vercel Dashboard 에서 deployment dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg 의
   Build Logs 섹션 스크린샷 또는 텍스트 복사
2. 로그에서 "Failed to compile" 또는 "Module parse failed" 또는
   "Type error" 다음에 오는 첫 에러 메시지
```

이것만 있으면 다음 세션에서 정확히 20분 내 수정 가능.

---

## 7. 현황 커밋 해시 (참고)

- 현재 origin/main HEAD: `76786a3b` (video 전부 revert 완료)
- 빌드 OK 최종: `76786a3b` (2026-04-24 09:46:06 UTC 성공)
- 실패 빌드 ID: `dpl_4AgMY9MpAn1GV5Gd2KTxJexXSRSg` (내 0c73c4d)
