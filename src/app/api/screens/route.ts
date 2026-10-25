import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const screens = await db.getScreens();
    return NextResponse.json({ screens });
  } catch (err) {
    console.error('Fetch screens API error:', err);
    return NextResponse.json({ error: 'Could not load screens' }, { status: 500 });
  }
}
