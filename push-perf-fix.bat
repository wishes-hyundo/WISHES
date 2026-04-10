@echo off
chcp 65001 >nul
echo ============================================
echo   WISHES v2 Map Performance Fix Push
echo ============================================
echo.
cd /d "%~dp0"
echo 현재 폴더: %cd%
echo.
node push-perf-fix.mjs
echo.
if %ERRORLEVEL% EQU 0 (
    echo.
    echo 완료! 브라우저에서 확인: https://github.com/wishes-hyundo/WISHES/tree/v2
) else (
    echo.
    echo 실패 시 대안: git push -f origin v2
)
echo.
pause
