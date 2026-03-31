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
export async function notifyAdminNewRegistration(user: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  reason?: string;
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
