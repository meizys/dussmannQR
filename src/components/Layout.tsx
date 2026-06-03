import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/AppState';

const NAV = [
  { to: '/', label: 'Route', ico: '🗺️', end: true },
  { to: '/review', label: 'Review', ico: '✅' },
  { to: '/scan', label: 'Scan', ico: '📷', scan: true },
  { to: '/meters', label: 'Meters', ico: '🏷️' },
  { to: '/export', label: 'Export', ico: '📄' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { online } = useAppState();
  const navigate = useNavigate();
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">📟</span>
          <h1>SnapMeter</h1>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className={`badge ${online ? 'confirmed' : 'queued'}`}>
            {online ? '● Online' : '○ Offline'}
          </span>
          <button
            className="btn ghost"
            style={{ width: 'auto', minHeight: 40, padding: '0 10px' }}
            onClick={() => navigate('/settings')}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `${n.scan ? 'scan' : ''} ${isActive ? 'active' : ''}`.trim()
            }
          >
            <span className="ico">{n.ico}</span>
            {!n.scan && <span>{n.label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
