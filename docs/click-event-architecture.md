# Click Event Architecture

How a user click travels from "tap on phone" to "chart on dashboard" — every component, every decision, every failure mode.

---

## The Complete Flow

```
User taps short URL
        |
        v
+------------------+     +------------------+     +------------------+
|  1. Express API  | --> |  2. URL Service  | --> |  3. Cache Layer  |
|  GET /:shortCode |     |  resolveUrl()    |     |  Redis → PG      |
+------------------+     +------------------+     +------------------+
        |                                                 |
        |  302 Redirect (user doesn't wait)               |
        v                                                 v
+------------------+                          +------------------+
|  User sees       |                          |  4. Outbox       |
|  original page   |                          |  Append event    |
+------------------+                          |  to outbox_events|
                                              +------------------+
                                                        |
                                                        v
                                              +------------------+
                                              |  5. Publisher    |
                                              |  Poll every 2s   |
                                              |  Claim → Publish |
                                              |  → Mark          |
                                              +------------------+
                                                        |
                                                        v
                                              +------------------+
                                              |  6. RabbitMQ     |
                                              |  Exchange/Queue  |
                                              +------------------+
                                                        |
                                                        v
                                              +------------------+
                                              |  7. Analytics    |
                                              |  Worker          |
                                              |  Consume → Batch |
                                              |  → Insert → Ack  |
                                              +------------------+
                                                   |          |
                                                   v          v
                                          +---------+  +------------+
                                          |  8. PG  |  | 9. Redis   |
                                          | click_  |  | Pub/Sub    |
                                          | events  |  |            |
                                          +---------+  +------------+
                                                           |
                                                           v
                                                  +------------------+
                                                  | 10. SSE Manager |
                                                  | Fan-out to      |
                                                  | connected       |
                                                  | clients         |
                                                  +------------------+
                                                           |
                                                           v
                                                  +------------------+
                                                  | 11. Frontend    |
                                                  | Real-time       |
                                                  | dashboard       |
                                                  +------------------+
```

---

## Step-by-Step Breakdown

### Step 1: User Clicks Short URL

```
GET /abc123
```

The Express router matches `/:shortCode` and calls the redirect controller.

**File:** `apps/api/src/controllers/urls.controller.ts:36-55`

```typescript
async redirect(req, res, next) {
  const { originalUrl } = await service.resolveUrl(shortCode, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    referer: req.get('referer') ?? null,
  });
  res.redirect(302, originalUrl);
}
```

**Key decisions:**
- **302 redirect** (not 301): Links are temporary — they can expire or be deactivated. Every click must reach us for counting.
- **Extract request metadata**: IP, User-Agent, Referer — these become the analytics event.

---

### Step 2: URL Service Resolves Short Code

```
resolveUrl('abc123', { ip, userAgent, referer })
```

**File:** `apps/api/src/services/url.service.ts:209-224`

The service does two things:
1. **Resolve the URL** (cache-aside: Redis → PostgreSQL)
2. **Emit a click event** (fire-and-forget)

```typescript
async resolveUrl(shortCode, ctx) {
  const resolved = await this.doResolve(shortCode);
  
  // Fire-and-forget — never awaited, never blocks redirect
  this.emitter.emit(buildClickEvent({ ...ctx, shortCode }));
  
  return resolved;
}
```

**Why fire-and-forget?**
The redirect must be fast. Analytics is important but not critical — if the event append fails, the user still gets redirected. The outbox pattern makes this reliable enough.

---

### Step 3: Build and Sanitize the Click Event

```
buildClickEvent({ shortCode, ip, userAgent, referer })
```

**File:** `apps/api/src/analytics/click-event.ts:73-82`

```typescript
function buildClickEvent(ctx): ClickEvent {
  return {
    eventType: 'url.clicked',
    shortCode: ctx.shortCode,
    clickedAt: new Date().toISOString(),
    ip: anonymizeIp(ctx.ip),        // IPv4: 192.168.1.100 → 192.168.1.0
    userAgent: ctx.userAgent || null, // Raw — parsed later
    referer: cleanReferer(ctx.referer), // https://google.com/search?q=hi → https://google.com/search
  };
}
```

**Privacy decisions:**
| Field | What we store | Why |
|---|---|---|
| `ip` | Anonymized (/24 for IPv4, /48 for IPv6) | City-level analytics survives; individual tracking doesn't |
| `userAgent` | Raw string | Parsed downstream by analytics worker |
| `referer` | Origin + path only | Query strings carry session tokens — stripped |

---

### Step 4: Outbox Append (Transactional)

```
outbox.append('url.clicked', event)
```

