import * as XLSX from 'xlsx';
import type { Client, Meter, Reading, Template, TemplateMapping } from '../types';
import { periodLabel } from './format';

// Excel auto-fill — PRD Section 7.4.
//
// PRODUCTION NOTE: the PRD's hard requirement is to inject values into the
// client's *real* master template with openpyxl (Python) so styles/formulas are
// preserved byte-for-byte. That belongs in a server-side service. For this
// browser-only PoC we generate an equivalent "Readings" sheet with SheetJS and
// honour the same template_mappings (target sheet + cell), proving the
// mapping → cell write loop. The mapping data is identical to what the Python
// service would consume.

export interface FillInput {
  client: Client;
  template: Template;
  mappings: TemplateMapping[];
  meters: Meter[];
  readings: Reading[]; // confirmed readings for the period
  period: string;
}

export interface FillResult {
  filename: string;
  cellsWritten: { cell: string; value: number; kind: string; meter: string }[];
}

function cellRef(col: string, row: number): string {
  return `${col}${row}`;
}

export function buildWorkbook(input: FillInput): { wb: XLSX.WorkBook; result: FillResult } {
  const { client, template, mappings, meters, readings, period } = input;
  const meterById = new Map(meters.map((m) => [m.id, m]));
  const readingByMeter = new Map(readings.map((r) => [r.meter_id, r]));

  const ws: XLSX.WorkSheet = {};
  const written: FillResult['cellsWritten'] = [];

  const set = (ref: string, value: string | number, numFmt?: string) => {
    const cell: XLSX.CellObject =
      typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value };
    if (numFmt) cell.z = numFmt;
    ws[ref] = cell;
  };

  // Header band (rows 1-3), matching the seeded mapping layout (data from row 4).
  set('A1', `${client.name} — Sub-Meter Report`);
  set('A2', `Template: ${template.name}`);
  set('D2', `Period: ${periodLabel(period)}`);
  const headers = ['Site', 'Meter', 'Type', 'Reading', 'Consumption', 'Units', 'Captured'];
  headers.forEach((h, i) => set(cellRef(String.fromCharCode(65 + i), 3), h));

  // Static descriptive columns per meter row (A,B,C,F,G); D/E come from mappings.
  meters.forEach((m, i) => {
    const row = i + 4;
    const r = readingByMeter.get(m.id);
    set(`A${row}`, m.site_id);
    set(`B${row}`, m.meter_label);
    set(`C${row}`, m.meter_type);
    set(`F${row}`, m.units);
    set(`G${row}`, r ? new Date(r.captured_at).toLocaleDateString() : '—');
  });

  // The actual mapped writes (PRD: value/consumption → target_sheet!target_cell).
  for (const map of mappings) {
    if (map.target_sheet !== 'Readings') continue;
    const meter = meterById.get(map.meter_id);
    const reading = readingByMeter.get(map.meter_id);
    if (!meter || !reading) continue;
    const value = map.value_kind === 'reading' ? reading.reading_value : reading.consumption;
    if (value == null) continue;
    const numFmt = '0.' + '0'.repeat(meter.register_config.decimals || 2);
    set(map.target_cell, value, numFmt);
    written.push({
      cell: `${map.target_sheet}!${map.target_cell}`,
      value,
      kind: map.value_kind,
      meter: meter.meter_label,
    });
  }

  // Compute sheet range from populated cells.
  const refs = Object.keys(ws);
  if (refs.length) {
    ws['!ref'] = XLSX.utils.encode_range(
      refs.reduce(
        (range, ref) => {
          const c = XLSX.utils.decode_cell(ref);
          range.s.r = Math.min(range.s.r, c.r);
          range.s.c = Math.min(range.s.c, c.c);
          range.e.r = Math.max(range.e.r, c.r);
          range.e.c = Math.max(range.e.c, c.c);
          return range;
        },
        { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } }
      )
    );
  }
  ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Readings');

  const filename = `${client.name.replace(/\s+/g, '_')}_${period}.xlsx`;
  return { wb, result: { filename, cellsWritten: written } };
}

export function downloadWorkbook(input: FillInput): FillResult {
  const { wb, result } = buildWorkbook(input);
  XLSX.writeFile(wb, result.filename);
  return result;
}
