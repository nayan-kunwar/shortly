# SSE Real-Time Analytics

How live analytics updates flow from a user click to a real-time dashboard refresh — the complete SSE architecture in Shortly.

---

## The Problem

When someone clicks your short link, you want the analytics dashboard to update **in real-time** — not after a 30-second polling interval. Server-Sent Events (SSE) solve this: the server pushes updates to the browser over a single persistent HTTP connection.

---

## The Complete Flow

```
User taps short link
       │
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ① Redirect (Express)                                   │
  │    GET /:shortCode → 302                                │
  │    Meanwhile: fire-and-forget → outbox_events           │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ② Publisher Worker (polls every 2s)                     │
  │    outbox_events → RabbitMQ                             │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ③ Analytics Worker (consumes RabbitMQ)                  │
  │    micro-batch INSERT → click_events                    │
  │    THEN: redis.publish('analytics:click:abc123', ...)   │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ④ Redis Pub/Sub                                         │
  │    channel: analytics:click:abc123                      │
  │    subscriber: SseConnectionManager                     │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ⑤ SseConnectionManager                                  │
  │    receives pmessage                                    │
  │    fetches FULL stats from PostgreSQL                   │
  │    broadcasts to ALL connected clients for abc123       │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ⑥ Browser (EventSource)                                 │
  │    receives: event: analytics / data: {totalClicks...}  │
  │    → invalidates React Query cache                      │
  │    → dashboard re-renders with fresh data               │
  └─────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Code Walkthrough

### Step 1: Client Opens SSE Connection

When a user visits `/urls/abc123/analytics`, the frontend opens an `EventSource` connection.

**Frontend hook:** `apps/web/src/features/analytics/hooks/use-analytics-stream.ts`

```typescript
export function useAnalyticsStream(shortCode: string, enabled = true) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>('disconnected');

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      setStatus('connecting');
      const url = getSseAnalyticsUrl(shortCode);
      // e.g. http://localhost:3000/api/v1/urls/abc123/analytics/stream
      const es = new EventSource(url);

      es.addEventListener('connected', () => {
        setStatus('connected');
        retryDelayRef.current = 1000; // reset backoff
      });

      es.addEventListener('analytics', () => {
        // Server sent new stats — invalidate cache so React Query refetches
        void queryClient.invalidateQueries({ queryKey: ['analytics', shortCode] });
      });

      es.addEventListener('error', () => {
        setStatus('error');
        es.close();
        scheduleReconnect(); // exponential backoff: 1s → 2s → 4s → ... → 30s max
      });
    }

    connect();
    // cleanup: es.close() on unmount
  }, [shortCode, enabled, queryClient]);
}
```

**What happens:**
1. Browser opens `GET /api/v1/urls/abc123/analytics/stream` with `Accept: text/event-stream`
2. The HTTP connection stays open — this is the SSE channel
3. Server pushes events through this connection as they happen

---

### Step 2: Server Accepts the SSE Connection

**Route:** `apps/api/src/routes/analytics-stream.ts`

```typescript
router.get('/:shortCode/analytics/stream', controller.streamAnalytics);
```

**Controller:** `apps/api/src/controllers/analytics-sse.controller.ts`

```typescript
async streamAnalytics(req, res, next) {
  const { shortCode } = shortCodeParams.parse(req.params);

  // Set SSE headers — tells the browser this is an event stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');     // Nginx: don't buffer
  res.setHeader('Content-Encoding', 'identity'); // No compression for SSE
  res.flushHeaders(); // Send headers immediately, don't wait for body

  // Register with the connection manager — this is where the magic happens
  const connId = manager.addConnection(shortCode, res);
  if (connId === '') return; // 503: max connections reached

  // Cleanup when client disconnects (browser tab closed, network drop, etc.)
  req.on('close', () => {
    manager.removeConnection(connId);
  });
}
```

**Key headers explained:**
| Header | Why |
|---|---|
| `Content-Type: text/event-stream` | Tells the browser "this is SSE, parse it as events" |
| `Cache-Control: no-cache` | Prevents proxies/browsers from caching the stream |
| `Connection: keep-alive` | Keeps the TCP connection open |
| `X-Accel-Buffering: no` | Nginx: disable response buffering (otherwise events pile up) |
| `Content-Encoding: identity` | Disable compression — SSE is streamed, not buffered |

---

### Step 3: Connection Manager Registers the Client

**File:** `apps/api/src/sse/connection-manager.ts`

```typescript
export class SseConnectionManager {
  private connections = new Map<string, SseConnection>();      // id → connection
  private subscriptions = new Map<string, Set<string>>();      // channel → connection IDs

