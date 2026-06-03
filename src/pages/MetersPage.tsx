import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { MeterIcon, PageTitle } from '../components/ui';
import { payloadForMeter, qrDataUrl } from '../lib/qr';
import { newId } from '../lib/repo';
import type { Meter, MeterType } from '../types';

const TYPES: MeterType[] = ['water', 'electricity', 'gas', 'heat'];

export default function MetersPage() {
  const [tab, setTab] = useState<'list' | 'qr' | 'add'>('list');
  const data = useLiveQuery(async () => {
    const meters = await db.meters.toArray();
    const sites = await db.sites.toArray();
    return { meters, sites };
  }, []);

  if (!data) return null;
  const siteName = (id: string) => data.sites.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <PageTitle title="Meters" subtitle="Master data · QR = source of truth for identity" />

      <div className="btn-row no-print" style={{ marginBottom: 14 }}>
        <button className={`btn ${tab === 'list' ? 'primary' : ''}`} onClick={() => setTab('list')}>
          List
        </button>
        <button className={`btn ${tab === 'qr' ? 'primary' : ''}`} onClick={() => setTab('qr')}>
          QR sheet
        </button>
        <button className={`btn ${tab === 'add' ? 'primary' : ''}`} onClick={() => setTab('add')}>
          + Add
        </button>
      </div>

      {tab === 'list' &&
        data.meters.map((m) => (
          <div key={m.id} className="card row">
            <MeterIcon meter={m} />
            <div className="grow stack">
              <div className="row between">
                <strong>{m.meter_label}</strong>
                <span className={`badge ${m.status === 'active' ? 'confirmed' : 'pending'}`}>
                  {m.status}
                </span>
              </div>
              <span className="muted small">
                {siteName(m.site_id)} · {m.meter_type} · {m.units} ·{' '}
                {m.register_config.integer_digits}+{m.register_config.decimals} digits
              </span>
              <span className="tiny muted">{payloadForMeter(m)}</span>
            </div>
          </div>
        ))}

      {tab === 'qr' && <QrSheet meters={data.meters} />}
      {tab === 'add' && <AddMeter sites={data.sites} onDone={() => setTab('list')} />}
    </div>
  );
}

function QrSheet({ meters }: { meters: Meter[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        meters.map(async (m) => [m.id, await qrDataUrl(payloadForMeter(m))] as const)
      );
      setUrls(Object.fromEntries(entries));
    })();
  }, [meters]);

  return (
    <>
      <div className="banner info no-print">
        🖨️ Print this sheet and stick a QR on each physical meter.
      </div>
      <button className="btn primary no-print" style={{ marginBottom: 14 }} onClick={() => window.print()}>
        🖨️ Print stickers
      </button>
      <div className="qr-sheet">
        {meters.map((m) => (
          <div key={m.id} className="qr-tile">
            {urls[m.id] ? <img src={urls[m.id]} alt={m.meter_label} /> : <div style={{ height: 160 }} />}
            <div className="lbl">{m.meter_label}</div>
            <div className="sub">
              {m.meter_type} · {m.units}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AddMeter({
  sites,
  onDone,
}: {
  sites: { id: string; name: string; client_id: string }[];
  onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [type, setType] = useState<MeterType>('water');
  const [units, setUnits] = useState('m³');
  const [intDigits, setIntDigits] = useState(5);
  const [decimals, setDecimals] = useState(2);

  async function save() {
    const site = sites.find((s) => s.id === siteId);
    if (!site || !label.trim()) return;
    const id = newId('mtr');
    const meter: Meter = {
      id,
      qr_payload: `SM:${id}`,
      meter_label: label.trim(),
      site_id: siteId,
      client_id: site.client_id,
      meter_type: type,
      units,
      register_config: { integer_digits: intDigits, decimals },
      status: 'active',
      created_at: new Date().toISOString(),
    };
    await db.meters.put(meter);
    onDone();
  }

  return (
    <div className="card">
      <label className="field">
        <span className="lbl">Meter label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="RS-WATER-02" />
      </label>
      <label className="field">
        <span className="lbl">Site</span>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="lbl">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as MeterType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="lbl">Units</span>
        <input value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field grow">
          <span className="lbl">Integer digits</span>
          <input
            type="number"
            value={intDigits}
            onChange={(e) => setIntDigits(Number(e.target.value))}
          />
        </label>
        <label className="field grow">
          <span className="lbl">Decimals</span>
          <input
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(Number(e.target.value))}
          />
        </label>
      </div>
      <button className="btn primary" onClick={save}>
        Save meter
      </button>
    </div>
  );
}
