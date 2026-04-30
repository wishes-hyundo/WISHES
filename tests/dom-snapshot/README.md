# tests/dom-snapshot — PR-E §125 단계 6

Playwright 기반 4 페이지 (`/`, `/map`, `/listings/[id]`, `/about`) DOM snapshot 베이스라인.

## 처음 박제 (사장님 환경에서 1회)

```bash
cd wishes-v2

# 1. devDeps 설치
npm install

# 2. Playwright 브라우저 다운로드 (~ 200MB chromium)
npx playwright install --with-deps chromium

# 3. Next.js production build
npm run build

# 4. 첫 snapshot 박제 (next start 자동 실행됨)
npm run dom-snapshot:update

# 5. 박제된 snapshot 검증
npm run dom-snapshot
```

박제 결과는 `tests/dom-snapshot/__html-snapshots__/` 에 저장됨 → git commit.

## CI (단계 7 — `regression-gate.yml`)

```yaml
- run: npm install
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm run dom-snapshot
```

snapshot diff 발생 시 PR 머지 자동 차단.

## 환경변수

- `PLAYWRIGHT_BASE_URL` — 검증 사이트 URL (기본 `http://localhost:3000`)
- `PLAYWRIGHT_SAMPLE_LISTING_ID` — `/listings/[id]` 검증용 매물 ID (기본 `46077`)
- `CI` — true 시 retry 2 / forbid `.only` / github reporter

## snapshot 갱신 (의도적 변경)

PR-G 등 후속 PR 에서 매물 표시 형식이 의도적으로 바뀌면:

```bash
# 1. 코드 변경 commit
git add -A && git commit -m "feat: ..."

# 2. snapshot 의도적 갱신
npm run dom-snapshot:update

# 3. 변경된 snapshot 별도 commit
git add tests/dom-snapshot/__html-snapshots__/
git commit -m "test: dom-snapshot baseline 갱신 (의도)"
```

snapshot 갱신은 **반드시 별도 commit** + PR 본문에 사유 명시.

## 보존 (헌법 §100 / §125.2)

- `/features/map-2026/**` 손대지 X
- `tailwind.config.js` 손대지 X
- `/search` (vanilla content.js) 손대지 X
- spec 은 read-only — 페이지 / 컴포넌트 수정 X
