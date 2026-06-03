import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { PageTitle } from '../components/ui';
import { useAppState } from '../hooks/AppState';
import { syncQueued } from '../lib/repo';
import { resetAll } from '../db/seed';
import type { UserRole } from '../types';

const ROLES: UserRole[] = ['technician', 'manager', 'admin', 'client_viewer'];

export default function SettingsPage() {
  const { user, setUser, online, setOnline } = useAppState();
  const [msg, setMsg] = useState<string | null>(null);

  const queued = useLiveQuery(() => db.readings.where('sync_state').equals('queued').count(), []);
  const visionMode = import.meta.env.VITE_VISION_API_URL ? 'Live API' : 'Mock extractor';

  async function doSync() {
    const n = await syncQueued();
    setMsg(`Synced ${n} queued reading${n === 1 ? '' : 's'}.`);
  }
  async function doReset() {
    if (!confirm('Reset all data back to the pilot seed?')) return;
    await resetAll();
    setMsg('Demo data reset.');
  }

  return (
    <div>
      <PageTitle title="Settings" subtitle="Demo controls" />

      <div className="card">
        <label className="field" style={{ marginBottom: 12 }}>
          <span className="lbl">Acting as</span>
          <select
            value={user.role}
            onChange={(e) =>
              setUser({
                ...user,
                role: e.target.value as UserRole,
                name: `${cap(e.target.value)} (${user.id})`,
              })
            }
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {cap(r)}
              </option>
            ))}
          </select>
        </label>
        <div className="kv">
          <span className="k">Connectivity</span>
          <label className="switch">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
            <span>{online ? 'Online' : 'Offline'}</span>
          </label>
        </div>
        <div className="kv">
          <span className="k">Queued offline</span>
          <span className="v">{queued ?? 0}</span>
        </div>
        <div className="kv">
          <span className="k">Vision mode</span>
          <span className="v">{visionMode}</span>
        </div>
      </div>

      <button className="btn" onClick={doSync} disabled={!online || !queued}>
        ⇅ Sync queued readings
      </button>

      <div className="section-title">Danger zone</div>
      <button className="btn danger" onClick={doReset}>
        ♻️ Reset demo data
      </button>

      {msg && (
        <div className="banner success" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div className="muted small">
          SnapMeter MVP · offline-first PWA. QR resolves identity, vision reads the value
          constrained to the meter's format, validation auto-confirms or flags, and confirmed
          readings fill the client Excel. See README for the production wiring (Supabase + real
          vision API + openpyxl).
        </div>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
