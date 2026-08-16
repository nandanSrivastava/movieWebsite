import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const allBookings = await db.getBookings();
    
    // Return recent paid/confirmed bookings sorted by newest first
    const confirmed = allBookings
      .filter((b: any) => ['paid', 'confirmed'].includes((b.payment_status || '').toLowerCase()))
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 30);

    return NextResponse.json({ bookings: confirmed });
  } catch (err: any) {
    console.error('Error fetching counter bookings:', err);
    return NextResponse.json({ error: err.message || 'Failed to load bookings' }, { status: 500 });
  }
}
