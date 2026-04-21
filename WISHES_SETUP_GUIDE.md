# WISHES 부동산 플랫폼 - 전체 구현/운영 가이드

> 이 문서만 있으면 다른 계정에서도 동일한 시스템을 완벽하게 구현하고 운영할 수 있습니다.

---

## 1. 시스템 아키텍처

| 구성요소 | 서비스 | 용도 |
|---------|--------|------|
| 프론트엔드 | Next.js (App Router) | SSR + 정적 페이지 |
| 호스팅 | Vercel | 자동 빌드/배포 |
| 데이터베이스 | Supabase (PostgreSQL) | 매물 데이터 저장 |
| 도메인 | wishes.co.kr | 프로덕션 도메인 |
| 소스코드 | GitHub (wishes-hyundo/WISHES) | v2 브랜치 사용 |
| 크롤러 | GitHub Actions + Python/JS | 공실클럽/온하우스 자동 수집 |

**배포 흐름**: GitHub v2 push → Vercel 자동 빌드 (약 48초) → wishes.co.kr 반영

---

## 2. Supabase 설정

### 프로젝트 정보
- URL: `xbjgdsyukjdkfvcbzmjc.supabase.co`
- 프로젝트명: wishes-realestate

### listings 테이블 (72 컬럼)

```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT CHECK (type IN ('원룸','투룸','쓰리룸','오피스텔','아파트','상가','사무실')),
  deal TEXT CHECK (deal IN ('전세','월세','매매')),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  views INTEGER DEFAULT 0,

  -- 가격 정보
  deposit BIGINT DEFAULT 0,
  monthly BIGINT,
  price BIGINT,
  maintenance_fee INTEGER DEFAULT 0,
  maintenance_includes TEXT[],

  -- 면적 정보
  area_m2 NUMERIC,
  area_supply_m2 NUMERIC,
  area_land_m2 NUMERIC,

  -- 층/구조
  floor_current TEXT,
  floor_total TEXT,
  rooms INTEGER,
  bathrooms INTEGER,
  direction TEXT,
  heating_type TEXT,

  -- 주소
  address TEXT NOT NULL,
  address_detail TEXT,
  dong TEXT NOT NULL,
  gu TEXT,
  lat NUMERIC,
  lng NUMERIC,

  -- 기본 정보
  available_date TEXT,
  built_year TEXT,
  description TEXT,
  ai_description TEXT,

  -- 시설/옵션
  parking BOOLEAN DEFAULT false,
  elevator BOOLEAN DEFAULT false,
  pet BOOLEAN DEFAULT false,
  balcony BOOLEAN DEFAULT false,
  full_option BOOLEAN DEFAULT false,
  loan_available BOOLEAN DEFAULT false,

  -- 상가/업종 전용
  business_type TEXT,
  goodwill_fee BIGINT,
  vat_included BOOLEAN,
  usage_approved TEXT,
  electric_capacity TEXT,
  signage_available TEXT,
  meeting_room TEXT,
  previous_business TEXT,
  recommended_business TEXT,
  restricted_business TEXT,
  parking_spaces INTEGER,
  rights_fee BIGINT,
  lease_period TEXT,

  -- 교통
  station_name TEXT,
  station_distance TEXT,

  -- 추가 필드 (v8 selectFields에 포함)
  entrance_type TEXT,
  parking_fee TEXT,
  building_purpose TEXT,
  previous_brand TEXT,
  commission_fee TEXT,
  special_notes TEXT,
  building_name TEXT,
  contact TEXT,

  -- 크롤링 출처
  source_site TEXT,
  source_id TEXT,
  source_url TEXT,

  -- 연관 테이블
  -- listing_images (url, sort_order) - 매물 이미지
  -- listing_features (feature) - 매물 특징 태그
);
```

---

## 3. API 라우트 설정

### 핵심 파일: `src/app/api/admin/listings/route.ts`

이 파일은 GET (목록), POST (생성), PUT (수정)을 처리합니다.

#### selectFields (v8 캐시 키)

검색 페이지(`/search`)가 `?fields=minimal` 모드로 요청 시 반환할 컬럼 목록:

```javascript
const selectFields = [
  'id', 'title', 'type', 'deal', 'status', 'created_at', 'views',
  'deposit', 'monthly', 'price',
  'maintenance_fee', 'maintenance_includes',
  'area_m2', 'area_supply_m2', 'area_land_m2',
  'floor_current', 'floor_total',
  'rooms', 'bathrooms', 'direction', 'heating_type',
  'address', 'address_detail', 'dong', 'gu',
  'lat', 'lng',
  'available_date', 'built_year', 'description', 'ai_description',
  'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'business_type', 'goodwill_fee', 'vat_included',
  'usage_approved', 'electric_capacity', 'signage_available', 'meeting_room',
  'previous_business', 'recommended_business', 'restricted_business',
  'parking_spaces', 'rights_fee', 'lease_period',
  'station_name', 'station_distance',
  'entrance_type', 'parking_fee', 'building_purpose',
  'previous_brand', 'commission_fee', 'special_notes',
  'source_site', 'source_id', 'source_url', 'building_name', 'contact',
  'listing_images(url,sort_order)',
  'listing_features(feature)'
].join(',');
```

#### 캐시 설정

```javascript
import { unstable_cache } from 'next/cache';
// 캐시 키: 'listings-minimal-v8', revalidate: 5초
const getCachedListings = unstable_cache(
  async () => { /* Supabase 쿼리 */ },
  ['listings-minimal-v8'],
  { revalidate: 5 }
);
```

**중요**: selectFields를 변경할 때마다 캐시 키 버전을 올려야 합니다 (v8 → v9 등).

#### 인증

```
Bearer Token: wishes2026
Header: Authorization: Bearer wishes2026
```

---

## 4. 검색 페이지 (`public/search/content.js`)

### 데이터 로딩 흐름

1. 페이지 로드 → `window.WS.loadData()` 호출
2. `/api/admin/listings?fields=minimal` 에서 전체 매물 fetch (Bearer token 사용)
3. `window.WS.allListings` 에 저장 (약 4,500+ 매물)
4. IndexedDB 캐시: DB명 `wishes_cache`, store `all_listings`, key `all_listings_v1`
5. Prefetch: `window.__WS_PREFETCH__` 로 초기 로딩 최적화

### 카드뷰 렌더링 필드

카드에 표시되는 주요 필드:
- 제목, 타입(원룸/투룸 등), 거래유형(전세/월세/매매)
- 가격(보증금/월세/매매가), 관리비
- 면적(전용/공급/대지), 층수, 방/욕실 수
- 주소, 역세권 정보
- 이미지 갤러리, 특징 태그

### 상세 모달 렌더링 섹션

1. **기본정보**: 타입, 면적, 층수, 방향, 구조(entrance_type)
2. **가격정보**: 보증금, 월세, 관리비, 권리금, 중개수수료(commission_fee)
3. **시설/옵션**: 주차, 엘리베이터, 반려동물, 발코니, 풀옵션, 주차비(parking_fee)
4. **업종/임대**: 이전업종, 추천업종, 제한업종, 이전상호(previous_brand), 건물용도(building_purpose), 특이사항(special_notes)
5. **기타정보**: 건물명(building_name)
6. **건축물대장**: 건축물대장 조회 버튼
7. **상세설명**: AI설명 + 크롤링 설명
8. **출처**: source_url 링크

---

## 5. 크롤러 설정

### 공실클럽 (22 필드 수집)
- 파일: `gsc_full_crawler.js`
- GitHub Actions 워크플로우로 자동 실행
- 수집 필드: title, type, deal, deposit, monthly, price, area_m2, floor, rooms, address, description, images 등

### 온하우스 (57 필드 수집)
- 파일: `onhouse_full_crawler.js`
- GitHub Actions: `.github/workflows/onhouse_crawl.yml`
- Python 버전: `scripts/onhouse_crawl_gh.py`
- 더 상세한 필드 수집: 업종정보, 건물정보, 교통정보 등 포함

---

## 6. 배포 워크플로우

### 일반 코드 수정 시

```bash
# 1. 코드 수정
# 2. git add & commit
git add .
git commit -m "fix: 설명"

# 3. v2 브랜치에 push → Vercel 자동 빌드
git push origin v2
```

### selectFields 변경 시

1. `src/app/api/admin/listings/route.ts`에서 selectFields 배열 수정
2. 캐시 키 버전 증가 (예: `listings-minimal-v8` → `listings-minimal-v9`)
3. git push → Vercel 재빌드
4. 브라우저에서 IndexedDB 캐시 클리어 또는 하드 리프레시

