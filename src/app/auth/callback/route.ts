import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeRedirectPath } from '@/features/auth/utils/safeRedirect';

const EMAIL_OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

// Handles links emailed by Supabase Auth (signup confirmation, password reset).
// Turns the link into a session cookie, then redirects to ?next= — the
// reset-password page when the link came from a reset.
//
// Two link shapes are accepted:
//  - ?code=…  (default templates, PKCE). The code verifier cookie was set by
//    the browser client that requested the email, so this only works in that
//    same browser.
//  - ?token_hash=…&type=…  (custom templates using {{ .TokenHash }}). Works on
//    any device, e.g. when the email is opened in a phone's mail app.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type') as EmailOtpType | null;

  // Supabase sends ?error_code=otp_expired etc. when the link itself was rejected.
  if (searchParams.get('error_code') || searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const hasTokenHash = !!tokenHash && !!otpType && EMAIL_OTP_TYPES.includes(otpType);
  if (!code && !hasTokenHash) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Guard against open redirects: same-origin paths only.
  const safeNext = safeRedirectPath(searchParams.get('next'), origin, '/');
  const response = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: otpType!, token_hash: tokenHash! });

  if (error) {
    console.error('[auth/callback] Email link sign-in failed:', error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  return response;
}
