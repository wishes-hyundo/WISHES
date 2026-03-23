# WISHES v2 - 위시스부동산 웹사이트

서울 관악구 전문 부동산 중개 웹사이트 (Next.js 15 + Drizzle ORM + Kakao Maps)

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.local.example .env.local
# 카카오맵 API 키 등 설정

# 3. DB 초기화 + 시드 데이터
npx tsx scripts/seed.ts

# 4. 개발 서버 실행
npm run dev
```

http://localhost:3000 접속

## 기술 스택

- **Framework**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: SQLite (로컬) → Supabase PostgreSQL (프로덕션)
- **ORM**: Drizzle ORM
- **Map**: Kakao Maps SDK v3
- **Storage**: Local → Cloudflare R2

## 프로젝트 구조

```
wishes-v2/
├── src/
│   ├── app/              # Next.js App Router 페이지
│   │   ├── api/          # API 라우트
│   │   ├── listings/     # 매물 목록/상세
│   │   ├── map/          # 지도 검색
│   │   ├── about/        # 회사소개
│   │   └── contact/      # 상담문의
│   ├── components/       # 공통 컴포넌트
│   ├── db/               # Drizzle 스키마 + 연결
│   ├── hooks/            # Custom Hooks
│   ├── lib/              # 유틸리티
│   └── types/            # TypeScript 타입
├── scripts/              # 시드, Geocoding 스크립트
├── data/                 # SQLite DB 파일
├── public/images/        # 매물 이미지
└── drizzle/              # 마이그레이션 파일
```

## 개발 문서

자세한 기술 명세는 `WISHES_개발문서_v2.md` 참고
