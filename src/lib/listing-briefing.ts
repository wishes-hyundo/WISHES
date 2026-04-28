// ──────────────────────────────────────────────────────────────────────
// listing-briefing — 매물 추천 브리핑 (장점 부각, LLM 0%)
// 작성: 2026-04-29 사장님 명령
//   - 검증된 사실만 (LLM 0%, 환각 0%)
//   - 기본정보/옵션/가격 카드와 중복 X (추가 가치만)
//   - 미세먼지/치안/상권 등 부동산 무관 정보 제외
//   - 출처/근거 표기 제거 (깔끔한 마케팅 톤)
//   - 단점 표시 X (신뢰점수 낮음 등) — 장점만 부각
// ──────────────────────────────────────────────────────────────────────

import type { NearestStation } from '@/lib/subway-finder';

export interface BriefingInput {
  type: string;
  deal: string;
  is_immediate_movein: boolean;
  is_full_option: boolean;
  has_elevator: boolean;
  has_parking: boolean;
  rooms: number | null;
  bathrooms: number | null;
  built_year: string | null;
  is_new_building: boolean;

  station_top3?: NearestStation[];
  rtms_avg_price?: number | null;
  rtms_data?: Record<string, unknown> | null;
  land_price_per_m2?: number | null;
  academy_count?: number | null;
  school_count?: number | null;
  school_zone_score?: number | null;
  school_zone_data?: Record<string, unknown> | null;
  trust_score?: number | null;
  grade?: string | null;
  last_verified_at?: string | null;
  enriched_at?: string | null;
  special_notes?: string | null;

  // 매물 등록자가 입력한 가격 (시세 비교용)
  own_price?: number | null;
}

export interface BriefingResult {
  description: string;
  sections: string[];
  facts_count: number;
  recommendation_reasons: string[];
}

function isVal(v: unknown): boolean {
  return v != null && v !== '' && v !== 0;
}

// ── 1. 교통 (장점 — 가까운 역만, 출처 X) ──
function buildTrafficSection(input: BriefingInput): string | null {
  const tops = input.station_top3 || [];
  if (tops.length === 0) return null;

  // 도보 15분 이상 역은 장점 X — 표시 안 함
  const walkable = tops.filter((s) => {
    const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
    return min <= 15;
  });
  if (walkable.length === 0) return null;

  const lines = ['🚇 교통'];
  for (const s of walkable.slice(0, 3)) {
    const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
    const exit = s.nearest_exit ? ` · ${s.nearest_exit.exit_no}번 출구` : '';
    lines.push(`• ${s.name}역 (${s.line}) 도보 ${min}분${exit}`);
  }
  return lines.join('\n');
}

// ── 2. 시세 (장점만 — 합리적/저렴할 때만) ──
function buildPriceMeritSection(input: BriefingInput): string | null {
  if (!isVal(input.rtms_avg_price) || !isVal(input.own_price)) return null;
  const own = input.own_price as number;
  const avg = input.rtms_avg_price as number;
  if (avg === 0) return null;
  const ratio = own / avg;

  const lines = ['📊 시세'];
  if (ratio <= 0.95) {
    lines.push('• 인근 평균 대비 합리적인 가격대');
  } else if (ratio <= 1.05) {
    lines.push('• 인근 평균 시세 수준의 안정적 가격');
  } else {
    return null;  // 평균보다 비싸면 단점 — 표시 X
  }
  return lines.join('\n');
}

// ── 3. 교육 (학세권 양호할 때만 — 70+) ──
function buildEducationSection(input: BriefingInput): string | null {
  const score = input.school_zone_score as number | null | undefined;
  if (!isVal(score) || (score as number) < 70) return null;

  const lines = ['🎓 교육환경'];
  if ((score as number) >= 85) {
    lines.push('• 학세권 우수');
  } else {
    lines.push('• 학세권 양호');
  }
  if (isVal(input.school_count)) lines.push(`• 인근 학교 ${input.school_count}개`);
  if (isVal(input.academy_count)) lines.push(`• 인근 학원 ${input.academy_count}개`);

  if (input.school_zone_data && typeof input.school_zone_data === 'object') {
    const d = input.school_zone_data as { nearest_elem?: string; nearest_elem_distance_m?: number };
    if (d.nearest_elem && d.nearest_elem_distance_m) {
      const min = Math.round(d.nearest_elem_distance_m / 80);
      if (min <= 10) lines.push(`• ${d.nearest_elem} 도보 ${min}분`);
    }
  }
  return lines.join('\n');
}

