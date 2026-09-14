import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDb, db } from './db/db.js';
import { log } from './observability/logger.js';
import { closeRedis } from './redis/client.js';
import { closeSubscriberClient, getSubscriberClient } from './redis/subscriber-client.js';
import {
  ClickEventRepository,
  RAW_CLICK_RETENTION_DAYS,
} from './analytics/click-event-repository.js';
import { OutboxRepository } from './outbox/outbox-repository.js';
import { SseConnectionManager } from './sse/connection-manager.js';
import { createAnalyticsSseController } from './controllers/analytics-sse.controller.js';
import { createAnalyticsSseRouter } from './routes/analytics-stream.js';

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // every hour

const { app, urlService } = createApp();

// SSE: subscribe to Redis pub/sub and mount the streaming endpoint.
// Created here (not in createApp) so tests don't need a live Redis subscriber.
const sseManager = new SseConnectionManager(getSubscriberClient(), urlService);
const sseController = createAnalyticsSseController(sseManager);
app.use('/api/v1/urls', createAnalyticsSseRouter(sseController));

const server = app.listen(env.PORT, () => {
  log('info', 'shortly listening', { baseUrl: env.BASE_URL, env: env.NODE_ENV });
});

// Purge scheduler: periodically clean published outbox rows and old click events.
function startPurgeScheduler(): void {
  const outbox = new OutboxRepository(db);
  const clicks = new ClickEventRepository(db);

  const purge = async (): Promise<void> => {
    try {
      const outboxPurged = await outbox.purgePublished(7);
      if (outboxPurged > 0) {
        log('info', 'Purged published outbox rows', { count: outboxPurged });
      }
    } catch (err) {
      log('error', 'Outbox purge failed', { error: (err as Error).message });
    }
    try {
      const clicksPurged = await clicks.purgeClicksOlderThan(RAW_CLICK_RETENTION_DAYS);
      if (clicksPurged > 0) {
        log('info', 'Purged old click events', {
          count: clicksPurged,
          retentionDays: RAW_CLICK_RETENTION_DAYS,
        });
      }
    } catch (err) {
      log('error', 'Click purge failed', { error: (err as Error).message });
    }
  };

  // Run once on startup, then every hour.
  void purge();
  setInterval(() => {
    void purge();
  }, PURGE_INTERVAL_MS);
}

startPurgeScheduler();

function shutdown(signal: string): void {
  log('info', 'Received signal, shutting down gracefully', { signal });
  server.close((err) => {
    if (err !== undefined && err !== null) {
      log('error', 'Error during shutdown', { error: err.message });
      process.exitCode = 1;
      return;
    }
    void (async () => {
      try {
        sseManager.close();
        await closeSubscriberClient();
        await closeDb();
        await closeRedis();
      } catch (e: unknown) {
        log('error', 'Error closing connections', { error: (e as Error).message });
        process.exitCode = 1;
        return;
      }
      process.exitCode = 0;
    })();
  });
  // Force-exit guard so a hanging socket cannot block deploys forever.
  setTimeout(() => {
    log('error', 'Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    log('error', 'Port already in use', { port: env.PORT });
  } else {
    log('error', 'Server error', { error: err.message });
  }
  process.exit(1);
});
