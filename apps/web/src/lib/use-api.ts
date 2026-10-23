"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/errors";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/** In-memory SWR cache for instant page population without waiting on spinners. */
const apiCache = new Map<string, unknown>();

export function clearApiCache(keyPrefix?: string) {
  if (!keyPrefix) {
    apiCache.clear();
    return;
  }
  for (const k of apiCache.keys()) {
    if (k.startsWith(keyPrefix)) apiCache.delete(k);
  }
}

export function setApiCache<T>(key: string, data: T) {
  apiCache.set(key, data);
}

/**
 * Run an async API call in a client component and track its loading/error state.
 * Supports an optional cacheKey to provide instant stale-while-revalidate data rendering.
 */
export function useApi<T>(
  fetcher: () => Promise<{ data: T | null; error: ApiError | null }>,
  deps: React.DependencyList,
  cacheKey?: string,
): AsyncState<T> & { reload: () => void; isRefreshing: boolean } {
  // If we have cached data for this key, start with it immediately (0ms wait, no spinner)
  const cachedData = cacheKey ? (apiCache.get(cacheKey) as T | undefined) ?? null : null;
  const [state, setState] = useState<AsyncState<T>>({
    data: cachedData,
    error: null,
    loading: cachedData === null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const current = ++seq.current;
    let cancelled = false;

    const cached = cacheKey ? (apiCache.get(cacheKey) as T | undefined) : undefined;
    if (cached !== undefined) {
      setState((s) => ({ ...s, data: cached, loading: false }));
      setIsRefreshing(true);
    } else {
      setState((s) => (s.data !== null ? s : { ...s, loading: true }));
    }

    fetcher()
      .then((res) => {
        if (cancelled || current !== seq.current) return;
        if (res.data !== null && cacheKey) {
          apiCache.set(cacheKey, res.data);
        }
        setState({ data: res.data, error: res.error, loading: false });
        setIsRefreshing(false);
      })
      .catch((e: unknown) => {
        if (cancelled || current !== seq.current) return;
        setState((prev) => ({
          ...prev,
          error: e instanceof ApiError ? e : new ApiError(String(e), 0),
          loading: false,
        }));
        setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, cacheKey]);

  return { ...state, reload, isRefreshing };
}
