# 줌 단계별 정밀 비교 — 네이버 vs WISHES
**작성일**: 2026-04-26 05:00  
**WISHES**: commit 423edb77 (`zoom = 21 - level` 매핑)  
**Naver 매핑**: 사용자 4개 스크린샷 + 라이브 관찰 기반

---

## 1. 줌 레벨별 표시 기준 비교 (1:1 매칭)

| Naver z | Naver 동작 | Naver viewport | WISHES z | WISHES level | WISHES 동작 | WISHES viewport | 폴리곤 매칭 | 마커 매칭 | 확대범위 매칭 |
|---|---|---|---|---|---|---|---|---|---|
| **z9** | 시군구 폴리곤 (관악구) | ~80km | z9 | level 12 | 시군구 폴리곤 ✓ | ~32km | ✓ | - | ✗ **2.5배 차이** |
| **z10** | 시군구 폴리곤 | ~40km | z10 | level 11 | 시군구 폴리곤 ✓ | ~16km | ✓ | - | ✗ **2.5배 차이** |
| **z11** | 시군구 폴리곤 | ~20km | z11 | level 10 | 시군구 폴리곤 ✓ | ~8km | ✓ | - | ✗ **2.5배 차이** |
| **z12** | 시군구 폴리곤 (서초구) | ~10km | z12 | level 9 | 시군구 폴리곤 ✓ | ~4km | ✓ | - | ✗ **2.5배 차이** |
| **z13** | 동 폴리곤 (서초동) | ~5km | z13 | level 8 | 시군구 폴리곤 ✗ | ~2km | ✗ **불일치** | - | ✗ **2.5배 차이** |
| **z14** | 동 폴리곤 | ~2.5km | z14 | level 7 | 동 폴리곤 ✓ | ~1km | ✓ | - | ✗ **2.5배 차이** |
| **z15** | 동 폴리곤 | ~1.2km | z15 | level 6 | 동 폴리곤 ✓ | ~500m | ✓ | - | ✗ **2.4배 차이** |
| **z16** | 마커 (단지/매물) | ~600m | z16 | level 5 | 마커 ✓ | ~250m | - | ✓ 종류 일치 | ✗ **2.4배 차이** |
| **z17** | 마커 | ~300m | z17 | level 4 | 마커 ✓ | ~125m | - | ✓ | ✗ **2.4배 차이** |
| **z18** | 마커 (개별) | ~150m | z18 | level 3 | 마커 ✓ | ~63m | - | ✓ | ✗ |
| **z19** | 마커 (단지/건물) | ~75m | z19 | level 2 | 마커 ✓ | ~32m | - | ✓ | ✗ |

---

## 2. 핵심 결론

### 🔴 Critical: 동일 z 라벨에서 viewport 사이즈가 약 2.5배 차이

같은 "z13" 라벨이지만:
- Naver z13 → viewport 약 5km 보임
- WISHES z13 → viewport 약 2km 보임

→ **사용자가 "z13에서 다른 것이 보인다"고 느끼는 이유**

### 🔴 Critical: z13 폴리곤 종류 불일치

- Naver z13 = **동 폴리곤** (신림동, 서초동)
- WISHES z13 = **시군구 폴리곤** (관악구, 서초구)

**원인**: 현재 매핑 `zoom = 21 - level`로 z13 = Kakao level 8. Level 8은 sigungu 범위.  
**필요**: z13 = Kakao level 7 (dong 범위 시작)이 되도록 매핑 조정.

### 🟡 마커 종류는 일치하나 밀집도 차이

- Naver z16: 약 30개 마커 (자연스러운 클러스터링)
- WISHES z16: 약 80~100개 마커 (과밀)

**원인**: WISHES viewport가 더 좁아서 동일 면적 더 자세히 보임 + 클러스터링 임계값 차이

---

## 3. 정확한 매핑 보정안

### 옵션 A: `zoom = 20 - level`로 변경

| Naver z | 원하는 동작 | 필요 Kakao level | `21 - level` (현재) | `20 - level` (제안) |
|---|---|---|---|---|
| z9 | 시군구 | 11 | z10 (off by 1) | **z11 (off by 2)** |
| z12 | 시군구 | 8 | z13 ✗ | **z12 ✓** |
| z13 | **동** | 7 | z14 (off) | **z13 ✓** |
| z16 | 마커 | 4 | z17 (off) | **z16 ✓** |

`zoom = 20 - level` 변경하면 z13 (동) / z16 (마커) 매칭됨.

### 옵션 B: 폴리곤 임계값 조정 (`21 - level` 유지)

현재 임계값:
- sigungu: level 9-12 (z9-z12)
- dong: level 6-8 (z13-z15)

변경:
- sigungu: level 9-11 (z10-z12)
- dong: level 5-8 (z13-z16)
- markers: level 1-4 (z17-z20)

이러면 z13 = level 8 = dong이 됨 (현재는 sigungu).  
하지만 z16 = level 5 = dong (Naver는 markers). 또 어긋남.

### ✅ 최선책: 옵션 A — `zoom = 20 - level`

```ts
function levelToZoom(level: number): number {
  return Math.max(0, 20 - level);  // 21 → 20
}
```

그리고 임계값 재설정:
```ts
if (level >= 12) mode = 'sido';      // z8+
else if (level >= 8) mode = 'sigungu'; // z9-z12
else if (level >= 5) mode = 'dong';    // z13-z15
// level <= 4: markers (z16-z19)
```

마커 threshold:
```ts
if (level >= 5) return;  // 이전 level >= 6 → 5로
```

### 📊 보정 후 매칭 표

| Naver z | 원하는 동작 | Kakao level | WISHES z | 폴리곤 매칭 | 확대범위 매칭 |
|---|---|---|---|---|---|
| z9 | 시군구 | 11 | z9 | ✓ | ✓ (둘 다 ~25-50km) |
| z12 | 시군구 | 8 | z12 | ✓ | ✓ (둘 다 ~5-8km) |
| **z13** | **동** | 7 | z13 | ✅ **수정됨** | ✓ |
| z16 | 마커 | 4 | z16 | ✓ | ✓ |
| z19 | 마커 | 1 | z19 | ✓ | ✓ |

---

## 4. 추가 개선 사항

### 4.1 마커 밀집도 (Critical)
- Naver: 클러스터링으로 30개 정도
- WISHES: 80+ 개별 마커
- **수정 방안**: 클러스터 임계값 조정 또는 zoom level별 마커 표시 개수 cap

### 4.2 폴리곤 라벨 위치
- Naver: 지도 상단 고정 breadcrumb
- WISHES: 폴리곤 centroid 위
- **수정 방안**: 별도 BreadcrumbBar 컴포넌트 추가

### 4.3 라벨 spacing 버그
- "안양시만안구" → "안양시 만안구"
- **수정 방안**: GeoJSON name 정규화 함수에서 `시(\S+)구` 패턴 분리

---

## 5. 요약

**현재 위시스 (commit 423edb77)**:
- 폴리곤 종류 매칭: 75% (z13에서 sigungu 보여 어긋남)
- 마커 종류 매칭: 100% (z16+에서 markers ✓)
- 확대범위 매칭: **0%** (모든 z에서 viewport 2.5배 차이)
- 라벨 매칭: 일부 일치, 위치/포맷 다름

**필요 수정 (단 1줄)**:
```ts
// MapClient.tsx + useMapClusters.ts
return Math.max(0, 20 - level);  // 21 → 20
```

추가로 임계값 1줄씩 조정. 이러면 **z13에서 동 폴리곤 + viewport 사이즈 매칭**.
