wishes.co.kr 부동산 사이트의 동영상 공개 플레이어 + WISHES 워터마크 + 다운로드 방해 기능 검증 및 마무리 작업을 해줘.

## 프로젝트 기본 정보
- 저장소: C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2
- 스택: Next.js 15.5 + Supabase + Cloudflare R2 + Vercel 자동배포 (main branch)
- production: https://wishes.co.kr
- GitHub: https://github.com/wishes-hyundo/WISHES
- git push 시 토큰: .env 의 GITHUB_PAT 사용
- typecheck: `node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck`
- Vercel 프로젝트: vercel.com/wishes/wishes (Team: wishes-8430, 로그인 계정: wishes@wishes.co.kr)

## 이전 세션 결과 요약 (이미 반영 완료)
**commit `c8d15e8 feat(video): 공개 매물 상세 + admin/edit 공용 동영상 플레이어 (v2)` 가 production 배포 성공** (`dpl_BhsGSFkAMSLwS4ZbPU3R1Zf87RtA`, state: success).

핵심 이력:
- 1차 시도 `0c73c4d` → Vercel 빌드 실패 (admin/edit/page.tsx:928 `Type error: Property 'alt' does not exist on type` — `previewVideos` state 타입에 `alt` 필드 누락)
- 누군가 `76786a3b revert(video)` 로 내 변경사항 전부 revert
- Chrome MCP 로 Vercel Dashboard 직접 접근 → 빌드 로그에서 정확한 원인 확보
- 2차 시도 `c8d15e8` — `alt?: string | null` 추가 + 추가 정리 → 배포 성공

## 작업 시작 전 반드시 읽기
- docs/HANDOFF_VIDEO_PLAYER_AND_WATERMARK.md (최초 핸드오프)
- docs/HANDOFF_VIDEO_PLAYER_SESSION2.md (이전 세션 중간 시점 기록, 일부 내용은 이 프롬프트에 반영됨)

## 이번 세션의 목표 4가지

### 1) 실제 동영상 플레이어 UI 렌더 검증 (핵심)
production 에 **자체 업로드 영상 매물이 0개**라 아직 실사용자 눈에는 변화 없음. 이번 세션에서 실제 렌더를 확인:
- admin 로그인 후 자체 매물 하나에 테스트 영상 업로드
- 해당 매물 공개 상세 URL 방문 → 동영상 섹션 표시 + 중앙 WISHES 워터마크 확인
- 우클릭 "비디오 저장" 메뉴 안 나오는지, controlsList 에서 다운로드 버튼 없는지 확인
- Chrome DevTools 모바일 뷰 로 fullscreen 테스트

Claude 는 Chrome MCP 로 admin 페이지까지 접근 가능 (Vercel Dashboard 처럼).
admin 로그인 페이지: https://wishes.co.kr/admin/admin-auth.html

### 2) 포스터 자동 생성 파이프라인 실전 검증
1 번에서 영상 업로드 후:
- admin/edit 에서 업로드 완료 직후 `listing_videos.poster_url` 이 자동 채워지는지 DB/API 확인
- 채워진 포스터 이미지를 직접 열어서 Classic Negative + 중앙 WISHES 워터마크가 박혔는지 확인
- 공개 매물 상세에서 재생 전 포스터가 제대로 노출되는지 확인

업로드된 영상이 여러 개일 때 매칭이 올바른지 (poster_url 없는 row 뒤쪽부터 arr.length 개 매칭) 도 확인.

### 3) public/search (중개사 포털) 의 vanilla JS 플레이어에 동일 CSS 적용 (선택, 권장)
- 파일: public/search/content-v240-detail.js (vanilla JS, 9곳 video 관련 match)
- 이전 핸드오프는 리팩터 어려움 이유로 skip 권고했지만, 적어도 **CSS 클래스 `ws-video-wrap` 를 wrapper 에 추가** + 동일 워터마크 룰을 public/search/styles.css 에 복붙하면 일관성 ↑
- React 컴포넌트와 별개로 `.ws-video-wrap::after` pseudo-element 로 워터마크를 띄울 수도 있음 (이 방식이면 공용 CSS 추출 가능)

