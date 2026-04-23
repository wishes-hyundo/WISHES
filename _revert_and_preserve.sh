#!/bin/bash
# ==============================================================
# Phase A — L-revert1 (3개 커밋 원복 + 단일 revert 커밋)
# ==============================================================
# 사용법: Git Bash 에서 cd 후 `bash _revert_and_preserve.sh`
# 이 스크립트는 revert 커밋만 만들고 push 는 하지 않습니다.
# Phase A 완료 후 Claude 가 page.tsx 수정, 그 다음 Phase B (별도 스크립트) 실행.
set -e

cd "/c/Users/wishe/Documents/Claude/Projects/wishes 홈페이지 관리/wishes-v2"

echo "================================================================"
echo " [Phase A] Step 1: HEAD 확인"
echo "================================================================"
git log --oneline -5
echo

echo "================================================================"
echo " [Phase A] Step 2: v297 백업본 존재 확인"
echo "================================================================"
PRESERVE_SRC="/c/Users/wishe/Desktop/WISHES_v2.7.0_freshness/content-v297-edit.js"
if [ ! -f "$PRESERVE_SRC" ]; then
  echo "  !! 백업 파일이 없음: $PRESERVE_SRC"
  echo "  !! Phase B 가 불가능하므로 Phase A 도 진행하지 않음."
  exit 1
fi
echo "  -> OK: $(wc -l < "$PRESERVE_SRC") lines"
echo

echo "================================================================"
echo " [Phase A] Step 3: 3개 커밋 revert (staged only, no commit)"
echo "================================================================"
git revert --no-commit 52d4df0 5876b67 b54d424
echo "  -> revert 병합 완료 (index 에 stage)"
echo

echo "================================================================"
echo " [Phase A] Step 4: revert 결과 감사"
echo "================================================================"
echo "- staged 변경사항:"
git diff --cached --stat
echo
echo "- 지워져야 할 파일들 (존재하면 안됨):"
for f in \
  public/search/content-v296-title.js \
  public/search/content-v297-edit.js \
  src/lib/aiTitleSanitizer.ts \
  src/app/api/admin/listings/regenerate-titles/route.ts
do
  if [ -e "$f" ]; then
    echo "    !! 여전히 존재: $f"
  else
    echo "    OK: $f 지워짐"
  fi
done
echo

echo "================================================================"
echo " [Phase A] Step 5: L-revert1 커밋"
echo "================================================================"
git commit -F COMMIT_MSG_L-revert1.txt
git log --oneline -3
echo
echo "================================================================"
echo " [Phase A] 완료"
echo "================================================================"
echo
echo "다음:"
echo "  1) Claude 가 src/app/search/page.tsx 에 v297 loader 블록 재주입"
echo "  2) bash _preserve_phase_b.sh 실행"
echo "  3) 최종 검증 후 git push origin main"
