import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { MeterIcon, PageTitle, SyncBadge, Empty } from '../components/ui';
import { formatValue, relativeTime } from '../lib/format';
import type { Meter, Reading } from '../types';

export default function ReviewPage() {
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const readings = await db.readings.toArray();
    const meters = await db.meters.toArray();
    return { readings, meters };
  }, []);

  if (!data) return null;
  const meterById = new Map<string, Meter>(data.meters.map((m) => [m.id, m]));
  const real = data.readings.filter((r) => r.captured_by !== 'seed');
  const flagged = real
    .filter((r) => r.status === 'flagged')
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  const recent = real
    .filter((r) => r.status !== 'flagged')
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
    .slice(0, 12);

  const Item = ({ r }: { r: Reading }) => {
    const m = meterById.get(r.meter_id);
    if (!m) return null;
    return (
      <div className="card tappable row" onClick={() => navigate(`/reading/${r.id}`)}>
        <MeterIcon meter={m} />
        <div className="grow stack">
          <div className="row between">
            <strong>{m.meter_label}</strong>
            <SyncBadge reading={r} />
          </div>
          <span className="muted small">
            {formatValue(r.reading_value, m)} {m.units} · {relativeTime(r.captured_at)}
          </span>
          {r.flags.length > 0 && (
            <span className="tiny" style={{ color: '#fbbf24' }}>
              {r.flags.map((f) => f.code.replace(/_/g, ' ')).join(' · ')}
            </span>
          )}
        </div>
        <span className="muted" style={{ fontSize: 22 }}>
          ›
        </span>
      </div>
    );
  };

  return (
    <div>
      <PageTitle
        title="Review queue"
        subtitle={`${flagged.length} reading${flagged.length === 1 ? '' : 's'} need attention`}
      />

      {flagged.length === 0 ? (
        <Empty icon="🎯">Nothing flagged — exception-based automation is keeping up.</Empty>
      ) : (
        flagged.map((r) => <Item key={r.id} r={r} />)
      )}

      {recent.length > 0 && (
        <>
          <div className="section-title">Recent activity</div>
          {recent.map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}
