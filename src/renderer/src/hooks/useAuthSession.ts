import { useEffect, useState, useCallback } from "react";

export interface AuthSessionView {
  signed_in: boolean;
  email: string | null;
  user_id: string | null;
  expires_at: number | null;
}

const EMPTY: AuthSessionView = {
  signed_in: false,
  email: null,
  user_id: null,
  expires_at: null,
};

/**
 * Subscribes to main-process session changes via IPC and exposes the
 * current view + a refresh helper. Mounting this hook is cheap — it
 * fetches the session once and listens for `auth-session-changed`.
 */
export function useAuthSession(): {
  session: AuthSessionView;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [session, setSession] = useState<AuthSessionView>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const view = await window.hermesAPI.authGetSession();
    setSession(view);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const view = await window.hermesAPI.authGetSession();
      if (!cancelled) {
        setSession(view);
        setLoading(false);
      }
    })();
    const off = window.hermesAPI.onAuthSessionChanged((v) => {
      if (!cancelled) setSession(v);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return { session, loading, refresh };
}