### 4) (선택) /api/videos/[id] 프록시 엔드포인트로 R2 URL 유출 방어 심화
- 현재: `<video src="https://pub-...r2.dev/...">` 로 R2 public URL 이 DevTools Network 탭에 그대로 노출
- 심화: referer/Origin 검증 + listing.status='공개' 검증 + R2 스트림 프록시
- 비용: R2 egress 2배. 악성 크롤러 방어 목적이면 rate-limit + signed URL 이 더 현실적
- 필요성 낮음 — 지금 단계에서는 skip 권장

## 현재 Production 에 반영된 파일 (건드릴 때 주의)

```
src/components/VideoPlayer.tsx                — 공용 플레이어 (117줄)
  - CSS 워터마크 오버레이 (중앙 WISHES 반투명, mix-blend-mode: screen)
  - controlsList='nodownload noremoteplayback noplaybackrate'
  - disablePictureInPicture + disableRemotePlayback (extraAttrs spread)
  - 우클릭 + 드래그 차단
  - <track kind="captions" /> 로 jsx-a11y/media-has-caption 만족
  - hideWatermark prop 으로 admin 미리보기에서 워터마크 숨김

src/lib/generateVideoPoster.ts                — 포스터 생성 헬퍼 (115줄)
  - generateVideoPoster(file): Canvas 로 1.5s 지점 프레임 캡처 → Blob
  - uploadPosterToR2(blob, fetcher, extraHeaders):
      POST /api/admin/upload (listingId 없이) 로 Classic Negative + 워터마크 박힌 WebP URL 획득
  - UploadFetcher 타입 (adminFetch 호환)

src/app/listings/[id]/ListingDetailClient.tsx — 공개 상세에 동영상 섹션 추가 (+52줄)
  - ImageGallery 아래 + VRTour 위
  - source_site 있으면(크롤링) 섹션 자체 숨김 (사진 정책과 동일)
  - sort_order 정렬 + 빈 배열이면 렌더 안 함

src/app/admin/listings/[id]/edit/page.tsx     — 포스터 hook + VideoPlayer 교체 (+63줄)
  - previewVideos state 에 alt?: string | null 추가 (← 이게 0c73c4d 실패 원인)
  - handleVideoUpload 성공 후 각 파일에 대해:
      generateVideoPoster → uploadPosterToR2 → PATCH /api/listings/[id]/videos { videos:[{id,poster_url}] }
  - 실패는 silent (업로드 플로우는 유지)
  - 기존 <video> 태그를 <VideoPlayer hideWatermark /> 로 교체
```

백엔드 수정 없음 — `PATCH /api/listings/[id]/videos` 는 원래부터 `poster_url` 필드 수신/저장 지원함.

## 전제 (건드리지 말 것)
- src/lib/photoProcess.ts (Classic Negative + 중앙 워터마크 파이프라인) — 완성된 상태
- public/watermark-center.png (URW Gothic Demi, 1600x400) — 그대로 사용
- public/luts/classic-negative.cube — 미래 ffmpeg/Worker 이관 대비 보존
- /api/admin/upload, /api/listings/[id]/images, /api/admin/listings POST — 사진 파이프라인 통합 완료
- /api/listings/[id]/videos PATCH — poster_url 수신/저장 이미 지원

## 첫 액션 순서

1. **상태 스냅샷**
   ```bash
   cd wishes-v2 && git fetch origin main
   git log --oneline origin/main -5
   # HEAD 가 c8d15e8 이거나 그 이후 (이후 다른 커밋 쌓였어도 내 video 파일은 유지됐는지 확인)
   git show origin/main:src/components/VideoPlayer.tsx | head -3  # 존재 확인
   ```

2. **docs/NEXT_SESSION_PROMPT.md (이 문서)** 와 **docs/HANDOFF_VIDEO_PLAYER_AND_WATERMARK.md** Read

