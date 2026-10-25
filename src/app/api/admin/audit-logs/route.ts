import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';

const MAX_LOGS = 200;

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    const logs = await db.getAuditLogs(MAX_LOGS);

    const response = NextResponse.json({ logs });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Fetch audit logs API error:', err);
    return NextResponse.json({ error: 'Could not load audit logs' }, { status: 500 });
  }
}
