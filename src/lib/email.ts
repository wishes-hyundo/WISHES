import { Resend } from 'resend';

// Lazy initialization - 빌드 시 API 키 없어도 에러 방지
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'WISHES <noreply@wishes.co.kr>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wishes@wishes.co.kr';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

// 새 사용자 가입 시 관리자에게 알림
// L-ts1 (2026-04-22): admin_users 컬럼들이 nullable 이므로 `string | null` 까지 허용.
export async function notifyAdminNewRegistration(user: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  reason?: string | null;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[WISHES] 새 사용자 가입 요청 - ${user.name}`,
      html: `
        <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8faf5;border-radius:12px">
          <div style="background:#2d5016;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px">WISHES 새 가입 요청</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8d0">
            <p style="color:#333;font-size:15px;margin-bottom:16px">새로운 사용자가 가입을 요청했습니다.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px;color:#666;width:80px">이름</td><td style="padding:8px;font-weight:600">${user.name}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">이메일</td><td style="padding:8px">${user.email}</td></tr>
              <tr><td style="padding:8px;color:#666">전화</td><td style="padding:8px">${user.phone || '-'}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">소속</td><td style="padding:8px">${user.company || '-'}</td></tr>
              <tr><td style="padding:8px;color:#666">사유</td><td style="padding:8px">${user.reason || '-'}</td></tr>
            </table>
            <div style="margin-top:20px;text-align:center">
              <a href="${SITE_URL}/admin/command-center.html" style="display:inline-block;background:#4a7c23;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">관리자 센터에서 확인</a>
            </div>
          </div>
        </div>
      `,
    });
    if (error) { console.error('[Email] Admin notification failed:', error); return null; }
    console.log('[Email] Admin notification sent:', data?.id);
    return data;
  } catch (e) { console.error('[Email] Admin notification error:', e); return null; }
}

// 사용자 승인 시 이메일 알림
export async function notifyUserApproved(user: {
  email: string;
  name: string;
  role: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '[WISHES] 가입이 승인되었습니다',
      html: `
        <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8faf5;border-radius:12px">
          <div style="background:#2d5016;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px">WISHES 가입 승인</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8d0">
            <p style="color:#333;font-size:15px">${user.name}님, 환영합니다!</p>
            <p style="color:#666;font-size:14px">WISHES 서비스 가입이 승인되었습니다. 지금 바로 로그인하여 서비스를 이용하실 수 있습니다.</p>
            <p style="color:#666;font-size:14px">부여된 권한: <strong>${user.role}</strong></p>
            <div style="margin-top:20px;text-align:center">
              <a href="${SITE_URL}/admin" style="display:inline-block;background:#4a7c23;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">로그인하기</a>
            </div>
          </div>
        </div>
      `,
    });
    if (error) { console.error('[Email] Approval notification failed:', error); return null; }
    console.log('[Email] Approval notification sent to:', user.email);
    return data;
  } catch (e) { console.error('[Email] Approval notification error:', e); return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T5-7: 매물 알림 구독 이메일 (신규 매물 매칭 시 발송)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type NotifyListing = {
  id: number | string;
  title?: string | null;
  deal?: string | null;
  type?: string | null;
  dong?: string | null;
  gu?: string | null;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  area_m2?: number | null;
  floor_current?: string | null;
  created_at?: string | null;
};

function formatMan(man?: number | null): string {
  if (!man) return '-';
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rem = man % 10000;
    return rem > 0 ? `${eok}억 ${rem.toLocaleString('ko-KR')}만` : `${eok}억`;
  }
  return man.toLocaleString('ko-KR') + '만';
}
function priceOf(l: NotifyListing): string {
  if (l.deal === '매매') return formatMan(l.price);
  if (l.deal === '전세') return formatMan(l.deposit);
  return `${formatMan(l.deposit)} / ${formatMan(l.monthly)}`;
}

function renderListingRow(l: NotifyListing, siteUrl: string): string {
  const url = `${siteUrl}/listings/${l.id}`;
  const badgeColor = l.deal === '전세' ? '#1565c0' : l.deal === '매매' ? '#e65100' : '#2e7d32';
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #eef1ea">
        <div style="display:inline-block;padding:3px 9px;border-radius:999px;background:${badgeColor};color:#fff;font-size:11px;font-weight:700;margin-bottom:6px">
          ${l.deal || ''}
        </div>
        <div style="font-size:15px;font-weight:700;color:#1e5a32;margin-bottom:3px">
          <a href="${url}" style="color:#1e5a32;text-decoration:none">${l.title || (l.dong || '') + ' ' + (l.type || '')}</a>
        </div>
        <div style="font-size:13px;color:#555;margin-bottom:6px">
          ${l.gu || ''} ${l.dong || ''} · ${l.type || ''}${l.area_m2 ? ` · ${l.area_m2}㎡` : ''}${l.floor_current ? ` · ${l.floor_current}층` : ''}
        </div>
        <div style="font-size:14px;font-weight:700;color:#222">
          ${priceOf(l)}
        </div>
        <a href="${url}" style="display:inline-block;margin-top:8px;padding:6px 12px;border-radius:6px;background:#4a7c23;color:#fff;text-decoration:none;font-size:12px;font-weight:600">
          상세 보기 →
        </a>
      </td>
    </tr>`;
}

