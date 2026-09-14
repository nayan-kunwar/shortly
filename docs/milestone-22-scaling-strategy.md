# Milestone 22 — Scaling Strategy

## What was built

A staged scaling strategy for the M21 workload:

```text
100M new URLs / month
1B redirects / day
38.58 creations/second, average
11,574.07 redirects/second, average
57,870.37 redirects/second, peak
```

It maps each required scaling stage to the bottleneck it addresses, explains
the complexity it introduces, and states whether that complexity is justified.
It does not change runtime behavior.

## Why this way

M21 showed that the system does not have one scaling problem. It has several
different constraints:

```text
publisher relay throughput
→ PostgreSQL analytics write rate
→ 90-day raw analytics storage and retention operations
→ PostgreSQL primary contention and replication lag
→ Redis hot-set memory and celebrity-key concentration
→ stateless API capacity
→ load-balancer and network capacity
```

A credible strategy must therefore do two things:

1. Preserve the required eight-stage evolution.
2. Recommend work in bottleneck order, rather than assuming distributed
   infrastructure is automatically the next step.

The current system already implements the important part of Stage 2: two
stateless API replicas behind Nginx round-robin load balancing, with passive
failure ejection and request retries
(`infrastructure/nginx/nginx.conf:1-7,43-44`,
`apps/api/src/app.ts:44-51`). Consequently, M22 is largely about what not to
build yet.

## Stage 1 — Single API, PostgreSQL, and Redis

```text
1 API
1 PostgreSQL
1 Redis
```

### Bottleneck

One API process limits CPU concurrency, deployment availability, and fault
isolation. One database and one cache are single points of failure and have
finite CPU, memory, IOPS, and storage.

### Why the change is necessary

This is the starting stage, not a change. A single-node deployment is the
correct way to prove correctness, persistence, caching, validation,
observability, and failure handling before adding distributed machinery.

### Problem it solves

It minimizes operational surface while the product and data model are still
being learned. Every later stage can then be evaluated against working
behavior rather than speculation.

### Complexity introduced

None beyond ordinary backup, monitoring, deployment, and dependency-health
procedures.

### Justified?

Yes, as the initial stage. It is no longer sufficient as a production target
for the M21 workload because one API cannot absorb 57,870 peak redirects per
second, and one database cannot durably absorb the resulting analytics
writes.

## Stage 2 — Multiple API instances behind a load balancer

```text
Multiple API instances
        ↓
Load Balancer
```

### Bottleneck

One Node.js API process has finite event-loop throughput and no redundancy.
A deployment, crash, or traffic spike affects all request handling.

### Why the change is necessary

Redirect handling is stateless. Sessions live in PostgreSQL, hot mappings
live in Redis, and events live in RabbitMQ or the outbox. Therefore
additional API processes can share the load without session affinity.

This stage is already implemented with two replicas. The remaining work is
adding replicas based on measured saturation, not proving that replicas can
work.

### Problem it solves

It increases redirect throughput, isolates process failures, permits rolling
deployments, and removes the API process as an early single point of
failure.

### Complexity introduced

- The load balancer itself can become a single point of failure.
- Logs and in-memory metrics are per instance and must be aggregated.
- Deployments, configuration, health checking, and autoscaling become fleet
  concerns.
- Any future process-local state would break horizontal scaling.

### Justified?

Yes. This is the cheapest major scaling step because the application was
already stateless. It is justified now as an architecture, while additional
replicas beyond two should wait for measured per-instance saturation.

Use the M21 formula:

```text
required instances =
  ceil(peak QPS × (1 + headroom) / measured per-instance sustained QPS)
```

With 30% headroom, the M21 peak needs approximately 8–38 replicas depending
on whether one instance sustains 10,000 or 2,000 redirects per second. Do
not select a number without that production measurement.

## Stage 3 — Redis Cluster

```text
Redis
 ↓
Redis Cluster
```

### Bottleneck

A single Redis instance can be constrained by:

- Hot working-set memory across a one-hour TTL window.
- Command throughput near 57,870 redirect lookups per second at peak.
- CPU concentration on celebrity short codes.
- Failover and availability during maintenance or failure.

M21 estimates roughly 0.3 GB per million cached entries under nominal
assumptions: 3 GB for 10 million, 9 GB for 30 million, and 30 GB for 100
million. Cardinality, fragmentation, replication, and persistence overhead
are additional.

