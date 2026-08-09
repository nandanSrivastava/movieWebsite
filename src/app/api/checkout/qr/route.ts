import { NextRequest, NextResponse } from 'next/server';
import { generateQRCodeDataUrl } from '@/features/shared/utils/qr';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    const qrCode = await generateQRCodeDataUrl(token);

    return NextResponse.json({ qrCode });
  } catch (err: any) {
    console.error('QR API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