// 신규 매물 매칭 알림 (복수 매물 가능)
export async function sendNewListingAlert(params: {
  to: string;
  name?: string | null;
  listings: NotifyListing[];
  unsubToken: string;
  searchLabel?: string;      // "강남구 전세 아파트 10억 이하" 등 조건 설명
}) {
  const resend = getResend();
  if (!resend) { console.warn('[Email] RESEND_API_KEY not set'); return null; }
  if (!params.listings.length) return null;

  const count = params.listings.length;
  const subject = count === 1
    ? `[WISHES] 신규 매물 알림 — ${params.listings[0].title || '매물'}`
    : `[WISHES] 신규 매물 ${count}건 알림`;

  const greeting = params.name ? `${params.name}님,` : '안녕하세요,';
  const unsubUrl = `${SITE_URL}/unsub?t=${encodeURIComponent(params.unsubToken)}`;

  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#f8faf5">
      <div style="background:linear-gradient(135deg,#2d5016,#4a7c23);color:#fff;padding:22px;border-radius:10px 10px 0 0;text-align:center">
        <div style="font-size:12px;letter-spacing:2px;opacity:0.85;margin-bottom:4px">WISHES REAL ESTATE</div>
        <h1 style="margin:0;font-size:22px;font-weight:800">신규 매물 알림</h1>
        ${params.searchLabel ? `<div style="margin-top:6px;font-size:12px;opacity:0.9">조건: ${params.searchLabel}</div>` : ''}
      </div>
      <div style="background:#fff;padding:22px;border:1px solid #e2e8d0;border-top:none;border-radius:0 0 10px 10px">
        <p style="color:#333;font-size:15px;margin:0 0 12px">${greeting}</p>
        <p style="color:#555;font-size:13px;line-height:1.6;margin:0 0 18px">
          저장하신 검색 조건에 맞는 새 매물 <strong>${count}건</strong>이 등록되었습니다. 아래 매물을 확인해보시고 관심 있는 매물은 바로 상담 신청해주세요.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
          ${params.listings.slice(0, 8).map((l) => renderListingRow(l, SITE_URL)).join('')}
        </table>
        ${count > 8 ? `<p style="font-size:12px;color:#888;margin-top:10px">외 ${count - 8}건 더 — <a href="${SITE_URL}/listings" style="color:#4a7c23">전체 보기</a></p>` : ''}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eef1ea;text-align:center">
          <a href="${SITE_URL}/listings" style="display:inline-block;padding:11px 22px;background:#2d5016;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">매물 전체 보기</a>
        </div>
      </div>
      <div style="text-align:center;color:#999;font-size:11px;padding:14px 0;line-height:1.6">
        본 메일은 WISHES 부동산 매물 알림을 구독하신 분께 발송됩니다.<br/>
        <a href="${unsubUrl}" style="color:#888;text-decoration:underline">알림 구독 해지</a> · WISHES 부동산 · wishes.co.kr
      </div>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });
    if (error) { console.error('[Email] New-listing alert failed:', error); return null; }
    console.log('[Email] New-listing alert sent to', params.to, '(id:', data?.id + ')');
    return data;
  } catch (e) { console.error('[Email] New-listing alert error:', e); return null; }
}