**File:** `apps/api/src/outbox/outbox-repository.ts:35-55`

```typescript
async append(eventType, payload, eventId = randomUUID()) {
  return this.db.insert(outboxEvents).values({
    eventId,    // Random UUID — two clicks in same ms are two events
    eventType,
    payload,    // The full ClickEvent as JSONB
  }).returning();
}
```

**Why the outbox pattern?**

Without outbox:
```
Redirect → INSERT click_events → Respond
```
Problem: If the DB insert fails, we either lose the event or block the redirect.

With outbox:
```
Redirect → Append to outbox (fast, same transaction) → Respond
                                          |
                                   (async, later)
                                          v
                                  Publisher → RabbitMQ → Worker → click_events
```

The outbox is a staging area. The redirect never waits for the full analytics pipeline. The outbox guarantees at-least-once delivery — a crash between append and publish just means the row gets re-published.

**Idempotency:** `event_id` has a UNIQUE constraint. Duplicate appends (network retry, race condition) silently return the existing row.

---

### Step 5: Publisher Worker

```
Poll every 2s → Claim rows → Publish to RabbitMQ → Mark published
```

**File:** `apps/api/src/workers/publisher.ts:122-147`

```typescript
async publishBatch() {
  // 1. Claim: lock rows so multiple publishers don't double-deliver
  const claimed = await this.outbox.claimBatch(100);
  
  // 2. Publish: send each event to RabbitMQ with publisher confirms
  for (const row of claimed) {
    this.channel.publish('shortly.events', 'url.clicked', 
      Buffer.from(JSON.stringify(row.payload)),
      { persistent: true, messageId: row.eventId }
    );
  }
  
  // 3. Confirm: wait for broker to acknowledge all messages
  await this.channel.waitForConfirms();
  
  // 4. Mark: stamp published_at so they're skipped next poll
  await this.outbox.markPublishedBatch(ids);
}
```

**Claim semantics (`FOR UPDATE SKIP LOCKED`):**
```sql
SELECT * FROM outbox_events
WHERE published_at IS NULL
  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
ORDER BY id
LIMIT 100
FOR UPDATE SKIP LOCKED  -- Other publishers skip these rows
```

This is how multiple publisher instances (horizontal scaling) don't double-deliver. The `SKIP LOCKED` clause means if another publisher is processing row 1-100, this publisher grabs row 101+.

**Exponential backoff:** Failed claims get `next_attempt_at` set with backoff (2s, 4s, 8s... capped at 1h). A crashed publisher's rows become due again automatically.

---

### Step 6: RabbitMQ

```
Exchange: shortly.events (topic)
Routing key: url.clicked
Queue: analytics.clicks (durable)
DLQ: analytics.clicks.dlq (dead-letter)
```

**File:** `apps/api/src/rabbitmq/connection.ts:15-25`

```typescript
async function assertTopology(channel) {
  await channel.assertExchange('shortly.events', 'topic', { durable: true });
  await channel.assertExchange('shortly.dlx', 'fanout', { durable: true });
  await channel.assertQueue('analytics.clicks.dlq', { durable: true });
  await channel.bindQueue('analytics.clicks.dlq', 'shortly.dlx', '#');
  await channel.assertQueue('analytics.clicks', {
    durable: true,
    deadLetterExchange: 'shortly.dlx',  // Failed messages go here
  });
  await channel.bindQueue('analytics.clicks', 'shortly.events', 'url.clicked');
}
```

**Why topic exchange?** Currently only one routing key (`url.clicked`), but the topic exchange allows adding more event types later (e.g., `url.created`, `url.deleted`) without changing infrastructure.

**Why a DLQ?** Poison messages (malformed, unprocessable) would infinitely requeue without a DLQ. The DLQ lets operators inspect and alert on failures.

**Message lifecycle:**
```
Publisher → Exchange → Queue → Consumer → Ack (success)
                                   |
                                   +→ Nack+requeue (transient failure, retry once)
                                   |
                                   +→ Reject (poison or redelivered) → DLQ
```

---

### Step 7: Analytics Worker (Consumer)

```
Consume → Validate → Micro-batch → Insert → Ack → Publish to Redis
```

**File:** `apps/api/src/workers/analytics-worker.ts:68-198`

