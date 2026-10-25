import { NextRequest, NextResponse } from 'next/server';
import { generateQRCodeDataUrl } from '@/features/shared/utils/qr';

// Ticket tokens look like tkt_<booking id>_<hex> (or tkt_cash_...). Anything
// else is refused before doing any work: QR generation costs real CPU, and
// this endpoint is public.
const TOKEN_RE = /^tkt_[A-Za-z0-9_-]{6,96}$/;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid ticket token' }, { status: 400 });
  }

  try {
    const qrCode = await generateQRCodeDataUrl(token);
    // The same token always gives the same image
    return NextResponse.json({ qrCode }, { headers: { 'Cache-Control': 'private, max-age=86400, immutable' } });
  } catch (err) {
    console.error('QR API error:', err);
    return NextResponse.json({ error: 'Could not generate the QR code' }, { status: 500 });
  }
}
