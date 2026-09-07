# Build a Production-Oriented Bitly-Like URL Shortener

You are a **senior backend engineer, distributed-systems engineer, and system-design mentor**.

Build a production-oriented **Bitly-like URL shortening service** that is both:

1. A fully working backend project.
2. A system-design learning project that teaches me **why each architectural decision is made**.

---

# 1. Technology Stack

Use exactly this core stack:

* Node.js
* TypeScript
* **Express.js — REQUIRED**
* PostgreSQL
* Redis
* RabbitMQ
* Docker
* Docker Compose
* Vitest
* Zod
* OpenAPI / Swagger

For local load balancing, you may use:

* Nginx

Do **NOT** use:

* Fastify
* NestJS
* MongoDB
* Kafka unless explicitly introduced as a future alternative
* unnecessary microservices
* unnecessary infrastructure

Prefer simple, understandable architecture first.

---

# 2. Critical Development Rule

**DO NOT build the entire project at once.**

Build the project milestone by milestone.

After every milestone:

1. Run tests.
2. Run TypeScript/build checks.
3. Verify the functionality.
4. Review the implementation.
5. Look for obvious bugs and design problems.
6. Update documentation.
7. Explain what was built.
8. Explain why it was built this way.
9. Explain alternatives.
10. Explain trade-offs.
11. Explain failure scenarios.
12. Explain what happens at 10x scale.
13. Explain what I should understand before continuing.

**Do not proceed to the next milestone if the current milestone is broken.**

Keep commits logically separated by milestone when possible.

---

# 3. Target Architecture

The system should evolve toward this architecture:

```text
                              ┌──────────────────┐
                              │      Client      │
                              │ Browser / Mobile │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │    DNS / CDN     │
                              │ Future / Optional│
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  Load Balancer   │
                              │   Nginx / ALB    │
                              └────────┬─────────┘
                                       │
                         ┌─────────────┴─────────────┐
                         │                           │
                         ▼                           ▼
                ┌─────────────────┐         ┌─────────────────┐
                │   API Servers   │         │  Redirect API   │
                │ Express + TS    │         │ Express + TS    │
                │ Stateless       │         │ Stateless       │
                └────────┬────────┘         └────────┬────────┘
                         │                           │
                         │                           ▼
                         │                    ┌──────────────┐
                         │                    │    Redis     │
                         │                    │    Cache     │
                         │                    └──────┬───────┘
                         │                           │
                         │                      Cache Miss
                         │                           │
                         └─────────────┬─────────────┘
                                       ▼
                              ┌──────────────────┐
                              │   PostgreSQL     │
                              │ Source of Truth  │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │   Click Outbox   │
                              │ Reliable Events  │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Publisher Worker │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │     RabbitMQ     │
                              │    Event Queue   │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Analytics Worker │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │   Analytics DB   │
                              │ PostgreSQL first │
                              │ ClickHouse later │
                              └──────────────────┘
```

## Important architectural clarification

Do **not** immediately create many microservices.

Initially, use a single Express application with logically separated modules:

```text
Express Application
│
├── URL Creation
├── Redirect
├── URL Management
├── Analytics API
├── Rate Limiting
├── Health / Readiness
└── Metrics
```

The API can later be deployed as multiple stateless instances.

The terms **API Server** and **Redirect API** represent logical responsibilities initially, not necessarily separate deployable services.

---

# 4. Core Request Flows

## URL Creation

```text
Client
  ↓
Load Balancer
  ↓
Express API
  ↓
Zod Validation
  ↓
URL Service
  ↓
ID Generation
  ↓
Base62 Encoding
  ↓
PostgreSQL
  ↓
Redis
  ↓
Response
```

---

## Redirect

This is the highest-throughput path.

```text
Client
  ↓
Load Balancer
  ↓
Redirect Handler
  ↓
Redis
  │
  ├── HIT ──────────────→ Redirect
  │
  └── MISS
         ↓
     PostgreSQL
         ↓
       Redis
         ↓
      Redirect
```

Redis is a performance optimization.

PostgreSQL remains the source of truth.

---

## Analytics

The redirect must **not wait for analytics processing**.

