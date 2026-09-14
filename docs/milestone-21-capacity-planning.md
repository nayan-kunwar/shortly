# Milestone 21 — Capacity Planning

## What was built

A capacity model for the hypothetical production load:

```text
100M new URLs / month
1B redirects / day
```

It calculates request rates, derives the actual read/write ratio, sizes API,
Redis, PostgreSQL, network, RabbitMQ, and analytics storage, and identifies
the first bottleneck. It does not change runtime behavior.

## Why this way

Capacity planning must precede M22. Scaling stages are only defensible if we
know whether the binding constraint is stateless request handling, cache
memory, database writes, queue throughput, or long-term event storage.

The model starts from the implemented architecture, not an idealized URL
shortener:

- Redirect answers `302` and counts only successful resolutions
  (`apps/api/src/controllers/urls.controller.ts:51`).
- Successful redirects emit one `url.clicked` event through the outbox
  (`apps/api/src/services/url.service.ts:186-198`).
- Generated codes use a PostgreSQL sequence/transaction before Base62
  encoding (`apps/api/src/repositories/url.repository.ts:119-148`).
- The publisher claims at most 100 rows per batch and opens a new broker
  connection/channel for every batch
  (`apps/api/src/workers/publisher.ts:7-57`).
- Click workers prefetch 50 messages and persist one row per message
  (`apps/api/src/workers/analytics-worker.ts:15-99`).
- Positive cache entries live up to `REDIS_TTL`; negative entries live 60
  seconds (`apps/api/src/config/env.ts:14`,
  `apps/api/src/cache/url-cache.ts:4-6`).

## Core workload math

Use a 30-day month:

```text
seconds per month = 30 × 24 × 3,600
                  = 2,592,000
```

### URL creation rate

```text
100,000,000 / 2,592,000
= 38.58 new URL rows/second, average
= 100,000,000 rows/month
= 1,200,000,000 rows/year
```

Generated codes additionally perform an insert plus an in-transaction update,
so their PostgreSQL statement rate can approach:

```text
2 × 38.58 = 77.16 statements/second, average
```

### Average redirect QPS

```text
1,000,000,000 / 86,400
= 11,574.07 redirects/second, average
```

### Actual read/write ratio

```text
11,574.07 / 38.58
= 300:1
```

The workload is **300 reads per URL-creation write**, not 10:1. That ratio
nevertheless understates database write pressure because every successful
redirect creates an analytics event.

### Peak redirect QPS

```text
5 × 11,574.07
= 57,870.37 redirects/second, peak
```

Assuming successful redirects remain the dominant case, the analytics
pipeline must also absorb approximately:

```text
11,574.07 events/second, average
57,870.37 events/second, peak
30,000,000,000 events/month
90,000,000,000 events per 90 days
```

## Assumptions, calculations, and measurements

### Assumptions

- Month means 30 days.
- Peak means five times the daily average.
- Successful redirects dominate; errors and 404/410 responses do not
  materially change the event rate.
- A representative `url.clicked` JSON payload is 275 bytes; with AMQP
  properties, frames, confirms, and acknowledgements, use 350 bytes.
- A representative positive Redis value is 168 bytes; with the `url:`
  key, dictionary entry, object overhead, allocation, and expiry, use
  300 bytes per cached short code.
- A redirect response, including HTTP status, `Location`, and headers, is
  nominally 800 bytes.
- PostgreSQL row footprints include tuple overhead, alignment, fill,
  visibility bookkeeping, heap pages, and all indexes.
- No production throughput benchmark is available yet.

### Calculated values

| Quantity                               | Value                |
| -------------------------------------- | -------------------- |
| Seconds per 30-day month               | 2,592,000            |
| Average URL creations                  | 38.58 rows/s         |
| Average redirects                      | 11,574.07 requests/s |
| Read-to-creation-write ratio           | 300:1                |
| Peak redirects                         | 57,870.37 requests/s |
| URL rows per month                     | 100,000,000          |
| URL rows per year                      | 1,200,000,000        |
| Click events per month                 | 30,000,000,000       |
| Click events per 90 days               | 90,000,000,000       |
| Nominal redirect egress, average       | 74.1 Mbps            |
| Nominal redirect egress, peak          | 370.4 Mbps           |
| Nominal RabbitMQ payload rate, average | 4.1 MB/s             |
| Nominal RabbitMQ payload rate, peak    | 20.3 MB/s            |

