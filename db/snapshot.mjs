// Genererer supabase/schema-snapshot.sql fra live-databasen: tabeller, indekser, views,
// funksjoner, triggere, RLS-policies, grants og realtime-publikasjon.
// Snapshotet er dokumentasjon/katastrofehjelp — den fulle gjenopprettingen er pg_dump-
// backupen fra GitHub Actions (se db/README.md).
// Bruk: node --env-file=db/.env db/snapshot.mjs
import { writeFileSync } from 'node:fs';
import pg from 'pg';

const cfg = process.env.PGHOST
  ? { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER,
      password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false } }
  : { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };

const client = new pg.Client(cfg);
await client.connect();
const q = async (sql, params=[]) => (await client.query(sql, params)).rows;

const out = [];
out.push(`-- ============================================================================`);
out.push(`-- GENERERT SNAPSHOT av public-skjemaet — IKKE rediger for hånd.`);
out.push(`-- Regenerer med: node --env-file=db/.env db/snapshot.mjs`);
out.push(`-- Komplett gjenoppretting gjøres fra pg_dump-backupen (db/README.md);`);
out.push(`-- dette snapshotet er referanse + nødhjelp for å gjenskape skjemaet fra repoet.`);
out.push(`-- ============================================================================\n`);

// Utvidelser
const exts = await q(`select extname from pg_extension where extname <> 'plpgsql' order by 1`);
out.push(`-- ---------- utvidelser ----------`);
for (const e of exts) out.push(`create extension if not exists "${e.extname}" with schema extensions;`);
out.push('');

// Tabeller
const tables = await q(`select tablename from pg_tables where schemaname='public' order by 1`);
out.push(`-- ---------- tabeller ----------`);
for (const { tablename } of tables) {
  const cols = await q(`
    select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) as def
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ('public.'||quote_ident($1))::regclass and a.attnum > 0 and not a.attisdropped
    order by a.attnum`, [tablename]);
  const cons = await q(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = ('public.'||quote_ident($1))::regclass
    order by contype desc, conname`, [tablename]);
  const lines = cols.map(c =>
    `  ${c.attname} ${c.type}${c.attnotnull ? ' not null' : ''}${c.def ? ' default ' + c.def : ''}`);
  for (const c of cons) lines.push(`  constraint ${c.conname} ${c.def}`);
  out.push(`create table if not exists public.${tablename} (\n${lines.join(',\n')}\n);`);
  const [{ relrowsecurity }] = await q(
    `select relrowsecurity from pg_class where oid = ('public.'||quote_ident($1))::regclass`, [tablename]);
  if (relrowsecurity) out.push(`alter table public.${tablename} enable row level security;`);
  out.push('');
}

// Indekser (utenom constraint-indekser)
const idx = await q(`
  select indexdef from pg_indexes
  where schemaname='public' and indexname not in (select conname from pg_constraint)
  order by indexname`);
out.push(`-- ---------- indekser ----------`);
for (const i of idx) out.push(i.indexdef + ';');
out.push('');

// Views
const views = await q(`select viewname, definition from pg_views where schemaname='public' order by 1`);
out.push(`-- ---------- views ----------`);
for (const v of views) out.push(`create or replace view public.${v.viewname} as\n${v.definition}\n`);

// Funksjoner
const fns = await q(`
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.prokind = 'f' order by p.proname`);
out.push(`-- ---------- funksjoner ----------`);
for (const f of fns) out.push(f.def + ';\n');

// Triggere
const trgs = await q(`
  select pg_get_triggerdef(t.oid) as def
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and not t.tgisinternal order by t.tgname`);
out.push(`-- ---------- triggere ----------`);
for (const t of trgs) out.push(t.def + ';');
out.push('');

// RLS-policies
const pols = await q(`select * from pg_policies where schemaname='public' order by tablename, policyname`);
out.push(`-- ---------- RLS-policies ----------`);
for (const p of pols) {
  let s = `create policy ${p.policyname} on public.${p.tablename}`;
  if (p.permissive === 'RESTRICTIVE') s += ' as restrictive';
  s += ` for ${p.cmd.toLowerCase()}`;
  if (p.roles && p.roles.length && String(p.roles) !== '{public}') s += ` to ${p.roles.join(', ')}`;
  if (p.qual) s += ` using (${p.qual})`;
  if (p.with_check) s += ` with check (${p.with_check})`;
  out.push(s + ';');
}
out.push('');

// Grants (tabeller/views) for anon/authenticated/service_role
const tg = await q(`
  select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated','service_role')
  group by grantee, table_name order by table_name, grantee`);
out.push(`-- ---------- tabell-grants (anon/authenticated/service_role) ----------`);
out.push(`-- NB: nye tabeller får ofte default-grants i Supabase; revoke eksplisitt der det trengs.`);
for (const g of tg) out.push(`grant ${g.privs.toLowerCase()} on public.${g.table_name} to ${g.grantee};`);
out.push('');

// Grants (funksjoner) — kun de som er åpne for anon/authenticated
const fg = await q(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args,
         array_to_string(array(select unnest(p.proacl)::text), ',') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' order by p.proname`);
out.push(`-- ---------- funksjons-grants ----------`);
out.push(`-- (funksjoner uten linje her er kun for postgres/service_role)`);
for (const f of fg) {
  const acl = f.acl || '';
  const roles = ['anon','authenticated'].filter(r => acl.includes(r + '=X'));
  if (roles.length) out.push(`grant execute on function public.${f.proname}(${f.args}) to ${roles.join(', ')};`);
}
out.push('');

// Realtime-publikasjon
const pub = await q(`select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' order by 1`);
out.push(`-- ---------- realtime-publikasjon ----------`);
for (const p of pub) out.push(`-- alter publication supabase_realtime add table public.${p.tablename};`);
out.push('');

writeFileSync(new URL('../supabase/schema-snapshot.sql', import.meta.url), out.join('\n'), 'utf8');
console.log(`✓ supabase/schema-snapshot.sql skrevet (${tables.length} tabeller, ${fns.length} funksjoner, ${pols.length} policies)`);
await client.end();
