// Full datadump av alle public-tabeller + funksjonsdefinisjoner til db/backups/<tidsstempel>/.
// Bruk: node --env-file=db/.env db/backup.mjs
// NB: db/backups/ er gitignored — dumpene inneholder persondata og skal ALDRI i det offentlige repoet.
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const cfg = process.env.PGHOST
  ? { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER,
      password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false } }
  : { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = new URL(`./backups/${stamp}/`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(dir, { recursive: true });

const client = new pg.Client(cfg);
try {
  await client.connect();

  const { rows: tables } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`);
  for (const { tablename } of tables) {
    const { rows } = await client.query(`select * from public."${tablename}"`);
    writeFileSync(`${dir}/${tablename}.json`, JSON.stringify(rows, null, 1));
    console.log(`✓ ${tablename}: ${rows.length} rader`);
  }

  const { rows: fns } = await client.query(`
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by p.proname`);
  writeFileSync(`${dir}/_functions.sql`,
    fns.map(f => `-- ${f.proname}\n${f.def};\n`).join('\n'));
  console.log(`✓ ${fns.length} funksjoner -> _functions.sql`);

  const { rows: views } = await client.query(`
    select viewname, definition from pg_views where schemaname = 'public'`);
  writeFileSync(`${dir}/_views.sql`,
    views.map(v => `-- ${v.viewname}\ncreate or replace view public.${v.viewname} as\n${v.definition}\n`).join('\n'));
  console.log(`✓ ${views.length} views -> _views.sql`);

  console.log(`\nBackup skrevet til ${dir}`);
} catch (e) {
  console.error('✗ Backup-feil:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