### Actual measurements available

- Representative JSON encodings were measured locally in this milestone:
  275 bytes for a representative click event and 168 bytes for a
  representative positive cache value.
- Existing unit, integration, and end-to-end suites measure correctness,
  not sustained throughput.
- Live milestone notes measure behavior such as cache fallback and worker
  recovery, but not production QPS.
- Per-instance API throughput remains an open production measurement. The
  API section therefore gives a sizing formula and scenarios rather than
  pretending one benchmark already exists.

## API instances

The API tier is stateless and horizontally scalable, but its required size
depends on a production measurement we do not yet have. Use:

```text
required instances =
  ceil(peak QPS × (1 + headroom) / measured per-instance sustained QPS)
```

With 30% headroom and the calculated 57,870.37 peak QPS:

| Assumed sustained capacity per instance | Required instances |
| --------------------------------------: | -----------------: |
|                       2,000 redirects/s |                 38 |
|                       3,000 redirects/s |                 26 |
|                       5,000 redirects/s |                 16 |
|                      10,000 redirects/s |                  8 |

Add at least one redundant instance beyond the table so one failure or
deployment does not remove all headroom.

This is the easiest tier to scale, but horizontal API replicas do not fix
the event pipeline or analytics database. Adding API containers while the
publisher remains serial is scaling the wrong bottleneck.

## Redis memory and operations

Redirects perform one cache lookup each:

```text
11,574.07 GET/s, average
57,870.37 GET/s, peak
```

Cache-write volume depends on hit rate. At a 90% hit rate, PostgreSQL still
receives approximately 1,157 redirect reads per second on average and 5,787
per second at peak. Redis sizing therefore has two dimensions: operation
rate and hot working-set cardinality.

Nominal memory for the cached hot set is:

| Distinct cached short codes | Nominal Redis memory |
| --------------------------: | -------------------: |
|                   1,000,000 |               0.3 GB |
|                  10,000,000 |               3.0 GB |
|                  30,000,000 |               9.0 GB |
|                 100,000,000 |              30.0 GB |

The one-hour positive TTL means Redis accumulates the distinct short codes
seen during the trailing hour, not the full historical URL table. Actual
memory also depends on key distribution, allocator fragmentation, replication
buffers, persistence settings, and hot-key overhead.

Rate limiting is not the Redis bottleneck here. Redirects are intentionally
unlimited, while creation/deletion and dashboard reads share fixed-window
budgets (`apps/api/src/app.ts:101-127`). At the assumed distributed traffic,
ordinary write volume is far below the configured per-IP budgets.

## PostgreSQL `urls` storage

The owned URL table grows slowly enough to remain operationally ordinary:

| Stored bytes per URL row | Storage per month | Storage per year |
| -----------------------: | ----------------: | ---------------: |
|                      250 |           25.0 GB |          0.30 TB |
|                      380 |           38.0 GB |          0.46 TB |
|                      550 |           55.0 GB |          0.66 TB |

The nominal 380-byte figure includes the heap row, page overhead, primary
key, and both unique lookup indexes. One asynchronous replica approximately
doubles local disk across two machines:

```text
0.46 TB × 2 ≈ 0.91 TB/year, nominal
```

WAL, backups, snapshots, and operational headroom are additional. The URL
table is therefore not the first storage emergency.

## PostgreSQL IOPS

Read IOPS depend strongly on cache effectiveness:

| Cache hit rate | PG redirect reads/s, average | PG redirect reads/s, peak |
| -------------: | ---------------------------: | ------------------------: |
|            95% |                          579 |                     2,894 |
|            90% |                        1,157 |                     5,787 |
|            50% |                        5,787 |                    28,935 |
|             0% |                       11,574 |                    57,870 |

The larger problem is analytics write amplification. One successful redirect
normally causes:

```text
1 outbox INSERT
1 outbox UPDATE when marked published
1 click_events INSERT
```

