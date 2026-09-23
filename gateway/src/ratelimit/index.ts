import fs from 'node:fs';
import path from 'node:path';
import { redis } from '../redis.js';
import { RateLimitAlgorithm, RateLimitDecision } from '../types.js';

const luaScripts: Record<RateLimitAlgorithm, string> = {
  token_bucket: fs.readFileSync(path.join(process.cwd(), 'src/ratelimit/lua/token_bucket.lua'), 'utf8'),
  fixed_window: fs.readFileSync(path.join(process.cwd(), 'src/ratelimit/lua/fixed_window.lua'), 'utf8'),
  sliding_window_log: fs.readFileSync(path.join(process.cwd(), 'src/ratelimit/lua/sliding_window_log.lua'), 'utf8'),
  sliding_window_counter: fs.readFileSync(path.join(process.cwd(), 'src/ratelimit/lua/sliding_window_counter.lua'), 'utf8'),
};

export async function evaluateRateLimit(
  algorithm: RateLimitAlgorithm,
  key: string,
  limit: number,
  windowMs: number,
  options: { refillRate?: number; burst?: number } = {}
): Promise<RateLimitDecision> {
  const now = Date.now();
  const script = luaScripts[algorithm];
  const args = [String(limit), String(now), String(windowMs)];

  if (algorithm === 'token_bucket') {
    args.splice(1, 0, String(options.refillRate ?? 5), String(options.burst ?? 10));
  }

  const [result, remaining, resetAt] = (await redis.eval(script, 1, key, ...args)) as [number, number, number];
  const allowed = result === 1;

  return {
    allowed,
    limit,
    remaining: Math.max(0, Number(remaining)),
    resetAt: Number(resetAt ?? now + windowMs),
    retryAfterMs: allowed ? 0 : Math.max(1, Number(resetAt ?? now + windowMs) - now),
    algorithm,
    key,
    scope: 'api_key',
  };
}
