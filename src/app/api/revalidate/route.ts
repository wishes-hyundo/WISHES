import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path, secret } = body;

    const revalidateSecret = process.env.REVALIDATE_SECRET || 'wishes-revalidate-2024';
    if (secret !== revalidateSecret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    revalidatePath(path);

    if (path.startsWith('/listings/')) {
      revalidatePath('/listings');
    }

    return NextResponse.json({
      revalidated: true,
      path,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revalidate' },
      { status: 500 }
    );
  }
}
