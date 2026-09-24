import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type { UrlService } from '../services/url.service.js';
import { log } from '../observability/logger.js';
import { env } from '../config/env.js';
import { sseActiveConnections, sseEventsSent } from './sse-metrics.js';

export interface SseConnection {
  id: string;
  shortCode: string;
  userId: string;
  res: Response;
  createdAt: number;
}

/**
 * Manages SSE connections and fans out analytics updates via Redis pub/sub.
 *
 * Flow:
 * 1. Client connects to GET /api/v1/urls/:shortCode/analytics/stream
 * 2. Connection is registered in the manager
 * 3. Manager subscribes to Redis channel `analytics:click:{shortCode}`
 * 4. When the analytics worker publishes a click event, the subscriber receives it
 * 5. Manager fetches full stats from PostgreSQL (source of truth)
 * 6. Manager broadcasts the updated stats to all connected clients for that shortCode
 *
 * Why fetch from PG on each message instead of forwarding the raw event?
 * - The raw event is just one click; the client needs full aggregated stats
 * - PG is the source of truth; forwarding partial data risks inconsistency
 * - The redirect path already wrote to PG, so the read is consistent
 */
export class SseConnectionManager {
  private connections = new Map<string, SseConnection>();
  private subscriptions = new Map<string, Set<string>>(); // channel → connection IDs
  private keepalive: ReturnType<typeof setInterval> | undefined;
  private idCounter = 0;

  constructor(
    private readonly subscriber: Redis,
    private readonly service: UrlService,
  ) {
    const doSubscribe = (): void => {
      this.subscriber.psubscribe('analytics:click:*', (err) => {
        if (err) {
          log('error', 'SSE: psubscribe failed', { error: (err as Error).message });
        } else {
          log('info', 'SSE: subscribed to analytics:click:*');
        }
      });
    };

    // Wait for Redis subscriber to be ready before subscribing.
    // enableOfflineQueue:false means commands fail if issued before connect.
    if (this.subscriber.status === 'ready') {
      doSubscribe();
    } else {
      this.subscriber.once('ready', doSubscribe);
    }

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const shortCode = channel.replace('analytics:click:', '');
      void this.handleClick(shortCode, message);
    });

    // Keepalive: send :ping comments to prevent proxy timeouts
    this.keepalive = setInterval(() => {
      for (const conn of this.connections.values()) {
        try {
          conn.res.write(':ping\n\n');
        } catch {
          this.removeConnection(conn.id);
        }
      }
    }, env.SSE_KEEPALIVE_MS);

    log('info', 'SSE connection manager initialized');
  }

  /** Rejects before the stream opens so 401/404 stay JSON. */
  async assertOwned(shortCode: string, userId: string): Promise<void> {
    await this.service.assertOwned(shortCode, userId);
  }

  /**
   * Register a new SSE connection. Sends initial `connected` event.
   * Returns the connection ID (used for cleanup on client disconnect).
   */
  addConnection(shortCode: string, res: Response, userId: string): string {
    if (this.connections.size >= env.SSE_MAX_CONNECTIONS) {
      log('warn', 'SSE: max connections reached', { limit: env.SSE_MAX_CONNECTIONS });
      res.status(503).json({ error: 'ServiceUnavailable', message: 'Too many SSE connections' });
      return '';
    }

    const id = `sse-${++this.idCounter}-${Date.now()}`;
    const connection: SseConnection = { id, shortCode, userId, res, createdAt: Date.now() };
    this.connections.set(id, connection);

    const channel = `analytics:click:${shortCode}`;
    let subs = this.subscriptions.get(channel);
    if (subs === undefined) {
      subs = new Set();
      this.subscriptions.set(channel, subs);
    }
    subs.add(id);

    sseActiveConnections.inc();

    // Send initial connected event
    this.sendEvent(id, 'connected', { shortCode });

    log('debug', 'SSE: client connected', { id, shortCode });
    return id;
  }

  /**
   * Remove a connection (on client disconnect or error).
   * Unsubscribes from Redis if no more clients watch this channel.
   */
  removeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn === undefined) return;

    this.connections.delete(id);

    const channel = `analytics:click:${conn.shortCode}`;
    const subs = this.subscriptions.get(channel);
    if (subs !== undefined) {
      subs.delete(id);
      if (subs.size === 0) {
        this.subscriptions.delete(channel);
        // No more clients for this channel — unsubscribe from Redis
        void this.subscriber.punsubscribe(channel).catch(() => { /* intentionally empty */ });
      }
    }

    sseActiveConnections.dec();
    log('debug', 'SSE: client disconnected', { id, shortCode: conn.shortCode });
  }

  /**
   * Handle a click event from Redis pub/sub.
   * Fetches full stats from PG and broadcasts to all connected clients.
   */
  private async handleClick(shortCode: string, _rawMessage: string): Promise<void> {
    const channel = `analytics:click:${shortCode}`;
    const subs = this.subscriptions.get(channel);
    if (subs === undefined || subs.size === 0) return;

    try {
      const ownerId = [...subs]
        .map((id) => this.connections.get(id)?.userId)
        .find((id): id is string => id !== undefined);
      if (ownerId === undefined) return;
      const stats = await this.service.getUrlAnalytics(shortCode, ownerId);
      for (const connId of subs) {
        this.sendEvent(connId, 'analytics', stats);
      }
    } catch (err) {
      log('warn', 'SSE: failed to fetch analytics for broadcast', {
        shortCode,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Send a named SSE event to a specific connection.
   * Silently removes the connection on write failure (client gone).
   */
  private sendEvent(connId: string, event: string, data: unknown): void {
    const conn = this.connections.get(connId);
    if (conn === undefined) return;

    try {
      conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sseEventsSent.inc();
    } catch {
      this.removeConnection(connId);
    }
  }

  /**
   * Broadcast a shutdown event to all connected clients and close responses.
   * Called during graceful server shutdown.
   */
  broadcastShutdown(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.res.write('event: shutdown\ndata: {"message":"Server shutting down"}\n\n');
        conn.res.end();
      } catch {
        // Client already gone
      }
    }
    this.connections.clear();
    this.subscriptions.clear();
  }

  /** Tear down the manager: unsubscribe, clear keepalive, close all connections. */
  close(): void {
    if (this.keepalive !== undefined) {
      clearInterval(this.keepalive);
      this.keepalive = undefined;
    }
    this.broadcastShutdown();
    void this.subscriber.punsubscribe().catch(() => { /* intentionally empty */ });
    log('info', 'SSE connection manager closed');
  }

  /** Current number of active connections (for health/metrics). */
  get activeConnections(): number {
    return this.connections.size;
  }
}