  constructor(subscriber: Redis, service: UrlService) {
    // Subscribe to ALL analytics click events via pattern
    this.subscriber.psubscribe('analytics:click:*');

    // When any analytics:click:* message arrives, handle it
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const shortCode = channel.replace('analytics:click:', '');
      void this.handleClick(shortCode, message);
    });

    // Keepalive: send :ping comments every 30s to prevent proxy timeouts
    this.keepalive = setInterval(() => {
      for (const conn of this.connections.values()) {
        conn.res.write(':ping\n\n'); // SSE comment — client ignores it
      }
    }, 30_000);
  }

  addConnection(shortCode: string, res: Response): string {
    if (this.connections.size >= env.SSE_MAX_CONNECTIONS) {
      res.status(503).json({ error: 'ServiceUnavailable' });
      return '';
    }

    const id = `sse-${++this.idCounter}-${Date.now()}`;
    this.connections.set(id, { id, shortCode, res, createdAt: Date.now() });

    // Track which connections watch which channel
    let subs = this.subscriptions.get(`analytics:click:${shortCode}`);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(`analytics:click:${shortCode}`, subs);
    }
    subs.add(id);

    // Send initial confirmation event
    this.sendEvent(id, 'connected', { shortCode });
    return id;
  }
}
```

**Two maps, one purpose:**
- `connections` — maps connection ID to the Express Response object (for writing SSE events)
- `subscriptions` — maps Redis channel name to set of connection IDs (for fan-out)

**Pattern subscribe (`psubscribe`):** Instead of subscribing to one channel per short code, we subscribe to `analytics:click:*` once. Redis matches any channel starting with `analytics:click:`. This scales to millions of short codes with a single subscription.

---

### Step 4: Analytics Worker Publishes to Redis

After the analytics worker inserts clicks into PostgreSQL, it notifies the SSE system via Redis pub/sub.

**File:** `apps/api/src/workers/analytics-worker.ts:107-118`

```typescript
// After successful DB insert...
if (redis !== undefined) {
  for (const m of toFlush) {
    void redis
      .publish(`analytics:click:${m.parsed.shortCode}`, JSON.stringify(m.parsed))
      .catch((err) => {
        log('warn', 'SSE publish failed', { error: err.message });
      });
  }
}
```

**Key design decisions:**
- **Fire-and-forget (`void`):** If Redis is down, SSE clients miss the update. But the data is safe in PostgreSQL. No retry, no blocking.
- **After DB insert, not before:** The click must be in PG first, so when the SSE manager fetches stats, it includes the new click.
- **One publish per click:** Each click gets its own Redis message. The SSE manager handles fan-out to multiple clients.

---

### Step 5: SSE Manager Receives the Redis Message

The `SseConnectionManager` is subscribed to `analytics:click:*` via `psubscribe`. When the analytics worker publishes, the manager's `pmessage` handler fires.

**File:** `apps/api/src/sse/connection-manager.ts:128-144`

```typescript
private async handleClick(shortCode: string, _rawMessage: string): Promise<void> {
  const channel = `analytics:click:${shortCode}`;
  const subs = this.subscriptions.get(channel);

  // No clients watching this shortCode — skip
  if (!subs || subs.size === 0) return;

  try {
    // Fetch FULL aggregated stats from PostgreSQL
    // (not just the raw click event — the client needs totals, breakdowns, etc.)
    const stats = await this.service.getUrlAnalytics(shortCode);

    // Broadcast to every connected client watching this shortCode
    for (const connId of subs) {
      this.sendEvent(connId, 'analytics', stats);
    }
  } catch (err) {
    log('warn', 'SSE: failed to fetch analytics for broadcast', {
      shortCode,
      error: err.message,
    });
  }
}
```

**Why fetch from PG instead of forwarding the raw event?**

The raw Redis message is just one click:
```json
{"shortCode":"abc123","clickedAt":"2026-09-15T10:00:00Z","ip":"192.168.1.0",...}
```

But the dashboard needs **full aggregated stats**:
```json
{
  "shortCode": "abc123",
  "totalClicks": 42,
  "clicksByDay": [{"date":"2026-09-15","count":5}, ...],
  "countries": {"IN": 20, "US": 15, ...},
  "devices": {"mobile": 30, "desktop": 12},
  "browsers": {"Chrome": 25, "Safari": 12}
}
```

Fetching from PG ensures:
- The stats always reflect the latest data (the click was just inserted)
- No complex client-side merging of incremental updates
- Consistency even if multiple clicks arrive in quick succession

---

### Step 6: Server Sends the SSE Event

**File:** `apps/api/src/sse/connection-manager.ts:150-159`

```typescript
private sendEvent(connId: string, event: string, data: unknown): void {
  const conn = this.connections.get(connId);
  if (!conn) return;

  try {
    // SSE format: named event with JSON data
    conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    sseEventsSent.inc();
  } catch {
    // Client disconnected — clean up silently
    this.removeConnection(connId);
  }
}
```

**SSE wire format:**
```
event: analytics
data: {"shortCode":"abc123","totalClicks":42,"countries":{"IN":20,"US":15},"devices":{"mobile":30,"desktop":12},"browsers":{"Chrome":25,"Safari":12}}

