import { NextResponse } from 'next/server';

// Liveness probe for uptime monitors. Deliberately cheap: no DB call, no
// auth, and excluded from the proxy matcher (src/proxy.ts).
// Rendered per request so `time` is always current, and never cached.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { ok: true, time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
