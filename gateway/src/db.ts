import pg, { Pool } from 'pg';
import { config } from './config.js';

export const pool: Pool = new pg.Pool({
  ...(config.postgres.url ? { connectionString: config.postgres.url, ssl: config.appEnv === 'production' ? { rejectUnauthorized: false } : undefined } : {}),
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_plans (
      id SERIAL PRIMARY KEY,
      api_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('FREE','PRO','ENTERPRISE')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM client_plans;');
  if (existing.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO client_plans (api_key, name, tier) VALUES
       ('test-client-free', 'Free Demo', 'FREE'),
       ('test-client-pro', 'Pro Demo', 'PRO'),
       ('test-client-enterprise', 'Enterprise Demo', 'ENTERPRISE'),
       ('demo-key', 'Demo Key', 'PRO');`
    );
  }
}
