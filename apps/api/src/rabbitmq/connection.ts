import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { env } from '../config/env.js';

export const EVENTS_EXCHANGE = 'shortly.events';
export const CLICKS_ROUTING_KEY = 'url.clicked';
export const CLICKS_QUEUE = 'analytics.clicks';
export const DLX_EXCHANGE = 'shortly.dlx';
export const CLICKS_DLQ = 'analytics.clicks.dlq';

/**
 * Broker topology, declared idempotently by every process that touches the
 * broker (publisher, worker, tests). Queues/exchanges survive restarts
 * (durable); poison messages route to the DLQ via the dead-letter exchange.
 */
export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
  await channel.assertQueue(CLICKS_DLQ, { durable: true });
  await channel.bindQueue(CLICKS_DLQ, DLX_EXCHANGE, '#');
  await channel.assertQueue(CLICKS_QUEUE, {
    durable: true,
    deadLetterExchange: DLX_EXCHANGE,
  });
  await channel.bindQueue(CLICKS_QUEUE, EVENTS_EXCHANGE, CLICKS_ROUTING_KEY);
}

export async function connectRabbitMQ(url: string = env.RABBITMQ_URL): Promise<ChannelModel> {
  return amqp.connect(url);
}

export type { Channel, ChannelModel, ConfirmChannel };
