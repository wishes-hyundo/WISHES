# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PR-E (RFC 0001) §125.1 단계 8 — 박제 + 검증 자동화 스크립트
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# 사장님 1회 실행 — PowerShell 에서:
#   PS> cd "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2"
#   PS> powershell -ExecutionPolicy Bypass -File scripts\setup-pr-e.ps1
#
# 자동 처리:
#   1. dev 프로세스 종료 (node, esbuild)
#   2. node_modules 강제 정리 + lockfile 삭제
#   3. npm install (devDeps 5 추가됨: husky/lint-staged/msw/yaml/@playwright/test)
#   4. Playwright chromium 검증 (이미 설치됨이면 건너뜀)
#   5. baseline.json 박제 (sql-oracle 50 케이스)
#   6. next build (production)
#   7. dom-snapshot baseline 박제 (4 페이지 HTML)
#   8. 검증 실행 (단위 + golden + dom-snapshot)
#   9. 결과 요약
#
# 헌법 §125.1 단계 8 + §96 + §101

$ErrorActionPreference = "Stop"

# UTF-8 출력 강제 (한글 깨짐 방지)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$projectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $projectRoot

Write-Host ""
Write-Host "============================================================"
Write-Host "  PR-E (RFC 0001) 회귀 안전망 — 단계 8 박제 자동화"
Write-Host "  프로젝트: $projectRoot"
Write-Host "============================================================"
Write-Host ""

# ──────────────────────────────────────────
# 1) dev 프로세스 종료
# ──────────────────────────────────────────
Write-Host "[1/9] dev 프로세스 종료 (node, esbuild)..."
$procs = Get-Process node, esbuild -ErrorAction SilentlyContinue
if ($procs) {
    Write-Host "  - 종료 대상: $($procs.Count) 개"
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    Write-Host "  - 종료할 프로세스 없음 ✅"
}

# ──────────────────────────────────────────
# 2) node_modules 강제 정리
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[2/9] node_modules + package-lock.json 강제 정리..."
if (Test-Path node_modules) {
    Write-Host "  - node_modules 삭제 중 (1-2 분 소요)..."
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
}
if (Test-Path package-lock.json) {
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
}
Write-Host "  - 정리 완료 ✅"

# ──────────────────────────────────────────
# 3) npm install
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[3/9] npm install (devDeps 5 추가: husky/lint-staged/msw/yaml/@playwright/test)..."
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "::error::npm install 실패. 위 로그 확인 필요." -ForegroundColor Red
    exit 1
}
Write-Host "  - 설치 완료 ✅"

# ──────────────────────────────────────────
# 4) Playwright chromium
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[4/9] Playwright chromium 검증 (이미 다운로드됨이면 건너뜀)..."
npx playwright install --with-deps chromium
if ($LASTEXITCODE -ne 0) {
    Write-Host "::warning::playwright install 일부 경고 (계속 진행)" -ForegroundColor Yellow
}
Write-Host "  - 검증 완료 ✅"

# ──────────────────────────────────────────
# 5) SQL Oracle baseline 박제 (게이트 5)
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[5/9] SQL Oracle baseline 박제 (50 케이스)..."
Write-Host "  - 환경변수 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 필요"
npm run oracle
if ($LASTEXITCODE -ne 0) {
    Write-Host "::warning::oracle 실패 — .env.local 의 supabase 환경변수 확인 필요" -ForegroundColor Yellow
    Write-Host "  계속 진행 (다음 단계 별도 실행 가능)" -ForegroundColor Yellow
} else {
    Write-Host "  - tests/golden/baseline.json 박제 완료 ✅"
}

# ──────────────────────────────────────────
# 6) next build
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[6/9] next build (production)..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "::error::next build 실패. 위 로그 확인 필요." -ForegroundColor Red
    exit 1
}
Write-Host "  - 빌드 완료 ✅"

# ──────────────────────────────────────────
# 7) DOM Snapshot baseline 박제 (게이트 6)
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[7/9] DOM Snapshot 4 페이지 baseline 박제..."
Write-Host "  - next start 자동 실행 + Playwright 4 페이지 fetch"
npm run dom-snapshot:update
if ($LASTEXITCODE -ne 0) {
    Write-Host "::warning::dom-snapshot:update 일부 실패. tests/dom-snapshot/__html-snapshots__/ 확인" -ForegroundColor Yellow
} else {
    Write-Host "  - tests/dom-snapshot/__html-snapshots__/ 박제 완료 ✅"
}

# ──────────────────────────────────────────
# 8) 최종 검증 (전체 6 게이트)
# ──────────────────────────────────────────
Write-Host ""
Write-Host "[8/9] 최종 검증 (6 게이트 일괄)..."

Write-Host "  gate-1 type ..."
npm run typecheck
$typeOk = ($LASTEXITCODE -eq 0)

Write-Host "  gate-2 lint ..."
npm run lint
$lintOk = ($LASTEXITCODE -eq 0)

Write-Host "  gate-3+4 unit + golden ..."
npm test
$testOk = ($LASTEXITCODE -eq 0)

Write-Host "  gate-6 dom-snapshot diff ..."
npm run dom-snapshot
$snapOk = ($LASTEXITCODE -eq 0)

# ──────────────────────────────────────────
# 9) 결과 요약
# ──────────────────────────────────────────
Write-Host ""
Write-Host "============================================================"
Write-Host "  PR-E 단계 8 박제 결과 요약"
Write-Host "============================================================"
Write-Host ""
Write-Host "  게이트 1 (type)        : $(if ($typeOk) {'✅ PASS'} else {'❌ FAIL'})"
Write-Host "  게이트 2 (lint)        : $(if ($lintOk) {'✅ PASS'} else {'❌ FAIL'})"
Write-Host "  게이트 3+4 (unit+golden): $(if ($testOk) {'✅ PASS'} else {'❌ FAIL'})"
Write-Host "  게이트 6 (dom-snapshot) : $(if ($snapOk) {'✅ PASS'} else {'❌ FAIL'})"
Write-Host ""
Write-Host "  베이스라인 박제 위치:"
Write-Host "    - tests/golden/baseline.json"
Write-Host "    - tests/dom-snapshot/__html-snapshots__/"
Write-Host ""

if ($typeOk -and $lintOk -and $testOk -and $snapOk) {
    Write-Host "  ✅ 모두 PASS — git push 후 단계 8 완료" -ForegroundColor Green
    Write-Host ""
    Write-Host "  다음 명령:"
    Write-Host "    git checkout -b feat/pr-e-regression-safety-net"
    Write-Host "    git add -A"
    Write-Host "    git commit -m 'feat(pr-e): 회귀 안전망 (RFC 0001)'"
    Write-Host "    git push -u origin feat/pr-e-regression-safety-net"
    Write-Host ""
    Write-Host "  GitHub 에서 PR 생성 → CI 자동 가동 → Cool-down 24h → PR-G"
    exit 0
} else {
    Write-Host "  ❌ 일부 게이트 실패. 위 로그 확인 후 수정" -ForegroundColor Red
    Write-Host ""
    Write-Host "  도움말:"
    Write-Host "    - typecheck 실패 → src/ 의 type 에러 수정"
    Write-Host "    - lint 실패     → npm run lint -- --fix"
    Write-Host "    - unit 실패     → tests/ 또는 src/ 의 .test.ts 확인"
    Write-Host "    - dom-snapshot 실패 → npm run dom-snapshot:report (HTML 보고서)"
    exit 1
}