```text
                    ┌──────────────→ User
                    │
Redirect Request ───┤
                    │
                    └──────────────→ Click Event
                                          ↓
                                    Click Outbox
                                          ↓
                                   Publisher Worker
                                          ↓
                                      RabbitMQ
                                          ↓
                                  Analytics Worker
                                          ↓
                                    Analytics DB
```

Use a **Transactional Outbox pattern** when implementing reliable analytics publication.

If RabbitMQ is unavailable, the redirect should not remain blocked indefinitely.

---

# 5. Milestone 0 — Repository & Development Foundation

## Goal

Create a clean TypeScript/Express backend.

## Tasks

* Initialize Node.js project.
* Configure TypeScript.
* Enable strict mode.
* Configure **Express.js**.
* Configure ESLint.
* Configure Prettier.
* Configure Vitest.
* Add environment configuration.
* Add `.env.example`.
* Add `.gitignore`.
* Create initial project structure.

Recommended structure:

```text
src/
├── app.ts
├── server.ts
├── config/
├── routes/
├── controllers/
├── services/
├── repositories/
├── models/
├── validators/
├── errors/
├── utils/
└── types/

tests/
├── unit/
├── integration/
└── e2e/

docs/
```

## Deliverables

* Application starts.
* `GET /health` returns 200.
* Tests run.
* TypeScript compilation works.

Verify:

```bash
npm run build
npm test
```

---

# 6. Milestone 1 — PostgreSQL

## Goal

Create the persistent URL storage layer.

Create migrations.

Initial table:

```text
urls
--------------------------------
id
short_code
original_url
custom_alias
user_id
created_at
updated_at
expires_at
is_active
```

Add:

* Primary key.
* Unique constraints.
* Appropriate indexes.
* Foreign keys where applicable.

Do not add indexes without explaining why they exist.

Create:

```text
UrlRepository
```

with methods such as:

```text
create()
findByShortCode()
findByCustomAlias()
deactivate()
update()
```

All SQL/database access must remain inside repository/data-access code.

Explain:

* Primary keys.
* Unique constraints.
* Indexes.
* Transactions.
* PostgreSQL sequences.
* Why sequence gaps are acceptable.

Test:

* Insert.
* Lookup.
* Uniqueness.
* Deactivation.
* Expiration.

---

# 7. Milestone 2 — URL Creation API

Implement:

```http
POST /api/v1/urls
```

Request:

```json
{
  "url": "https://example.com/very/long/url",
  "customAlias": null,
  "expiresAt": null
}
```

Response:

```json
{
  "shortCode": "abc123",
  "shortUrl": "http://localhost:3000/abc123",
  "originalUrl": "https://example.com/very/long/url"
}
```

Architecture:

```text
HTTP
 ↓
Route
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
PostgreSQL
```

Use Zod for validation.

Validate:

* URL format.
* HTTP/HTTPS only.
* Maximum URL length.
* Invalid/missing fields.

Test valid and invalid requests.

---

# 8. Milestone 3 — Base62

Implement:

```text
encode(number)
decode(string)
```

Alphabet:

```text
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
```

Architecture:

```text
Unique ID
   ↓
Base62
   ↓
Short Code
```

Initially use PostgreSQL-generated IDs.

Explain:

* Why random codes collide.
* Why Base62 is compact.
* Sequential ID leakage.
* Predictability.
* Distributed ID generation.
* Snowflake-style IDs.

Test:

* `encode(0)`.
* Small numbers.
* Large numbers.
* Encode/decode round trips.
* Invalid input.

---

# 9. Milestone 4 — Redirect System

Implement:

```http
GET /:shortCode
```

Flow:

```text
GET /abc123
     ↓
PostgreSQL
     ↓
original URL
     ↓
HTTP Redirect
```

Handle:

* Unknown short code.
* Inactive URL.
* Expired URL.

Use an appropriate redirect status.

Explain:

* 301.
* 302.
* 307.
* 308.

Explain why the selected status is appropriate for this project.

---

# 10. Milestone 5 — Redis

Add Redis caching.

Implement cache-aside:

