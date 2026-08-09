import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get('host');
  const origin = req.headers.get('origin');

  // 1. CORS / CSRF Origin Guard for APIs
  if (path.startsWith('/api')) {
    // Webhook endpoint handles cross-origin POSTs from Razorpay.
    // Razorpay signature is verified cryptographically in the endpoint route, so we skip CORS for it.
    if (origin && !path.startsWith('/api/checkout/webhook')) {
      try {
        const originUrl = new URL(origin);
        const hostHeader = host || req.nextUrl.host;
        
        const isAllowed = 
          originUrl.host === hostHeader || 
          originUrl.host.startsWith('localhost:') || 
          originUrl.protocol === 'capacitor:';
          
        if (!isAllowed) {
          return new NextResponse(
            JSON.stringify({ error: 'Access Denied: CORS policy violation.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: 'Access Denied: Invalid request origin.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  // 2. Role-based Auth Route Guards (for /admin and /counter paths)
  if (path.startsWith('/admin') || path.startsWith('/counter')) {
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      // ── MOCK MODE SECURITY GUARD ──────────────────────────────
      const mockSession = req.cookies.get('cinebook_mock_session');
      
      if (!mockSession) {
        return NextResponse.redirect(new URL('/login', req.url));
      }

      try {
        const sessionObj = JSON.parse(mockSession.value);
        const role = sessionObj.role;

        if (path.startsWith('/admin') && role !== 'admin') {
          return NextResponse.redirect(new URL('/login?error=unauthorized', req.url));
        }
        
        if (path.startsWith('/counter') && !['admin', 'member'].includes(role)) {
          return NextResponse.redirect(new URL('/login?error=unauthorized', req.url));
        }
      } catch {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    } else {
      // ── LIVE MODE SECURITY GUARD ──────────────────────────────
      // Checks for the existence of Supabase project auth cookies.
      const cookies = req.cookies.getAll();
      const hasSbCookie = cookies.some(c => c.name.startsWith('sb-'));
      
      if (!hasSbCookie) {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/counter/:path*', '/api/:path*']
};
