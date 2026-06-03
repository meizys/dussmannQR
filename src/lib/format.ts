import type { Meter, MeterType } from '../types';

export const METER_ICON: Record<MeterType, string> = {
  water: '💧',
  electricity: '⚡',
  gas: '🔥',
  heat: '♨️',
};

export const METER_COLOR: Record<MeterType, string> = {
  water: '#0ea5e9',
  electricity: '#f59e0b',
  gas: '#ef4444',
  heat: '#a855f7',
};

/** Total digit count expected from the register config (PRD format-constraint). */
export function expectedDigitCount(meter: Meter): number {
  const { integer_digits, decimals } = meter.register_config;
  return integer_digits + decimals;
}

/** Render a numeric value with the meter's configured decimal places. */
export function formatValue(value: number, meter: Meter): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: meter.register_config.decimals,
    maximumFractionDigits: meter.register_config.decimals,
  });
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}
