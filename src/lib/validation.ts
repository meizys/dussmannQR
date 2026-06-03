import type { Meter, RawExtraction, Reading, ReadingFlag } from '../types';

// Validation engine — PRD Section 7.3. Pure functions, no I/O, easy to unit test
// and to port to a Supabase Edge Function verbatim.

export interface ValidationConfig {
  /** Minimum vision confidence to auto-confirm. */
  confidenceThreshold: number;
  /** Consumption may exceed the rolling average by this factor before flagging. */
  spikeFactor: number;
  /** Consumption below avg/dropFactor flags a suspicious drop (when history exists). */
  dropFactor: number;
}

export const DEFAULT_CONFIG: ValidationConfig = {
  confidenceThreshold: 0.8,
  spikeFactor: 3,
  dropFactor: 5,
};

export function computeConsumption(
  currentValue: number,
  previousValue: number | null
): number | null {
  if (previousValue == null) return null;
  return round(currentValue - previousValue, 4);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function digitCount(raw: string): number {
  return (raw.match(/\d/g) ?? []).length;
}

export interface ValidationInput {
  meter: Meter;
  extraction: RawExtraction;
  /** Computed reading value after applying any multiplier. */
  readingValue: number;
  previousValue: number | null;
  /** Rolling average consumption from history (null if insufficient history). */
  avgConsumption: number | null;
}

export interface ValidationResult {
  status: Reading['status'];
  consumption: number | null;
  flags: ReadingFlag[];
}

/**
 * Decide whether a reading auto-confirms or routes to the review queue.
 * Auto-confirm requires ALL checks to pass (PRD 7.3); anything else is flagged,
 * never silently rejected.
 */
export function validateReading(
  input: ValidationInput,
  config: ValidationConfig = DEFAULT_CONFIG
): ValidationResult {
  const { meter, extraction, readingValue, previousValue, avgConsumption } = input;
  const flags: ReadingFlag[] = [];

  // 1. Confidence
  if (extraction.confidence < config.confidenceThreshold) {
    flags.push({
      code: 'low_confidence',
      message: `Vision confidence ${(extraction.confidence * 100).toFixed(0)}% is below the ${(
        config.confidenceThreshold * 100
      ).toFixed(0)}% auto-confirm threshold.`,
    });
  }

  // 2. Format / digit-count match
  const expected = meter.register_config.integer_digits + meter.register_config.decimals;
  const got = digitCount(extraction.raw_digits);
  if (got !== expected) {
    flags.push({
      code: 'format_mismatch',
      message: `Read ${got} digits but this meter is configured for ${expected}.`,
    });
  }

  // 3. Vision-reported anomalies
  if (extraction.anomalies.length > 0) {
    flags.push({
      code: 'vision_anomaly',
      message: `Vision noted: ${extraction.anomalies.join(', ')}.`,
    });
  }

  const consumption = computeConsumption(readingValue, previousValue);

  if (previousValue == null) {
    flags.push({
      code: 'no_history',
      message: 'No previous reading — consumption cannot be validated. Establishes a baseline.',
    });
  } else if (consumption != null) {
    // 4. Non-negative consumption (rollover/meter-swap handled by review)
    if (consumption < 0) {
      flags.push({
        code: 'negative_consumption',
        message: 'Reading is lower than last period — possible rollover or meter replacement.',
      });
    }

    // 5. Plausibility band vs rolling average
    if (avgConsumption != null && avgConsumption > 0) {
      if (consumption > avgConsumption * config.spikeFactor) {
        flags.push({
          code: 'spike',
          message: `Consumption ${consumption} is >${config.spikeFactor}× the average (${avgConsumption.toFixed(
            2
          )}).`,
        });
      } else if (consumption >= 0 && consumption < avgConsumption / config.dropFactor) {
        flags.push({
          code: 'drop',
          message: `Consumption ${consumption} is unusually low vs the average (${avgConsumption.toFixed(
            2
          )}).`,
        });
      }
    }
  }

  // 'no_history' alone establishes a baseline and is acceptable to auto-confirm;
  // any other flag routes to review.
  const blocking = flags.filter((f) => f.code !== 'no_history');
  const status: Reading['status'] = blocking.length === 0 ? 'confirmed' : 'flagged';

  return { status, consumption, flags };
}

/** Rolling average of confirmed consumption for a meter (most recent first). */
export function rollingAverage(consumptions: (number | null)[]): number | null {
  const vals = consumptions.filter((c): c is number => c != null && c >= 0).slice(0, 6);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