```

The `\n\n` (double newline) terminates the event. The browser's `EventSource` parser splits on this and dispatches `es.addEventListener('analytics', ...)`.

**Other event types sent:**
| Event | When | Data |
|---|---|---|
| `connected` | Client first connects | `{shortCode}` |
| `analytics` | Click event processed | Full aggregated stats |
| `shutdown` | Server shutting down | `{message:"Server shutting down"}` |
| `:ping` | Every 30s (keepalive) | Comment — client ignores |

---

### Step 7: Browser Receives and Reacts

Back in the frontend hook:

```typescript
es.addEventListener('analytics', () => {
  if (!cancelled) {
    // Don't process the data directly — invalidate the query cache
    // so TanStack Query refetches from the REST API
    void queryClient.invalidateQueries({ queryKey: ['analytics', shortCode] });
  }
});
```

**Why invalidate instead of using the SSE data directly?**

The SSE event triggers a refetch from `GET /api/v1/urls/:shortCode/analytics`. This:
- Keeps the data shape consistent (same source for initial load and updates)
- Avoids duplicating parsing/rendering logic
- Allows the REST response to include computed fields the SSE payload doesn't have
- Keeps TanStack Query as the single source of truth for server state

---

## Why Two Redis Connections?

Redis pub/sub puts the connection into **subscriber mode** — it can only receive `PUBLISH` messages. It cannot issue `GET`, `SET`, `PING`, or any other command.

```
Regular Redis Client          Subscriber Redis Client
┌─────────────────────┐      ┌─────────────────────┐
│ GET url:abc123      │      │ PSUBSCRIBE          │
│ SET url:abc123 ...  │      │ analytics:click:*   │
│ DEL rate:1.2.3.4    │      │ (receives messages) │
│ INCR rate:1.2.3.4   │      │                     │
└─────────────────────┘      └─────────────────────┘
        │                              │
        └──────────┬───────────────────┘
                   │
              Same Redis server
              Different connections
```

The main Redis client (`apps/api/src/redis/client.ts`) handles caching and rate limiting. The subscriber client (`apps/api/src/redis/subscriber-client.ts`) is dedicated to pub/sub.

---

## Connection Lifecycle

```
Browser opens EventSource
         │
         ▼
Controller sets SSE headers
         │
         ▼
SseConnectionManager.addConnection()
  → stores in connections Map
  → adds to subscriptions Set
  → sends 'connected' event
         │
         ▼
Connection stays open...
  → :ping every 30s (keepalive)
  → 'analytics' events as clicks happen
         │
         ▼
Client disconnects (tab close, navigate away, network drop)
         │
         ▼
req.on('close') fires
         │
         ▼
SseConnectionManager.removeConnection()
  → removes from connections Map
  → removes from subscriptions Set
  → if no more clients on channel: punsubscribe from Redis
  → decrements active connections gauge
