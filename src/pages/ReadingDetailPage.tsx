import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Meter, Reading } from '../types';
import { db } from '../db/db';
import { MeterIcon, PageTitle, SyncBadge } from '../components/ui';
import { confirmReading, rejectReading } from '../lib/repo';
import { formatValue, formatNumber, periodLabel } from '../lib/format';
import { useAppState } from '../hooks/AppState';

export default function ReadingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAppState();
  const [reading, setReading] = useState<Reading | null>(null);
  const [meter, setMeter] = useState<Meter | null>(null);
  const [correct, setCorrect] = useState('');
  const [editing, setEditing] = useState(false);

  async function load() {
    if (!id) return;
    const r = await db.readings.get(id);
    if (!r) return;
    setReading(r);
    setMeter((await db.meters.get(r.meter_id)) ?? null);
    setCorrect(String(r.reading_value));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!reading || !meter) return <div className="empty">Loading…</div>;

  const isOpen = reading.status === 'flagged' || reading.status === 'pending';

  async function doConfirm(corrected?: number) {
    await confirmReading(reading!.id, user.id, corrected);
    await load();
    setEditing(false);
  }
  async function doReject() {
    await rejectReading(reading!.id, user.id);
    await load();
  }

  return (
    <div>
      <button className="btn ghost" style={{ width: 'auto', marginBottom: 8 }} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <PageTitle title="Reading detail" subtitle={periodLabel(reading.period)} />

      <div className="card row">
        <MeterIcon meter={meter} />
        <div className="grow stack">
          <strong>{meter.meter_label}</strong>
          <span className="muted small">
            {meter.meter_type} · {meter.units}
          </span>
        </div>
        <SyncBadge reading={reading} />
      </div>

      {reading.photo_url ? (
        <img
          src={reading.photo_url}
          alt="proof"
          style={{ width: '100%', borderRadius: 16, marginBottom: 12 }}
        />
      ) : (
        <div className="banner info">No photo on this seeded baseline reading.</div>
      )}

      <div className="card">
        <div className="kv">
          <span className="k">Reading</span>
          <span className="v">
            {formatValue(reading.reading_value, meter)} {meter.units}
          </span>
        </div>
        <div className="kv">
          <span className="k">Consumption</span>
          <span className="v">
            {reading.consumption != null ? formatNumber(reading.consumption) : '—'} {meter.units}
          </span>
        </div>
        <div className="kv">
          <span className="k">Confidence</span>
          <span className="v">{(reading.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="kv">
          <span className="k">Raw digits</span>
          <span className="v">{reading.raw_extraction.raw_digits}</span>
        </div>
        <div className="kv">
          <span className="k">Captured by</span>
          <span className="v">{reading.captured_by}</span>
        </div>
        {reading.confirmed_by && (
          <div className="kv">
            <span className="k">Confirmed by</span>
            <span className="v">{reading.confirmed_by}</span>
          </div>
        )}
      </div>

      {reading.flags.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 6px' }}>
            Flags
          </div>
          {reading.flags.map((f, i) => (
            <div className="flag-item" key={i}>
              <span>⚠️</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <>
          {editing ? (
            <div className="card">
              <label className="field">
                <span className="lbl">Corrected reading value</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={correct}
                  onChange={(e) => setCorrect(e.target.value)}
                />
              </label>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="btn success" onClick={() => doConfirm(Number(correct))}>
                  Save & confirm
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="btn-row">
                <button className="btn" onClick={() => setEditing(true)}>
                  ✎ Correct
                </button>
                <button className="btn success" onClick={() => doConfirm()}>
                  ✓ Confirm
                </button>
              </div>
              <button className="btn danger" style={{ marginTop: 10 }} onClick={doReject}>
                ✕ Reject
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