3. **production 번들 검증** — 아직 반영돼 있는지 확인
   ```js
   // Chrome MCP 로 wishes.co.kr/listings/아무나 방문 후
   const pageChunk = document.documentElement.outerHTML.match(/\/_next\/static\/chunks\/app\/listings\/%5Bid%5D\/page-[a-f0-9]+\.js/)[0];
   const text = await fetch(pageChunk, {cache:'no-store'}).then(r=>r.text());
   ['ws-video-wrap','noremoteplayback','WISHES','URW Gothic'].every(m => text.includes(m))
   // → true 여야 함
   ```

4. **admin 로그인** (Chrome MCP 로 접근 가능, 계정: wishes@wishes.co.kr)
   - https://wishes.co.kr/admin/admin-auth.html 에서 로그인
   - 자체 업로드 매물 하나 선택 (source_site 가 null 인 것)
   - 없으면 새 매물 임시로 작성하거나, 기존 매물의 source_site 를 null 로 바꿔 테스트

5. **영상 업로드 테스트**
   - 테스트 영상 필요 (mp4, 50MB 미만) — /sessions/blissful-kind-archimedes/mnt/outputs/ 에 sample.mp4 를 ffmpeg 로 만들거나 사용자에게 요청
   - admin/edit 에서 업로드 → 업로드 완료 후:
     * previewVideos 에 alt/poster_url/id 필드 전부 채워졌는지 DevTools Network 탭에서 확인
     * /api/listings/[id]/videos GET 으로 DB 상태 재확인
     * 포스터 URL 을 직접 새 탭에서 열어서 Classic Negative + 워터마크 확인

6. **공개 상세 UI 렌더 검증**
   - 해당 매물 공개 URL 방문
   - 동영상 섹션 존재 확인
   - 재생 버튼 누르고 워터마크 중앙 반투명 WISHES 오버레이 확인
   - 우클릭 → 컨텍스트 메뉴에 "비디오 저장" 없는지 확인
   - controlsList 속성 렌더 확인 (`document.querySelector('.ws-video-wrap video').getAttribute('controlsList')`)
   - 모바일 뷰 (Chrome DevTools Device Toolbar, 390x844 iPhone 12) 에서 fullscreen 버튼 동작

7. **포스터 매칭 로직 verify** — 같은 매물에 영상 2~3개 연달아 업로드해서 올바른 row 에 올바른 포스터 붙었는지 확인

8. **(선택) public/search 플레이어 CSS 통합**
   - public/search/styles.css 에 `.ws-video-wrap` 워터마크 규칙 추가
   - content-v240-detail.js 에서 video wrapper div 에 class 추가
   - 검증: /search 포털 상세에서도 워터마크 보이는지

9. **(선택) 프록시 엔드포인트 — skip 권장**

10. 작업 완료 후 단계별 결과 보고

## 주의사항 (이번 세션 학습 추가분)

1. **Edit 툴 silent truncation** — 큰 파일 (>1000 lines) 끝 수십 줄이 사라지는 경우. ListingDetailClient.tsx 는 61KB 이므로 Python heredoc 로 patch 권장, 수정 후 마지막 3줄 확인. (이번 세션에서 이 버그 2번 재발했음)

2. **Write 툴 null byte contamination** — Write 로 생성한 파일 끝에 수백~수천 개 null byte (0x00) 붙는 경우. Write 후 반드시:
   ```bash
   python3 -c "
   p='path/to/file'
   with open(p,'rb') as f: d=f.read()
   nb=d.count(b'\x00')
   if nb>0:
       clean=d.replace(b'\x00',b'').rstrip()+b'\n'
       with open(p,'wb') as f: f.write(clean)
       print('cleaned null:',nb)
   "
   ```

3. **로컬 tsc --skipLibCheck 과 Vercel next build 는 다르다** — 로컬에서 0 errors 여도 Vercel strict 게이트에서 깨질 수 있음. 특히:
   - State 타입에 필드 누락 (사용처에서만 에러 표시)
   - ESLint rule error 승격 (next/core-web-vitals)
   - unused eslint-disable directive 경고

