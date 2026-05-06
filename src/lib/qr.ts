import QRCode from "qrcode";

/**
 * Render a QR code as an inline SVG `data:` URL safe to drop into `<img src=>`.
 *
 * SVG keeps the QR sharp at any size (broadcast TV → tiny manage page row)
 * without shipping a binary blob through the HTML. We URL-encode rather than
 * base64-encode so the payload stays human-debuggable in DevTools.
 */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
