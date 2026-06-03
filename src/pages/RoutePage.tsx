import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { currentPeriod } from '../db/seed';
import { MeterIcon, PageTitle, SyncBadge, Empty } from '../components/ui';
import { formatValue, periodLabel, relativeTime } from '../lib/format';
import type { Reading } from '../types';

export default function RoutePage() {
  const navigate = useNavigate();
  const period = currentPeriod();

  const data = useLiveQuery(async () => {
    const sites = await db.sites.toArray();
    const meters = await db.meters.where('status').equals('active').toArray();
    const readings = await db.readings.where('period').equals(period).toArray();
    return { sites, meters, readings };
  }, [period]);

  if (!data) return null;
  const { sites, meters, readings } = data;
  const thisPeriod = new Map<string, Reading>();
  for (const r of readings) thisPeriod.set(r.meter_id, r);
  const done = meters.filter((m) => thisPeriod.has(m.id)).length;

  return (
    <div>
      <PageTitle title="Today's route" subtitle={`Period ${periodLabel(period)}`} />

      <div className="card">
        <div className="row between">
          <div className="stack">
            <span className="muted small">Meters read this period</span>
            <span className="big-num">
              {done}
              <span className="muted" style={{ fontSize: 18 }}>
                {' '}
                / {meters.length}
              </span>
            </span>
          </div>
          <div style={{ fontSize: 40 }}>{done === meters.length ? '🎉' : '📋'}</div>
        </div>
        <div className="progress-track" style={{ marginTop: 12 }}>
          <div
            className="progress-fill"
            style={{ width: `${meters.length ? (done / meters.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {sites.map((site) => {
        const siteMeters = meters.filter((m) => m.site_id === site.id);
        if (!siteMeters.length) return null;
        return (
          <div key={site.id}>
            <div className="section-title">{site.name}</div>
            {siteMeters.map((meter) => {
              const reading = thisPeriod.get(meter.id);
              return (
                <div
                  key={meter.id}
                  className="card tappable row"
                  onClick={() => navigate(`/capture/${meter.id}`)}
                >
                  <MeterIcon meter={meter} />
                  <div className="grow stack">
                    <div className="row between">
                      <strong>{meter.meter_label}</strong>
                      {reading ? (
                        <SyncBadge reading={reading} />
                      ) : (
                        <span className="badge pending">Due</span>
                      )}
                    </div>
                    <span className="muted small">
                      {reading
                        ? `${formatValue(reading.reading_value, meter)} ${meter.units} · ${relativeTime(
                            reading.captured_at
                          )}`
                        : `${meter.meter_type} · ${meter.units}`}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: 22 }}>
                    ›
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {meters.length === 0 && <Empty icon="🏷️">No meters yet. Add some under Meters.</Empty>}
    </div>
  );
}
