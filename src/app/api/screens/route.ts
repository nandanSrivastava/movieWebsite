import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const screens = await db.getScreens();
    return NextResponse.json({ screens });
  } catch (err: any) {
    console.error('Fetch screens API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