// 구독 확인 이메일 (opt-in 직후)
export async function sendSubscriptionConfirmed(params: {
  to: string;
  name?: string | null;
  searchLabel?: string;
  unsubToken: string;
}) {
  const resend = getResend();
  if (!resend) return null;
  const unsubUrl = `${SITE_URL}/unsub?t=${encodeURIComponent(params.unsubToken)}`;
  const greeting = params.name ? `${params.name}님,` : '안녕하세요,';
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: '[WISHES] 매물 알림 구독이 등록되었습니다',
      html: `
        <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8faf5">
          <div style="background:#2d5016;color:#fff;padding:20px;border-radius:10px 10px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px;font-weight:800">알림 구독 완료</h1>
          </div>
          <div style="background:#fff;padding:22px;border:1px solid #e2e8d0;border-top:none;border-radius:0 0 10px 10px">
            <p style="color:#333;font-size:15px">${greeting}</p>
            <p style="color:#555;font-size:14px;line-height:1.7">
              WISHES 부동산 매물 알림 구독이 정상 등록되었습니다.<br/>
              조건에 맞는 신규 매물이 등록될 때마다 이 메일로 안내드리겠습니다.
            </p>
            ${params.searchLabel ? `<div style="margin-top:14px;padding:12px 14px;background:#f4f9f4;border-left:3px solid #4a7c23;border-radius:4px"><div style="font-size:11px;color:#888;margin-bottom:4px">내 검색 조건</div><div style="font-size:13px;color:#222;font-weight:600">${params.searchLabel}</div></div>` : ''}
            <div style="text-align:center;margin-top:22px">
              <a href="${SITE_URL}/listings" style="display:inline-block;padding:11px 22px;background:#4a7c23;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">매물 검색으로 이동</a>
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;padding:14px 0">
            <a href="${unsubUrl}" style="color:#888;text-decoration:underline">알림 구독 해지</a> · wishes.co.kr
          </div>
        </div>`,
    });
    if (error) { console.error('[Email] Subscription confirm failed:', error); return null; }
    return data;
  } catch (e) { console.error('[Email] Subscription confirm error:', e); return null; }
}

// 어드민이 직접 작성한 공지/뉴스레터 발송
export async function sendAdminNewsletter(params: {
  to: string;
  name?: string | null;
  subject: string;
  body: string;              // HTML 허용
  unsubToken: string;
}) {
  const resend = getResend();
  if (!resend) return null;
  const unsubUrl = `${SITE_URL}/unsub?t=${encodeURIComponent(params.unsubToken)}`;
  const greeting = params.name ? `${params.name}님,` : '안녕하세요,';
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `[WISHES] ${params.subject}`,
      html: `
        <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#f8faf5">
          <div style="background:linear-gradient(135deg,#2d5016,#4a7c23);color:#fff;padding:20px;border-radius:10px 10px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px;font-weight:800">${params.subject}</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e2e8d0;border-top:none;border-radius:0 0 10px 10px">
            <p style="color:#333;font-size:15px;margin:0 0 14px">${greeting}</p>
            <div style="color:#444;font-size:14px;line-height:1.75">${params.body}</div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;padding:14px 0">
            WISHES 부동산 · <a href="${unsubUrl}" style="color:#888;text-decoration:underline">알림 구독 해지</a> · wishes.co.kr
          </div>
        </div>`,
    });
    if (error) { console.error('[Email] Admin newsletter failed:', error); return null; }
    return data;
  } catch (e) { console.error('[Email] Admin newsletter error:', e); return null; }
}

// 사용자 거부 시 이메일 알림
export async function notifyUserRejected(user: {
  email: string;
  name: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '[WISHES] 가입 요청 결과 안내',
      html: `
        <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8faf5;border-radius:12px">
          <div style="background:#2d5016;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px">WISHES 가입 요청 결과</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8d0">
            <p style="color:#333;font-size:15px">${user.name}님, 안녕하세요.</p>
            <p style="color:#666;font-size:14px">죄송합니다. 현재 가입 요청이 승인되지 않았습니다.</p>
            <p style="color:#666;font-size:14px">추가 문의사항이 있으시면 관리자에게 직접 연락해 주세요.</p>
          </div>
        </div>
      `,
    });
    if (error) { console.error('[Email] Rejection notification failed:', error); return null; }
    console.log('[Email] Rejection notification sent to:', user.email);
    return data;
  } catch (e) { console.error('[Email] Rejection notification error:', e); return null; }
}
