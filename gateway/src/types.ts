export type RateLimitAlgorithm = 'token_bucket' | 'fixed_window' | 'sliding_window_log' | 'sliding_window_counter';
export type RateLimitTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface ClientRateLimitConfig {
  limit: number;
  algorithm: RateLimitAlgorithm;
  windowMs: number;
  refillRate: number;
  burst: number;
}

export interface ClientPlan {
  id: number;
  apiKey: string;
  tier: RateLimitTier;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
  algorithm: RateLimitAlgorithm;
  key: string;
  scope: 'api_key' | 'ip';
  metadata?: Record<string, unknown>;
}

export interface GatewayMetricEvent {
  ts: number;
  clientId: string;
  route: string;
  isAllowed: boolean;
  remaining: number;
  limit: number;
  scope: 'api_key' | 'ip';
  algorithm: RateLimitAlgorithm;
}

export interface BackendCircuitState {
  service: string;
  isOpen: boolean;
  failures: number;
  openedAt: number | null;
  cooldownUntil: number | null;
}
