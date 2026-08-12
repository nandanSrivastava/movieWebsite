// ── EMAIL TEMPLATES ─────────────────────────────────────────────
// Ready-to-use, branded HTML templates for transactional mail.
// Every user-supplied value MUST go through escapeHtml() before being
// interpolated — customer names and notes are attacker-controlled.

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const THEATER_NAME = 'Dhrub Cineplex';

interface TicketEmailData {
  customerName: string | null;
  bookingId: string;
  movieTitle: string;
  screenName: string;
  showDate: string;
  showTime: string;
  seats: string;
  totalAmount: number;
  qrCodeDataUrl?: string | null; // data:image/png;base64,... or null (renders token instead)
  qrToken?: string | null;
  paymentMode?: 'online' | 'cash';
}

function baseLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(THEATER_NAME)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a1024;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a1024;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#111a36;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <span style="font-size:22px;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(THEATER_NAME)}</span>
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-top:4px;">Bagaha, Bihar</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 24px;font-size:11px;color:#6b7280;border-top:1px solid rgba(255,255,255,0.06);">
              This is an automated message from ${escapeHtml(THEATER_NAME)}. Please do not reply to this email.<br/>
              © ${new Date().getFullYear()} ${escapeHtml(THEATER_NAME)}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Digital ticket confirmation — used for online (Razorpay) bookings and can
 * be reused for counter/cash sales (pass paymentMode: 'cash').
 */
export function ticketConfirmationEmail(data: TicketEmailData): string {
  const {
    customerName, bookingId, movieTitle, screenName, showDate, showTime,
    seats, totalAmount, qrCodeDataUrl, qrToken, paymentMode = 'online'
  } = data;

  const qrHtml = qrCodeDataUrl
    ? `<img src="${qrCodeDataUrl}" alt="Ticket QR code" width="180" height="180" style="display:block;margin:0 auto;border-radius:8px;background:#ffffff;padding:8px;" />`
    : qrToken
      ? `<div style="font-family:monospace;font-size:12px;color:#9ca3af;word-break:break-all;text-align:center;">${escapeHtml(qrToken)}</div>`
      : '';

  const body = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#10b981;font-weight:bold;">
        ${paymentMode === 'cash' ? 'Cash Sale Confirmed' : 'Payment Successful'}
      </div>
      <h2 style="margin:10px 0 4px;font-size:24px;line-height:1.2;">Ticket Confirmed!</h2>
      <p style="margin:0;color:#9ca3af;font-size:14px;">Hi ${escapeHtml(customerName || 'Movie Buff')}, your seats are locked in.</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1529;border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:20px;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="font-size:18px;font-weight:bold;margin-bottom:12px;">${escapeHtml(movieTitle)}</div>
          <div style="font-size:13px;color:#cbd5e1;line-height:1.9;">
            🏛️ <strong>Screen:</strong> ${escapeHtml(screenName)}<br/>
            📅 <strong>Date:</strong> ${escapeHtml(showDate)}<br/>
            🕒 <strong>Showtime:</strong> ${escapeHtml(showTime)}<br/>
            🎟️ <strong>Seats:</strong> <span style="color:#f59e0b;font-weight:bold;">${escapeHtml(seats)}</span><br/>
            💳 <strong>Mode:</strong> ${paymentMode === 'cash' ? 'Counter Cash' : 'Online (Razorpay)'}<br/>
            💰 <strong>Amount Paid:</strong> ₹${escapeHtml(totalAmount)}
          </div>
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">Show this at the entrance</div>
      ${qrHtml}
    </div>

    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:8px 0 0;">
      Booking ID: <span style="font-family:monospace;color:#cbd5e1;">${escapeHtml(bookingId)}</span>
    </p>
  `;

  return baseLayout(body);
}

/** Welcome / onboarding email — fire after successful signup. */
export function welcomeEmail(data: { customerName: string | null; email?: string | null }): string {
  const { customerName, email } = data;
  const body = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;font-weight:bold;">Welcome aboard</div>
      <h2 style="margin:10px 0 4px;font-size:24px;">Hi ${escapeHtml(customerName || 'there')}! 👋</h2>
      <p style="margin:0;color:#9ca3af;font-size:14px;">Thank you for choosing ${escapeHtml(THEATER_NAME)}.</p>
    </div>
    <p style="font-size:14px;line-height:1.8;color:#cbd5e1;">
      Your account${email ? ` (<span style="color:#cbd5e1;">${escapeHtml(email)}</span>)` : ''} is ready.
      Here's what you can expect:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#cbd5e1;line-height:1.8;">
          🎟️ <strong>Booking confirmations</strong> with your digital ticket & QR code<br/>
          📧 <strong>Transaction receipts</strong> for every purchase<br/>
          🕒 <strong>Order updates</strong> if anything changes
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://dhrubcineplex.com/" style="display:inline-block;background:#f59e0b;color:#000000;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:14px;">Browse Movies</a>
        </td>
      </tr>
    </table>
  `;
  return baseLayout(body);
}

export interface BookingEmailContext {
  customerName: string | null;
  bookingId: string;
  movieTitle: string;
  screenName: string;
  showDate: string;
  showTime: string;
  seats: string;
  totalAmount: number;
  qrCodeDataUrl?: string | null;
  qrToken?: string | null;
}

export { THEATER_NAME };
