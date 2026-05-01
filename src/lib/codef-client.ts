/**
 * PR-R-3 (RFC 0018 Phase 2.B) — CODEF API client (스텁)
 *
 * 사장님 외부 등록 후 활성화:
 *   1. https://developer.codef.io 사업자 가입 (1주)
 *   2. API key 발급
 *   3. Vercel env CODEF_CLIENT_ID + CODEF_CLIENT_SECRET 등록
 *   4. PR-R-3-Activate (별도 PR) 에서 실제 fetch 활성화
 *
 * 비용: 등기부등본 발급 건당 ₩1,000 (선결제 / 후정산)
 *
 * 헌법 §"비용 정책": 사용자 결제 ₩3,000 - 원가 ~₩1,100 = 마진 ₩1,900 (63%).
 */

export interface CodefRegistryRequest {
  property_address: string; // 등기 소재지 (도로명 OK)
  property_type: 'apt' | 'officetel' | 'house' | 'land' | 'building';
  user_consent: boolean; // 본인 동의 필수
}

export interface CodefRegistryResponse {
  ok: boolean;
  raw_pdf_url?: string; // CODEF 가 제공하는 PDF URL
  parsed?: {
    property_address: string;
    property_area_m2: number | null;
    property_purpose: string | null;
    property_structure: string | null;
    ownership_history: Array<{
      type: '소유권보존' | '소유권이전' | '신탁' | '기타';
      owner: string;
      date: string;
      reason?: string;
    }>;
    current_owner: string | null;
    liens: Array<{
      type: '근저당권' | '저당권' | '가압류' | '압류' | '경매' | '임차권' | '신탁' | '가등기' | '기타';
      amount?: number;
      holder?: string;
      date: string;
    }>;
  };
  error?: string;
  reason?: string;
}

const CODEF_CLIENT_ID = process.env.CODEF_CLIENT_ID || '';
const CODEF_CLIENT_SECRET = process.env.CODEF_CLIENT_SECRET || '';

export function isCodefEnabled(): boolean {
  return !!(CODEF_CLIENT_ID && CODEF_CLIENT_SECRET);
}

/**
 * 등기부등본 발급 + 파싱 — CODEF 통합.
 * 환경변수 미설정 시 graceful disabled.
 */
export async function fetchRegistry(
  _req: CodefRegistryRequest,
): Promise<CodefRegistryResponse> {
  if (!isCodefEnabled()) {
    return {
      ok: false,
      error: 'codef_not_configured',
      reason: 'CODEF_CLIENT_ID + CODEF_CLIENT_SECRET 환경변수 미설정',
    };
  }

  // 실제 구현은 PR-R-3-Activate 별도 PR.
  //   1. POST https://oauth.codef.io/oauth/token (Basic auth)
  //   2. POST https://development.codef.io/v1/kr/etc/g/internet-registration/register
  //   3. 응답 PDF URL 다운로드 + 파싱 (PDF.js 또는 정규식)
  //   4. 표제부/갑구/을구 구조화
  return {
    ok: false,
    error: 'codef_not_implemented',
    reason: 'PR-R-3-Activate 에서 실제 호출 활성화 예정',
  };
}
