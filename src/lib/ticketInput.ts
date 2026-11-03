// What a scanned QR or pasted text means at the gate. Ticket QRs carry the token
// itself, but staff may also scan or paste the ticket link from an email.

const TICKET_LINK_RE = /\/booking\/confirmation\/([^/?#\s]+)/;

/** The token or booking id inside whatever was scanned; plain searches pass through. */
export function ticketFromScan(scanned: string): string {
  const text = scanned.trim();
  const fromLink = text.match(TICKET_LINK_RE);
  if (fromLink) return fromLink[1];
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.searchParams.get('token') || url.searchParams.get('id') || text;
    } catch {
      return text;
    }
  }
  return text;
}
