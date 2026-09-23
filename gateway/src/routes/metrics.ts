import { Router } from 'express';
import { getCircuitBreakerStatus } from '../proxy.js';

export const metricsRouter = Router();

metricsRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    snapshot: {
      timestamp: Date.now(),
      circuitBreakers: getCircuitBreakerStatus(),
    },
  });
});
