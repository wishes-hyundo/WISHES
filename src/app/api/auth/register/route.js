/**
 * WISHES Auth API - Register
 * POST /api/auth/register
 *
 * íìê°ì ì ì²­ â pending ìíë¡ ì ì¥ â ê´ë¦¬ì ì¹ì¸ ëê¸°
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://wishes.co.kr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Rate limit: ê°ì IPìì 1ìê°ì 3íë§ ê°ì ê°ë¥
const regAttempts = new Map();

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    // Rate limit
    const now = Date.now();
    const record = regAttempts.get(ip) || { count: 0, resetAt: now + 3600000 };
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + 3600000; }
    if (record.count >= 3) {
      return NextResponse.json(
        { success: false, message: 'ê°ì ìë íìë¥¼ ì´ê³¼íìµëë¤. 1ìê° í ë¤ì ìëíì¸ì.' },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { name, email, password, phone, company, role, reason, fingerprint, userAgent } = body;

    // Validation
    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, message: 'ì´ë¦ì 2ì ì´ì ìë ¥íì¸ì.' }, { status: 400, headers: CORS_HEADERS });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, message: 'ì¬ë°ë¥¸ ì´ë©ì¼ì ìë ¥íì¸ì.' }, { status: 400, headers: CORS_HEADERS });
    }
    if (!password || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return NextResponse.json({ success: false, message: 'ë¹ë°ë²í¸ë 8ì ì´ì, ìë¬¸+ì«ì+í¹ìë¬¸ìë¥¼ í¬í¨í´ì¼ í©ëë¤.' }, { status: 400, headers: CORS_HEADERS });
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: 'ì°ë½ì²ë¥¼ ìë ¥íì¸ì.' }, { status: 400, headers: CORS_HEADERS });
    }

    // ===== ì¤ì  êµ¬í ì: ì¤ë³µ ì´ë©ì¼ íì¸ =====
    // const existing = await db.user.findUnique({ where: { email } });
    // if (existing) return NextResponse.json({ success: false, message: 'ì´ë¯¸ ë±ë¡ë ì´ë©ì¼ìëë¤.' }, ...);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // ===== ì¤ì  êµ¬í ì: DBì ì ì¥ =====
    // await db.user.create({
    //   data: {
    //     name, email, passwordHash, phone, company, role,
    //     reason, fingerprint, userAgent,
    //     status: 'pending', // ê´ë¦¬ì ì¹ì¸ ëê¸°
    //     ip,
    //     createdAt: new Date(),
    //   }
    // });

    // Log registration
    console.log(`[AUTH] New registration: ${email} (${name}) from ${ip} at ${new Date().toISOString()}`);

    // ===== ì¤ì  êµ¬í ì: ê´ë¦¬ììê² ìë¦¼ ë°ì¡ =====
    // await sendAdminNotification({ type: 'new_registration', user: { name, email, company, role, reason } });

    record.count++;
    regAttempts.set(ip, record);

    return NextResponse.json({
      success: true,
      message: 'ê°ì ì ì²­ì´ ìë£ëììµëë¤. ê´ë¦¬ì ì¹ì¸ í ì´ì© ê°ë¥í©ëë¤.'
    }, { status: 201, headers: CORS_HEADERS });

  } catch (error) {
    console.error('[AUTH] Register error:', error);
    return NextResponse.json(
      { success: false, message: 'ìë² ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
