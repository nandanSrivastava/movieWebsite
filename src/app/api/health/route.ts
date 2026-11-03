import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Liveness probe, and the server's clock for browsers whose own is wrong.
// Deliberately cheap: no DB call, no auth, and excluded from the proxy matcher
// (src/proxy.ts). Rendered per request so `time` is always current, and never cached.
//
// Uptime monitors should use ?deep=1, which also proves the database answers.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const time = new Date().toISOString();
  if (req.nextUrl.searchParams.get('deep') !== '1') {
    return NextResponse.json({ ok: true, time }, { headers: NO_STORE });
  }
  try {
    await db.getScreens();
    return NextResponse.json({ ok: true, database: true, time }, { headers: NO_STORE });
  } catch (err) {
    console.error('Health check: database unreachable', err);
    return NextResponse.json({ ok: false, database: false, time }, { status: 503, headers: NO_STORE });
  }
}
