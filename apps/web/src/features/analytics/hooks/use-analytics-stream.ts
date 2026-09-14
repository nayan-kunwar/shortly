'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSseAnalyticsUrl } from '../api/sse-url';

export type SseStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Subscribes to the SSE analytics stream for a short code.
 * On each `analytics` event, invalidates the React Query cache
 * so the polling hook refetches fresh data.
 *
 * Handles reconnection with exponential backoff.
 */
export function useAnalyticsStream(shortCode: string, enabled = true) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      setStatus('connecting');
      const url = getSseAnalyticsUrl(shortCode);
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        if (!cancelled) {
          setStatus('connected');
          retryDelayRef.current = 1000; // reset backoff
        }
      });

      es.addEventListener('analytics', () => {
        if (!cancelled) {
          // Invalidate the analytics query so it refetches with fresh data
          void queryClient.invalidateQueries({ queryKey: ['analytics', shortCode] });
        }
      });

      es.addEventListener('shutdown', () => {
        if (!cancelled) {
          setStatus('disconnected');
          es.close();
          scheduleReconnect();
        }
      });

      es.addEventListener('error', () => {
        if (!cancelled) {
          setStatus('error');
          es.close();
          scheduleReconnect();
        }
      });

      es.onopen = () => {
        // Connection opened but no 'connected' event yet — still connecting
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30_000); // exponential backoff, max 30s
      retryTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (eventSourceRef.current !== null) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [shortCode, enabled, queryClient]);

  return { status };
}
