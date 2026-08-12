import { describe, it, expect } from 'vitest';
import { escapeHtml, ticketConfirmationEmail, welcomeEmail } from '../src/lib/email/templates';

const base = {
  customerName: 'John Doe',
  bookingId: 'b1',
  movieTitle: 'Test Movie',
  screenName: 'Screen 1',
  showDate: '2026-08-12',
  showTime: '20:30:00',
  seats: 'A-1, A-2',
  totalAmount: 360,
};

describe('email templates', () => {
  it('escapes HTML in customer-supplied fields', () => {
    const html = ticketConfirmationEmail({
      ...base,
      customerName: '<script>alert(1)</script>',
      movieTitle: 'A&B <Movie> "quoted"',
      seats: 'A-1 & B-2',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A&amp;B &lt;Movie&gt; &quot;quoted&quot;');
    expect(html).toContain('A-1 &amp; B-2');
  });

  it('embeds the QR data URL as an image when provided', () => {
    const html = ticketConfirmationEmail({
      ...base,
      qrCodeDataUrl: 'data:image/png;base64,AAAA',
    });

    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it('falls back to the plain token when no QR image is available', () => {
    const html = ticketConfirmationEmail({ ...base, qrToken: 'tkt_b1_abc123' });
    expect(html).toContain('tkt_b1_abc123');
    expect(html).not.toContain('<img src=');
  });

  it('renders the cash-sale variant label', () => {
    const html = ticketConfirmationEmail({ ...base, paymentMode: 'cash' });
    expect(html).toContain('Cash Sale Confirmed');
  });

  it('welcome email escapes the name', () => {
    const html = welcomeEmail({ customerName: 'Bob<br/>Hax', email: 'bob@example.com' });
    expect(html).not.toContain('<br/>Hax');
    expect(html).toContain('Bob&lt;br/&gt;Hax');
  });

  it('escapeHtml handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('0');
  });
});
