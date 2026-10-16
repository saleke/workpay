"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/errors";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * Run an async API call in a client component and track its loading/error
 * state. `deps` controls re-fetching, exactly like `useEffect`. Authoritative
 * data always comes from `/api/v1`; the hook only holds disposable client state
 * (invariant F1).
 */
export function useApi<T>(
  fetcher: () => Promise<{ data: T | null; error: ApiError | null }>,
  deps: React.DependencyList,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const current = ++seq.current;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetcher()
      .then((res) => {
        if (cancelled || current !== seq.current) return;
        setState({ data: res.data, error: res.error, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled || current !== seq.current) return;
        setState({
          data: null,
          error: e instanceof ApiError ? e : new ApiError(String(e), 0),
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload };
}
