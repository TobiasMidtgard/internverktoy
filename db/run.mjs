// Run a .sql file against Supabase Postgres.
// Usage: node --env-file=db/.env db/run.mjs supabase/tasks_v7.sql
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Mangler DATABASE_URL — sett den i db/.env'); process.exit(1); }

const file = process.argv[2];
if (!file) { console.error('Bruk: node --env-file=db/.env db/run.mjs <fil.sql>'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`→ Kjører ${file} …`);
  const res = await client.query(sql);          // simple-query: kjører alle setninger i fila
  const n = Array.isArray(res) ? res.length : 1;
  console.log(`✓ OK — ${n} setning(er) fullført.`);
} catch (e) {
  console.error('✗ SQL-feil:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