### Why the change is necessary

Clustering partitions keys across shards, distributes memory and command
load, and supports replica failover. It becomes necessary when vertical
memory, single-node throughput, hot-key CPU, or availability—not merely
total request count—has been measured as the constraint.

### Problem it solves

It raises aggregate cache memory and throughput while preserving Redis as a
reconstructible performance layer. PostgreSQL remains the source of truth.

### Complexity introduced

- Slot ownership, resharding, rebalancing, and cluster-aware operations.
- Restricted multi-key operations; Lua scripts must stay within one hash
  slot or use hash tags.
- Hot keys still hash to one primary slot; replicas can spread reads, but
  do not eliminate single-key write concentration.
- More difficult failure diagnosis and client-timeout tuning.
- Cache cold starts after topology changes can transiently flood PostgreSQL.

### Justified?

Not yet automatically. First measure:

- Redis memory utilization and eviction behavior.
- Command rate, CPU saturation, and p99 latency.
- Hot-key concentration from celebrity links.
- Failover requirements and recovery time.

A larger single Redis instance or read replicas may be cheaper and simpler
than a cluster. Clustering because request volume “sounds large” would
violate the project’s scaling discipline.

## Stage 4 — PostgreSQL primary and read replicas

```text
PostgreSQL Primary
        ↓
Read Replicas
```

### Bottleneck

The primary carries redirect cache misses, URL creation, dashboard reads,
list/search queries, global counts, analytics aggregation, outbox writes,
published-row updates, and click-event inserts. M21 estimates approximately
34,722 logical analytics row mutations per second on average and 173,611 at
peak, before URL writes and dashboard queries.

### Why the change is necessary

Read replicas offload:

- Redirect cache misses.
- URL list, detail, analytics-dashboard, and global-statistics reads.
- Expensive `COUNT(*)`, joins, search queries, and backups.

They do not offload URL writes, outbox writes, published-row updates, or
click-event inserts. Those still go to the primary.

### Problem it solves

It separates expensive analytical/dashboard reads from the latency-sensitive
redirect and creation paths, while preserving one authoritative writer for
transactional data.

### Complexity introduced

- Replication lag and consequently stale dashboard or management reads.
- Read/write routing in the repository layer.
- Failover, promotion, fencing, and backup procedures.
- Schema-migration coordination across primary and replicas.
- Lag, replication-delay, and replica-health observability.
- Risk of treating replicas as unlimited capacity while the primary write
  bottleneck remains.

### Justified?

Yes, once read pressure is measured—but only as a read-side optimization.
Replicas are not the cure for 35,000 analytics mutations per second or
tens of terabytes of raw click storage. Those require pipeline batching,
aggregation, retention policy, workload separation, or an analytical store
before generic read replication can be called sufficient.

## Stage 5 — PostgreSQL sharding

```text
PostgreSQL
 ↓
Sharding
```

### Bottleneck

A single primary eventually reaches limits in write throughput, storage,
index depth, vacuum and backup operations, replication-stream volume, or
blast radius. At M21 scale, the combined transactional-plus-analytics
database reaches operational limits long before the URL table alone does.

### Why the change is necessary

Sharding partitions rows and their indexes across independent databases,
increasing aggregate write throughput and storage while reducing per-node
index and maintenance burden. The natural shard key is `short_code` because
redirects, alias rows, and per-link analytics are all addressable by that
key.

### Problem it solves

It removes the single-primary ceiling for eligible partitioned workloads.

### Complexity introduced

- Shard-key selection and prevention of hot partitions.
- Cross-shard search, global counts, global analytics, and administration.
- Distributed transactions and consistency limitations.
- Resharding, rebalancing, shard-aware backups, restores, and migrations.
- Much larger operational and testing burden.
- Potential need for distributed ID generation if shards use independent
  sequences.

### Justified?

No, not now for the URL table alone. Nominal URL-table growth is about
0.46 TB per year, which does not by itself justify sharding.

Sharding becomes relevant only after:

1. Transactional and analytical workloads are separated.
2. Vertical scaling is exhausted.
3. Read replicas are insufficient.
4. Aggregation and retention policy have reduced the retained working set.
5. A measured primary—not a hypothetical future primary—is saturated.

