// Deterministic test for rollover_recurring(): inserts synthetic "completed on
// time" recurring tasks, runs the function, and checks that each task's next
// due is its ORIGINAL due advanced by whole intervals to the first occurrence
// after now() (preserving time-of-day / weekday / day-of-month alignment).
// All comparisons stay in SQL (full timestamp precision — no JS Date round-trip).
// Runs in a transaction that is rolled back, so production data is untouched.
// Usage: node --env-file=db/.env db/test_rollover.mjs
import pg from 'pg';
const cfg = { host: process.env.PGHOST, port: +(process.env.PGPORT||5432), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE||'postgres', ssl:{rejectUnauthorized:false} };
const c = new pg.Client(cfg);
await c.connect();
await c.query('begin');

// Three "completed on time" recurring tasks. due_at sits one full period in the
// past at a time-of-day 3h ahead of now, so the correct next occurrence is the
// upcoming slot (today/this week/this month), NOT a full extra period out.
const scenarios = [
  { key:'DAILY  ', unit:'day',   back:"interval '1 day'",   lastback:"interval '1 day'  - interval '10 min'" },
  { key:'WEEKLY ', unit:'week',  back:"interval '7 days'",  lastback:"interval '5 days'" },
  { key:'MONTHLY', unit:'month', back:"interval '1 month'", lastback:"interval '20 days'" },
];
for (const s of scenarios) {
  await c.query(
    `insert into public.tasks (title, recur_unit, recur_n, status, done, priority, due_at, last_done_at)
     values ($1,$2,1,'done',true,'medium', now() - ${s.back} + interval '3 hours', now() - ${s.lastback})`,
    [ '[TEST] '+s.key, s.unit ]);
}
// snapshot originals BEFORE rollover (full precision, stays in SQL)
await c.query(`create temp table orig on commit drop as
  select id, title, due_at as orig_due, recur_unit, recur_n from public.tasks where title like '[TEST] %'`);

await c.query('select public.rollover_recurring()');

const res = await c.query(`
  select o.title as scenario,
         to_char(o.orig_due at time zone 'Europe/Oslo','YYYY-MM-DD HH24:MI') as original_due,
         to_char(t.due_at   at time zone 'Europe/Oslo','YYYY-MM-DD HH24:MI') as result_due,
         exists(select 1 from generate_series(1,400) k
                where o.orig_due + ((o.recur_n*k)||' '||o.recur_unit)::interval = t.due_at) as aligned,
         (t.due_at > now()
          and t.due_at - ((o.recur_n)||' '||o.recur_unit)::interval <= now())               as upcoming
  from orig o join public.tasks t using (id)
  order by o.title`);
let allPass = true;
const rows = res.rows.map(r => { const pass = r.aligned && r.upcoming; if(!pass) allPass=false;
  return { scenario:r.scenario.replace('[TEST] ',''), original_due:r.original_due, result_due:r.result_due,
           aligned:r.aligned, upcoming:r.upcoming, PASS:pass }; });
console.log('Transaction now():', (await c.query(`select to_char(now() at time zone 'Europe/Oslo','YYYY-MM-DD HH24:MI') n`)).rows[0].n);
console.table(rows);
console.log(allPass ? '\n✅ ALL PASS — rollover keeps alignment & picks the next upcoming slot.'
                    : '\n❌ FAIL — rollover broke alignment or skipped past the next slot (the bug).');

await c.query('rollback');
await c.end();
process.exit(allPass ? 0 : 1);
