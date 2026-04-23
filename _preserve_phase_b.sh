#!/bin/bash
# ==============================================================
# Phase B — L-preserve1 (v297 전 필드 편집 UX 재적용)
# ==============================================================
# 사전 조건: Phase A 완료 + Claude 가 src/app/search/page.tsx 수정 완료
# 실행:     bash _preserve_phase_b.sh
set -e

cd "/c/Users/wishe/Documents/Claude/Projects/wishes 홈페이지 관리/wishes-v2"

PRESERVE_SRC="/c/Users/wishe/Desktop/WISHES_v2.7.0_freshness/content-v297-edit.js"

echo "================================================================"
echo " [Phase B] Step 1: 사전 조건 확인"
echo "================================================================"

# (a) Phase A 가 커밋됐는지
if git log -1 --format="%s" | grep -q "L-revert1"; then
  echo "  OK: 직전 커밋이 L-revert1"
else
  echo "  !! 직전 커밋이 L-revert1 이 아님. Phase A 미완."
  git log -1 --oneline
  exit 1
fi

# (b) 백업본 있나
if [ ! -f "$PRESERVE_SRC" ]; then
  echo "  !! 백업본 없음: $PRESERVE_SRC"
  exit 1
fi
echo "  OK: 백업본 $(wc -l < "$PRESERVE_SRC") lines"

# (c) page.tsx 에 v297 loader 가 있는지 (Claude Edit 완료 여부)
if grep -q "ws-ext-patch-v297-edit" src/app/search/page.tsx; then
  echo "  OK: page.tsx 에 v297 loader 확인"
else
  echo "  !! page.tsx 에 v297 loader 가 없음."
  echo "  !! Claude 에게 Edit 완료 후 재실행 요청 필요."
  exit 2
fi

# (d) content-v297-edit.js 가 아직 없어야 함 (revert 로 삭제된 상태)
if [ -e "public/search/content-v297-edit.js" ]; then
  echo "  경고: public/search/content-v297-edit.js 가 이미 존재 — 덮어쓰기 진행"
fi
echo

echo "================================================================"
echo " [Phase B] Step 2: v297 파일 복원"
echo "================================================================"
cp "$PRESERVE_SRC" public/search/content-v297-edit.js
wc -l public/search/content-v297-edit.js
node --check public/search/content-v297-edit.js
echo "  -> syntax OK"
echo

echo "================================================================"
echo " [Phase B] Step 3: Stage + 검증"
echo "================================================================"
git add public/search/content-v297-edit.js src/app/search/page.tsx
git status --short
echo
echo "- staged diff stat:"
git diff --cached --stat
echo

echo "================================================================"
echo " [Phase B] Step 4: L-preserve1 커밋"
echo "================================================================"
git commit -F COMMIT_MSG_L-preserve1.txt
git log --oneline -5
echo
echo "================================================================"
echo " [Phase B] 완료"
echo "================================================================"
echo "다음: git push origin main   (검증 후 수동 실행)"
