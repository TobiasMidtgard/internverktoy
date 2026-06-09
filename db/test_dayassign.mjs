// Validates the day_assignees merge/remove/prune logic used by set_day_assignees,
// in a rolled-back transaction (no auth needed — exercises the UPDATE expression
// directly). Usage: node --env-file=db/.env db/test_dayassign.mjs
import pg from 'pg';
const cfg = { host: process.env.PGHOST, port: +(process.env.PGPORT||5432), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE||'postgres', ssl:{rejectUnauthorized:false} };
const c = new pg.Client(cfg);
await c.connect();
await c.query('begin');
await c.query(`alter table public.tasks add column if not exists day_assignees jsonb not null default '{}'::jsonb`);
const id = (await c.query(
  `insert into public.tasks (title, recur_unit, status, priority) values ('[TEST] dayassign','day','todo','medium') returning id`)).rows[0].id;
const cutoff = (await c.query(`select to_char((now() at time zone 'Europe/Oslo')::date - 60,'YYYY-MM-DD') c`)).rows[0].c;

async function setDay(day, tags){
  await c.query(`update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value),'{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees,'{}'::jsonb)) e
        where e.key <> $2 and e.key >= $4 )
    || case when jsonb_array_length($3::jsonb) > 0 then jsonb_build_object($2,$3::jsonb) else '{}'::jsonb end
    where t.id = $1`, [ id, day, JSON.stringify(tags), cutoff ]);
}
const get = async () => (await c.query(`select day_assignees d from public.tasks where id=$1`,[id])).rows[0].d;
const eq = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const checks = [];

await setDay('2026-06-08', ['ALEX','MORT']);
checks.push(['set A', eq(await get(), {'2026-06-08':['ALEX','MORT']})]);

await setDay('2026-06-09', ['SIRI']);
checks.push(['add B (A kept)', eq(await get(), {'2026-06-08':['ALEX','MORT'],'2026-06-09':['SIRI']})]);

await setDay('2026-06-08', ['MORT']);
checks.push(['reassign A only', eq(await get(), {'2026-06-08':['MORT'],'2026-06-09':['SIRI']})]);

await setDay('2026-06-08', []);
checks.push(['empty removes A', eq(await get(), {'2026-06-09':['SIRI']})]);

// prune: inject a key older than cutoff, then a normal write must drop it
await c.query(`update public.tasks set day_assignees = day_assignees || '{"2000-01-01":["OLD"]}'::jsonb where id=$1`,[id]);
await setDay('2026-06-10', ['ALEX']);
const after = await get();
checks.push(['prune >60d old key', !('2000-01-01' in after) && eq(after['2026-06-10'],['ALEX'])]);

let allPass = true;
console.table(checks.map(([name,pass])=>{ if(!pass) allPass=false; return {check:name, PASS:pass}; }));
console.log('final JSON:', JSON.stringify(after));
console.log(allPass ? '\n✅ ALL PASS' : '\n❌ FAIL');
await c.query('rollback');
await c.end();
process.exit(allPass?0:1);
