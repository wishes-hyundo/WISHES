import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Vercel Cron 또는 외부 트리거로 매일 실행
// vercel.json에 cron 설정 필요: { "crons": [{ "path": "/api/alerts/send", "schedule": "0 9 * * *" }] }
export async function GET(request: Request) {
  // 보안: Vercel Cron 또는 특정 키로만 호출 가능
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!isVercelCron && authHeader !== 'Bearer ' + cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // 1. 알림 활성화된 사용자 목록 가져오기
    const { data: alertUsers, error: alertError } = await supabase
      .from('alert_settings')
      .select('user_id, areas, types, deals, min_price, max_price')
      .eq('enabled', true);

    if (alertError || !alertUsers || alertUsers.length === 0) {
      return NextResponse.json({ message: 'No active alerts', count: 0 });
    }

    // 2. 최근 24시간 신규 매물 가져오기
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: newListings, error: listingError } = await supabase
      .from('listings')
      .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current')
      .eq('status', '공개')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false });

    if (listingError || !newListings || newListings.length === 0) {
      return NextResponse.json({ message: 'No new listings in last 24h', count: 0 });
    }

    // 3. 각 사용자별 매칭 매물 필터링
    const notifications: { user_id: string; email: string; matches: any[] }[] = [];

    for (const alert of alertUsers) {
      const matches = newListings.filter(listing => {
        // 지역 필터
        const areaMatch = !alert.areas || alert.areas.length === 0 ||
          alert.areas.some((a: string) =>
            (listing.dong || '').includes(a) || (listing.address || '').includes(a)
          );

        // 유형 필터
        const typeMatch = !alert.types || alert.types.length === 0 ||
          alert.types.includes(listing.type);

        // 거래 유형 필터
        const dealMatch = !alert.deals || alert.deals.length === 0 ||
          alert.deals.includes(listing.deal);

        // 가격 필터
        let priceMatch = true;
        const price = listing.deal === '매매' ? listing.price : listing.deposit;
        if (alert.min_price && price < alert.min_price) priceMatch = false;
        if (alert.max_price && price > alert.max_price) priceMatch = false;

        return areaMatch && typeMatch && dealMatch && priceMatch;
      });

      if (matches.length > 0) {
        // 사용자 이메일 가져오기
        const { data: userData } = await supabase.auth.admin.getUserById(alert.user_id);
        if (userData?.user?.email) {
          notifications.push({
            user_id: alert.user_id,
            email: userData.user.email,
            matches
          });
        }
      }
    }

    // 4. 알림 발송 (로그 기록 + 이메일)
    const results = [];
    for (const notif of notifications) {
      // 알림 로그 저장
      await supabase.from('alert_logs').insert({
        user_id: notif.user_id,
        listing_count: notif.matches.length,
        listing_ids: notif.matches.map(m => m.id),
        sent_at: new Date().toISOString()
      }).catch(() => {});

      // Resend API로 이메일 발송
      if (process.env.RESEND_API_KEY) {
        try {
          const listingHtml = notif.matches.slice(0, 5).map(m => {
            const price = m.deal === '매매'
              ? (m.price >= 10000 ? Math.floor(m.price/10000) + '억' : m.price + '만')
              : m.deal === '전세'
              ? '전세 ' + (m.deposit >= 10000 ? Math.floor(m.deposit/10000) + '억' : m.deposit + '만')
              : m.deposit + '/' + m.monthly;
            return `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
              <div style="font-weight:bold;color:#1a5632">${price}</div>
              <div style="font-size:14px;color:#374151">${m.title}</div>
              <div style="font-size:12px;color:#9ca3af">${m.dong} · ${m.area_m2}m² · ${m.floor_current || ''}</div>
              <a href="https://wishes.co.kr/listings/${m.id}" style="color:#2d8b5e;font-size:13px">자세히 보기 →</a>
            </div>`;
          }).join('');

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
            },
            body: JSON.stringify({
              from: 'WISHES <noreply@wishes.co.kr>',
              to: notif.email,
              subject: `[위시스] 신규 매물 ${notif.matches.length}건이 등록되었습니다`,
              html: `<div style="max-width:600px;margin:0 auto;font-family:sans-serif">
                <div style="background:#1a5632;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                  <h1 style="color:white;margin:0;font-size:24px">WISHES</h1>
                  <p style="color:rgba(255,255,255,0.7);margin:4px 0 0">서울·경기 종합부동산 서비스</p>
                </div>
                <div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none">
                  <h2 style="color:#1a5632;margin-top:0">신규 매물 알림</h2>
                  <p style="color:#6b7280">설정하신 관심 조건에 맞는 신규 매물 ${notif.matches.length}건을 찾았습니다.</p>
                  ${listingHtml}
                  ${notif.matches.length > 5 ? '<p style="color:#9ca3af;text-align:center">외 ' + (notif.matches.length - 5) + '건 더...</p>' : ''}
                  <div style="text-align:center;margin-top:20px">
                    <a href="https://wishes.co.kr/listings" style="display:inline-block;padding:12px 32px;background:#2d8b5e;color:white;border-radius:8px;text-decoration:none;font-weight:bold">전체 매물 보기</a>
                  </div>
                </div>
                <div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;border-radius:0 0 12px 12px">
                  <p>위시스부동산 | wishes@wishes.co.kr</p>
                  <a href="https://wishes.co.kr/mypage" style="color:#9ca3af">알림 설정 변경</a>
                </div>
              </div>`
            })
          });
        } catch (emailErr) {
          console.error('Email send error:', emailErr);
        }
      }

      results.push({ user_id: notif.user_id, matches: notif.matches.length });
    }

    return NextResponse.json({
      message: 'Alert notifications processed',
      total_users: alertUsers.length,
      new_listings: newListings.length,
      notifications_sent: results.length,
      details: results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}