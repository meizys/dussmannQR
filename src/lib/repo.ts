import { db } from '../db/db';
import type { Meter, RawExtraction, Reading } from '../types';
import { currentPeriod } from '../db/seed';
import {
  DEFAULT_CONFIG,
  rollingAverage,
  validateReading,
  type ValidationConfig,
} from './validation';

// Data-access helpers that sit between the UI and IndexedDB. Mirrors what a
// Supabase repository layer would expose.

export function newId(prefix = 'rd'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Most recent confirmed reading for a meter (the consumption baseline). */
export async function previousReading(meterId: string): Promise<Reading | undefined> {
  const all = await db.readings.where('meter_id').equals(meterId).toArray();
  return all
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
}

/** Confirmed consumption history (most recent first) for rolling-average checks. */
export async function consumptionHistory(meterId: string): Promise<(number | null)[]> {
  const all = await db.readings.where('meter_id').equals(meterId).toArray();
  return all
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
    .map((r) => r.consumption);
}

export interface CaptureInput {
  meter: Meter;
  extraction: RawExtraction;
  photoUrl: string;
  capturedBy: string;
  online: boolean;
  period?: string;
  config?: ValidationConfig;
}

/**
 * Persist a captured reading: apply multiplier, compute consumption, run the
 * validation engine, and queue for sync. Returns the stored Reading.
 */
export async function saveCapture(input: CaptureInput): Promise<Reading> {
  const { meter, extraction, photoUrl, capturedBy, online } = input;
  const period = input.period ?? currentPeriod();
  const config = input.config ?? DEFAULT_CONFIG;

  const prev = await previousReading(meter.id);
  const history = await consumptionHistory(meter.id);
  const avg = rollingAverage(history);

  const multiplier = meter.register_config.multiplier ?? 1;
  const readingValue = round(extraction.value * multiplier, meter.register_config.decimals);

  const result = validateReading(
    {
      meter,
      extraction,
      readingValue,
      previousValue: prev?.reading_value ?? null,
      avgConsumption: avg,
    },
    config
  );

  const reading: Reading = {
    id: newId(),
    meter_id: meter.id,
    register: extraction.register,
    period,
    reading_value: readingValue,
    previous_reading_id: prev?.id ?? null,
    consumption: result.consumption,
    captured_at: new Date().toISOString(),
    captured_by: capturedBy,
    photo_url: photoUrl,
    confidence: extraction.confidence,
    raw_extraction: extraction,
    status: result.status,
    flags: result.flags,
    confirmed_by: null,
    confirmed_at: null,
    // Offline-first: confirmed readings are only marked synced once "online".
    sync_state: online ? 'synced' : 'queued',
  };

  await db.readings.put(reading);
  return reading;
}

/** Manager confirms a flagged reading, optionally correcting the value. */
export async function confirmReading(
  id: string,
  by: string,
  correctedValue?: number
): Promise<void> {
  const r = await db.readings.get(id);
  if (!r) return;
  const meter = await db.meters.get(r.meter_id);
  let reading_value = r.reading_value;
  let consumption = r.consumption;
  if (correctedValue != null && meter) {
    reading_value = correctedValue;
    const prev = r.previous_reading_id ? await db.readings.get(r.previous_reading_id) : undefined;
    consumption = prev ? round(correctedValue - prev.reading_value, 4) : null;
  }
  await db.readings.update(id, {
    reading_value,
    consumption,
    status: 'confirmed',
    confirmed_by: by,
    confirmed_at: new Date().toISOString(),
  });
}

export async function rejectReading(id: string, by: string): Promise<void> {
  await db.readings.update(id, {
    status: 'rejected',
    confirmed_by: by,
    confirmed_at: new Date().toISOString(),
  });
}

/** Flush the offline queue once back online (PRD step 6 → 7). */
export async function syncQueued(): Promise<number> {
  const queued = await db.readings.where('sync_state').equals('queued').toArray();
  for (const r of queued) {
    await db.readings.update(r.id, { sync_state: 'synced' });
  }
  return queued.length;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