```text
GET /abc123
      ↓
    Redis
      │
 ┌────┴────┐
 HIT       MISS
 │          │
 ▼          ▼
URL      PostgreSQL
           │
           ▼
         Redis
           │
           ▼
        Redirect
```

Use:

```text
url:{shortCode}
```

Requirements:

* Configurable TTL.
* Cache successful mappings.
* Cache misses if appropriate.
* Invalidate cache after mutations.
* Redis connection handling.
* Redis failure fallback.

Redis must never be required for correctness.

Track:

```text
cache_hits
cache_misses
```

Test:

* Hit.
* Miss.
* DB fallback.
* Cache population.
* Invalidation.
* Redis failure.

---

# 11. Milestone 6 — Custom Aliases

Support:

```text
https://short.example/github
```

Request:

```json
{
  "url": "https://github.com/",
  "customAlias": "github"
}
```

Requirements:

* Alias validation.
* Allowed characters.
* Reserved words where appropriate.
* Database-level uniqueness.
* Concurrent request safety.

Important:

Never rely only on:

```text
SELECT → check exists → INSERT
```

because concurrent requests can race.

Use a database unique constraint and correctly handle the conflict.

Test concurrent creation.

---

# 12. Milestone 7 — URL Lifecycle

Implement:

```http
DELETE /api/v1/urls/:shortCode
```

Use soft deletion/deactivation.

Support:

```text
expiresAt
isActive
```

Expired/inactive URLs should return:

```text
410 Gone
```

Invalidate Redis after deletion/deactivation.

Explain:

* Soft deletion.
* Hard deletion.
* Lazy expiration.
* Background cleanup.
* Redis TTL.
* Database cleanup.

---

# 13. Milestone 8 — Distributed Rate Limiting

Use Redis.

Example:

```text
100 requests / minute / IP
```

Protect at minimum:

```text
POST /api/v1/urls
Analytics APIs
```

Return:

```text
429 Too Many Requests
```

Do not use process-local memory.

Explain:

* Fixed window.
* Sliding window.
* Token bucket.
* Distributed rate limiting.

Implement the simplest appropriate approach first.

---

# 14. Milestone 9 — Analytics Events

Create:

```text
url.clicked
```

Example:

```json
{
  "eventType": "url.clicked",
  "shortCode": "abc123",
  "timestamp": "...",
  "ip": "...",
  "userAgent": "...",
  "referer": "..."
}
```

Do not synchronously perform expensive analytics processing during redirects.

Discuss privacy:

* IP retention.
* IP anonymization.
* User-agent handling.
* Data retention.
* Aggregation.

---

# 15. Milestone 10 — Transactional Outbox

Implement a reliable event-publication mechanism.

Concept:

```text
Redirect
   │
   ├────────→ User
   │
   ▼
PostgreSQL
   │
   ▼
Click Outbox
   │
   ▼
Publisher Worker
   │
   ▼
RabbitMQ
```

The outbox should support:

* Event persistence.
* Retry.
* Publish confirmation.
* Failure recovery.
* Idempotent processing.
* Cleanup of successfully published events.

Explain the trade-off:

```text
Best-effort analytics
vs
Reliable analytics
```

Do not allow RabbitMQ failure to block redirects indefinitely.

---

# 16. Milestone 11 — RabbitMQ & Analytics Worker

Create:

```text
Analytics Worker
```

It should:

1. Consume events.
2. Validate events.
3. Persist analytics.
4. Acknowledge successful messages.
5. Retry transient failures.
6. Handle poison messages.
7. Use a dead-letter queue where appropriate.

Explain:

* At-least-once delivery.
* Duplicate messages.
* Idempotency.
* Retry policies.
* Dead-letter queues.
* Message acknowledgements.

---

# 17. Milestone 12 — Analytics Storage

Create:

```text
click_events
```

Possible fields:

```text
id
short_code
timestamp
country
device_type
browser
referrer
```

Initially use PostgreSQL.

Explain why an analytical database such as ClickHouse could eventually be preferable for very large event volumes.

---

# 18. Milestone 13 — Analytics API

Implement:

```http
GET /api/v1/urls/:shortCode/analytics
```

Support:

