import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { currentPeriod } from '../db/seed';
import { PageTitle } from '../components/ui';
import { downloadWorkbook, type FillResult } from '../lib/excel';
import { formatValue, periodLabel } from '../lib/format';
import type { Client, Meter, Reading, Template, TemplateMapping } from '../types';

export default function ExportPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [bundle, setBundle] = useState<{
    template?: Template;
    mappings: TemplateMapping[];
    meters: Meter[];
    readings: Reading[];
  }>({ mappings: [], meters: [], readings: [] });
  const [result, setResult] = useState<FillResult | null>(null);

  useEffect(() => {
    (async () => {
      const cs = await db.clients.toArray();
      setClients(cs);
      if (!clientId && cs[0]) setClientId(cs[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const template = (await db.templates.where('client_id').equals(clientId).toArray())[0];
      const mappings = template
        ? await db.templateMappings.where('template_id').equals(template.id).toArray()
        : [];
      const meters = await db.meters.where('client_id').equals(clientId).toArray();
      const all = await db.readings.where('period').equals(period).toArray();
      const meterIds = new Set(meters.map((m) => m.id));
      const readings = all.filter((r) => meterIds.has(r.meter_id) && r.status === 'confirmed');
      setBundle({ template, mappings, meters, readings });
      setResult(null);
    })();
  }, [clientId, period]);

  const client = clients.find((c) => c.id === clientId);
  const readingByMeter = new Map(bundle.readings.map((r) => [r.meter_id, r]));
  const ready = bundle.meters.filter((m) => readingByMeter.has(m.id));
  const missing = bundle.meters.filter((m) => !readingByMeter.has(m.id));

  function onExport() {
    if (!client || !bundle.template) return;
    const res = downloadWorkbook({
      client,
      template: bundle.template,
      mappings: bundle.mappings,
      meters: bundle.meters,
      readings: bundle.readings,
      period,
    });
    setResult(res);
  }

  return (
    <div>
      <PageTitle title="Export to Excel" subtitle="Confirmed readings → client template" />

      <div className="card">
        <label className="field">
          <span className="lbl">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="lbl">Period</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </div>

      {bundle.template ? (
        <>
          <div className="card">
            <div className="row between">
              <strong>{bundle.template.name}</strong>
              <span className="muted small">{periodLabel(period)}</span>
            </div>
            <div className="progress-track" style={{ marginTop: 12 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${bundle.meters.length ? (ready.length / bundle.meters.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              {ready.length} of {bundle.meters.length} meters confirmed
            </div>
          </div>

          <div className="section-title">Cells to be written</div>
          {bundle.meters.map((m) => {
            const r = readingByMeter.get(m.id);
            const maps = bundle.mappings.filter((mp) => mp.meter_id === m.id);
            return (
              <div className="card" key={m.id}>
                <div className="row between">
                  <strong>{m.meter_label}</strong>
                  {r ? (
                    <span className="badge confirmed">ready</span>
                  ) : (
                    <span className="badge pending">missing</span>
                  )}
                </div>
                {r &&
                  maps.map((mp) => (
                    <div className="kv" key={mp.id}>
                      <span className="k">
                        {mp.target_sheet}!{mp.target_cell} · {mp.value_kind}
                      </span>
                      <span className="v">
                        {mp.value_kind === 'reading'
                          ? formatValue(r.reading_value, m)
                          : r.consumption != null
                            ? formatValue(r.consumption, m)
                            : '—'}
                      </span>
                    </div>
                  ))}
              </div>
            );
          })}

          {missing.length > 0 && (
            <div className="banner offline">
              ⚠️ {missing.length} meter(s) not yet confirmed for this period — they'll be left
              blank.
            </div>
          )}

          <button className="btn primary" disabled={ready.length === 0} onClick={onExport}>
            ⬇️ Generate &amp; download .xlsx
          </button>

          {result && (
            <div className="banner success" style={{ marginTop: 12 }}>
              ✅ {result.filename} — wrote {result.cellsWritten.length} cells.
            </div>
          )}
        </>
      ) : (
        <div className="empty">No template configured for this client.</div>
      )}
    </div>
  );
}