```typescript
async function startAnalyticsWorker(db, amqpUrl, redis) {
  const connection = await connectRabbitMQ(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.prefetch(50);  // Max 50 unacked messages per consumer

  const batch = [];
  
  await channel.consume('analytics.clicks', (msg) => {
    // 1. Validate (distrust the wire)
    const parsed = clickEventSchema.safeParse(body);
    if (!parsed.success) {
      channel.reject(msg, false);  // → DLQ (poison)
      return;
    }
    
    // 2. Accumulate for micro-batch
    batch.push({ msg, parsed, eventId });
    
    // 3. Flush when batch is full or timer fires
    if (batch.length >= 50) flushBatch();
    else if (!flushTimer) flushTimer = setTimeout(flushBatch, 100);
  });
}

async function flushBatch() {
  const toFlush = batch.splice(0, batch.length);
  try {
    // 4. Batch INSERT (one statement, not 50)
    await repo.recordClickBatch(toFlush.map(m => ({
      event: m.parsed,
      eventId: m.eventId,
    })));
    
    // 5. Publish to Redis for SSE (fire-and-forget)
    for (const m of toFlush) {
      void redis.publish(`analytics:click:${m.parsed.shortCode}`, 
        JSON.stringify(m.parsed));
    }
    
    // 6. Ack all messages
    for (const m of toFlush) channel.ack(m.msg);
  } catch (err) {
    // 7. Handle failure
    for (const m of toFlush) {
      if (m.msg.fields.redelivered) {
        channel.reject(m.msg, false);  // Already retried → DLQ
      } else {
        channel.nack(m.msg, false, true);  // First try → requeue
      }
    }
  }
}
```

**Micro-batching explained:**

Without batching:
```
Message 1 → INSERT (1 round-trip)
Message 2 → INSERT (1 round-trip)
Message 3 → INSERT (1 round-trip)
...
Message 50 → INSERT (50 round-trips)
```

With batching:
```
Messages 1-50 → single INSERT with 50 rows (1 round-trip)
```

10-50x fewer DB round-trips. The 100ms timer ensures low latency even for small batches.

**Idempotency:** `ON CONFLICT DO NOTHING` on `event_id`. If a message is redelivered (consumer crash before ack), the duplicate is silently absorbed.

---

### Step 8: Click Events Table (PostgreSQL)

```sql
CREATE TABLE click_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT UNIQUE NOT NULL,     -- Idempotency key
  short_code   TEXT NOT NULL,
  clicked_at   TIMESTAMPTZ NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  referrer     TEXT,
  country      TEXT,
  device_type  TEXT,
  browser      TEXT
);

CREATE INDEX idx_click_events_link_time 
  ON click_events (short_code, clicked_at);
```

**Why `event_id` UNIQUE?** At-least-once delivery means the same event can arrive twice. The UNIQUE constraint ensures it's stored exactly once.

**Why `BIGSERIAL`?** Click events grow fast. 32-bit `INT` overflows at ~2B rows; `BIGINT` handles petabytes.

**Retention:** Raw rows deleted after 90 days. Aggregates (country, device, browser) are timeless.

---

### Step 9: Redis Pub/Sub (SSE Bridge)

```
Analytics worker → redis.publish('analytics:click:abc123', payload)
                          |
                          v
                   Redis Pub/Sub
                          |
                          v
                   SseConnectionManager (subscriber)
```

**File:** `apps/api/src/sse/connection-manager.ts:42-51`

```typescript
// Pattern subscribe — one subscription handles all shortCodes
this.subscriber.psubscribe('analytics:click:*');

this.subscriber.on('pmessage', (pattern, channel, message) => {
  const shortCode = channel.replace('analytics:click:', '');
  this.handleClick(shortCode, message);
});
```

**Why Redis pub/sub instead of direct SSE fan-out?**

In combined mode (single process), the analytics worker and SSE manager are in the same process. But the architecture is designed for horizontal scaling:

```
API Instance 1          API Instance 2
     |                       |
     v                       v
SSE Manager 1           SSE Manager 2
     |                       |
     +--- Redis Pub/Sub -----+
               |
               v
    analytics worker publishes once
    → ALL instances receive the message
```

Without Redis pub/sub, each API instance would need its own analytics worker, or the worker would need to know about all connected clients across instances.

**Why a dedicated subscriber connection?** A Redis connection in subscriber mode can't issue regular commands (GET, SET). We need a separate connection for pub/sub subscriptions.

---

### Step 10: SSE Connection Manager

```
Redis pmessage → Fetch full stats from PG → Broadcast to connected clients
```

**File:** `apps/api/src/sse/connection-manager.ts:128-144`

```typescript
private async handleClick(shortCode, rawMessage) {
  // 1. Find all SSE connections watching this shortCode
  const subs = this.subscriptions.get(`analytics:click:${shortCode}`);
  if (!subs || subs.size === 0) return;
  
  // 2. Fetch FULL aggregated stats from PG (source of truth)
  const stats = await this.service.getUrlAnalytics(shortCode);
  
  // 3. Broadcast to all connected clients
  for (const connId of subs) {
    this.sendEvent(connId, 'analytics', stats);
  }
}
```

