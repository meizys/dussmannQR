import QRCode from 'qrcode';
import type { Meter } from '../types';

// QR is the source of truth for identity (PRD principle #1). Payload format is a
// tiny namespaced string so it's robust, offline-decodable, and human-greppable.

export const QR_PREFIX = 'SM:';

export function meterIdFromPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(QR_PREFIX)) return null;
  const id = trimmed.slice(QR_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function payloadForMeter(meter: Meter): string {
  return `${QR_PREFIX}${meter.id}`;
}

export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
}