### DB 스키마 변경 시

1. Supabase SQL Editor에서 `ALTER TABLE listings ADD COLUMN ...` 실행
2. selectFields에 새 컬럼 추가
3. `public/search/content.js`에 렌더링 코드 추가
4. 캐시 키 버전 증가
5. git push

---

## 7. 주요 트러블슈팅

### Vercel 빌드 에러: "Unterminated string constant"

**원인**: `route.ts` 파일이 잘려서 (truncation) 문자열이 닫히지 않음.
**해결**: GitHub 웹 에디터에서 파일 끝에 누락된 catch 블록 추가:

```typescript
  } catch (error: any) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
```

### 새 필드가 브라우저에 표시되지 않음

1. selectFields에 해당 필드가 포함되어 있는지 확인
2. 캐시 키 버전이 올라갔는지 확인
3. Vercel 빌드가 성공했는지 확인 (vercel.com/wishes/wishes/deployments)
4. 브라우저 콘솔에서 `window.WS.allListings[0]`으로 필드 확인
5. IndexedDB 캐시가 갱신되었는지 확인

### Supabase null 필드 최적화

Supabase API는 null 값을 가진 필드를 응답에서 제거합니다 (null-stripping). DB에 데이터가 있는 필드만 API 응답에 포함됩니다. 따라서 `area_land_m2: 0`이라도 DB에 값이 없으면 응답에 나타나지 않습니다.

### git lock 파일 문제

```bash
# Windows에서
del /f /q ".git\objects\maintenance.lock"
del /f /q ".git\index.lock"
```

---

## 8. 환경 변수

`.env.local` 파일에 필요한 변수:

```
NEXT_PUBLIC_SUPABASE_URL=https://xbjgdsyukjdkfvcbzmjc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>
```

---

## 9. 새 계정에서 처음부터 구현하기

### Step 1: 기본 인프라 설정
1. GitHub 리포지토리 생성, v2 브랜치 설정
2. Supabase 프로젝트 생성
3. Vercel 프로젝트 생성 → GitHub 리포지토리 연결 → v2 브랜치 배포
4. 도메인 연결

### Step 2: 데이터베이스 설정
1. Supabase SQL Editor에서 listings 테이블 생성 (위 스키마 참고)
2. listing_images, listing_features 테이블 생성
3. RLS 정책 설정

### Step 3: API 라우트 구현
1. `src/app/api/admin/listings/route.ts` 생성
2. selectFields 배열 설정
3. unstable_cache 캐시 설정
4. Bearer token 인증 추가

### Step 4: 검색 페이지 구현
1. `public/search/content.js` - 카드뷰 + 상세 모달
2. `public/search/styles.css` - 스타일
3. `public/search/map-main.js` - 지도 기능
4. `public/search/page-auth.js` - 인증

### Step 5: 크롤러 설정
1. GitHub Actions 워크플로우 파일 설정
2. 크롤러 스크립트 배포 (gsc_full_crawler.js, onhouse_full_crawler.js)
3. Supabase 연결 정보 GitHub Secrets에 등록

### Step 6: 검증
1. Vercel 빌드 성공 확인
2. `/search` 페이지에서 데이터 로드 확인
3. 콘솔에서 `window.WS.allListings` 필드 확인
4. 카드뷰 + 상세 모달 렌더링 확인

---

## 10. Claude (AI) 작업 시 주의사항

1. **route.ts 파일 수정 시**: 반드시 파일 끝까지 완전한지 확인 (PUT handler의 catch 블록까지)
2. **selectFields 변경 시**: 캐시 키 버전을 함께 올릴 것
3. **content.js 수정 시**: 약 13,000줄 대형 파일 — 부분 수정만 할 것, 전체 재작성 금지
4. **git push 실패 시**: GitHub 웹 에디터를 통해 직접 커밋 가능
5. **Vercel 빌드 에러 시**: deployments 페이지에서 에러 로그 확인
6. **null 필드 이슈**: Supabase가 null 값을 strip하므로 DB에 실제 데이터가 있는지 SQL로 확인

---

*최종 업데이트: 2026-04-13*
*빌드 확인 커밋: fb93bad (Vercel Ready, 602 lines)*