* Total clicks.
* Clicks by day.
* Country.
* Device.
* Browser.
* Referrer.

Example:

```json
{
  "shortCode": "abc123",
  "totalClicks": 12543,
  "countries": {
    "IN": 5000,
    "US": 3000
  },
  "devices": {
    "mobile": 8000,
    "desktop": 4000
  }
}
```

Do not prematurely optimize.

---

# 19. Milestone 14 — Observability

Implement structured logging.

Every request should include:

```text
requestId
method
path
statusCode
latency
```

Metrics:

```text
http_requests_total
http_request_duration
redirect_requests_total
redirect_cache_hits
redirect_cache_misses
url_creation_total
analytics_events_created
analytics_events_published
analytics_events_processed
analytics_events_failed
rate_limit_exceeded
```

Endpoints:

```http
GET /health
GET /ready
GET /metrics
```

`/ready` should check required dependencies:

* PostgreSQL.
* Redis.
* RabbitMQ.

Explain the difference between:

```text
liveness
vs
readiness
```

---

# 20. Milestone 15 — Failure Handling

Explicitly test dependency failures.

## Redis failure

```text
Redis unavailable
      ↓
PostgreSQL fallback
      ↓
Redirect continues
```

## RabbitMQ failure

```text
RabbitMQ unavailable
      ↓
Outbox retains event
      ↓
Publisher retries later
```

## PostgreSQL failure

If the mapping cannot be resolved, return an appropriate service-unavailable response.

Implement:

* Timeouts.
* Appropriate retries.
* Exponential backoff where appropriate.
* Graceful shutdown.
* Connection cleanup.

Avoid retry storms.

Explain:

* Fail-open vs fail-closed.
* Dependency isolation.
* Backpressure.
* Cascading failures.

---

# 21. Milestone 16 — Docker

Create:

```text
Dockerfile
docker-compose.yml
```

Initial services:

```text
api
postgres
redis
rabbitmq
analytics-worker
```

Later add:

```text
nginx
api-2
```

to demonstrate horizontal scaling.

The entire system should start with:

```bash
docker compose up
```

Use:

```text
.env.example
```

Document:

```text
DATABASE_URL
REDIS_URL
RABBITMQ_URL
BASE_URL
PORT
RATE_LIMIT_WINDOW
RATE_LIMIT_MAX_REQUESTS
REDIS_TTL
LOG_LEVEL
```

---

# 22. Milestone 17 — Load Balancer & Horizontal Scaling

This milestone is important.

Demonstrate that the API is stateless and horizontally scalable.

Run:

```text
              Nginx
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
    API #1    API #2    API #3
```

Requirements:

* Multiple Express instances.
* Different ports.
* Nginx reverse proxy/load balancing.
* Health checks.
* Round-robin or equivalent balancing.
* No important application state stored in local memory.

Demonstrate:

```text
API #1 crashes
     ↓
Load Balancer
     ↓
API #2 / API #3
     ↓
Requests continue
```

Explain:

* Stateless services.
* Horizontal scaling.
* Load balancing.
* Session affinity.
* Health checks.
* Failure isolation.

Do not require cloud infrastructure.

---

# 23. Milestone 18 — Comprehensive Testing

## Unit

Test:

* Base62.
* Validation.
* Expiration.
* ID generation.
* Rate limiter.
* Services.

## Integration

Test:

* PostgreSQL.
* Redis.
* RabbitMQ.
* Repositories.
* Outbox.
* Workers.

## E2E

Test:

```text
Create URL
    ↓
Receive short code
    ↓
Redirect
    ↓
Create analytics event
    ↓
Publish event
    ↓
Worker processes event
    ↓
Analytics API
    ↓
Verify click
```

Also test:

* Expired URL.
* Deleted URL.
* Duplicate alias.
* Concurrent alias creation.
* Redis failure.
* RabbitMQ failure.
* Rate limiting.
* Invalid URL.
* Unknown code.
* PostgreSQL failure.

---

# 24. Milestone 19 — OpenAPI

Document:

```text
POST   /api/v1/urls
GET    /:shortCode
GET    /api/v1/urls/:shortCode
DELETE /api/v1/urls/:shortCode
GET    /api/v1/urls/:shortCode/analytics
GET    /health
GET    /ready
GET    /metrics
```