Sharding the combined database to preserve indefinite raw click storage
would entrench the wrong data model in distributed form.

## Stage 6 — Distributed ID generation

```text
PostgreSQL Sequence
        ↓
Distributed ID Generator
        ↓
Base62
```

### Bottleneck

A PostgreSQL sequence is centralized. It can become lock/contention,
availability, multi-writer, sharding, or multi-region infrastructure once
IDs must be allocated outside one primary database.

At the assumed workload, average creation is only 38.58 URLs per second.
The present sequence is nowhere near saturation.

### Why the change is necessary

A Snowflake-style generator allocates timestamp, worker/machine, and
sequence components without contacting a central database. It supports
independent writers, shards, and regions while preserving rough time
ordering.

### Problem it solves

It removes centralized ID allocation from the creation path and avoids
cross-writer coordination for every new URL.

### Complexity introduced

- Worker/machine-ID allocation and lifecycle management.
- Clock-skew, backward clock movement, duplicate-ID, and ordering hazards.
- Timestamp-width exhaustion and bit-layout migration planning.
- Potential ordering or creation-time information leakage.
- Migration from sequence-derived codes and dual-generation testing.
- Continued need to encode the resulting integer compactly in Base62.

### Justified?

No, not now. Distributed IDs solve a multi-writer problem the current
system does not have. Introduce them when sharding, multi-primary writes,
or multi-region creation makes centralized sequences a measured bottleneck.

## Stage 7 — PostgreSQL analytics to ClickHouse

```text
PostgreSQL Analytics
        ↓
ClickHouse
```

### Bottleneck

M21 estimates 30 billion click events per month and about 50 TB for 90 days
under nominal assumptions. Sustained ingestion is approximately 11,574
events per second on average and 57,870 at peak. PostgreSQL must also
maintain primary-key, event-ID, and link-time indexes while serving
aggregations, purges, vacuuming, backups, and dashboard queries.

### Why the change is necessary

A columnar analytical database offers:

- Much better compression for repetitive event fields.
- High-throughput batch ingestion.
- Fast scans and aggregations over billions of rows.
- Time-based partitioning and retention/TTL operations better suited to
  click analytics.

PostgreSQL would remain the transactional source of truth for URLs and the
outbox; ClickHouse would become a derived analytics store.

### Problem it solves

It separates high-volume append/scan analytics from latency-sensitive
transactional reads and writes.

### Complexity introduced

- Dual-store architecture and event-pipeline changes.
- Exactly-once or idempotent ingestion semantics.
- Schema evolution across two databases.
- Backfill, replay, reconciliation, and divergence monitoring.
- Retention, aggregation, sampling, and cold-storage policy.
- New query dialect, operational expertise, backup strategy, and failure
  modes.

### Justified?

Eventually yes, but not before cheaper decisions are made. The first
questions are product and retention questions, not database-brand questions:

- How long must raw clicks remain queryable?
- Which answers can come from rollups instead of raw rows?
- What sampling rate is acceptable, if any?
- When must published outbox rows and expired raw events be purged?
- Can the worker use batch inserts?

Migrating 90 days of raw per-click data without answering those questions
merely moves an unbounded retention policy into a faster engine.

## Stage 8 — Multi-region deployment

```text
Single Region
      ↓
Multi-region
```

### Bottleneck

A single region has higher latency for distant users, remains exposed to
regional outages, and may not satisfy latency, availability, disaster
recovery, or data-residency requirements.

### Why the change is necessary

Multiple regions can place stateless request handling closer to users,
survive regional failure, add capacity, and satisfy jurisdictional data
requirements.

### Problem it solves

It improves global latency and regional fault tolerance when those are
measured product or compliance requirements.

### Complexity introduced

- Consistency choices across regions for URLs, aliases, lifecycle changes,
  caches, queues, outbox rows, and analytics.
- Conflict resolution for aliases and deactivation.
- Global versus regional analytics semantics.
- Cache-invalidation propagation.
- Queue replication or regional ingestion pipelines.
- DNS routing, failover testing, backup/restore across regions, and
  substantially higher operational cost.

### Justified?

No, not now. Multi-region deployment is the last stage because it
multiplies every unresolved consistency, retention, failover, and
operational problem. It becomes justified only after:

- Single-region high availability is proven.
- Backup, restore, failover, and game-day procedures are routine.
- Global latency or outage tolerance is measured.
- Data-residency or compliance rules require regional separation.

## Recommended execution order

The specified stages describe an architectural evolution, but they are not
a work queue. Based on M21, the justified order is:

```text
1. Harden the event pipeline:
   persistent publisher connections,
   larger/streaming batches,
   concurrent publishers/consumers,
   batched database writes.

2. Define retention and aggregation:
   schedule outbox purges,
   schedule click retention,
   introduce rollups,
   decide sampling and cold storage.

3. Separate analytical writes from transactional URL writes.

4. Add API replicas from measured per-instance saturation.

5. Add PostgreSQL read replicas for misses and dashboards.

6. Scale Redis vertically, add replicas, then cluster only on measured
   memory, throughput, availability, or hot-key pressure.

7. Consider ClickHouse after retention and aggregation policy are fixed.

8. Consider sharding after workload separation and vertical scaling.

9. Consider distributed IDs for multi-writer or multi-region creation.

10. Consider multi-region deployment last.
```

This order preserves the project principle:

```text
Simple
  ↓
Correct
  ↓
Measurable
  ↓
Scalable
```

## Alternatives considered

- Add API replicas first because they are easy: useful for request
  handling, but does not fix publisher throughput or analytics storage.
- Move directly to Redis Cluster: useful for proven memory/throughput
  pressure, but premature without cardinality and hot-key measurements.
- Add PostgreSQL read replicas first: useful for dashboard/read isolation,
  but does not fix analytics write amplification.
- Shard PostgreSQL early: powerful but operationally expensive and
  unnecessary for the URL table alone.
- Adopt ClickHouse before retention policy: faster scans, but preserves an
  unbounded raw-retention problem.
- Deploy multi-region early: best global availability story, but multiplies
  consistency and operational complexity before single-region durability is
  routine.

## Trade-offs

- Stateless API scaling is operationally cheap; stateful data scaling is
  operationally expensive.
- Read scaling and write scaling are different problems. Replicas help the
  former; partitioning, batching, aggregation, or workload separation help
  the latter.
- Raw-event fidelity competes with ingestion cost, storage cost,
  operational burden, and query performance.
- Stronger availability usually means more replicas, regions, lag,
  divergence, reconciliation, or cost.
- Every distributed stage reduces a capacity ceiling while increasing the
  number of failure modes an operator must understand.

## Failure scenarios

- Additional replicas can expose hidden process-local assumptions,
  uneven health checking, log/metric fan-out gaps, or deployment skew.
- Redis topology changes can cause cold starts and redirect-miss storms
  against PostgreSQL.
- Read replicas can serve stale dashboard state, recently deactivated
  links, or expired mappings during lag.
- A single load balancer remains a single point of failure until it is
  made redundant.
- Shard imbalance can recreate a single-node hotspot in distributed form.
- Resharding, promotion, failover, backfill, and cross-region recovery can
  all cause downtime if they are first tested during an incident.
- Dual analytics stores can diverge through redelivery, replay, schema
  mismatch, retention-policy mismatch, or incomplete reconciliation.

## At 10x scale

Ten times the M21 workload implies approximately:

```text
385.80 URL creations/second, average
115,740.74 redirects/second, average
578,703.70 redirects/second, peak
300,000,000,000 click events/month
```

At 5,000 sustained redirects per instance and 30% headroom, the peak needs
approximately 151 API replicas; at 2,000 per instance, it needs 377. Those
numbers reinforce the sequencing lesson: stateless replicas can be
provisioned, but the publisher, database-write, retention, aggregation, and
analytical-query architecture must change first.

## Before M23

Understand:

- Why Stage 2 is already implemented, while Stages 3–8 remain conditional.
- Why pipeline throughput and retention policy precede generic database
  sharding.
- Why read replicas do not solve write amplification.
- Why the URL table alone does not justify sharding at the modeled growth
  rate.
- Why distributed IDs, ClickHouse, and multi-region deployment answer
  specific measured constraints rather than general traffic growth.
- That M23 should audit the current implementation against this strategy,
  especially publisher throughput, purge scheduling, dashboard-query cost,
  hot-key behavior, and operational recovery procedures.
