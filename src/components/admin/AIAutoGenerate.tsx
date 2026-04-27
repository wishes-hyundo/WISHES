'use client';
// ──────────────────────────────────────────────────────────────────────
// AI 매물 설명 v2 — 검수 화면용 컴포넌트
// 작성: 2026-04-27 v3 세션
//
// 동작:
//   1. "v2 AI 재생성" 버튼 → /api/admin/generate-description-v2 호출
//   2. 결과 미리보기 (title, description, keywords, verify)
//   3. 사용자가 "이 내용으로 저장" 클릭 → onUpdate 호출
//
// v2 시스템 특징 (글로벌 SOTA 조사 기반):
//   - RAG 검증된 사실만 주입 (환각 0)
//   - 7개 페르소나 풀 (다양성)
//   - 표 정보 중복 자동 검출 + 환각 단어 검출
//   - Gemini 2.5 Flash (무료 일 100K) 우선 / Anthropic Haiku fallback
// ──────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { adminFetch } from '@/lib/adminFetch';

interface AIAutoGenerateProps {
  listing: { id: number; type?: string; dong?: string; title?: string };
  onUpdate?: (field: string, value: unknown) => void;
}

interface VerifyDetail {
  ok: boolean;
  ai_banned: string[];
  table_duplicate: string[];
  hallucinated_stations: string[];
  hallucinated_landmarks: string[];
  too_short: boolean;
  too_long: boolean;
  reasons: string[];
}

interface V2Response {
  success: boolean;
  title: string;
  description: string;
  keywords: string[];
  tags: string[];
  meta_description: string;
  style: { id: string; name: string };
  headline_pattern: string;
  used_llm: string;
  verify: { title: VerifyDetail; description: VerifyDetail; passed: boolean };
  error?: string;
}

export default function AIAutoGenerate({ listing, onUpdate }: AIAutoGenerateProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<V2Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!listing?.id) {
      setError('매물 ID 없음');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminFetch('/api/admin/generate-description-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const data: V2Response = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || `오류 ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result || !onUpdate) return;
    onUpdate('title', result.title);
    onUpdate('description', result.description);
    onUpdate('ai_description', result.description);
    onUpdate('seo_meta_description', result.meta_description);
    if (result.keywords.length > 0) onUpdate('seo_keywords', result.keywords);
    if (result.tags.length > 0) onUpdate('seo_tags', result.tags);
    setResult(null);
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          fontSize: '12px',
          padding: '4px 10px',
          background: loading ? '#94a3b8' : '#0f3460',
          color: 'white',
          borderRadius: '6px',
          border: 'none',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '생성 중...' : '✨ v2 AI 재생성'}
      </button>

      {error && (
        <div style={{ marginTop: '8px', padding: '8px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '12px' }}>
          오류: {error}
        </div>
      )}

      {result && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }} onClick={() => setResult(null)}>
          <div style={{
            background: 'white', borderRadius: '12px', padding: '20px',
            maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', width: '100%'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontWeight: 'bold' }}>v2 AI 생성 결과</h3>
              <button onClick={() => setResult(null)} style={{ fontSize: '20px', color: '#999' }}>✕</button>
            </div>

            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
              스타일: <b>{result.style.name}</b> · 헤드라인 패턴: {result.headline_pattern} · 모델: {result.used_llm}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>제목</div>
              <div style={{ padding: '8px', background: '#f1f5f9', borderRadius: '6px' }}>{result.title}</div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>설명</div>
              <div style={{ padding: '8px', background: '#f1f5f9', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                {result.description}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>키워드</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {result.keywords.map((k, i) => (
                  <span key={i} style={{ fontSize: '11px', padding: '2px 8px', background: '#e0e7ff', color: '#3730a3', borderRadius: '12px' }}>{k}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>해시태그</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {result.tags.map((t, i) => (
                  <span key={i} style={{ fontSize: '11px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '12px' }}>{t}</span>
                ))}
              </div>
            </div>

            {/* 검증 결과 */}
            <div style={{ marginBottom: '12px', padding: '8px', background: result.verify.passed ? '#d1fae5' : '#fee2e2', borderRadius: '6px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {result.verify.passed ? '✅ 검증 통과' : '⚠️ 검증 경고'}
              </div>
              {result.verify.title.reasons.length > 0 && (
                <div>제목: {result.verify.title.reasons.join(' / ')}</div>
              )}
              {result.verify.description.reasons.length > 0 && (
                <div>설명: {result.verify.description.reasons.join(' / ')}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={handleGenerate} disabled={loading}
                style={{ padding: '8px 16px', background: '#94a3b8', color: 'white', borderRadius: '6px' }}>
                다시 생성
              </button>
              <button onClick={() => setResult(null)}
                style={{ padding: '8px 16px', background: '#e5e7eb', color: '#374151', borderRadius: '6px' }}>
                취소
              </button>
              <button onClick={handleApply}
                style={{ padding: '8px 16px', background: '#10b981', color: 'white', borderRadius: '6px', fontWeight: 'bold' }}>
                이 내용으로 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
