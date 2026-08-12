import nodemailer from 'nodemailer';

// SMTP is only considered configured when host, user AND pass are present.
// Gating on SMTP_USER alone silently breaks mail when the password is missing.
export const isEmailConfigured = (): boolean =>
  !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

// Build lazily so importing this module never throws in dev without SMTP vars.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465, // true for 465, false for 587/25 (STARTTLS)
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async ({ to, subject, html, text }: SendEmailParams) => {
  try {
    if (!isEmailConfigured()) {
      console.warn('sendEmail skipped: SMTP_* env vars are not configured.');
      return { success: false, skipped: true };
    }
    const info = await transporter.sendMail({
      from: `"Dhrub Cineplex" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};
