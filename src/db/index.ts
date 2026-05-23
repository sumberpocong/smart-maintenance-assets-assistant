import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('[db] WARNING: DATABASE_URL environment variable is not defined!');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create Drizzle DB client
export const db = drizzle(pool, { schema });

/**
 * Runs lightweight startup queries or manual table initialization.
 * For cloud-agnostic and highly reversible systems, we can automatically
 * create tables if they do not exist, or we can run drizzle-kit push.
 * To make this extremely robust, we will write a helper that runs at startup
 * to verify connection and log status.
 */
export async function testDbConnection(): Promise<boolean> {
  if (!databaseUrl) {
    console.error('[db] Cannot connect to Postgres: DATABASE_URL is missing.');
    return false;
  }
  
  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log(`[db] PostgreSQL connected successfully! Server time: ${res.rows[0].now}`);
    return true;
  } catch (err) {
    console.error('[db] PostgreSQL connection failed:', err);
    return false;
  } finally {
    if (client) client.release();
  }
}
