// Run a .sql file against Supabase Postgres.
// Usage: node --env-file=db/.env db/run.mjs supabase/tasks_v7.sql [--force]
// Migreringer under supabase/ loggføres i schema_migrations og nektes re-kjørt
// uten --force (en re-kjøring av f.eks. tasks_v13.sql ville slettet data).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.find(a => a !== '--force');
if (!file) { console.error('Bruk: node --env-file=db/.env db/run.mjs <fil.sql> [--force]'); process.exit(1); }

// Discrete fields avoid URI-encoding issues with special chars in the password.
const cfg = process.env.PGHOST
  ? { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER,
      password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false } }
  : { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
if (!cfg.host && !cfg.connectionString) { console.error('Mangler PGHOST/DATABASE_URL — sett i db/.env'); process.exit(1); }

const isMigration = /supabase[\\/]/.test(file);
const name = basename(file);
const sql = readFileSync(file, 'utf8');
const client = new pg.Client(cfg);

try {
  await client.connect();

  if (isMigration) {
    await client.query(`create table if not exists public.schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const { rows } = await client.query('select applied_at from public.schema_migrations where name = $1', [name]);
    if (rows.length && !force) {
      console.error(`✗ ${name} er allerede kjørt (${rows[0].applied_at.toISOString()}). Bruk --force for å kjøre igjen.`);
      process.exit(1);
    }
  }

  console.log(`→ Kjører ${file} …`);
  const res = await client.query(sql);          // simple-query: kjører alle setninger i fila
  const n = Array.isArray(res) ? res.length : 1;

  if (isMigration) {
    await client.query('insert into public.schema_migrations (name) values ($1) on conflict (name) do nothing', [name]);
  }
  console.log(`✓ OK — ${n} setning(er) fullført.${isMigration ? ' (loggført i schema_migrations)' : ''}`);
} catch (e) {
  console.error('✗ SQL-feil:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
