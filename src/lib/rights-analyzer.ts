/**
 * PR-R-3 (RFC 0018 Phase 2.C) — 등기부 권리분석 알고리즘
 *
 * 사장님 도메인 통찰:
 *   "끝내는 실제 현장조사가 필요한것처럼 100% 완벽한건 아니니간 정말 큼지막한 것만"
 *
 * 자동 분석 (큼지막한 것만):
 *   - 근저당 + 임차보증금 합 > 매물가 80% → warning
 *   - 가압류 / 압류 / 경매 진행 → danger
 *   - 신탁 / 가등기 → caution
 *   - 이중매매 의심 → danger
 *
 * 사장님 영역 (자동 X):
 *   - 시세 추정 (CLAUDE.md AI 시세 추정 X)
 *   - 법률 자문 (PR-O 변호사 영역)
 *   - 협상 / 조건 (사장님 13년 노하우)
 */

import type { CodefRegistryResponse } from './codef-client';

export type RiskLevel = 'safe' | 'caution' | 'warning' | 'danger';

export interface RiskReason {
  code: string;
  message: string;
  severity: RiskLevel;
}

export interface RightsAnalysisResult {
  level: RiskLevel;
  reasons: RiskReason[];
  summary: string;
  // disclaimer: 면책 조항 (PR-O 법무 자문 후 확정)
  disclaimer: string;
}

const DISCLAIMER =
  '본 분석은 등기부등본 자동 분석 결과 (참고용)입니다. ' +
  '최종 매수 결정은 변호사 자문 + 현장 검증 후 진행하시기 바랍니다. ' +
  '실측 / 도면 / 임대차 현황은 본 분석 범위 외입니다.';

export function analyzeRights(
  registry: NonNullable<CodefRegistryResponse['parsed']>,
  property_price: number, // 매물 가격 (원)
): RightsAnalysisResult {
  const reasons: RiskReason[] = [];

  // 1. 위험 — 가압류 / 압류 / 경매
  for (const lien of registry.liens) {
    if (lien.type === '가압류' || lien.type === '압류') {
      reasons.push({
        code: 'lien_seizure',
        message: `${lien.type} 등기 발견 — 매수 위험 큼`,
        severity: 'danger',
      });
    } else if (lien.type === '경매') {
      reasons.push({
        code: 'lien_auction',
        message: '경매 진행 중 — 즉시 변호사 자문 필수',
        severity: 'danger',
      });
    }
  }

  // 2. 경고 — 근저당 합계
  const totalLien = registry.liens
    .filter((l) => l.type === '근저당권' || l.type === '저당권')
    .reduce((sum, l) => sum + (l.amount || 0), 0);

  if (property_price > 0 && totalLien > 0) {
    const ratio = totalLien / property_price;
    if (ratio > 0.8) {
      reasons.push({
        code: 'lien_high_ratio',
        message: `근저당 합 ${(ratio * 100).toFixed(0)}% — 매물가 80% 초과`,
        severity: 'warning',
      });
    } else if (ratio > 0.6) {
      reasons.push({
        code: 'lien_moderate_ratio',
        message: `근저당 합 ${(ratio * 100).toFixed(0)}% — 검토 필요`,
        severity: 'caution',
      });
    }
  }

  // 3. 주의 — 신탁 / 가등기
  for (const lien of registry.liens) {
    if (lien.type === '신탁') {
      reasons.push({
        code: 'lien_trust',
        message: '신탁 등기 — 신탁사 동의 필요',
        severity: 'caution',
      });
    } else if (lien.type === '가등기') {
      reasons.push({
        code: 'lien_provisional',
        message: '가등기 — 권리 우선순위 검토 필요',
        severity: 'caution',
      });
    } else if (lien.type === '임차권') {
      reasons.push({
        code: 'lien_lease',
        message: '임차권 등기 — 기존 임차인 권리 확인',
        severity: 'caution',
      });
    }
  }

  // 4. 위험 — 이중매매 의심 (소유권 이전 빈도 비정상)
  const recentTransfers = registry.ownership_history
    .filter((h) => h.type === '소유권이전')
    .filter((h) => {
      const d = new Date(h.date);
      return Date.now() - d.getTime() < 365 * 24 * 60 * 60 * 1000; // 1년 이내
    });
  if (recentTransfers.length >= 3) {
    reasons.push({
      code: 'ownership_frequent_transfer',
      message: `1년 내 소유권 이전 ${recentTransfers.length}회 — 이중매매 의심`,
      severity: 'danger',
    });
  }

  // 종합 등급 결정 (가장 높은 severity)
  const order: Record<RiskLevel, number> = { safe: 0, caution: 1, warning: 2, danger: 3 };
  let level: RiskLevel = 'safe';
  for (const r of reasons) {
    if (order[r.severity] > order[level]) level = r.severity;
  }

  const summary =
    level === 'safe'
      ? '자동 분석 결과 큰 위험 요소 발견되지 않음.'
      : level === 'caution'
        ? '주의 필요한 권리 관계 있음 — 변호사 자문 권장.'
        : level === 'warning'
          ? '경고 — 근저당 / 부채 비율 높음. 매수 전 검토 필수.'
          : '위험 — 가압류 / 경매 / 이중매매 의심. 즉시 변호사 자문 + 현장 검증 필수.';

  return {
    level,
    reasons,
    summary,
    disclaimer: DISCLAIMER,
  };
}
