# 네이버 검색어드바이저 sitemap 제출 안내 (사용자 클릭 1번)

## 페이지

```
https://searchadvisor.naver.com
```

## 클릭 순서 (2분)

1. **로그인** (네이버 계정 — 이미 로그인되어 있을 수 있음)
2. 좌측 사이트 목록에서 **wishes.co.kr** 클릭
   - (만약 사이트 없으면 "사이트 등록" → wishes.co.kr 입력 → verification 메타는 이미 layout.tsx 에 박혀있음 → 즉시 검증)
3. 좌측 메뉴 **요청** → **사이트맵 제출**
4. URL 입력: `sitemap.xml`
5. **확인** 클릭

## 추가 권장 (RSS, 5초)

같은 페이지의 **RSS 제출** 칸에:
```
https://wishes.co.kr/sitemap.xml
```
↑ 사이트맵을 RSS 로도 등록 (네이버 자동 크롤링 가속)

## 검증 (1주일 후)

- 좌측 **리포트 → 사이트 진단** → 색인된 페이지 수 증가 확인
- `네이버 검색 wishes.co.kr` → 매물 페이지 노출 확인

## 이미 갖춰진 것
- `naver-site-verification` 메타 태그 ✅ (layout.tsx 60줄)
- robots.txt 의 sitemap 선언 ✅
- sitemap.xml 동적 생성 ✅ (1,635개 색인 OK 매물)

작성: 2026-04-27 v3 세션
