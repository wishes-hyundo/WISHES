import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts } from '@/db/schema';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ìë ¥ê° ì í¨ì± ê²ì¬ ì¤í¤ë§
const contactSchema = z.object({
  name: z.string().min(1, 'ì´ë¦ì ìë ¥í´ì£¼ì¸ì'),
  phone: z.string().min(1, 'ì°ë½ì²ë¥¼ ìë ¥í´ì£¼ì¸ì'),
  email: z.string().email('ì¬ë°ë¥¸ ì´ë©ì¼ íìì´ ìëëë¤').optional().or(z.literal('')),
  message: z.string().optional(),
  listingId: z.number().nullable().optional(),
});

// POST /api/contacts - ìë´ ë¬¸ì ë±ë¡
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, phone, email, message, listingId } = parsed.data;

    const [result] = await db.insert(contacts).values({
      name,
      phone,
      email: email || null,
      message: message || null,
      listingId: listingId || null,
    }).returning();

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 201 });
  } catch (error) {
    console.error('ë¬¸ì ë±ë¡ ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ë¬¸ì ë±ë¡ì ì¤í¨íìµëë¤' },
      { status: 500 }
    );
  }
}
