import type { Meter, RawExtraction } from '../types';

// Vision-extraction interface — PRD Section 7.2.
// The QR has already resolved identity; vision ONLY reads the numeric value, and
// it reads it constrained by the known register format. The mock below lets the
// whole PoC run with no backend; set VITE_VISION_API_URL to swap in a real
// multimodal endpoint behind the exact same contract.

export interface ExtractionContext {
  meter: Meter;
  /** Last confirmed reading value, used by the mock to synthesise plausible data. */
  previousValue: number | null;
  /** Typical per-period consumption, used by the mock to size the next read. */
  typicalConsumption: number | null;
}

export async function extractReading(
  imageDataUrl: string,
  ctx: ExtractionContext
): Promise<RawExtraction> {
  const url = import.meta.env.VITE_VISION_API_URL;
  if (url) return extractViaApi(url, imageDataUrl, ctx);
  return mockExtract(ctx);
}

/** Calls a real Edge Function. Expected to return the RawExtraction JSON contract. */
async function extractViaApi(
  url: string,
  imageDataUrl: string,
  ctx: ExtractionContext
): Promise<RawExtraction> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageDataUrl,
      meter_id: ctx.meter.id,
      meter_type: ctx.meter.meter_type,
      register_config: ctx.meter.register_config,
    }),
  });
  if (!res.ok) throw new Error(`Vision API error ${res.status}`);
  const text = await res.text();
  // Contract: must be valid JSON; strip any markdown fences defensively.
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned) as RawExtraction;
}

// ── Deterministic-ish mock ────────────────────────────────────────────────────
// Produces a value consistent with the meter format and recent history, then
// occasionally injects realistic problems so the validation/review flow is
// demonstrable end-to-end.

function mockExtract(ctx: ExtractionContext): Promise<RawExtraction> {
  const { meter, previousValue, typicalConsumption } = ctx;
  const { integer_digits, decimals } = meter.register_config;
  const base = previousValue ?? 10 ** (integer_digits - 2);
  const typical = typicalConsumption && typicalConsumption > 0 ? typicalConsumption : base * 0.02;

  // ~78% clean, then a spread of edge cases.
  const roll = Math.random();
  let value: number;
  let confidence: number;
  const anomalies: string[] = [];
  let raw_digits: string;
  let notes = 'Format-constrained read.';

  if (roll < 0.78) {
    value = base + typical * (0.6 + Math.random() * 0.8);
    confidence = 0.9 + Math.random() * 0.09;
  } else if (roll < 0.88) {
    // Low confidence — glare/fog
    value = base + typical * (0.6 + Math.random() * 0.8);
    confidence = 0.55 + Math.random() * 0.2;
    anomalies.push(Math.random() < 0.5 ? 'glare' : 'fogged_glass');
    notes = 'Display partially obscured.';
  } else if (roll < 0.95) {
    // Spike — leak or misread last digit
    value = base + typical * (4 + Math.random() * 3);
    confidence = 0.88 + Math.random() * 0.08;
    notes = 'Large jump vs history.';
  } else {
    // Format mismatch — a digit is dropped
    value = base + typical;
    confidence = 0.7 + Math.random() * 0.15;
    anomalies.push('partial_digit');
    raw_digits = digitsOf(value, integer_digits, decimals).slice(0, -1);
    notes = 'A digit may be cut off.';
    return resolve({
      value: round(value, decimals),
      raw_digits,
      register: meter.register_config.registers?.[0] ?? null,
      confidence: round(confidence, 2),
      anomalies,
      notes,
    });
  }

  value = round(value, decimals);
  raw_digits = digitsOf(value, integer_digits, decimals);
  return resolve({
    value,
    raw_digits,
    register: meter.register_config.registers?.[0] ?? null,
    confidence: round(confidence, 2),
    anomalies,
    notes,
  });
}

function digitsOf(value: number, intDigits: number, decimals: number): string {
  const scaled = Math.round(value * 10 ** decimals);
  return String(scaled).padStart(intDigits + decimals, '0');
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function resolve(r: RawExtraction): Promise<RawExtraction> {
  // Simulate model latency so the capture UI shows its "reading…" state.
  return new Promise((res) => setTimeout(() => res(r), 600 + Math.random() * 700));
}