// ── 4. 매물 검증 (점수 80+ 일 때만 표시 — 단점 강조 X) ──
function buildVerifiedSection(input: BriefingInput): string | null {
  const items: string[] = [];
  const score = input.trust_score as number | null | undefined;
  if (isVal(score) && (score as number) >= 80) {
    items.push('• 매물 신뢰도 우수');
  }
  if (input.grade && /^[A-S]/i.test(input.grade)) {
    items.push(`• 매물 등급: ${input.grade}`);
  }
  if (input.last_verified_at) {
    const d = new Date(input.last_verified_at);
    const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 30) items.push(`• 최근 현장 확인 완료 (${days <= 1 ? '1일' : days + '일'} 전)`);
  }
  if (items.length === 0) return null;
  return ['✅ 검증', ...items].join('\n');
}

// ── 5. 등록자 특이사항 (있으면) ──
function buildSpecialNotesSection(input: BriefingInput): string | null {
  if (!input.special_notes) return null;
  const trimmed = input.special_notes.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return null;
  return ['📝 매물 특이사항', `${trimmed}`].join('\n');
}

// ── 6. 추천 사실 조합 (장점만, 사실 결합) ──
function buildRecommendationReasons(input: BriefingInput): string[] {
  const reasons: string[] = [];

  if (input.is_new_building) {
    reasons.push('5년 이내 신축 건물');
  }

  if (input.station_top3 && input.station_top3.length > 0) {
    const top1 = input.station_top3[0];
    const min = top1.walk_minutes ?? Math.round(top1.distance_m / 80);
    if (min <= 5) {
      reasons.push(`${top1.name}역 도보 ${min}분 — 출퇴근 편리`);
    } else if (min <= 10) {
      reasons.push(`${top1.name}역 도보 ${min}분`);
    }
  }

  if (input.is_full_option && input.is_immediate_movein) {
    reasons.push('풀옵션 + 즉시입주 — 짐만 가지고 바로 거주 가능');
  } else if (input.is_immediate_movein) {
    reasons.push('즉시입주 가능');
  } else if (input.is_full_option) {
    reasons.push('풀옵션 — 가전 비용 절감');
  }

  if (input.has_elevator && input.has_parking) {
    reasons.push('엘리베이터 + 주차 가능');
  } else if (input.has_elevator) {
    reasons.push('엘리베이터 보유');
  }

  return reasons;
}

// ── 7. 메인 ──
export function buildBriefing(input: BriefingInput): BriefingResult {
  const sections: string[] = ['이 매물을 추천드리는 이유\n'];

  const traffic = buildTrafficSection(input);
  if (traffic) sections.push(traffic);

  const price = buildPriceMeritSection(input);
  if (price) sections.push(price);

  const edu = buildEducationSection(input);
  if (edu) sections.push(edu);

  const verified = buildVerifiedSection(input);
  if (verified) sections.push(verified);

  const notes = buildSpecialNotesSection(input);
  if (notes) sections.push(notes);

  const reasons = buildRecommendationReasons(input);
  if (reasons.length > 0) {
    const reasonLines = ['⭐ 추천 포인트'];
    reasons.forEach((r, i) => reasonLines.push(`${i + 1}. ${r}`));
    sections.push(reasonLines.join('\n'));
  }

  const factsCount = sections.length - 1 + reasons.length;

  if (factsCount === 0) {
    return {
      description: '매물 정보 검토 중입니다. 잠시 후 확인해 주세요.',
      sections: [],
      facts_count: 0,
      recommendation_reasons: [],
    };
  }

  return {
    description: sections.join('\n\n'),
    sections,
    facts_count: factsCount,
    recommendation_reasons: reasons,
  };
}
