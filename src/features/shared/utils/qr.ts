import QRCode from 'qrcode';

/**
 * Encodes a text token into a base64 PNG Data URL representation of a QR Code.
 * Useful for scanning receipt validation markers at theater counters.
 */
export async function generateQRCodeDataUrl(token: string): Promise<string> {
  try {
    return await QRCode.toDataURL(token, {
      margin: 1,
      width: 250,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
    throw new Error('Failed to generate verification QR code.');
  }
}
