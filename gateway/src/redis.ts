import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  password: config.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
}