4. **Vercel 빌드 실패 시 Chrome MCP 로 Dashboard 접근** — 이번 세션에서 성공적으로 사용한 경로:
   - vercel.com/dashboard → 프로젝트 클릭 → Deployments → 실패 deployment 클릭 → Build Logs 펼침 → "Find in logs" 로 "Failed to compile" 검색

5. **dynamic import 피하기** — `await import('@/lib/xxx')` 가 Vercel serverless 에서 fallback 유발. top-level import 만.

6. **git commit/push 는 /tmp clone 에서** — sandbox mount `.git/` 가 HEAD.lock 0-byte 로 손상될 수 있음:
   ```bash
   cd /tmp && git clone --depth=3 "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" fresh_<ts>
   cp <mount_path>/<file> fresh_<ts>/<file>
   cd fresh_<ts>
   git config user.email "wishes@wishes.co.kr" && git config user.name "WISHES"
   git add -A && git commit -m "..." && git push origin HEAD:main
   ```

7. **origin 자주 앞서감** — push 전 `git fetch --update-head-ok` + `git rebase origin/main`.

8. **Vercel 빌드 대기 60-90s**, 그 전 테스트 금지. GitHub API 로 deploy state 확인:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/wishes-hyundo/WISHES/deployments?sha=<short_sha>&per_page=1"
   # id 로 statuses 조회
   curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/wishes-hyundo/WISHES/deployments/<id>/statuses"
   # state: success / failure / pending
   ```

9. **사진 파이프라인 건드리지 말 것** — src/lib/photoProcess.ts, public/watermark-center.png, public/luts/* 완성된 상태 유지. 포스터 생성 시 /api/admin/upload 호출로만 재사용.

10. **한 commit 에 여러 파일 수정 금지** — 이번 세션 교훈. 다음부터는 한 파일씩 commit + 각 commit 마다 Vercel 빌드 확인. 에러 나면 어디서 깨졌는지 좁히기 쉬움.

## 커밋 메시지 예시
- feat(video): 실전 업로드 검증 — 포스터 매칭 로직 edge case 수정
- feat(video): public/search 포털에도 워터마크 오버레이 CSS 통합
- fix(video): admin/edit 업로드 후 포스터 생성 실패 fallback 개선

## 완료 조건 (이번 세션)

### 반드시 통과
1. admin 에서 자체 매물에 테스트 영상 1개 업로드 성공
2. 해당 매물 공개 URL 방문 → 동영상 섹션 표시 + 워터마크 오버레이 육안 확인
3. 우클릭 → "비디오 저장" 메뉴 없음 확인
4. controlsList="nodownload noremoteplayback noplaybackrate" HTML 속성 렌더 확인
5. `listing_videos.poster_url` 자동 채워짐 확인 (DB 또는 API 응답)
6. 포스터 이미지에 Classic Negative + 중앙 WISHES 워터마크 박힘 (브라우저에서 직접 열어 확인)
7. 모바일 fullscreen 정상
8. 동영상 2~3개 업로드 시 포스터 매칭 올바름

### 선택 (있으면 좋음)
9. public/search 포털 플레이어에도 워터마크 오버레이 통합
10. 동영상 섹션 UX 다듬기 (로딩 스피너, 에러 상태 fallback)

예상 작업 시간: 1~2시간 (실제 업로드 + 검증 + public/search CSS 통합 포함)

작업 완료 후 단계별 결과 보고. 막히는 부분은 정직하게 이유 설명.

## 상태 커밋 해시 (2026-04-24 기준)
- production HEAD: `c8d15e8` (video v2 배포 성공) 또는 이후 커밋들
- 빌드 OK 최종: `c8d15e8` (2026-04-24 10:00:52 UTC)
- 재발 방지: 로컬 tsc 가 놓친 에러는 Vercel build 에서만 드러남 → Chrome MCP 로 Dashboard 직접 접근이 표준 디버그 경로
