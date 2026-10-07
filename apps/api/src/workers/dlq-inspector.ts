import http from 'node:http';
import type { ConsumeMessage } from 'amqplib';
import { analyticsMetrics, recordDlqDepth, recordDlqSeen } from '../analytics/analytics-metrics.js';
import { assertTopology, CLICKS_DLQ, connectRabbitMQ } from '../rabbitmq/connection.js';
import { log } from '../observability/logger.js';
import { env } from '../config/env.js';

const METRICS_PORT = 9092;
const DEPTH_LOG_INTERVAL_MS = 60_000;
const MAX_PAYLOAD_LOG_CHARS = 500;

export interface DeadLetterInfo {
  messageId: string | undefined;
  routingKey: string;
  redelivered: boolean;
  deathReason: string | undefined;
  payloadPreview: string;
}

export interface DlqInspectorHooks {
  onDeadLetter?: (info: DeadLetterInfo) => void;
}

export interface DlqInspectorHandle {
  stop(): Promise<void>;
}

function renderDlqMetrics(): string {
  const lines = [
    '# HELP dlq_total Dead-lettered click events observed (peeked, never consumed).',
    '# TYPE dlq_total counter',
    `dlq_total ${String(analyticsMetrics.dlqTotal)}`,
    '# HELP dlq_depth Current dead-letter queue depth.',
    '# TYPE dlq_depth gauge',
    `dlq_depth ${String(analyticsMetrics.dlqDepth)}`,
  ];
  return lines.join('\n') + '\n';
}

/**
 * DLQ inspector: the dedicated consumer for dead-lettered click events.
 * Logs each dead letter at error level (that log line IS the durable
 * evidence), tracks dlq_total / dlq_depth, then acks. Without this,
 * poison messages accumulate in the DLQ forever with no operator signal.
 */
export async function startDlqInspector(
  amqpUrl: string = env.RABBITMQ_URL,
  hooks: DlqInspectorHooks = {},
): Promise<DlqInspectorHandle> {
  const connection = await connectRabbitMQ(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);

  const handleMessage = (msg: ConsumeMessage): void => {
    const raw = msg.content.toString();
    const xDeath = msg.properties.headers?.['x-death'];
    const firstDeath = Array.isArray(xDeath) ? (xDeath[0] as Record<string, unknown>) : undefined;
    const info: DeadLetterInfo = {
      messageId: typeof msg.properties.messageId === 'string' ? msg.properties.messageId : undefined,
      routingKey: msg.fields.routingKey,
      redelivered: msg.fields.redelivered,
      deathReason: typeof firstDeath?.reason === 'string' ? firstDeath.reason : undefined,
      payloadPreview: raw.slice(0, MAX_PAYLOAD_LOG_CHARS),
    };
    if (hooks.onDeadLetter !== undefined) {
      hooks.onDeadLetter(info);
    } else {
      log('error', 'Dead-lettered click event', { ...info });
    }
    recordDlqSeen();
    channel.ack(msg);
    void updateDepth();
  };

  const updateDepth = async (): Promise<void> => {
    try {
      const queueInfo = await channel.checkQueue(CLICKS_DLQ);
      recordDlqDepth(queueInfo.messageCount);
    } catch (err) {
      log('warn', 'DLQ depth check failed', { error: (err as Error).message });
    }
  };

  await channel.consume(CLICKS_DLQ, (msg) => {
    if (msg !== null) {
      handleMessage(msg);
    }
  });

  // Depth at startup, then periodically — an already-full DLQ must be
  // visible even when no new dead letters arrive.
  await updateDepth();
  const depthTimer = setInterval(() => {
    void updateDepth();
  }, DEPTH_LOG_INTERVAL_MS);

  const metricsServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(renderDlqMetrics());
  });
  metricsServer.listen(METRICS_PORT);

  log('info', 'DLQ inspector started', { metricsPort: METRICS_PORT });

  return {
    stop: async () => {
      clearInterval(depthTimer);
      metricsServer.close();
      await channel.close();
      await connection.close();
    },
  };
}

function isMainModule(): boolean {
  return (
    process.argv[1]?.endsWith('dlq-inspector.js') === true ||
    process.argv[1]?.endsWith('dlq-inspector.ts') === true
  );
}

if (isMainModule()) {
  const inspector = await startDlqInspector(env.RABBITMQ_URL);
  const stop = (): void => {
    log('info', 'DLQ inspector shutting down...');
    void inspector
      .stop()
      .catch((e: unknown) => log('error', 'Error stopping DLQ inspector', { error: (e as Error).message }))
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