**Why fetch from PG instead of forwarding the raw event?**

The raw event is just one click. The client needs full aggregated stats (total clicks, breakdowns by day/country/device). PostgreSQL is the source of truth — the click was just inserted, so the read is consistent.

---

### Step 11: Frontend Displays Analytics

```
SSE stream → useAnalyticsStream hook → LiveIndicator + auto-refresh
API call   → useBreakdowns hook → Breakdown widgets
```

The frontend has two data paths:

1. **SSE stream** (real-time): When a new click arrives, the server pushes updated stats. The dashboard updates without polling.

2. **API call** (on-demand): When the page loads, fetch current stats from `GET /api/v1/urls/:shortCode/analytics`.

---

## Failure Modes

### What happens when each component fails?

| Component fails | What happens | Data loss? |
|---|---|---|
| **Redis (cache)** | Redirect falls back to PostgreSQL | No — PG is source of truth |
| **Outbox append fails** | Redirect still works, click not counted | Yes — one click lost (documented trade-off) |
| **Publisher crashes** | Unmarked outbox rows, re-delivered on restart | No — outbox guarantees retry |
| **RabbitMQ down** | Publisher retries with backoff, outbox retains events | No — events wait in outbox |
| **Analytics worker crashes** | Unacked messages return to queue, redelivered | No — at-least-once delivery |
| **PostgreSQL down** | Worker nacks messages, they return to queue | Temporary — PG recovery restores flow |
| **Redis (pub/sub) down** | SSE clients miss real-time updates | No — data safe in PG, SSE reconnects |
| **Analytics worker fails to process** | Messages nacked (first delivery) or rejected to DLQ (redelivery) | DLQ for poison messages |

### The Redirect Never Blocks

The most critical guarantee: **analytics processing never delays or breaks the redirect.**

```
User clicks → 302 redirect (< 100ms)
                    |
                    +→ Outbox append (fire-and-forget)
                           |
                    (happens in background, user doesn't wait)
```

If the outbox append fails, the error is logged and the redirect still succeeds. This is a deliberate trade-off: redirect latency beats edge analytics durability.

---

## Message Flow Diagram

```
                    CLICK EVENT LIFECYCLE
                    
User ──→ GET /abc123 ──→ [Express API]
                              │
                              ├──→ [URL Service] ──→ [Redis Cache] ──→ HIT
                              │         │                              │
                              │         ├──→ MISS ──→ [PostgreSQL] ────┘
                              │         │
                              │         └──→ emit(buildClickEvent(ctx))
                              │                   │
                              │                   v
                              │         [OutboxClickEmitter]
                              │                   │
                              │                   v
                              │         [outbox_events table]
                              │         (id, event_id, payload, 
                              │          published_at=NULL)
                              │
                              └──→ 302 Redirect ──→ User sees original page
                              
                    ══════════════════════════════════
                    ASYNC PIPELINE (background)
                    ══════════════════════════════════

[publisher worker] ──poll 2s──→ [outbox_events]
      │                           WHERE published_at IS NULL
      │                           FOR UPDATE SKIP LOCKED
      │
      ├──→ [RabbitMQ] ──→ Exchange: shortly.events
      │                    Routing key: url.clicked
      │                    Queue: analytics.clicks
      │
      ├──→ [analytics worker] ──consume──→ [validate schema]
      │                                      │
      │                                      ├── INVALID → reject → DLQ
      │                                      │
      │                                      └── VALID → micro-batch
      │                                                  │
      │                                      ┌───────────┘
      │                                      v
      │                              [click_events table]
      │                              INSERT ... ON CONFLICT DO NOTHING
      │                                      │
      │                                      ├──→ ack message
      │                                      │
      │                                      └──→ redis.publish()
      │                                             │
      │                                             v
      │                                      [Redis Pub/Sub]
      │                                             │
      │                                             v
      │                                      [SSE Connection Manager]
      │                                      psubscribe('analytics:click:*')
      │                                             │
      │                                      ┌──────┘
      │                                      v
      │                              [Fetch full stats from PG]
      │                                      │
      │                                      v
      │                              [Broadcast to SSE clients]
      │
      └──→ [mark published] ──→ outbox_events.published_at = NOW()
```

---

## Database Schema

### outbox_events (staging area)