```

---

## Keepalive and Timeout Prevention

Nginx and many proxies close idle connections after 60s. The keepalive mechanism prevents this:

```typescript
this.keepalive = setInterval(() => {
  for (const conn of this.connections.values()) {
    try {
      conn.res.write(':ping\n\n'); // SSE comment — invisible to client
    } catch {
      this.removeConnection(conn.id); // Dead connection — clean up
    }
  }
}, env.SSE_KEEPALIVE_MS); // Default: 30000ms (30s)
```

**SSE comments** start with `:` and are ignored by the `EventSource` API. They're just心跳 to keep the TCP connection alive through proxies.

Nginx config also needs:
```nginx
location /api/v1/urls/:shortCode/analytics/stream {
    proxy_buffering off;
    proxy_read_timeout 86400s;  # 24 hours
    proxy_send_timeout 86400s;
}
```

---

## Reconnection with Exponential Backoff

If the SSE connection drops, the browser's `EventSource` doesn't auto-reconnect with backoff (it retries immediately, which can cause retry storms). The hook implements its own:

```typescript
function scheduleReconnect() {
  const delay = retryDelayRef.current;
  retryDelayRef.current = Math.min(delay * 2, 30_000); // 1s → 2s → 4s → 8s → ... → 30s max
  retryTimeoutRef.current = setTimeout(connect, delay);
}
```

**Why manual backoff?** Browser `EventSource` has a built-in reconnection, but:
- It retries immediately on some error types
- It doesn't respect server-side shutdown signals
- It doesn't reset backoff on success

The hook takes full control: close the `EventSource`, wait with backoff, create a new one.

---

## Failure Modes

| Failure | What happens | Data loss? |
|---|---|---|
| **Redis down** | SSE clients miss real-time updates | No — data safe in PG, manual refresh works |
| **RabbitMQ down** | No events published → no SSE events | No — events wait in outbox |
| **Analytics worker down** | No events consumed → no Redis publish → no SSE | No — events wait in RabbitMQ |
| **PG down** | `getUrlAnalytics()` fails → SSE broadcast skipped | No — click still in outbox, will retry |
| **SSE client disconnects** | `req.on('close')` → cleanup | N/A |
| **Max connections reached** | Returns 503, doesn't register | N/A |
| **Server shuts down** | Broadcasts `event: shutdown` → closes connections | N/A |

**The critical guarantee:** SSE is a **performance optimization**, not a correctness requirement. If SSE fails, the dashboard still works via manual refresh. The analytics data is always in PostgreSQL.

---

## Scaling: Why Redis Pub/Sub?

In single-process mode (Render free tier), the analytics worker and SSE manager are in the same Node.js process. But the architecture is designed for horizontal scaling:

```
Without Redis Pub/Sub (broken at scale):

API Instance 1          API Instance 2
     │                       │
     ▼                       ▼
SSE Manager 1           SSE Manager 2
     │                       │
Analytics Worker 1      Analytics Worker 2  ← double processing!
     │                       │


With Redis Pub/Sub (scales):

API Instance 1          API Instance 2
     │                       │
     ▼                       ▼
SSE Manager 1           SSE Manager 2
     │                       │
     └───────┬───────────────┘
             │
        Redis Pub/Sub
             │
             ▼
      Analytics Worker (once)
      publishes once → ALL instances receive it
```

The analytics worker publishes **once** to Redis. Every API instance with an SSE manager receives the message and broadcasts to its local clients. No double processing, no coordination needed.

---

## Metrics

Exposed via `apps/api/src/sse/sse-metrics.ts` in Prometheus format:

```
# HELP sse_active_connections Current number of active SSE connections
# TYPE sse_active_connections gauge
sse_active_connections 3

# HELP sse_events_sent_total Total number of SSE events sent
# TYPE sse_events_sent_total counter
sse_events_sent_total 147
```

**What to watch:**
| Metric | Normal | Alert if |
|---|---|---|
| `sse_active_connections` | Varies (0 when no one on dashboard) | 0 when users are present |
| `sse_events_sent_total` | Grows with click volume | Flat when clicks are happening |

---

## Summary

The SSE system in Shortly works like this:

1. **Browser opens EventSource** → server registers the connection
2. **User clicks short link** → outbox → publisher → RabbitMQ → analytics worker
3. **Analytics worker inserts to PG** → publishes to Redis pub/sub
4. **SseConnectionManager receives Redis message** → fetches full stats from PG → broadcasts to all connected clients
5. **Browser receives `analytics` event** → invalidates React Query cache → dashboard re-renders

**Design principles:**
- **SSE is a notification layer**, not a data source. The real data lives in PostgreSQL.
- **Fire-and-forget everywhere.** Redis pub/sub failures don't block the pipeline.
- **Redis pub/sub enables horizontal scaling.** One publish, many subscribers.
- **Dedicated subscriber connection.** Redis pub/sub mode is incompatible with regular commands.
- **Keepalive prevents proxy timeouts.** SSE comments every 30s.
- **Manual reconnection with backoff.** More reliable than browser `EventSource` auto-reconnect.
