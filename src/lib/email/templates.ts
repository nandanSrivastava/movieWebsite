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

  const formattedMovie = (movieTitle || 'BAHUBALI').toUpperCase();
  const formattedDate = (showDate || 'SUN, AUG 16, 2026').toUpperCase();
  const formattedTime = (showTime || '01:30 PM').toUpperCase();
  const formattedSeats = seats || 'N/A';

  const tokenToEncode = qrToken || bookingId;
  const qrImageSrc = (qrCodeDataUrl && (qrCodeDataUrl.startsWith('http') || qrCodeDataUrl.startsWith('cid:')))
    ? qrCodeDataUrl
    : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(tokenToEncode)}`;

  const qrHtml = `<img src="${qrImageSrc}" alt="Ticket QR code" width="130" height="130" style="display:block; margin:0 auto; border-radius:6px; border:0; outline:none; background-color:#ffffff;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(THEATER_NAME)} Digital Gold Ticket</title>
  <style>
    @media only screen and (max-width: 680px) {
      .ticket-wrapper-table { width: 100% !important; }
      .ticket-col-main { display: block !important; width: 100% !important; border-right: none !important; border-bottom: 2px dashed #E2C275 !important; box-sizing: border-box !important; padding: 20px 14px !important; }
      .ticket-col-stub { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 20px 14px !important; }
      .mobile-center { text-align: center !important; }
      .mobile-stack-grid { display: block !important; width: 100% !important; margin-bottom: 12px !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#030712;font-family:'Georgia','Times New Roman',serif,Arial;color:#F5D77F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#030712;padding:24px 10px;">
    <tr>
      <td align="center">

        <!-- MAIN LUXURY GOLD PASS CONTAINER -->
        <table role="presentation" class="ticket-wrapper-table" width="820" cellpadding="0" cellspacing="0" style="width:820px;max-width:100%;background:radial-gradient(ellipse at 40% 30%, #0E1624 0%, #080C14 70%, #04060B 100%);background-color:#080C14;border-radius:24px;border:2.5px solid #E2C275;overflow:hidden;box-shadow:0 25px 70px rgba(0,0,0,0.95);">
          <tr>
            
            <!-- LEFT MAIN PASS BODY -->
            <td class="ticket-col-main" width="580" style="width:580px;padding:28px 32px 24px 32px;vertical-align:top;border-right:2.5px dashed #E2C275;">
              
              <!-- BRAND HEADER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:middle;">
                          <!-- GOLD EMBLEM -->
                          <div style="font-size:36px;line-height:1;color:#F5D77F;">💫</div>
                        </td>
                        <td style="text-align:left;vertical-align:middle;">
                          <div style="font-size:36px;font-weight:900;letter-spacing:3px;color:#F5D77F;line-height:1;text-transform:uppercase;font-family:'Times New Roman',serif;">DHRUB</div>
                          <div style="font-size:18px;font-weight:700;letter-spacing:7px;color:#E2C275;line-height:1;margin-top:4px;text-transform:uppercase;">CINEPLEX</div>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="font-size:10px;color:#F5D77F;letter-spacing:4px;text-transform:uppercase;margin:8px 0 10px 0;font-weight:bold;">
                      EXPERIENCE THE EPIC TALE
                    </div>

                    <!-- Star Divider Line -->
                    <table role="presentation" width="90%" cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto;">
                      <tr>
                        <td width="45%" style="border-bottom:1px solid #E2C275;height:1px;"></td>
                        <td width="10%" align="center" style="color:#F5D77F;font-size:12px;padding:0 6px;">★</td>
                        <td width="45%" style="border-bottom:1px solid #E2C275;height:1px;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SHOW COORDINATES (MOVIE | DATE | TIME) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                <tr>
                  <!-- Movie Column -->
                  <td class="mobile-stack-grid" width="40%" style="vertical-align:middle;padding:4px;">
                    <div style="font-size:10px;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">🎬 MOVIE</div>
                    <div style="font-size:16px;color:#FFFFFF;font-weight:bold;text-transform:uppercase;margin-top:2px;letter-spacing:0.5px;">${escapeHtml(formattedMovie)}</div>
                  </td>

                  <!-- Date Column -->
                  <td class="mobile-stack-grid" width="35%" align="center" style="vertical-align:middle;padding:4px;border-left:1px solid rgba(226,194,117,0.3);border-right:1px solid rgba(226,194,117,0.3);">
                    <div style="font-size:10px;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;margin-bottom:4px;">📅 DATE</div>
                    <div style="background:linear-gradient(135deg, #FBE097 0%, #E3BA5E 50%, #BD8C28 100%);background-color:#E3BA5E;color:#080C14;padding:4px 14px;border-radius:16px;font-weight:bold;font-size:13px;display:inline-block;">
                      ${escapeHtml(formattedDate)}
                    </div>
                  </td>

                  <!-- Time Column -->
                  <td class="mobile-stack-grid" width="25%" align="right" style="vertical-align:middle;padding:4px;">
                    <div style="font-size:10px;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">🕒 TIME</div>
                    <div style="font-size:16px;color:#FFFFFF;font-weight:bold;text-transform:uppercase;margin-top:2px;">${escapeHtml(formattedTime)}</div>
                  </td>
                </tr>
              </table>

              <!-- SEAT & PRICE CAPSULE BOX -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1.8px solid #E2C275;border-radius:14px;background-color:rgba(226,194,117,0.04);margin-bottom:18px;">
                <tr>
                  <td style="padding:10px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <span style="font-size:13px;font-weight:bold;color:#F5D77F;letter-spacing:1.5px;text-transform:uppercase;">SEAT NO.</span>
                          <span style="background:linear-gradient(135deg, #FBE097 0%, #E3BA5E 50%, #BD8C28 100%);background-color:#E3BA5E;color:#080C14;padding:4px 12px;border-radius:12px;font-weight:bold;font-size:14px;margin-left:8px;display:inline-block;">
                            ${escapeHtml(formattedSeats)}
                          </span>
                        </td>
                        <td align="center" style="vertical-align:middle;border-left:1px solid rgba(226,194,117,0.4);border-right:1px solid rgba(226,194,117,0.4);padding:0 12px;">
                          <span style="font-size:14px;font-weight:bold;color:#FFFFFF;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(screenName)}</span>
                        </td>
                        <td align="right" style="vertical-align:middle;">
                          <span style="font-size:16px;font-weight:bold;color:#F5D77F;">Rs ${escapeHtml(totalAmount)}/-</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- FOOTER & INSTAGRAM HANDLE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="font-size:10px;font-weight:bold;color:#F5D77F;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">
                      ★ THANKYOU FOR CHOOSING DHRUB CINEPLEX BAGAHA ★
                    </div>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1.2px solid rgba(226,194,117,0.6);border-radius:24px;background-color:rgba(4,6,11,0.6);margin:0 auto;">
                      <tr>
                        <td style="padding:6px 16px;font-size:11px;color:#FFFFFF;font-weight:bold;">
                          📸 @dhrubcineplex <span style="color:#E2C275;margin:0 6px;">│</span> <span style="color:#9CA3AF;font-weight:normal;">Follow us on Instagram for more details</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>

            <!-- RIGHT VERIFICATION STUB -->
            <td class="ticket-col-stub" width="240" style="width:240px;padding:28px 18px;vertical-align:top;text-align:center;background-color:rgba(0,0,0,0.25);">
              
              <div style="font-size:28px;line-height:1;color:#F5D77F;margin-bottom:4px;">💫</div>
              <div style="font-size:18px;font-weight:bold;color:#F5D77F;letter-spacing:2px;text-transform:uppercase;">DHRUB</div>
              <div style="font-size:10px;color:#F5D77F;letter-spacing:3px;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">CINEPLEX</div>

              <div style="font-size:11px;color:#F5D77F;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:8px 0;">★ SCAN QR ★</div>

              <!-- QR CODE CARD -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background-color:#FFFFFF;padding:8px;border-radius:14px;border:2px solid #E2C275;display:inline-block;margin-bottom:8px;box-shadow:0 6px 20px rgba(0,0,0,0.5);">
                      ${qrHtml}
                    </div>
                  </td>
                </tr>
              </table>

              <div style="font-size:11px;color:#E50914;font-weight:bold;letter-spacing:0.5px;">@DHRUBCINEPLEX</div>
              <div style="font-size:9px;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;margin-top:14px;">EXPERIENCE THE EPIC TALE</div>
              <div style="font-size:12px;color:#F5D77F;margin-top:2px;">★</div>

              <div style="margin-top:10px;font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:1px;">Booking Ref ID</div>
              <div style="font-family:monospace;color:#94A3B8;font-size:11px;margin-top:2px;word-break:break-all;">${escapeHtml(bookingId)}</div>

            </td>
          </tr>
        </table>

        <!-- EMAIL FOOTER -->
        <table role="presentation" width="820" style="width:820px;max-width:100%;margin-top:16px;" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="font-size:11px;color:#64748B;padding:12px 0;">
              This is an automated ticket confirmation from ${escapeHtml(THEATER_NAME)}. Please present this pass or QR code at entry.<br/>
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
