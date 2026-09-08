import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/db.js';
import { closeRedis } from './redis/client.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  // Keep M0 logging minimal; structured logging lands in M14.
  console.log(`shortly listening on ${env.BASE_URL} (env=${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close((err) => {
    if (err !== undefined && err !== null) {
      console.error('Error during shutdown', err);
      process.exitCode = 1;
      return;
    }
    void (async () => {
      try {
        await closeDb();
        await closeRedis();
      } catch (e: unknown) {
        console.error('Error closing connections', e);
        process.exitCode = 1;
        return;
      }
      process.exitCode = 0;
    })();
  });
  // Force-exit guard so a hanging socket cannot block deploys forever.
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use`);
  } else {
    console.error('Server error', err);
  }
  process.exit(1);
});
