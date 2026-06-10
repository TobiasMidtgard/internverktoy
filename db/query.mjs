// Kjør en ad-hoc SELECT/SQL mot Supabase Postgres og skriv resultatet som JSON.
// Bruk: node --env-file=db/.env db/query.mjs "select * from coworkers"
//       node --env-file=db/.env db/query.mjs --file sti/til/fil.sql
import { readFileSync } from 'node:fs';
import pg from 'pg';

const arg = process.argv[2];
if (!arg) { console.error('Bruk: node --env-file=db/.env db/query.mjs "<sql>" | --file <fil.sql>'); process.exit(1); }
const sql = arg === '--file' ? readFileSync(process.argv[3], 'utf8') : arg;

const cfg = process.env.PGHOST
  ? { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER,
      password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false } }
  : { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };

const client = new pg.Client(cfg);
try {
  await client.connect();
  const res = await client.query(sql);
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (r.rows && r.rows.length) console.log(JSON.stringify(r.rows, null, 2));
    else console.log(`-- ${r.command}: ${r.rowCount ?? 0} rad(er)`);
  }
} catch (e) {
  console.error('✗ SQL-feil:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
