import 'server-only';
import nodemailer, { Transporter } from 'nodemailer';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { ticketConfirmationEmail, ticketLookupEmail } from '@/lib/email/templates';
import { createClient } from '@supabase/supabase-js';
import { ticketUrl } from '@/lib/siteUrl';
import type { Booking } from '@/lib/types';

// Strip whitespace from SMTP_PASS (e.g. Gmail App Passwords formatted as "xxxx xxxx xxxx xxxx")
const getSmtpPass = () => process.env.SMTP_PASS?.replace(/\s+/g, '') || '';

// SMTP is only considered configured when host, user AND pass are present.
export const isEmailConfigured = (): boolean =>
  !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!getSmtpPass();

const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One transporter per server instance. Short timeouts so a slow mail server
// can't hold a request (or the after-response work) open for minutes.
let transporter: Transporter | null = null;
const getTransporter = () => {
  if (!transporter) {
    const pass = getSmtpPass();
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for 587/25 (STARTTLS)
      auth: process.env.SMTP_USER && pass ? { user: process.env.SMTP_USER, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
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
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || `"Dhrub Cineplex" <${process.env.SMTP_USER}>`,
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

const formatSeats = (booking: Booking) =>
  booking.booking_seats
    ?.map((bs: any) => `${bs.seat_layout?.row_label || ''}-${bs.seat_layout?.seat_number || ''}`)
    .join(', ') || 'N/A';

async function resolveCustomerEmail(booking: Booking): Promise<string | null> {
  if (booking.customer_email && EMAIL_RE.test(booking.customer_email)) return booking.customer_email;
  if (!booking.booked_by || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.auth.admin.getUserById(booking.booked_by);
    return data?.user?.email && EMAIL_RE.test(data.user.email) ? data.user.email : null;
  } catch (err) {
    console.warn('Could not fetch user email from auth admin:', err);
    return null;
  }
}

/**
 * Sends the ticket email for a paid booking exactly once. The booking row is
 * the outbox: a claim stops parallel senders, success stamps
 * ticket_email_sent_at, and a failure is retried by the reconcile job.
 */
export async function deliverTicketEmail(bookingId: string): Promise<'sent' | 'skipped' | 'failed' | 'not_due'> {
  try {
    if (!isEmailConfigured()) return 'skipped';
    if (!(await db.claimTicketEmail(bookingId))) return 'not_due';

    const booking = await db.getBookingById(bookingId);
    if (!booking) return 'failed';

    const customerEmail = await resolveCustomerEmail(booking);
    if (!customerEmail) {
      // Nothing to send to; mark done so the outbox doesn't retry forever
      await db.markTicketEmailSent(bookingId);
      return 'skipped';
    }

    const qrToken = booking.qr_code_token || booking.id;
    const attachments: any[] = [];
    let qrCodeDataUrl: string | null = null;
    try {
      const { generateQRCodeDataUrl } = await import('@/features/shared/utils/qr');
      const base64Data = await generateQRCodeDataUrl(qrToken);
      if (base64Data?.includes('base64,')) {
        attachments.push({
          filename: 'ticket-qr.png',
          content: Buffer.from(base64Data.split('base64,')[1], 'base64'),
          cid: 'qrcode@dhrubcineplex',
        });
        qrCodeDataUrl = 'cid:qrcode@dhrubcineplex';
      }
    } catch (qrErr) {
      console.error('Failed to generate QR code for email:', qrErr);
    }

    const movieTitle = booking.show?.movie?.title || 'Movie';
    const result = await sendEmail({
      to: customerEmail,
      subject: booking.booking_channel === 'counter'
        ? `Dhrub Cineplex — Cash Sale Ticket (${movieTitle})`
        : `Dhrub Cineplex — Ticket Confirmed (${movieTitle})`,
      html: ticketConfirmationEmail({
        customerName: booking.customer_name,
        bookingId: booking.id,
        movieTitle,
        screenName: booking.show?.screen?.name || 'Standard Screen',
        showDate: booking.show?.show_date || '—',
        showTime: booking.show?.show_time || '—',
        seats: formatSeats(booking),
        totalAmount: Number(booking.total_amount),
        qrCodeDataUrl,
        qrToken,
        paymentMode: booking.booking_channel === 'counter' ? 'cash' : 'online',
        ticketUrl: ticketUrl(booking.id, booking.access_key),
      }),
      attachments,
    });

    if (!result.success) return 'failed';
    await db.markTicketEmailSent(bookingId);
    return 'sent';
  } catch (err) {
    console.error('deliverTicketEmail error:', err);
    return 'failed';
  }
}

/** Sends the ticket email after the response has gone out (never blocks the caller). */
export function queueTicketEmail(bookingId: string) {
  after(() => deliverTicketEmail(bookingId).then(() => undefined));
}

/** "Find my tickets": email every paid ticket for a phone number to the address on file. */
export async function sendTicketLookupEmails(bookings: Booking[]): Promise<number> {
  const byEmail = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const email = await resolveCustomerEmail(booking);
    if (!email) continue;
    byEmail.set(email, [...(byEmail.get(email) || []), booking]);
  }

  let sent = 0;
  for (const [email, list] of byEmail) {
    const result = await sendEmail({
      to: email,
      subject: 'Dhrub Cineplex — Your tickets',
      html: ticketLookupEmail({
        tickets: list.map(b => ({
          movieTitle: b.show?.movie?.title || 'Movie',
          showDate: b.show?.show_date || '—',
          showTime: b.show?.show_time || '—',
          seats: formatSeats(b),
          ticketUrl: ticketUrl(b.id, b.access_key),
        })),
      }),
    });
    if (result.success) sent++;
  }
  return sent;
}
