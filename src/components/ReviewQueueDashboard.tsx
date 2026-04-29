'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getReviewQueue,
  markListingReviewed,
  calculateTrustScore,
  getTrustScoreLabel,
  getTrustScoreColor,
  type ReviewQueueItem,
  type ReviewField,
  type TrustScore
} from '@/lib/bob-enrichment';
import type { Database } from '@/types/supabase';

type Listing = Database['public']['Tables']['listings']['Row'];

interface ReviewQueueDashboardProps {
  brokerId: string;
  onClose?: () => void;
}

/**
 * Phase 3-4: Broker Review Queue Dashboard
 *
 * Displays listings needing verification and allows:
 * - Viewing AI-suggested enrichment values
 * - Confirming or correcting field values
 * - Locking fields (preventing auto-re-enrichment)
 * - Tracking enrichment history
 * - Trust score calculation
 */
export function ReviewQueueDashboard({
  brokerId,
  onClose
}: ReviewQueueDashboardProps) {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);

  // Load review queue
  useEffect(() => {
    const loadQueue = async () => {
      setLoading(true);
      const items = await getReviewQueue(brokerId, { limit: 50, minConfidence: 70 });
      setQueue(items);
      setLoading(false);
    };

    loadQueue();
  }, [brokerId]);

  // Load trust score when item selected
  useEffect(() => {
    const loadTrustScore = async () => {
      if (selectedItem) {
        // In real implementation, fetch full listing data
        const score = calculateTrustScore({
          // Minimal data for demo
          id: selectedItem.id,
          area: undefined,
          area_confidence: undefined,
          area_locked_at: null,
          heating: undefined,
          heating_confidence: undefined,
          heating_locked_at: null,
          orientation: undefined,
          orientation_confidence: undefined,
          orientation_locked_at: null,
          construction_year: undefined,
          construction_year_confidence: undefined,
          construction_year_locked_at: null,
          price: undefined,
          price_confidence: undefined,
          price_locked_at: null,
          enrichment_status: selectedItem.enrichmentStatus as any,
          lease_type: null,
          jeonse_price: undefined
        } as unknown as Listing);

        setTrustScore(score);
      }
    };

    loadTrustScore();
  }, [selectedItem]);

  const handleReviewField = useCallback(
    async (field: ReviewField, newValue: any) => {
      if (!selectedItem) return;

      setSubmitting(true);
      const result = await markListingReviewed(
        selectedItem.id,
        field.fieldName,
        newValue,
        brokerId
      );

      if (result.success) {
        // Remove from queue
        setQueue(queue.filter(item => item.id !== selectedItem.id));
        setSelectedItem(null);
      } else {
        alert(`오류: ${result.error}`);
      }

      setSubmitting(false);
    },
    [selectedItem, brokerId, queue]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">검토 큐 로드 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">검토 필요한 매물</h1>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              닫기
            </button>
          </div>
          <p className="text-gray-600">
            AI 자동보강이 확신하지 못한 정보들을 확인해주세요
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-900">
                  매물 ({queue.length})
                </h2>
              </div>

              <div className="divide-y divide-gray-200 max-h-[calc(100vh-200px)] overflow-y-auto">
                {queue.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    검토할 매물이 없습니다
                  </div>
                ) : (
                  queue.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`w-full text-left p-4 hover:bg-blue-50 transition-colors ${
                        selectedItem?.id === item.id
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 truncate">
                        {item.address}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-2">
                        <span className={`px-2 py-1 rounded-full ${
                          item.priority === 'high'
                            ? 'bg-red-100 text-red-700'
                            : item.priority === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {item.priority === 'high'
                            ? '긴급'
                            : item.priority === 'medium'
                            ? '중요'
                            : '낮음'}
                        </span>
                        <span className="text-gray-400">
                          {item.reviewNeeded.length} 항목
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Detail View */}
          <div className="lg:col-span-2">
            {selectedItem ? (
              <div className="space-y-6">
                {/* Trust Score Card */}
                {trustScore && (
                  <div
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                    style={{
                      borderTopColor: getTrustScoreColor(trustScore.overall),
                      borderTopWidth: '4px'
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">신뢰도 점수</h3>
                      <div className="text-right">
                        <div
                          className="text-3xl font-bold"
                          style={{ color: getTrustScoreColor(trustScore.overall) }}
                        >
                          {trustScore.overall}
                        </div>
                        <div className="text-sm text-gray-600">
                          {getTrustScoreLabel(trustScore.overall)}
                        </div>
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-2 mb-4">
                      <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        점수 분석
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(trustScore.breakdown).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                              {formatFieldLabel(key)}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {value > 0 ? `+${value}` : '0'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommendations */}
                    {trustScore.recommendations.length > 0 && (
                      <div className="pt-4 border-t border-gray-200">
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                          권장사항
                        </div>
                        <ul className="space-y-1">
                          {trustScore.recommendations.map((rec, idx) => (
                            <li key={idx} className="text-sm text-amber-700 flex gap-2">
                              <span>•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Review Fields */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">검토 필드</h3>

                  <div className="space-y-4">
                    {selectedItem.reviewNeeded.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        모든 정보가 확인되었습니다
                      </div>
                    ) : (
                      selectedItem.reviewNeeded.map((field, idx) => (
                        <ReviewFieldCard
                          key={`${field.fieldName}-${idx}`}
                          field={field}
                          onSubmit={(value) => handleReviewField(field, value)}
                          isSubmitting={submitting}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Audit Trail (Demo) */}
                {selectedItem.lastAttempt && (
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-sm">
                    <div className="font-semibold text-blue-900 mb-2">
                      자동보강 시도 기록
                    </div>
                    <div className="text-blue-700">
                      마지막 시도: {selectedItem.lastAttempt.toLocaleString('ko-KR')}
                    </div>
                    {selectedItem.errorLog && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                        {selectedItem.errorLog}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <div className="text-gray-500">
                  매물을 선택하여 상세 정보를 확인하세요
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual field review component
 */
function ReviewFieldCard({
  field,
  onSubmit,
  isSubmitting
}: {
  field: ReviewField;
  onSubmit: (value: any) => void;
  isSubmitting: boolean;
}) {
  const [editValue, setEditValue] = useState(field.currentValue);

  const handleSubmit = () => {
    onSubmit(editValue);
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-medium text-gray-900">{field.label}</div>
          {field.source && (
            <div className="text-xs text-gray-500 mt-1">
              출처: {field.source} {field.confidence ? `(${field.confidence}%)` : ''}
            </div>
          )}
        </div>
        {field.isLocked && (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
            확정됨
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {field.autoValue !== undefined && (
          <div>
            <label className="text-xs text-gray-600 block mb-1">AI 제안값</label>
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 font-medium">
              {String(field.autoValue)}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-600 block mb-1">현재값</label>
          {field.type === 'select' ? (
            <select
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              disabled={isSubmitting || field.isLocked}
            >
              <option value="">선택하기</option>
              {field.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              disabled={isSubmitting || field.isLocked}
            />
          ) : (
            <input
              type={field.type}
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              disabled={isSubmitting || field.isLocked}
            />
          )}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || field.isLocked}
        className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
      >
        {isSubmitting ? '저장 중...' : '확인'}
      </button>
    </div>
  );
}

/**
 * Format field names for display
 */
function formatFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    area: '면적',
    price: '가격',
    orientation: '향',
    heating: '난방',
    constructionYear: '건축년도',
    brokerVerified: '중개사 검증',
    registryChecked: '등기 확인'
  };
  return labels[key] || key;
}
