import { type ReactNode } from 'react';
import type { Meter, Reading, ReadingStatus } from '../types';
import { METER_COLOR, METER_ICON } from '../lib/format';

export function MeterIcon({ meter, size }: { meter: Meter; size?: number }) {
  return (
    <div
      className="meter-icon"
      style={{
        background: `${METER_COLOR[meter.meter_type]}22`,
        color: METER_COLOR[meter.meter_type],
        width: size,
        height: size,
      }}
    >
      {METER_ICON[meter.meter_type]}
    </div>
  );
}

const STATUS_LABEL: Record<ReadingStatus, string> = {
  confirmed: 'Confirmed',
  flagged: 'Needs review',
  pending: 'Pending',
  rejected: 'Rejected',
};

export function StatusBadge({ status, queued }: { status: ReadingStatus; queued?: boolean }) {
  if (queued) return <span className="badge queued">⇅ Queued</span>;
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function SyncBadge({ reading }: { reading: Reading }) {
  return <StatusBadge status={reading.status} queued={reading.sync_state === 'queued'} />;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: '4px 0 2px', fontSize: 22 }}>{title}</h2>
      {subtitle && <div className="muted small">{subtitle}</div>}
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 44, marginBottom: 10 }}>{icon}</div>
      {children}
    </div>
  );
}
