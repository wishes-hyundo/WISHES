'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): AIRegenerateButton — v2 AI 재생성 버튼
//   옛날 content-v300-aidesc-v2.js 의 "✨ v2 AI 재생성" 재현
//   - POST /api/admin/generate-description-v2 (Bearer)
//   - 결과 모달 미리보기 → 적용 / 다시생성 / 취소
//   - sonner toast (성공/실패)
//   - RAG 검증 표시 (환각 0%)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { Sparkles, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export interface AIGenerateResult {
  success: boolean;
  title?: string;
  description?: string;
  meta_description?: string;
  keywords?: string[];
  tags?: string[];
  used_llm?: string;
  headline_pattern?: string;
  style?: { name?: string };
  verify?: {
    passed: boolean;
    title?: { reasons?: string[] };
    description?: { reasons?: string[] };
  };
  error?: string;
}

export interface AIRegenerateButtonProps {
  listingId: number;
  apiToken?: string; // Bearer 토큰 (sessionStorage에서 가져오기)
  onApply: (result: { title: string; description: string; keywords?: string[]; tags?: string[] }) => void;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm';
  className?: string;
}

export function AIRegenerateButton({
  listingId,
  apiToken,
  onApply,
  variant = 'outline',
  size = 'sm',
  className,
}: AIRegenerateButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<AIGenerateResult | null>(null);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const token = apiToken || (typeof window !== 'undefined' ? (
        localStorage.getItem('wishes_token') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('ws_token') ||
        ''
      ) : '');
      const res = await fetch('/api/admin/generate-description-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ listingId }),
      });
      const data: AIGenerateResult = await res.json();
      if (!res.ok || !data.success) {
        const msg = data.error || `HTTP ${res.status}`;
        toast.error('생성 실패', { description: msg });
        setOpen(false);
        return;
      }
      setResult(data);
    } catch (e) {
      toast.error('네트워크 오류', { description: (e as Error).message });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [listingId, apiToken]);

  const handleClick = async () => {
    setOpen(true);
    await generate();
  };

  const handleApply = () => {
    if (!result || !result.success) return;
    onApply({
      title: result.title || '',
      description: result.description || '',
      keywords: result.keywords,
      tags: result.tags,
    });
    toast.success('AI 결과 적용됨', { description: '"💾 저장" 버튼을 눌러 확정하세요.' });
    setOpen(false);
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={handleClick} className={className}>
        <Sparkles className="h-4 w-4 mr-1" />
        v2 AI 재생성
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-wishes-primary" />
              v2 AI 매물 설명
            </DialogTitle>
            <DialogDescription>
              글로벌 SOTA RAG + 7개 페르소나 — 환각 0%, 다양성 ↑
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="h-8 w-8 text-wishes-primary animate-spin" />
              <p className="text-sm text-wishes-muted">생성 중... (5~15초)</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* 검증 배지 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {result.verify?.passed
                  ? <Badge variant="success">✅ RAG 검증 통과</Badge>
                  : <Badge variant="warning">⚠️ 검증 경고</Badge>}
                {result.style?.name && <Badge variant="outline">{result.style.name}</Badge>}
                {result.headline_pattern && <Badge variant="secondary">패턴: {result.headline_pattern}</Badge>}
                {result.used_llm && <Badge variant="outline">{result.used_llm}</Badge>}
              </div>

              {/* 제목 */}
              {result.title && (
                <div>
                  <div className="text-xs font-semibold text-wishes-muted mb-1">제목</div>
                  <div className="p-3 bg-wishes-cream rounded-lg text-sm font-semibold">{result.title}</div>
                </div>
              )}

              {/* 설명 */}
              {result.description && (
                <div>
                  <div className="text-xs font-semibold text-wishes-muted mb-1">설명</div>
                  <div className="p-3 bg-wishes-cream rounded-lg text-sm leading-7 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {result.description}
                  </div>
                </div>
              )}

              {/* 메타 설명 */}
              {result.meta_description && (
                <div>
                  <div className="text-xs font-semibold text-wishes-muted mb-1">메타 설명 (검색엔진)</div>
                  <div className="p-2 bg-wishes-bg rounded text-xs text-wishes-text">{result.meta_description}</div>
                </div>
              )}

              {/* 키워드 + 태그 */}
              {(result.keywords?.length || result.tags?.length) && (
                <div className="space-y-2">
                  {result.keywords && result.keywords.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-wishes-muted mb-1">키워드</div>
                      <div className="flex flex-wrap gap-1">
                        {result.keywords.map((k) => <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>)}
                      </div>
                    </div>
                  )}
                  {result.tags && result.tags.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-wishes-muted mb-1">해시태그</div>
                      <div className="flex flex-wrap gap-1">
                        {result.tags.map((t) => <Badge key={t} variant="warning" className="text-[10px]">#{t}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 검증 경고 상세 */}
              {result.verify && !result.verify.passed && (
                <div className="text-xs text-red-700 bg-red-50 p-2 rounded space-y-1">
                  {result.verify.title?.reasons?.map((r, i) => <div key={i}>제목: {r}</div>)}
                  {result.verify.description?.reasons?.map((r, i) => <div key={i}>설명: {r}</div>)}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" />
              다시 생성
            </Button>
            <Button size="sm" onClick={handleApply} disabled={loading || !result?.success}>
              <Check className="h-4 w-4 mr-1" />
              이 내용으로 채우기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
