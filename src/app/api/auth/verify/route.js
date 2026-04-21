/**
 * WISHES Auth API - Verify Token
 * POST /api/auth/verify
 *
 * JWT í í° ê²ì¦ + ì¬ì©ì ìí íì¸
 */

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'wishes-super-secret-key-change-in-production';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://wishes.co.kr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ valid: false, message: 'ì¸ì¦ í í°ì´ ììµëë¤.' }, { status: 401, headers: CORS_HEADERS });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return NextResponse.json({ valid: false, message: 'í í°ì´ ë§ë£ëìê±°ë ì í¨íì§ ììµëë¤.' }, { status: 401, headers: CORS_HEADERS });
    }

    // ===== ì¤ì  êµ¬í ì: DBìì ì¬ì©ì ìí ì¬íì¸ =====
    // const user = await db.user.findUnique({ where: { id: decoded.userId } });
    // if (!user || user.status === 'blocked') return NextResponse.json({ valid: false }, ...);

    return NextResponse.json({
      valid: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        status: 'approved',
      }
    }, { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error('[AUTH] Verify error:', error);
    return NextResponse.json({ valid: false, message: 'ìë² ì¤ë¥' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
