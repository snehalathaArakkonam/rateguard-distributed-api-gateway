import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env', '../.env'].find((p) => !!p) });

export const config = {
  port: Number(process.env.PORT ?? 8080),
  appEnv: process.env.APP_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  redis: {
    url: process.env.REDIS_URL ?? '',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    db: Number(process.env.REDIS_DB ?? 0),
    password: process.env.REDIS_PASSWORD ?? '',
  },
  postgres: {
    url: process.env.DATABASE_URL ?? '',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? 'rateguard',
    user: process.env.POSTGRES_USER ?? 'rateguard',
    password: process.env.POSTGRES_PASSWORD ?? 'rateguard',
  },
  adminApiKey: process.env.ADMIN_API_KEY ?? 'admin-key-123',
  ordersServiceUrl: process.env.ORDERS_SERVICE_URL ?? 'http://localhost:3001',
  inventoryServiceUrl: process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3002',
  dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5173',
  instanceName: process.env.INSTANCE_NAME ?? 'gateway-1',
  defaultAlgorithm: (process.env.GATEWAY_RATE_ALGORITHM ?? 'token_bucket') as 'token_bucket' | 'fixed_window' | 'sliding_window_log' | 'sliding_window_counter',
  defaultTier: (process.env.GATEWAY_DEFAULT_TIER ?? 'FREE') as 'FREE' | 'PRO' | 'ENTERPRISE',
  backendTimeoutMs: Number(process.env.BACKEND_TIMEOUT_MS ?? 4000),
  circuitBreakerFailureThreshold: Number(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? 5),
  circuitBreakerResetTimeoutMs: Number(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS ?? 15000),
};

export type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export const TIER_LIMITS: Record<PlanTier, number> = {
  FREE: 60,
  PRO: 180,
  ENTERPRISE: 600,
};

export const PLAN_WINDOW_MS = 60_000;

export const routePolicy: Record<string, { algorithm: 'token_bucket' | 'fixed_window' | 'sliding_window_log' | 'sliding_window_counter'; limit: number; windowMs: number; refillRate: number; burst: number }> = {
  default: {
    algorithm: config.defaultAlgorithm,
    limit: TIER_LIMITS[config.defaultTier],
    windowMs: PLAN_WINDOW_MS,
    refillRate: 5,
    burst: 10,
  },
  '/orders': {
    algorithm: 'token_bucket',
    limit: 12,
    windowMs: 60_000,
    refillRate: 2,
    burst: 8,
  },
  '/inventory': {
    algorithm: 'sliding_window_counter',
    limit: 18,
    windowMs: 60_000,
    refillRate: 3,
    burst: 12,
  },
};

export const serviceTargets = {
  orders: config.ordersServiceUrl,
  inventory: config.inventoryServiceUrl,
};
