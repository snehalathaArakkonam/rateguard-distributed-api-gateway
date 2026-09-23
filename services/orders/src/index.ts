import express from 'express';
import { config } from './config.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'orders', status: 'healthy', timestamp: Date.now() });
});

app.get('/orders', (req, res) => {
  res.json({
    ok: true,
    service: 'orders',
    message: 'Orders service responded successfully',
    requestId: req.headers['x-rateguard-request-id'] ?? 'unknown',
    items: [
      { id: 'A-1001', sku: 'LAMP-01', qty: 2, total: 149.99 },
      { id: 'A-1002', sku: 'MOUSE-09', qty: 1, total: 29.5 },
    ],
    timestamp: Date.now(),
  });
});

app.post('/orders', (req, res) => {
  const payload = req.body ?? {};
  res.status(201).json({
    ok: true,
    service: 'orders',
    message: 'Order created',
    requestId: req.headers['x-rateguard-request-id'] ?? 'unknown',
    payload,
    timestamp: Date.now(),
  });
});

app.listen(config.port, () => {
  console.log(`Orders service listening on port ${config.port}`);
});
