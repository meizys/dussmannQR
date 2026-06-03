import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Meter, RawExtraction, Reading } from '../types';
import { db } from '../db/db';
import { CameraCapture } from '../components/CameraCapture';
import { MeterIcon, PageTitle } from '../components/ui';
import { extractReading } from '../lib/vision';
import { consumptionHistory, previousReading, saveCapture } from '../lib/repo';
import { rollingAverage, validateReading } from '../lib/validation';
import { expectedDigitCount, formatValue, formatNumber } from '../lib/format';
import { useAppState } from '../hooks/AppState';

type Stage = 'intro' | 'extracting' | 'review' | 'saved';

interface Context {
  prevValue: number | null;
  avg: number | null;
}

export default function CapturePage() {
  const { meterId } = useParams();
  const navigate = useNavigate();
  const { user, online } = useAppState();

  const [meter, setMeter] = useState<Meter | null>(null);
  const [ctx, setCtx] = useState<Context>({ prevValue: null, avg: null });
  const [stage, setStage] = useState<Stage>('intro');
  const [photo, setPhoto] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<RawExtraction | null>(null);
  const [saved, setSaved] = useState<Reading | null>(null);

  useEffect(() => {
    (async () => {
      const m = meterId ? await db.meters.get(meterId) : undefined;
      if (!m) return;
      setMeter(m);
      const prev = await previousReading(m.id);
      const avg = rollingAverage(await consumptionHistory(m.id));
      setCtx({ prevValue: prev?.reading_value ?? null, avg });
    })();
  }, [meterId]);

  if (!meter) return <div className="empty">Loading meter…</div>;

  async function onCapture(dataUrl: string) {
    if (!meter) return;
    setPhoto(dataUrl);
    setStage('extracting');
    const result = await extractReading(dataUrl, {
      meter,
      previousValue: ctx.prevValue,
      typicalConsumption: ctx.avg,
    });
    setExtraction(result);
    setStage('review');
  }

  async function onConfirm() {
    if (!meter || !extraction || !photo) return;
    const reading = await saveCapture({
      meter,
      extraction,
      photoUrl: photo,
      capturedBy: user.id,
      online,
    });
    setSaved(reading);
    setStage('saved');
  }

  function reshoot() {
    setPhoto(null);
    setExtraction(null);
    setStage('intro');
  }

  // Preview validation (matches what saveCapture will persist).
  const multiplier = meter.register_config.multiplier ?? 1;
  const readingValue = extraction
    ? round(extraction.value * multiplier, meter.register_config.decimals)
    : 0;
  const preview =
    extraction &&
    validateReading({
      meter,
      extraction,
      readingValue,
      previousValue: ctx.prevValue,
      avgConsumption: ctx.avg,
    });

  return (
    <div>
      <PageTitle title="Capture reading" subtitle={meter.meter_label} />

      <div className="card row">
        <MeterIcon meter={meter} />
        <div className="grow stack">
          <strong>{meter.meter_label}</strong>
          <span className="muted small">
            {meter.meter_type} · {meter.units} · {expectedDigitCount(meter)} digits (
            {meter.register_config.integer_digits}+{meter.register_config.decimals})
          </span>
        </div>
      </div>

      <div className="card">
        <div className="kv">
          <span className="k">Last reading</span>
          <span className="v">
            {ctx.prevValue != null ? `${formatValue(ctx.prevValue, meter)} ${meter.units}` : '—'}
          </span>
        </div>
        <div className="kv">
          <span className="k">Avg consumption</span>
          <span className="v">{ctx.avg != null ? formatNumber(ctx.avg) : '—'}</span>
        </div>
      </div>

      {stage === 'intro' && <CameraCapture meter={meter} onCapture={onCapture} />}

      {stage === 'extracting' && (
        <div className="card center-col">
          {photo && <img src={photo} alt="capture" style={{ width: 120, borderRadius: 12 }} />}
          <div className="row" style={{ gap: 10 }}>
            <span className="spinner" />
            <span>Reading the display…</span>
          </div>
          <span className="muted tiny">
            Constrained to {expectedDigitCount(meter)} digits · {meter.units}
          </span>
        </div>
      )}

      {stage === 'review' && extraction && preview && (
        <>
          <div className="card">
            {photo && (
              <img
                src={photo}
                alt="meter"
                style={{ width: '100%', borderRadius: 12, marginBottom: 12 }}
              />
            )}
            <div className="center-col" style={{ padding: '8px 0' }}>
              <span className="muted small">Extracted reading</span>
              <span className="big-num">{formatValue(readingValue, meter)}</span>
              <span className="muted">{meter.units}</span>
            </div>
            <div className="kv">
              <span className="k">Consumption</span>
              <span className="v">
                {preview.consumption != null ? formatNumber(preview.consumption) : '—'}{' '}
                {meter.units}
              </span>
            </div>
            <div className="kv">
              <span className="k">Confidence</span>
              <span className="v">{(extraction.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="kv">
              <span className="k">Outcome</span>
              <span className="v">
                {preview.status === 'confirmed' ? (
                  <span className="badge confirmed">Auto-confirm</span>
                ) : (
                  <span className="badge flagged">Will be flagged</span>
                )}
              </span>
            </div>
          </div>

          {preview.flags.length > 0 && (
            <div className="card">
              <div className="section-title" style={{ margin: '0 0 6px' }}>
                Flags
              </div>
              {preview.flags.map((f, i) => (
                <div className="flag-item" key={i}>
                  <span>⚠️</span>
                  <span>{f.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="btn-row">
            <button className="btn ghost" onClick={reshoot}>
              ↻ Re-shoot
            </button>
            <button className="btn primary" onClick={onConfirm}>
              ✓ Save reading
            </button>
          </div>
        </>
      )}

      {stage === 'saved' && saved && (
        <div className="card center-col">
          <div style={{ fontSize: 48 }}>
            {saved.status === 'confirmed' ? '✅' : '🚩'}
          </div>
          <strong>
            {saved.status === 'confirmed'
              ? 'Reading auto-confirmed'
              : 'Saved — sent to review queue'}
          </strong>
          <span className="muted small">
            {saved.sync_state === 'queued'
              ? 'Queued offline — will sync when back online.'
              : 'Synced.'}
          </span>
          <div className="btn-row" style={{ width: '100%', marginTop: 8 }}>
            <button className="btn ghost" onClick={() => navigate('/')}>
              Route
            </button>
            <button className="btn primary" onClick={() => navigate('/scan')}>
              Next meter →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
