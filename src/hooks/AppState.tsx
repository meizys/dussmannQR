import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../types';

// Lightweight global state: the signed-in user (mocked) and a manual offline
// toggle so the offline-first behaviour is demonstrable on a desktop browser.

interface AppState {
  user: User;
  setUser: (u: User) => void;
  online: boolean;
  setOnline: (v: boolean) => void;
}

const DEFAULT_USER: User = { id: 'tech-1', role: 'technician', name: 'Alex (Technician)' };

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(DEFAULT_USER);
  const [online, setOnlineState] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const on = () => setOnlineState(true);
    const off = () => setOnlineState(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const setOnline = useCallback((v: boolean) => setOnlineState(v), []);

  const value = useMemo(
    () => ({ user, setUser, online, setOnline }),
    [user, online, setOnline]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
