import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { ticketConfirmationEmail } from '@/lib/email/templates';
import { createClient } from '@supabase/supabase-js';

// Strip whitespace from SMTP_PASS (e.g. Gmail App Passwords formatted as "xxxx xxxx xxxx xxxx")
const getSmtpPass = () => process.env.SMTP_PASS?.replace(/\s+/g, '') || '';

// SMTP is only considered configured when host, user AND pass are present.
export const isEmailConfigured = (): boolean =>
  !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!getSmtpPass();

const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

// Build lazily so importing this module never throws in dev without SMTP vars.
const getTransporter = () => {
  const pass = getSmtpPass();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for 587/25 (STARTTLS)
    auth: process.env.SMTP_USER && pass
      ? { user: process.env.SMTP_USER, pass }
      : undefined,
  });
};

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}

export const sendEmail = async ({ to, subject, html, text, attachments }: SendEmailParams) => {
  try {
    if (!isEmailConfigured()) {
      console.warn('sendEmail skipped: SMTP_* env vars are not configured.');
      return { success: false, skipped: true };
    }
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"Dhrub Cineplex" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
      attachments,
    });
    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};

/**
 * Sends a branded digital ticket email for a confirmed booking.
 * Can be safely called from verify-payment API or Webhooks.
 */
export async function sendBookingTicketEmail(bookingId: string) {
  try {
    if (!isEmailConfigured()) {
      console.warn('sendBookingTicketEmail skipped: SMTP not configured.');
      return { success: false, skipped: true };
    }

    const booking = await db.getBookingById(bookingId);
    if (!booking) {
      console.error(`sendBookingTicketEmail failed: Booking ${bookingId} not found`);
      return { success: false, error: 'Booking not found' };
    }

    let customerEmail: string | null = booking.customer_email || null;

    const isSupabaseConfigured =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!customerEmail && isSupabaseConfigured && booking.booked_by) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: userData } = await supabase.auth.admin.getUserById(booking.booked_by);
        if (userData?.user?.email) {
          customerEmail = userData.user.email;
        }
      } catch (authErr) {
        console.warn('Could not fetch user email from auth admin:', authErr);
      }
    }

    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      console.warn(`sendBookingTicketEmail skipped: No valid email address for booking ${bookingId}`);
      return { success: false, skipped: true, reason: 'No valid email address' };
    }

    const seatsStr = booking.booking_seats
      ?.map((bs: any) => `${bs.seat_layout?.row_label || ''}-${bs.seat_layout?.seat_number || ''}`)
      .join(', ') || 'N/A';

    let qrCodeDataUrl: string | null = null;
    const attachments: any[] = [];
    const qrToken = booking.qr_code_token || booking.id;

    if (qrToken) {
      try {
        const { generateQRCodeDataUrl } = await import('@/features/shared/utils/qr');
        const base64Data = await generateQRCodeDataUrl(qrToken);
        if (base64Data && base64Data.includes('base64,')) {
          const buffer = Buffer.from(base64Data.split('base64,')[1], 'base64');
          attachments.push({
            filename: 'ticket-qr.png',
            content: buffer,
            cid: 'qrcode@dhrubcineplex'
          });
          qrCodeDataUrl = 'cid:qrcode@dhrubcineplex';
        }
      } catch (qrErr) {
        console.error('Failed to generate QR code data URL for email:', qrErr);
      }
    }

    const ctx = {
      customerName: booking.customer_name,
      bookingId: booking.id,
      movieTitle: booking.show?.movie?.title || 'Movie',
      screenName: booking.show?.screen?.name || 'Standard Screen',
      showDate: booking.show?.show_date || '—',
      showTime: booking.show?.show_time || '—',
      seats: seatsStr,
      totalAmount: Number(booking.total_amount),
      qrCodeDataUrl,
      qrToken: booking.qr_code_token || booking.id,
    };

    const html = ticketConfirmationEmail(ctx);
    return await sendEmail({
      to: customerEmail,
      subject: `Dhrub Cineplex — Ticket Confirmed (${ctx.movieTitle})`,
      html,
      attachments,
    });
  } catch (err) {
    console.error('sendBookingTicketEmail error:', err);
    return { success: false, error: err };
  }
}