At average traffic, that is approximately:

```text
11,574 + 11,574 + 11,574
= 34,722 logical analytics row mutations/second
```

At peak, it is approximately 173,611 per second. Physical IOPS will be lower
because of WAL batching and buffer-cache hits, but the logical operation
rate is already orders of magnitude beyond a comfortable single PostgreSQL
primary. Index maintenance on every insert and update makes this worse, not
better.

## Network bandwidth

Nominal redirect egress dominates external bandwidth:

```text
average: 11,574.07 × 800 bytes × 8 ≈ 74.1 Mbps
peak:    57,870.37 × 800 bytes × 8 ≈ 370.4 Mbps
```

Internal RabbitMQ payload traffic is comparatively small:

```text
average: 11,574.07 × 350 bytes ≈ 4.1 MB/s
peak:    57,870.37 × 350 bytes ≈ 20.3 MB/s
```

Database replication and backup traffic is separate and can exceed both
figures during base backups, replica catch-up, or large deletes. TLS
handshakes, retries, observability scraping, and management traffic are also
additional.

The network is not the first bottleneck. A single modern load-balancer NIC
can carry the nominal peak redirect payload; the systems behind it cannot
yet process that many durable analytics events.

## RabbitMQ throughput

The broker data rate is modest, but the current relay implementation is not.

At 100 rows per publisher batch, sustaining the event rate requires:

```text
average: 11,574.07 / 100 ≈ 116 batches/second
peak:    57,870.37 / 100 ≈ 579 batches/second
```

The present publisher opens a connection and confirm channel for every batch
before publishing those 100 rows and waiting for confirms. Hundreds of
connect-confirm-close cycles per second is not a viable operating point.

Parallel publishers can help because row claiming uses `FOR UPDATE SKIP
LOCKED`, but that scales an inefficient loop rather than fixing it. The
needed changes are persistent broker connections/channels, larger or
streaming batches, concurrent publishing, and ideally batched marking of
published rows.

The analytics consumer has the same shape of problem: prefetch 50, one
database insert per message, then acknowledgement. Parallel consumers are
possible, but single-row database writes remain the ceiling unless batching
or aggregation is introduced.

## Analytics storage

Raw click retention is the largest structural problem.

| Stored bytes per click row | Storage per month | Storage per 90 days |
| -------------------------: | ----------------: | ------------------: |
|                        300 |            9.0 TB |             27.0 TB |
|                        550 |           16.5 TB |             49.5 TB |
|                        700 |           21.0 TB |             63.0 TB |

Even the low estimate requires 27 TB for 90 days before replicas, backups,
indexes, WAL, vacuum overhead, and operational headroom. The nominal
estimate approaches 50 TB. Ninety billion rows also make global `COUNT(*)`
dashboards, large purges, vacuum, backup/restore, and schema changes
operationally severe.

There is a second retention hazard: purge methods exist for published outbox
rows and old clicks, but the inspected runtime does not schedule them.
Without a scheduler, “temporary” outbox history and “90-day” clicks can
both grow without bound.

Long-term raw PostgreSQL retention at this volume is therefore not a tuning
exercise. It requires aggregation, tiered/cold storage, shorter raw
retention, sampling, an analytical database, or a combination of those.

## First bottleneck

There are two complementary answers.

**First runtime bottleneck: the current publisher relay.**

A single publisher batch loop cannot approach 11,574 events per second.
Its batch size, per-batch connection/channel lifecycle, confirm wait, and
sequential published-marking make it fall behind almost immediately. The
outbox will then accumulate pending rows, analytics will lag, recovery will
become a larger read/publish storm, and PostgreSQL will carry both live
writes and a growing backlog.

**First architectural bottleneck: durable raw analytics in PostgreSQL.**

Even if publishing were instantaneous, approximately 35,000 logical
analytics row mutations per second and tens of terabytes of 90-day raw
storage make the current single-PostgreSQL event store unsuitable. API
replicas and Redis can absorb more redirect traffic than this pipeline can
durably record.

Practical order:

