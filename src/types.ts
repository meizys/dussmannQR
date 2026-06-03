// Domain model — mirrors PRD Section 6. Kept framework-agnostic so it can map
// 1:1 onto Postgres tables when a Supabase backend is added later.

export type MeterType = 'water' | 'electricity' | 'gas' | 'heat';
export type MeterStatus = 'active' | 'replaced' | 'removed';
export type ReadingStatus = 'pending' | 'confirmed' | 'flagged' | 'rejected';
export type UserRole = 'technician' | 'manager' | 'admin' | 'client_viewer';
export type ValueKind = 'reading' | 'consumption';

export interface Client {
  id: string;
  name: string;
  contact: string;
  created_at: string;
}

export interface Site {
  id: string;
  client_id: string;
  name: string;
  address: string;
  geo?: { lat: number; lng: number } | null;
  created_at: string;
}

/** Describes the physical register layout so vision reads are format-constrained. */
export interface RegisterConfig {
  integer_digits: number;
  decimals: number;
  /** CT ratio / pulse multiplier applied to the raw read. Defaults to 1. */
  multiplier?: number;
  /** Multi-rate registers, e.g. ['T1','T2']. Empty/absent => single register. */
  registers?: string[];
}

export interface Meter {
  id: string;
  /** Opaque string encoded in the printed QR sticker. */
  qr_payload: string;
  /** Human-readable ID printed on the device. */
  meter_label: string;
  site_id: string;
  client_id: string;
  meter_type: MeterType;
  units: string;
  register_config: RegisterConfig;
  status: MeterStatus;
  created_at: string;
}

/** A single anomaly/flag attached to a reading. */
export interface ReadingFlag {
  code:
    | 'low_confidence'
    | 'format_mismatch'
    | 'negative_consumption'
    | 'spike'
    | 'drop'
    | 'no_history'
    | 'vision_anomaly';
  message: string;
}

export interface RawExtraction {
  value: number;
  raw_digits: string;
  register: string | null;
  secondary_registers?: { register: string; value: number }[];
  confidence: number;
  anomalies: string[];
  notes: string;
}

export interface Reading {
  id: string;
  meter_id: string;
  register: string | null;
  /** Billing period, e.g. '2026-05'. */
  period: string;
  reading_value: number;
  previous_reading_id: string | null;
  consumption: number | null;
  captured_at: string;
  captured_by: string;
  /** Object URL / data URL of the meter-face proof photo. */
  photo_url: string;
  confidence: number;
  raw_extraction: RawExtraction;
  status: ReadingStatus;
  flags: ReadingFlag[];
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  /** Offline-first bookkeeping. 'queued' = captured offline, awaiting sync. */
  sync_state: 'queued' | 'synced';
}

export interface Template {
  id: string;
  client_id: string;
  name: string;
  /** Demo placeholder for the stored master template reference. */
  file_ref: string;
  structure_meta?: Record<string, unknown>;
  created_at: string;
}

export interface TemplateMapping {
  id: string;
  template_id: string;
  meter_id: string;
  target_sheet: string;
  target_cell: string;
  value_kind: ValueKind;
  /** How a period maps onto the sheet (demo: cell is fixed per mapping). */
  period_anchor: string;
}

export interface User {
  id: string;
  role: UserRole;
  name: string;
}
