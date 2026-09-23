import express, { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { config, TIER_LIMITS, routePolicy, type PlanTier } from './config.js';
import { initializeDatabase, pool } from './db.js';
import { logger } from './logger.js';
import { connectRedis, redis } from './redis.js';
import { wireServiceProxy } from './proxy.js';
import { evaluateRateLimit } from './ratelimit/index.js';
import { metricsPublisher } from './metrics.js';
import { adminRouter } from './routes/admin.js';
import { metricsRouter } from './routes/metrics.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).requestId = (req.headers['x-request-id'] as string) || randomUUID();
  logger.info({ requestId: (req as any).requestId, method: req.method, url: req.originalUrl }, 'incoming request');
  next();
});

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});
metricsPublisher.attach(io);

async function getClientTier(apiKey: string): Promise<PlanTier> {
  const result = await pool.query('SELECT tier FROM client_plans WHERE api_key = $1', [apiKey]);
  const tier = result.rows[0]?.tier as PlanTier | undefined;
  return tier ?? config.defaultTier;
}

function getFallbackIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown-ip';
}

function buildRateLimitKey(req: Request, clientId: string): string {
  return `rl:${req.path}:${clientId}`;
}

async function resolveRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = (req.headers['x-api-key'] as string) || 'anonymous';
  const ip = getFallbackIp(req);
  const tier = await getClientTier(apiKey === 'anonymous' ? 'anonymous' : apiKey);
  const limit = TIER_LIMITS[tier];
  const route = req.path || '/';
  const algorithm = routePolicy[route]?.algorithm ?? config.defaultAlgorithm;
  const windowMs = routePolicy[route]?.windowMs ?? 60_000;

  const key = `gateway:${route}:${apiKey !== 'anonymous' ? apiKey : ip}`;
  const decision = await evaluateRateLimit(
    algorithm,
    key,
    limit,
    windowMs,
    { refillRate: routePolicy[route]?.refillRate ?? 5, burst: routePolicy[route]?.burst ?? 10 }
  );

  decision.scope = apiKey !== 'anonymous' ? 'api_key' : 'ip';
  decision.limit = limit;

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, decision.remaining)));
  res.setHeader('X-RateLimit-Reset', String(decision.resetAt));
  res.setHeader('Retry-After', String(decision.retryAfterMs));

  if (!decision.allowed) {
    metricsPublisher.emit({
      ts: Date.now(),
      clientId: apiKey !== 'anonymous' ? apiKey : ip,
      route,
      isAllowed: false,
      remaining: decision.remaining,
      limit: decision.limit,
      scope: decision.scope,
      algorithm,
    });

    res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      retryAfterMs: decision.retryAfterMs,
      limit,
      remaining: Math.max(0, decision.remaining),
      resetAt: decision.resetAt,
    });
    return;
  }

  metricsPublisher.emit({
    ts: Date.now(),
    clientId: apiKey !== 'anonymous' ? apiKey : ip,
    route,
    isAllowed: true,
    remaining: decision.remaining,
    limit: decision.limit,
    scope: decision.scope,
    algorithm,
  });

  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'gateway', instance: config.instanceName, redis: 'connected' });
});

app.get('/auth-check', async (req, res) => {
  const apiKey = (req.headers['x-api-key'] as string) || 'anonymous';
  const clientTier = await getClientTier(apiKey);
  res.json({ ok: true, apiKey, tier: clientTier, limits: TIER_LIMITS[clientTier] });
});

app.use('/admin', adminRouter);
app.use('/metrics', metricsRouter);

app.use('/orders', resolveRateLimit, (req, res) => {
  res.json({
    ok: true,
    service: 'orders',
    message: 'Order service request proxied successfully',
    requestId: (req as any).requestId,
    instance: config.instanceName,
  });
});

app.use('/inventory', resolveRateLimit, (req, res) => {
  res.json({
    ok: true,
    service: 'inventory',
    message: 'Inventory service request proxied successfully',
    requestId: (req as any).requestId,
    instance: config.instanceName,
  });
});

wireServiceProxy(app);

io.on('connection', (socket) => {
  socket.emit('status', { ok: true, server: config.instanceName, connectedAt: Date.now() });
});

const start = async (): Promise<void> => {
  await initializeDatabase();
  await connectRedis();
  server.listen(config.port, () => {
    logger.info({ port: config.port, instance: config.instanceName }, 'RateGuard gateway listening');
  });
};

start().catch((error) => {
  logger.error(error, 'Gateway startup failed');
  process.exit(1);
});
