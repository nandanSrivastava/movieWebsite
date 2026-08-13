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
    ? `<img src="${qrCodeDataUrl}" alt="Ticket QR code" width="140" height="140" style="display:block; margin: 0 auto; border-radius:8px;" />`
    : qrToken
      ? `<div style="width:140px;height:140px;color:#000;text-align:center;font-size:11px;word-break:break-all;margin: 0 auto;display:table-cell;vertical-align:middle;">${escapeHtml(qrToken)}</div>`
      : `<div style="width:140px;height:140px;background:#eee;margin:0 auto;border-radius:8px;"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(THEATER_NAME)} Ticket</title>
  <style>
    @media only screen and (max-width: 700px) {
      .ticket-row { display: block !important; width: 100% !important; }
      .ticket-main { display: block !important; width: 100% !important; border-right: none !important; padding: 20px 10px !important; }
      .ticket-stub { display: block !important; width: 100% !important; border-top: 2px dashed #d4af37 !important; padding: 20px 10px !important; }
      .stack-mobile { display: block !important; width: 100% !important; margin-bottom: 15px !important; }
      .hide-mobile { display: none !important; }
      .main-title { font-size: 32px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:30px 15px;">
    <tr>
      <td align="center">
        <!-- Ticket Wrapper -->
        <table role="presentation" width="100%" style="max-width:850px;background-color:#0f172a;border-radius:16px;border:2px solid #d4af37;overflow:hidden;" cellpadding="0" cellspacing="0">
          <tr class="ticket-row">
            <!-- Main Ticket -->
            <td class="ticket-main" width="72%" style="padding: 40px; border-right: 2px dashed #d4af37; vertical-align: top;">
                
               <!-- Top Section -->
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                 <tr>
                   <td align="center">
                     <h1 class="main-title" style="color:#d4af37; font-size: 46px; margin:0; letter-spacing: 4px; text-transform: uppercase;">DHRUB CINEPLEX</h1>
                     <p style="color:#d4af37; font-size: 15px; margin: 8px 0 20px 0; letter-spacing: 5px; text-transform: uppercase;">Experience the epic tale</p>
                     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                       <tr>
                         <td width="45%" style="border-bottom: 1px solid #d4af37;"></td>
                         <td width="10%" align="center" style="color: #d4af37; font-size: 16px;">★</td>
                         <td width="45%" style="border-bottom: 1px solid #d4af37;"></td>
                       </tr>
                     </table>
                   </td>
                 </tr>
               </table>

               <!-- Info Section -->
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 25px;">
                 <tr>
                   <td class="stack-mobile" width="33%" align="center" style="vertical-align: top; padding: 10px;">
                     <div style="color:#d4af37; font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 10px;">🎬 MOVIE</div>
                     <div style="color:#ffffff; font-size: 20px; font-weight: bold; text-transform: uppercase; line-height: 1.3;">${escapeHtml(movieTitle)}</div>
                   </td>
                   <td class="stack-mobile" width="33%" align="center" style="vertical-align: top; padding: 10px;">
                     <div style="color:#d4af37; font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 10px;">📅 DATE</div>
                     <div style="background-color:#d4af37; color:#0f172a; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">${escapeHtml(showDate)}</div>
                   </td>
                   <td class="stack-mobile" width="33%" align="center" style="vertical-align: top; padding: 10px;">
                     <div style="color:#d4af37; font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 10px;">🕒 TIME</div>
                     <div style="color:#ffffff; font-size: 20px; font-weight: bold;">${escapeHtml(showTime)}</div>
                   </td>
                 </tr>
               </table>

               <!-- Seat Section -->
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 35px;">
                 <tr>
                   <td align="center">
                     <table role="presentation" cellpadding="0" cellspacing="0" style="border: 2px solid #d4af37; border-radius: 12px; display: inline-block; margin: 0 auto;">
                       <tr>
                         <td style="padding: 15px 15px 15px 25px;">
                           <span style="color:#d4af37; font-size: 20px; font-weight: bold;">SEAT NO.</span>
                         </td>
                         <td style="padding: 15px 15px 15px 5px;">
                           <div style="background-color:#d4af37; color:#0f172a; padding: 8px 18px; border-radius: 6px; font-weight: bold; font-size: 20px;">${escapeHtml(seats)}</div>
                         </td>
                         <td style="padding: 15px;">
                           <div style="border-left: 1px solid #d4af37; height: 35px;"></div>
                         </td>
                         <td style="padding: 15px 15px 15px 5px;">
                           <span style="color:#d4af37; font-size: 22px; font-weight: bold; text-transform: uppercase;">${escapeHtml(screenName)}</span>
                         </td>
                         <td style="padding: 15px 25px 15px 15px;">
                           <span style="color:#d4af37; font-size: 20px; font-weight: bold;">Rs ${escapeHtml(totalAmount)}/-</span>
                         </td>
                       </tr>
                     </table>
                   </td>
                 </tr>
               </table>

               <!-- Bottom Footer -->
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 35px;">
                 <tr>
                   <td align="center">
                     <div style="color:#d4af37; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px;">★ THANKYOU FOR CHOOSING DHRUB CINEPLEX BAGAHA ★</div>
                     <table role="presentation" cellpadding="0" cellspacing="0" style="border: 1px solid #d4af37; border-radius: 20px; display: inline-block; margin: 0 auto;">
                        <tr>
                          <td style="padding: 12px 25px;">
                            <span style="color:#ffffff; font-size: 15px;">📸 @dhrubcineplex <span style="color:#d4af37; margin: 0 10px;">|</span> Follow us on Instagram for more details</span>
                          </td>
                        </tr>
                     </table>
                   </td>
                 </tr>
               </table>

            </td>

            <!-- Stub Ticket -->
            <td class="ticket-stub" width="28%" style="padding: 40px 20px; vertical-align: top; text-align: center; background-color: #0f172a;">
               <h2 style="color:#d4af37; font-size: 28px; margin:0; letter-spacing: 2px; text-transform: uppercase; line-height: 1.2;">DHRUB<br/>CINEPLEX</h2>
               
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                 <tr>
                   <td width="35%" style="border-bottom: 1px solid #d4af37;"></td>
                   <td width="30%" align="center" style="color: #d4af37; font-size: 16px;">★</td>
                   <td width="35%" style="border-bottom: 1px solid #d4af37;"></td>
                 </tr>
               </table>

               <p style="color:#d4af37; font-size: 16px; margin: 20px 0; letter-spacing: 2px;">★ SCAN QR ★</p>
               
               <!-- QR Code -->
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                 <tr>
                   <td align="center">
                     <div style="background-color:#ffffff; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 15px;">
                       ${qrHtml}
                     </div>
                   </td>
                 </tr>
               </table>

               <p style="color:#ec4899; font-size: 16px; font-weight: bold; margin: 10px 0; letter-spacing: 1px;">@DHRUBCINEPLEX</p>
               <p style="color:#d4af37; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 25px; margin-bottom: 10px;">EXPERIENCE THE EPIC TALE</p>
               <div style="color:#d4af37; font-size: 16px;">★</div>
               
               <div style="margin-top:20px; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:1px;">Booking ID</div>
               <div style="font-family:monospace; color:#94a3b8; font-size:13px; margin-top:4px;">${escapeHtml(bookingId)}</div>
            </td>
          </tr>
        </table>
        
        <!-- Email Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:850px; margin-top: 20px;">
          <tr>
            <td align="center" style="padding:16px 24px 24px;font-size:12px;color:#475569;border-top:1px solid rgba(255,255,255,0.06);">
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
