import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { QRScanner } from '../components/QRScanner';
import { MeterIcon, PageTitle } from '../components/ui';
import { db } from '../db/db';
import { meterIdFromPayload } from '../lib/qr';

export default function ScanPage() {
  const navigate = useNavigate();
  const [showPicker, setShowPicker] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);

  const meters = useLiveQuery(() => db.meters.where('status').equals('active').toArray(), []);

  const resolve = useCallback(
    async (payload: string) => {
      const id = meterIdFromPayload(payload) ?? payload;
      const meter = await db.meters.get(id);
      if (meter) {
        navigate(`/capture/${meter.id}`);
      } else {
        setNotFound(payload);
      }
    },
    [navigate]
  );

  return (
    <div>
      <PageTitle title="Scan meter QR" subtitle="QR resolves the meter — no typing serials" />

      {!showPicker && (
        <QRScanner onResult={resolve} onNoCamera={() => setShowPicker(true)} />
      )}

      {notFound && (
        <div className="banner offline" style={{ marginTop: 12 }}>
          ⚠️ Unknown QR: <code>{notFound}</code>
        </div>
      )}

      <button
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => setShowPicker((s) => !s)}
      >
        {showPicker ? 'Try camera scan' : '⌨️ Pick meter manually'}
      </button>

      {showPicker && (
        <>
          <div className="section-title">Choose a meter</div>
          {meters?.map((meter) => (
            <div
              key={meter.id}
              className="card tappable row"
              onClick={() => navigate(`/capture/${meter.id}`)}
            >
              <MeterIcon meter={meter} />
              <div className="grow stack">
                <strong>{meter.meter_label}</strong>
                <span className="muted small">
                  {meter.meter_type} · {meter.units}
                </span>
              </div>
              <span className="muted" style={{ fontSize: 22 }}>
                ›
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
