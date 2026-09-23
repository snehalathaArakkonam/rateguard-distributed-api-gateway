import { createProxyMiddleware } from 'http-proxy-middleware';
import { Express } from 'express';
import { config, serviceTargets } from './config.js';
import { CircuitBreaker } from './circuit-breaker.js';

const circuitBreakers = new Map<string, CircuitBreaker>();

function ensureCircuitBreaker(service: string): CircuitBreaker {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(
      service,
      new CircuitBreaker(service, config.circuitBreakerFailureThreshold, config.circuitBreakerResetTimeoutMs)
    );
  }
  return circuitBreakers.get(service)!;
}

export function wireServiceProxy(app: Express): void {
  app.use('/orders', (req, res, next) => {
    const breaker = ensureCircuitBreaker('orders');
    if (breaker.isOpen()) {
      res.status(503).json({
        ok: false,
        service: 'orders',
        error: 'Service temporarily unavailable. Circuit breaker is open.',
        fallback: true,
      });
      return;
    }

    const proxy = createProxyMiddleware({
      target: serviceTargets.orders,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.setHeader('x-rateguard-route', '/orders');
          proxyReq.setHeader('x-rateguard-request-id', (req as any).requestId ?? 'unknown');
        },
        error: () => {
          breaker.recordFailure();
        },
        proxyRes: () => {
          breaker.recordSuccess();
        },
      },
    });
    proxy(req, res, next);
  });

  app.use('/inventory', (req, res, next) => {
    const breaker = ensureCircuitBreaker('inventory');
    if (breaker.isOpen()) {
      res.status(503).json({
        ok: false,
        service: 'inventory',
        error: 'Service temporarily unavailable. Circuit breaker is open.',
        fallback: true,
      });
      return;
    }

    const proxy = createProxyMiddleware({
      target: serviceTargets.inventory,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.setHeader('x-rateguard-route', '/inventory');
          proxyReq.setHeader('x-rateguard-request-id', (req as any).requestId ?? 'unknown');
        },
        error: () => {
          breaker.recordFailure();
        },
        proxyRes: () => {
          breaker.recordSuccess();
        },
      },
    });
    proxy(req, res, next);
  });
}

export function getCircuitBreakerStatus(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
  return Object.fromEntries(Array.from(circuitBreakers.entries()).map(([service, breaker]) => [service, breaker.getStats()]));
}
