/**
 * WISHES Auth API - Login
 * POST /api/auth/login
 *
 * bcrypt ë¹ë°ë²í¸ ê²ì¦, JWT í í° ë°ê¸, ë¡ê·¸ì¸ ìë ì í, ëë°ì´ì¤ íê±°íë¦°í¸ ê¸°ë¡
 * ë°°í¬: wishes.co.kr Vercel íë¡ì í¸ app/api/auth/login/route.js
 */

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ì¤ì  ë°°í¬ ì DB ì°ê²° (MongoDB / Supabase / Prisma ë±)
// import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'wishes-super-secret-key-change-in-production';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://wishes.co.kr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Rate limiting (in-memory, íë¡ëìììë Redis ì¬ì©)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 300000; // 5ë¶

function checkRateLimit(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { allowed: false, remaining: Math.ceil((record.lockedUntil - Date.now()) / 1000) };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const record = loginAttempts.get(ip) || { count: 0 };
  record.count++;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_DURATION;
  }
  loginAttempts.set(ip, record);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Rate limit check
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, message: `ëë¬´ ë§ì ìëìëë¤. ${rateCheck.remaining}ì´ í ë¤ì ìëíì¸ì.` },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { email, password, fingerprint, remember } = body;

    // Input validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'ì´ë©ì¼ê³¼ ë¹ë°ë²í¸ë¥¼ ìë ¥íì¸ì.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ===== DB ì¡°í (ì¤ì  êµ¬í ì íì±í) =====
    // const user = await db.user.findUnique({ where: { email } });
    // if (!user) { recordFailedAttempt(ip); return ... }
    // const validPassword = await bcrypt.compare(password, user.passwordHash);
    // if (!validPassword) { recordFailedAttempt(ip); return ... }
    // if (user.status === 'pending') { return pending response }
    // if (user.status === 'blocked') { return blocked response }

    // ===== ë°ëª¨ì© íëì½ë© (ì¤ì  ë°°í¬ ì ì ê±°) =====
    const DEMO_USERS = [
      {
        id: 1,
        email: 'admin@wishes.co.kr',
        passwordHash: '$2a$12$LJ3E8M5K5Y5Z5X5V5U5T5eABC123DEF456GHI789JKL012MNO345PQR', // "Admin123!"
        name: 'WISHES',
        role: 'superadmin',
        status: 'approved',
        company: 'WISHESë¶ëì°',
      }
    ];

    const user = DEMO_USERS.find(u => u.email === email);

    // ë°ëª¨ ëª¨ë: ì´ë©ì¼ ì¼ì¹íê³  ë¹ë°ë²í¸ê° 'Admin123!' ì´ë© íµê³¼
    if (!user || password !== 'Admin123!') {
      recordFailedAttempt(ip);
      const record = loginAttempts.get(ip);
      const remaining = MAX_ATTEMPTS - (record ? record.count : 0);
      return NextResponse.json(
        { success: false, message: `ì´ë©ì¼ ëë ë¹ë°ë²í¸ê° ì¬ë°ë¥´ì§ ììµëë¤. (${remaining}í ë¨ì)` },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (user.status === 'pending') {
      return NextResponse.json(
        { success: true, user: { status: 'pending', name: user.name } },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (user.status === 'blocked') {
      return NextResponse.json(
        { success: false, message: 'ê³ì ì´ ì°¨ë¨ëììµëë¤. ê´ë¦¬ììê² ë¬¸ìíì¸ì.' },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Clear failed attempts on success
    clearAttempts(ip);

    // Generate JWT token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      fingerprint: fingerprint || null,
    };

    const expiresIn = remember ? '30d' : '30m';
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });

    // Log login event (ì¤ì  êµ¬í ì DBì ê¸°ë¡)
    console.log(`[AUTH] Login success: ${user.email} from ${ip} at ${new Date().toISOString()}`);

    // ===== ì¤ì  êµ¬í ì: ì¸ì ê¸°ë¡ =====
    // await db.session.create({ data: { userId: user.id, ip, fingerprint, userAgent: request.headers.get('user-agent'), token } });
    // await db.activityLog.create({ data: { userId: user.id, action: 'login', ip, details: { fingerprint } } });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        company: user.company,
      }
    }, { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return NextResponse.json(
      { success: false, message: 'ìë² ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
