'use client';
import { useEffect, useState, useCallback } from 'react';

/**
 * Fetches JSON from a workspace-local API route and falls back to a mock value
 * on error or when the backend returns an empty array.
 * `live` is true once we successfully hit the backend (even if empty).
 */
export function useApiOrMock<T>(url: string, mock: T): { data: T; live: boolean; loading: boolean; error?: string; refresh: () => void } {
  const [data, setData] = useState<T>(mock);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [ver, setVer] = useState(0);
  const refresh = useCallback(() => setVer(v => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as T;
        if (cancelled) return;
        setLive(true);
        // Empty arrays still mean "live but no rows" — show mock for demo continuity.
        if (Array.isArray(j) && j.length === 0) setData(mock);
        else setData(j);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError((e as Error)?.message);
        // keep mock
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, ver]);

  return { data, live, loading, error, refresh };
}
