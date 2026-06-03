import { db } from './db';
import type {
  Client,
  Meter,
  Reading,
  Site,
  Template,
  TemplateMapping,
} from '../types';
import { computeConsumption } from '../lib/validation';

// Deterministic pilot dataset (PRD Phase 0/1). QR payloads are stable strings so
// the printable sticker sheet and the scanner agree.
const now = new Date().toISOString();

export const PILOT_CLIENT: Client = {
  id: 'client-acme',
  name: 'Acme Property Group',
  contact: 'facilities@acme.example',
  created_at: now,
};

export const PILOT_SITES: Site[] = [
  {
    id: 'site-riverside',
    client_id: PILOT_CLIENT.id,
    name: 'Riverside Tower',
    address: '12 Riverside Ave',
    geo: { lat: 54.6872, lng: 25.2797 },
    created_at: now,
  },
  {
    id: 'site-market',
    client_id: PILOT_CLIENT.id,
    name: 'Market Square Offices',
    address: '4 Market Sq',
    geo: { lat: 54.6896, lng: 25.271 },
    created_at: now,
  },
];

export const PILOT_METERS: Meter[] = [
  {
    id: 'mtr-rs-w1',
    qr_payload: 'SM:mtr-rs-w1',
    meter_label: 'RS-WATER-01',
    site_id: 'site-riverside',
    client_id: PILOT_CLIENT.id,
    meter_type: 'water',
    units: 'm³',
    register_config: { integer_digits: 5, decimals: 2 },
    status: 'active',
    created_at: now,
  },
  {
    id: 'mtr-rs-e1',
    qr_payload: 'SM:mtr-rs-e1',
    meter_label: 'RS-ELEC-01',
    site_id: 'site-riverside',
    client_id: PILOT_CLIENT.id,
    meter_type: 'electricity',
    units: 'kWh',
    register_config: { integer_digits: 6, decimals: 1, multiplier: 1 },
    status: 'active',
    created_at: now,
  },
  {
    id: 'mtr-rs-g1',
    qr_payload: 'SM:mtr-rs-g1',
    meter_label: 'RS-GAS-01',
    site_id: 'site-riverside',
    client_id: PILOT_CLIENT.id,
    meter_type: 'gas',
    units: 'm³',
    register_config: { integer_digits: 5, decimals: 3 },
    status: 'active',
    created_at: now,
  },
  {
    id: 'mtr-ms-h1',
    qr_payload: 'SM:mtr-ms-h1',
    meter_label: 'MS-HEAT-01',
    site_id: 'site-market',
    client_id: PILOT_CLIENT.id,
    meter_type: 'heat',
    units: 'MWh',
    register_config: { integer_digits: 5, decimals: 2 },
    status: 'active',
    created_at: now,
  },
  {
    id: 'mtr-ms-e1',
    qr_payload: 'SM:mtr-ms-e1',
    meter_label: 'MS-ELEC-01',
    site_id: 'site-market',
    client_id: PILOT_CLIENT.id,
    meter_type: 'electricity',
    units: 'kWh',
    register_config: { integer_digits: 6, decimals: 1 },
    status: 'active',
    created_at: now,
  },
];

const PILOT_TEMPLATE: Template = {
  id: 'tpl-acme',
  client_id: PILOT_CLIENT.id,
  name: 'Acme Monthly Sub-Meter Report',
  file_ref: 'master/acme-monthly.xlsx',
  created_at: now,
};

// Hand-defined mapping (PRD Phase 1): each meter's reading + consumption land in
// fixed cells on the client's sheet.
const PILOT_MAPPINGS: TemplateMapping[] = PILOT_METERS.flatMap((m, i) => {
  const row = i + 4; // header rows 1-3 in the generated sheet
  return [
    {
      id: `map-${m.id}-r`,
      template_id: PILOT_TEMPLATE.id,
      meter_id: m.id,
      target_sheet: 'Readings',
      target_cell: `D${row}`,
      value_kind: 'reading' as const,
      period_anchor: 'column-D',
    },
    {
      id: `map-${m.id}-c`,
      template_id: PILOT_TEMPLATE.id,
      meter_id: m.id,
      target_sheet: 'Readings',
      target_cell: `E${row}`,
      value_kind: 'consumption' as const,
      period_anchor: 'column-E',
    },
  ];
});

/** Previous-period baseline readings so consumption can be computed on day one. */
function baselineReadings(): Reading[] {
  const lastPeriod = previousPeriod();
  const baselines: Record<string, number> = {
    'mtr-rs-w1': 1842.55,
    'mtr-rs-e1': 284910.4,
    'mtr-rs-g1': 5120.115,
    'mtr-ms-h1': 731.2,
    'mtr-ms-e1': 99820.6,
  };
  return PILOT_METERS.map((m) => ({
    id: `seed-${m.id}-${lastPeriod}`,
    meter_id: m.id,
    register: null,
    period: lastPeriod,
    reading_value: baselines[m.id],
    previous_reading_id: null,
    consumption: null,
    captured_at: new Date(Date.now() - 30 * 864e5).toISOString(),
    captured_by: 'seed',
    photo_url: '',
    confidence: 1,
    raw_extraction: {
      value: baselines[m.id],
      raw_digits: String(baselines[m.id]).replace('.', ''),
      register: null,
      confidence: 1,
      anomalies: [],
      notes: 'seed baseline',
    },
    status: 'confirmed',
    flags: [],
    confirmed_by: 'seed',
    confirmed_at: new Date(Date.now() - 30 * 864e5).toISOString(),
    sync_state: 'synced',
  }));
}

export function currentPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function previousPeriod(d = new Date()): string {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return currentPeriod(p);
}

/** Idempotently load the pilot dataset. Safe to call on every app start. */
export async function ensureSeed(): Promise<void> {
  const existing = await db.clients.get(PILOT_CLIENT.id);
  if (existing) return;
  await db.transaction(
    'rw',
    [db.clients, db.sites, db.meters, db.readings, db.templates, db.templateMappings],
    async () => {
      await db.clients.put(PILOT_CLIENT);
      await db.sites.bulkPut(PILOT_SITES);
      await db.meters.bulkPut(PILOT_METERS);
      await db.templates.put(PILOT_TEMPLATE);
      await db.templateMappings.bulkPut(PILOT_MAPPINGS);
      await db.readings.bulkPut(baselineReadings());
    }
  );
}

/** Used by the "reset demo data" action in Settings. */
export async function resetAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.clients, db.sites, db.meters, db.readings, db.templates, db.templateMappings],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.sites.clear(),
        db.meters.clear(),
        db.readings.clear(),
        db.templates.clear(),
        db.templateMappings.clear(),
      ]);
    }
  );
  await ensureSeed();
}

// Re-exported helper kept here to avoid a circular import in seed baselines.
export { computeConsumption };