```sql
CREATE TABLE outbox_events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        TEXT UNIQUE NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  attempts        INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### click_events (analytics storage)

```sql
CREATE TABLE click_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT UNIQUE NOT NULL,
  short_code   TEXT NOT NULL,
  clicked_at   TIMESTAMPTZ NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  referrer     TEXT,
  country      TEXT,
  device_type  TEXT,
  browser      TEXT
);
```

### RabbitMQ topology

```
Exchange: shortly.events (topic, durable)
  └── Binding: url.clicked → Queue: analytics.clicks

Exchange: shortly.dlx (fanout, durable)
  └── Binding: # → Queue: analytics.clicks.dlq
```

---

## Key Design Decisions

### 1. Why the Outbox Pattern?

**Alternative: Direct INSERT into click_events during redirect**

Problem: If the INSERT fails, we either lose the event or retry and delay the redirect.

**Outbox solution:** Append to a staging table (fast, same DB transaction as the redirect lookup). A separate publisher processes the outbox asynchronously. The redirect never waits for analytics.

**Trade-off:** A crash between redirect response and outbox INSERT loses the click event. This is documented and accepted — redirect latency is more important than 100% analytics capture.

### 2. Why Fire-and-Forget?

The redirect controller never awaits analytics processing. The `emit()` call is synchronous and the result is ignored. If it throws, the error is caught and logged — the redirect still succeeds.

### 3. Why Micro-Batching?

50 messages per INSERT instead of 1 message per INSERT = 10-50x fewer DB round-trips. The 100ms timer ensures latency stays low even for small batches.

### 4. Why Idempotent Inserts?

At-least-once delivery means the same event can arrive twice (publisher crash between confirm and mark, consumer crash before ack). `ON CONFLICT DO NOTHING` on `event_id` ensures exactly-once storage.

### 5. Why Separate Redis Connections?

A Redis connection in subscriber mode can't issue regular commands. The SSE manager needs a dedicated subscriber connection. The main Redis client handles caching and rate limiting.

### 6. Why 302 Not 301?

301 = permanently moved. Browsers cache 301 aggressively — a user would never reach us again, losing future clicks. 302 = temporary redirect — every click hits us.

---

## Scaling Considerations

### Current: Single Process (Render Free Tier)

```
[API + Publisher + Analytics Worker] → [PostgreSQL] → [Redis] → [RabbitMQ]
```

All in one Node.js process. Works for low traffic.

### Stage 2: Multiple API Instances

```
              Nginx
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
    API #1    API #2    API #3
       │        │        │
       └────────┼────────┘
                │
         [PostgreSQL]
         [Redis]
         [RabbitMQ]
```

APIs are stateless — just copy the Express app to multiple ports. Nginx load-balances with round-robin.

### Stage 3: Separate Workers

```
API Servers (stateless)
       │
       └──→ [PostgreSQL]
              │
       Publisher Worker (separate process)
              │
       [RabbitMQ]
              │
       Analytics Worker (separate process)
              │
       [PostgreSQL] [Redis Pub/Sub]
```

Workers are now independent processes. Each can be scaled independently. The outbox pattern ensures no events are lost during scaling.

### Stage 4: ClickHouse for Analytics

PostgreSQL works for moderate volumes. At billions of events, ClickHouse provides:
- Columnar storage (10x compression)
- Vectorized aggregation (100x faster GROUP BY)
- Parallel ingestion (1M+ events/sec)

The analytics worker would write to ClickHouse instead of PostgreSQL. The API would query ClickHouse for analytics.

---

## Metrics to Watch

| Metric | Normal | Alert if |
|---|---|---|
| Outbox pending count | < 100 | > 1000 (publisher lagging) |
| Outbox published count | Grows steadily | Flat (publisher stopped) |
| RabbitMQ queue depth | < 50 | > 500 (consumer lagging) |
| RabbitMQ consumer count | 1 | 0 (consumer disconnected) |
| Click events inserted/min | > 0 | 0 for > 5 min |
| SSE active connections | Varies | 0 when users are on dashboard |
| DLQ message count | 0 | > 0 (poison messages) |

---

## Summary

The click event system is a **reliable async pipeline** built on the transactional outbox pattern:

1. **Redirect is fast** — analytics is fire-and-forget
2. **Outbox guarantees delivery** — events survive crashes
3. **RabbitMQ decouples** — publisher and consumer scale independently
4. **Micro-batching reduces DB load** — 10-50x fewer round-trips
5. **Idempotent processing** — duplicates are harmlessly absorbed
6. **Redis pub/sub enables real-time** — SSE clients get instant updates
7. **DLQ handles poison messages** — bad data doesn't block the pipeline
8. **Every failure mode is handled** — no data loss, no blocking redirects
