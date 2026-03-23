# WISHES - 위시스부동산중개법인

서울 관악구 신림동 전문 부동산 중개 사이트

## 배포 방법

### 1. GitHub에 업로드
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wishes-site.git
git push -u origin main
```

### 2. Vercel 연결
1. https://vercel.com 에서 로그인
2. "New Project" 클릭
3. GitHub 레포지토리 선택
4. "Deploy" 클릭
5. 자동으로 빌드 및 배포 완료

### 3. 도메인 연결
Vercel 프로젝트 설정 > Domains에서 `wishes.co.kr` 추가

## 매물 관리
`src/data/listings.ts` 파일에서 매물 데이터를 관리합니다.
변경 후 GitHub에 push하면 자동으로 사이트에 반영됩니다.

## 기술 스택
- Next.js 14 (React)
- TypeScript
- Tailwind CSS
- Vercel 호스팅
