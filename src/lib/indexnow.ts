// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IndexNow helper — PR-D
//
// 신규/업데이트 매물 URL 을 검색엔진(Bing/Yandex/Naver/Seznam)에 즉시 알림.
// 구글은 IndexNow 미지원 — 별도 sitemap.xml + Search Console 의존.
//
// 프로토콜: https://www.indexnow.org/documentation
// API endpoint: https://api.indexnow.org/IndexNow (모든 지원 엔진 동시 fanout)
//
// Key: public/{key}.txt 파일이 도메인에 호스팅되어야 검증됨.
//   wishes.co.kr/{key}.txt → 본문 = key 자체.
//
// 환경변수 INDEXNOW_KEY 미설정 시 console.warn fallback (사장님 부담 0).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INDEXNOW_HOST = 'wishes.co.kr';
const INDEXNOW_API = 'https://api.indexnow.org/IndexNow';

export interface IndexNowResult {
  ok: boolean;
  status?: number;
  reason?: string;
  submitted?: number;
}

/**
 * 매물 URL 들을 IndexNow 에 ping. 최대 10,000 URLs/request.
 * 환경변수: INDEXNOW_KEY (32 hex chars 권장)
 */
export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    console.warn('[indexnow] INDEXNOW_KEY 미설정 — ping skip');
    return { ok: false, reason: 'INDEXNOW_KEY_missing' };
  }
  if (urls.length === 0) {
    return { ok: true, submitted: 0 };
  }
  // 한 요청 최대 10,000 URLs
  const batch = urls.slice(0, 10000);

  try {
    const resp = await fetch(INDEXNOW_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key,
        keyLocation: `https://${INDEXNOW_HOST}/${key}.txt`,
        urlList: batch,
      }),
    });
    if (resp.ok) {
      return { ok: true, status: resp.status, submitted: batch.length };
    }
    const errText = await resp.text();
    return {
      ok: false,
      status: resp.status,
      reason: `indexnow_${resp.status}_${errText.slice(0, 100)}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `fetch_error_${(err as Error).message?.slice(0, 100)}`,
    };
  }
}
