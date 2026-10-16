"use client";

import { useEffect, useRef, useState } from "react";

interface EventStreamOptions {
  url: string;
  onEvent?: (ev: MessageEvent) => void;
  onError?: (e: Event) => void;
  withSince?: boolean;
}

export function useEventStream(opts: EventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let url = opts.url;
    if (opts.withSince && lastEventId) {
      url = url.includes("?") ? `${url}&since=${lastEventId}` : `${url}?since=${lastEventId}`;
    } else if (opts.withSince) {
      url = url.includes("?") ? `${url}&since=` : `${url}?since=`;
    }
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = (e) => {
      setConnected(false);
      opts.onError?.(e);
    };
    es.onmessage = (ev) => {
      if (ev.lastEventId) setLastEventId(ev.lastEventId);
      opts.onEvent?.(ev);
    };
    return () => {
      es.close();
    };
  }, [opts.url]);

  return { connected, lastEventId, close: () => esRef.current?.close() };
}