Include:

* Request schemas.
* Response schemas.
* Error schemas.
* Examples.
* Status codes.

Expose Swagger UI during development.

---

# 25. Milestone 20 — System Design Documentation

Create:

```text
docs/system-design.md
```

Include:

## Functional Requirements

Examples:

* Create short URLs.
* Redirect users.
* Custom aliases.
* Expiration.
* Deactivation.
* Analytics.
* Rate limiting.

## Non-functional Requirements

Discuss:

* Low redirect latency.
* High availability.
* Scalability.
* Durability.
* Eventual consistency of analytics.
* Observability.

## Architecture

Document every major component.

## Data Model

Document:

* URLs.
* Click events.
* Outbox events.

## Request Flows

### Creation

```text
Client
 ↓
LB
 ↓
API
 ↓
ID Generator
 ↓
Base62
 ↓
PostgreSQL
 ↓
Redis
```

### Redirect

```text
Client
 ↓
LB
 ↓
API
 ↓
Redis
 ↓
PostgreSQL on miss
 ↓
Redirect
```

### Analytics

```text
Redirect
 ↓
Outbox
 ↓
Publisher
 ↓
RabbitMQ
 ↓
Worker
 ↓
Analytics DB
```

---

# 26. Milestone 21 — Capacity Planning

Use these hypothetical assumptions:

```text
100M new URLs / month
1B redirects / day
```

Do **not** assume these automatically represent a 10:1 read/write ratio.

Calculate the actual workload ratio from the assumptions.

Calculate:

### URL creation rate

```text
100,000,000 / seconds in a month
```

### Average redirect QPS

```text
1,000,000,000 / 86,400
```

### Peak QPS

Assume approximately:

```text
5 × average QPS
```

Then estimate:

* API instances.
* Redis memory.
* PostgreSQL storage.
* Database IOPS.
* Network bandwidth.
* RabbitMQ throughput.
* Analytics storage.

Clearly distinguish:

```text
Assumptions
vs
Calculated values
vs
Actual measurements
```

Explain which component becomes the bottleneck first.

---

# 27. Milestone 22 — Scaling Strategy

Document the evolution.

## Stage 1

```text
1 API
1 PostgreSQL
1 Redis
```

## Stage 2

```text
Multiple API instances
        ↓
Load Balancer
```

## Stage 3

```text
Redis
 ↓
Redis Cluster
```

## Stage 4

```text
PostgreSQL Primary
        ↓
Read Replicas
```

## Stage 5

```text
PostgreSQL
 ↓
Sharding
```

## Stage 6

```text
PostgreSQL Sequence
        ↓
Distributed ID Generator
        ↓
Base62
```

## Stage 7

```text
PostgreSQL Analytics
        ↓
ClickHouse
```

## Stage 8

```text
Single Region
      ↓
Multi-region
```

For every stage explain:

* What bottleneck exists.
* Why the change is necessary.
* What problem it solves.
* What complexity it introduces.
* Whether the change is actually justified.

Do not add distributed complexity just because traffic increased slightly.

---

# 28. Future Production Evolution

Document these but do not prematurely implement them unless explicitly requested.

## CDN

A CDN may help with extremely hot redirect traffic.

Discuss:

* Cacheability.
* TTL.
* Invalidation.
* Custom aliases.
* Expiration.
* Why CDN caching redirects can be tricky.

## DNS / Global Traffic Routing

Eventually:

```text
Global DNS
   │
   ├── Region A
   ├── Region B
   └── Region C
```

Discuss:

* Latency-based routing.
* Failover.
* Regional outages.
* Data consistency.

## Redis Cluster

Discuss:

* Partitioning.
* Replication.
* Failover.
* Hot keys.

## Database Sharding

Discuss:

* Shard key.
* Consistent hashing.
* Rebalancing.
* Hot partitions.
* Cross-shard queries.

## Distributed ID Generation

Discuss:

* Snowflake-style IDs.
* Timestamp-based IDs.
* Worker IDs.
* Clock issues.

## ClickHouse

Discuss:

* Analytical workloads.
* Columnar storage.
* Aggregation performance.
* High-volume event ingestion.

---

# 29. Milestone 23 — Final Architecture Review

Perform a serious architecture review.

Look for:

* Race conditions.
* Inefficient SQL.
* Missing indexes.
* Cache consistency problems.
* Cache stampedes.
* Failure modes.
* Retry storms.
* Queue problems.
* Duplicate events.
* Missing idempotency.
* Security issues.
* Validation problems.
* Poor error handling.
* Logging problems.
* Privacy concerns.
* Scalability bottlenecks.
* Unnecessary complexity.

Do not simply say:

> "The system is production ready."

Instead provide:

```text
What is production-ready
What is not
What assumptions remain
What would break at 10x
What would break at 100x
What should be changed next
```

---

# 30. Milestone 24 — Final README

Create a polished README containing:

```text
Project Overview
Features
Architecture
Tech Stack
Getting Started
Docker Setup
Environment Variables
Database Migrations
API Documentation
Testing
Analytics
Caching
Rate Limiting
Observability
Failure Handling
Load Balancing
Capacity Planning
Scaling Strategy
System Design
Trade-offs
Known Limitations
Future Improvements
```

Include Mermaid diagrams where useful.

---

# 31. Final Project Architecture

The completed learning project should demonstrate this:

```text
                           CLIENT
                              │
                              ▼
                         DNS / CDN
                       (future/optional)
                              │
                              ▼
                       LOAD BALANCER
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
             API #1                      API #2
                │                           │
                └─────────────┬─────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
             Redis                     PostgreSQL
             Cache                   Source of Truth
                │                           │
                │                           │
                └─────────────┬─────────────┘
                              │
                         Click Outbox
                              │
                              ▼
                       Publisher Worker
                              │
                              ▼
                          RabbitMQ
                              │
                              ▼
                      Analytics Worker
                              │
                              ▼
                       Analytics DB
                              │
                         future:
                         ClickHouse
```

---

# 32. Core Engineering Principles

Throughout the project follow these principles:

### PostgreSQL

```text
Source of truth
```

### Redis

```text
Performance optimization
```

### RabbitMQ

```text
Asynchronous communication
```

### Outbox

```text
Reliable event publication
```

### Workers

```text
Background processing
```

### Load Balancer

```text
Horizontal scaling
```

### Express API

```text
Stateless application layer
```

### Analytics DB

```text
Separate analytical workload
```

---

# 33. What I Should Learn From This Project

The goal is **not** simply to create a URL shortener.

By the end, I should understand:

```text
REST APIs
    ↓
PostgreSQL
    ↓
Indexes
    ↓
Transactions
    ↓
Base62
    ↓
Redis
    ↓
Caching strategies
    ↓
Rate limiting
    ↓
Message queues
    ↓
RabbitMQ
    ↓
Async processing
    ↓
Transactional Outbox
    ↓
Idempotency
    ↓
Retries
    ↓
Dead-letter queues
    ↓
Observability
    ↓
Load balancing
    ↓
Horizontal scaling
    ↓
Read replicas
    ↓
Sharding
    ↓
Distributed IDs
    ↓
Analytics databases
    ↓
Multi-region architecture
```

For every technology, teach me **why it exists and what problem it solves**.

---

# 34. Agent Behavior

You are my **coding agent + system-design mentor**.

Do not blindly implement requirements.

Whenever making an architectural decision, explain:

### 1. What are we building?

### 2. Why are we building it?

### 3. Why this approach?

### 4. What are the alternatives?

### 5. What are the trade-offs?

### 6. What happens when it fails?

### 7. What happens at 10x scale?

### 8. What happens at 100x scale?

### 9. What bottleneck will appear next?

### 10. What should I understand before moving forward?

Prefer:

```text
Simple
   ↓
Correct
   ↓
Measurable
   ↓
Scalable
```

over:

```text
Complex
   ↓
Distributed
   ↓
Hard to understand
```

Do not introduce a technology merely because it is popular.

Every component must have a clear reason to exist.

The final project should demonstrate that I understand **why the architecture works**, not merely that I can make the code run.
