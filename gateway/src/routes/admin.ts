import { Router } from 'express';
import { pool } from '../db.js';
import { config, TIER_LIMITS, type PlanTier } from '../config.js';

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== config.adminApiKey) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
});

adminRouter.get('/plans', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM client_plans ORDER BY id');
  res.json({ ok: true, plans: rows });
});

adminRouter.put('/plans/:apiKey', async (req, res) => {
  const { apiKey } = req.params;
  const { tier, name } = req.body ?? {};
  if (!tier || !Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier)) {
    res.status(400).json({ ok: false, error: 'Invalid tier. Use FREE, PRO, or ENTERPRISE.' });
    return;
  }

  const now = new Date().toISOString();
  const result = await pool.query(
    `INSERT INTO client_plans (api_key, name, tier, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (api_key)
     DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier, updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [apiKey, name ?? apiKey, tier as PlanTier, now]
  );

  res.json({ ok: true, client: result.rows[0] });
});
