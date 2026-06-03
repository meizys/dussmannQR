import Dexie, { type Table } from 'dexie';
import type {
  Client,
  Meter,
  Reading,
  Site,
  Template,
  TemplateMapping,
} from '../types';

// IndexedDB is the system of record for the offline-first PoC. Each store maps
// to a PRD table; swapping in Supabase later means mirroring writes here.
export class SnapMeterDB extends Dexie {
  clients!: Table<Client, string>;
  sites!: Table<Site, string>;
  meters!: Table<Meter, string>;
  readings!: Table<Reading, string>;
  templates!: Table<Template, string>;
  templateMappings!: Table<TemplateMapping, string>;

  constructor() {
    super('snapmeter');
    this.version(1).stores({
      clients: 'id, name',
      sites: 'id, client_id',
      meters: 'id, qr_payload, site_id, client_id, status',
      readings:
        'id, meter_id, period, status, sync_state, captured_at, [meter_id+register+period]',
      templates: 'id, client_id',
      templateMappings: 'id, template_id, meter_id',
    });
  }
}

export const db = new SnapMeterDB();
