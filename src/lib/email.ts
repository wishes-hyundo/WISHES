import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[WISHES] 새 사용자 가입 승인 요청 - ${user.name}`,
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2d5016 0%, #4a7c23 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">WISHES 새 가입 승인 요청</h1>
          </div>
          <div style="background: #f9faf6; padding: 24px; border: 1px solid #e0e8d0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">새로운 사용자가 가입을 요청했습니다.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px 12px; background: #eef2e6; font-weight: 600; width: 100px; border-radius: 4px 0 0 4px;">이름</td><td style="padding: 8px 12px; background: #fff; border-radius: 0 4px 4px 0;">${user.name}</td></tr>
              <tr><td style="padding: 8px 12px; background: #eef2e6; font-weight: 600; border-radius: 4px 0 0 4px;">이메일</td><td style="padding: 8px 12px; background: #fff; border-radius: 0 4px 4px 0;">${user.email}</td></tr>
              ${user.phone ? `<tr><td style="padding: 8px 12px; background: #eef2e6; font-weight: 600; border-radius: 4px 0 0 4px;">연락처</td><td style="padding: 8px 12px; background: #fff; border-radius: 0 4px 4px 0;">${user.phone}</td></tr>` : ''}
              ${user.company ? `<tr><td style="padding: 8px 12px; background: #eef2e6; font-weight: 600; border-radius: 4px 0 0 4px;">소속</td><td style="padding: 8px 12px; background: #fff; border-radius: 0 4px 4px 0;">${user.company}</td></tr>` : ''}
              ${user.reason ? `<tr><td style="padding: 8px 12px; background: #eef2e6; font-weight: 600; border-radius: 4px 0 0 4px;">사유</td><td style="padding: 8px 12px; background: #fff; border-radius: 0 4px 4px 0;">${user.reason}</td></tr>` : ''}
            </table>
            <a href="${SITE_URL}/admin/command-center.html" style="display: inline-block; background: #4a7c23; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">Command Center에서 승인하기</a>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('[Email] Admin notification failed:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[Email] Admin notification error:', e);
    return null;
  }
}

// 사용자 승인 시 해당 사용자에게 알림
export async function notifyUserApproved(user: {
  email: string;
  name?: string;
  role?: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '[WISHES] 계정이 승인되었습니다',
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2d5016 0%, #4a7c23 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">WISHES 계정 승인 완료</h1>
          </div>
          <div style="background: #f9faf6; padding: 24px; border: 1px solid #e0e8d0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">${user.name || ''}님, 안녕하세요!</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">WISHES 관리자 계정이 <strong style="color: #4a7c23;">승인</strong>되었습니다.</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">이제 아래 버튼을 클릭하여 로그인하실 수 있습니다.</p>
            ${user.role ? `<p style="color: #666; font-size: 14px;">승인된 직책: <strong>${user.role === 'agent' ? '중개사' : user.role === 'admin' ? '관리자' : user.role}</strong></p>` : ''}
            <a href="${SITE_URL}/admin/admin-auth.html" style="display: inline-block; background: #4a7c23; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">로그인하기</a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 16px; text-align: center;">WISHES - 서울 경기 종합부동산 서비스</p>
        </div>
      `,
    });

    if (error) {
      console.error('[Email] User approval notification failed:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[Email] User approval notification error:', e);
    return null;
  }
}

// 사용자 거부 시 해당 사용자에게 알림
export async function notifyUserRejected(user: {
  email: string;
  name?: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '[WISHES] 계정 승인 결과 안내',
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #8b4513 0%, #a0522d 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">WISHES 계정 승인 결과</h1>
          </div>
          <div style="background: #faf6f2; padding: 24px; border: 1px solid #e8d8c8; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">${user.name || ''}님, 안녕하세요.</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">죄송합니다. 현재 계정 승인이 보류되었습니다.</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">문의사항이 있으시면 관리자에게 연락해주세요.</p>
            <p style="color: #666; font-size: 14px; margin-top: 16px;">문의: wishes@wishes.co.kr</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 16px; text-align: center;">WISHES - 서울 경기 종합부동산 서비스</p>
        </div>
      `,
    });

    if (error) {
      console.error('[Email] User rejection notification failed:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[Email] User rejection notification error:', e);
    return null;
  }
}
