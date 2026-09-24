'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSseAnalyticsUrl } from '../api/sse-url';
import { getToken } from '../../auth/session';

export type SseStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Subscribes to the SSE analytics stream for a short code.
 * Uses fetch so the bearer token can be sent. EventSource cannot set headers.
 * On each `analytics` event, invalidates the React Query cache.
 */
export function useAnalyticsStream(shortCode: string, enabled = true) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>('disconnected');
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function scheduleReconnect(): void {
      if (cancelled) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30_000);
      retryTimeoutRef.current = setTimeout(() => {
        void connect();
      }, delay);
    }

    async function connect(): Promise<void> {
      if (cancelled) return;
      setStatus('connecting');
      const abort = new AbortController();
      abortRef.current = abort;
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      const token = getToken();
      if (token !== null) headers['Authorization'] = `Bearer ${token}`;

      let res: Response;
      try {
        res = await fetch(getSseAnalyticsUrl(shortCode), { headers, signal: abort.signal });
      } catch {
        if (!cancelled) {
          setStatus('error');
          scheduleReconnect();
        }
        return;
      }
      if (!res.ok || res.body === null) {
        if (!cancelled) {
          setStatus('error');
          scheduleReconnect();
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const eventLine = frame.split('\n').find((line) => line.startsWith('event:'));
            const event = eventLine?.slice('event:'.length).trim();
            if (event === 'connected' && !cancelled) {
              setStatus('connected');
              retryDelayRef.current = 1000;
            }
            if (event === 'analytics' && !cancelled) {
              void queryClient.invalidateQueries({ queryKey: ['analytics', shortCode] });
            }
            if (event === 'shutdown' && !cancelled) {
              setStatus('disconnected');
              scheduleReconnect();
              return;
            }
          }
        }
        if (!cancelled) {
          setStatus('disconnected');
          scheduleReconnect();
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          scheduleReconnect();
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current !== null) clearTimeout(retryTimeoutRef.current);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [shortCode, enabled, queryClient]);

  return { status };
}