```text
publisher relay throughput
→ PostgreSQL analytics write rate
→ 90-day raw analytics storage and retention operations
→ PostgreSQL primary contention and replication lag
→ Redis hot-set memory and celebrity-key concentration
→ stateless API capacity
→ load-balancer and network capacity
```

## Alternatives considered

- Sample analytics instead of recording every click: reduces pipeline and
  storage load dramatically, but changes product semantics and makes rare
  links statistically unreliable.
- Publish directly to RabbitMQ from the redirect path: removes outbox
  writes, but couples redirect latency/availability to broker health and
  reintroduces partial-failure inconsistency.
- Batch click inserts in the worker: preserves event completeness while
  reducing database operations, at the cost of worker complexity and larger
  redelivery units.
- Aggregate clicks into counters or rollups: preserves dashboard answers
  while discarding raw-event flexibility.
- Use CDC/logical replication instead of polling: more efficient change
  capture at scale, but substantially more infrastructure than the current
  single-table poller.
- Replace RabbitMQ with Kafka or Redis Streams later: potentially better
  high-throughput event transport, but premature before fixing batching,
  persistence, consumer parallelism, and retention policy.

## Trade-offs

- Per-click raw events preserve maximum analytical flexibility at maximum
  ingestion and storage cost.
- The transactional outbox preserves reliability at the cost of write
  amplification: every logical click touches PostgreSQL multiple times.
- Fire-and-forget emission protects redirect latency but accepts a narrow
  durability gap before the outbox row commits.
- Cache-aside Redis protects PostgreSQL from repeat reads but cannot
  protect it from first-time reads, cold starts, celebrity-link misses, or
  analytics writes.
- Horizontal API scaling is simple and effective for request handling, but
  ineffective for the broker, publisher, and analytical-database limits.

## Failure scenarios

- **Cold cache or cache loss:** PostgreSQL receives the full 11,574
  redirect reads per second on average and 57,870 at peak. Negative entries
  blunt repeated unknown-key floods, but genuine first-time traffic cannot
  be cached in advance.
- **Slow publisher:** pending outbox rows accumulate, analytics freshness
  degrades, and restart/recovery must process both new and backlogged rows.
- **Broker outage:** redirects continue while the outbox absorbs about 41.7
  million pending rows per average hour. Recovery creates a publish and
  database-marking surge.
- **Click-worker outage:** the broker queue grows and dashboards become
  increasingly stale; prolonged outage risks queue-disk exhaustion.
- **Missing purge schedule:** published outbox history and old click rows
  consume storage indefinitely and make later deletes more disruptive.
- **Primary saturation:** Redis cannot answer writes, outbox inserts, or
  click inserts. Redirects eventually receive 503 because the source of
  truth is unavailable.
- **Peak skew beyond 5x:** all queue, backlog, storage, and recovery
  estimates deteriorate superlinearly because fixed batch sizes and polling
  intervals become a smaller fraction of demand.

## At 10x scale

Multiply the modeled load by ten:

```text
385.80 URL creations/second, average
115,740.74 redirects/second, average
578,703.70 redirects/second, peak
300,000,000,000 click events/month
900,000,000,000 click events per 90 days
```

Nominal 90-day raw click storage moves toward 495 TB. Peak analytics row
mutations approach 1.74 million per second. The current publisher,
single-queue consumer, per-row database writes, global count dashboards,
and PostgreSQL raw retention all fail long before stateless API capacity
becomes the main concern.

The lesson for M22 is sequencing: fix the event pipeline and retention
model before treating API replicas, Redis Cluster, or multi-region
deployment as the next milestone.

## Before M22

Understand:

- Why 300:1 is the URL-table ratio, while analytics writes dominate
  PostgreSQL work.
- Why the publisher’s per-batch connection lifecycle is a throughput bug,
  not merely an unoptimized implementation detail.
- Why raw-event flexibility and raw-event retention are different costs:
  one is ingestion throughput, the other is long-term storage and
  operations.
- Why adding API replicas first would improve the easiest tier while
  leaving the earliest bottleneck untouched.
- That the missing production API benchmark, cache-cardinality
  measurement, purge schedule, and aggregation policy are now blocking
  inputs to credible scaling work.
