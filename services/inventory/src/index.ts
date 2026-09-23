import express from 'express';
import { config } from './config.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'inventory', status: 'healthy', timestamp: Date.now() });
});

app.get('/inventory', (req, res) => {
  res.json({
    ok: true,
    service: 'inventory',
    message: 'Inventory service responded successfully',
    requestId: req.headers['x-rateguard-request-id'] ?? 'unknown',
    stock: [
      { sku: 'LAMP-01', count: 42 },
      { sku: 'MOUSE-09', count: 105 },
      { sku: 'KEYBOARD-12', count: 78 },
    ],
    timestamp: Date.now(),
  });
});

app.post('/inventory/adjust', (req, res) => {
  const payload = req.body ?? {};
  res.json({
    ok: true,
    service: 'inventory',
    message: 'Inventory adjusted',
    requestId: req.headers['x-rateguard-request-id'] ?? 'unknown',
    payload,
    timestamp: Date.now(),
  });
});

app.listen(config.port, () => {
  console.log(`Inventory service listening on port ${config.port}`);
});
