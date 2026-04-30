param(
    [string]$Src = "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2",
    [string]$Dst = "C:\Users\wishe\Documents\wishes-pr-e-fresh"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "============================================================"
Write-Host "  PR-E 파일 22개 cp: working copy --> fresh clone"
Write-Host "  Src: $Src"
Write-Host "  Dst: $Dst"
Write-Host "============================================================"
Write-Host ""

if (-not (Test-Path $Dst)) {
    Write-Host "[ERROR] Dst 폴더 없음. 먼저 git clone 하세요:" -ForegroundColor Red
    Write-Host "  cd C:\Users\wishe\Documents"
    Write-Host "  git clone https://github.com/wishes-hyundo/WISHES wishes-pr-e-fresh"
    exit 1
}

$files = @(
    "docs\RFC\0001-pr-e-regression-safety-net.md",
    "vitest.config.ts",
    "tests\setup.ts",
    "tests\unit\filters-baseline.test.ts",
    "package.json",
    ".lintstagedrc.json",
    ".husky\pre-commit",
    "tests\golden\seeds.yaml",
    "tests\golden\handlers.ts",
    "tests\golden\fetcher.ts",
    "tests\golden\golden.test.ts",
    "tests\golden\baseline.json",
    "tests\golden\sql-oracle.test.ts",
    "scripts\sql-oracle.ts",
    "tests\dom-snapshot\home.spec.ts",
    "tests\dom-snapshot\map.spec.ts",
    "tests\dom-snapshot\listing-detail.spec.ts",
    "tests\dom-snapshot\about.spec.ts",
    "tests\dom-snapshot\README.md",
    "playwright.config.ts",
    ".gitignore",
    ".github\workflows\regression-gate.yml",
    "scripts\setup-pr-e.ps1",
    "scripts\cp-pr-e-to-fresh.ps1",
    ".env.local"
)

$ok = 0
$fail = 0

foreach ($f in $files) {
    $srcFile = Join-Path $Src $f
    $dstFile = Join-Path $Dst $f
    $dstDir = Split-Path $dstFile -Parent

    if (-not (Test-Path $srcFile)) {
        Write-Host "  [SKIP] $f (src 없음)" -ForegroundColor Yellow
        $fail++
        continue
    }

    if (-not (Test-Path $dstDir)) {
        New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
    }

    Copy-Item -Path $srcFile -Destination $dstFile -Force
    Write-Host "  [OK] $f" -ForegroundColor Green
    $ok++
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  cp 결과: 성공 $ok / 실패 $fail / 합계 $($files.Count)"
Write-Host "============================================================"
Write-Host ""
Write-Host "다음 명령:"
Write-Host "  cd `"$Dst`""
Write-Host "  git checkout -b feat/pr-e-regression-safety-net"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\setup-pr-e.ps1"
Write-Host ""
