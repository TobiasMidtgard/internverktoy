// End-to-end test of day_times (tasks_v27): ukedagstider for gjentakende oppgaver.
// Kjøres i en transaksjon som rulles tilbake. Usage: node --env-file=db/.env db/test_day_times.mjs
import pg from 'pg';
const cfg = { host: process.env.PGHOST, port: +(process.env.PGPORT||5432), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE||'postgres', ssl:{rejectUnauthorized:false} };
const c = new pg.Client(cfg);
await c.connect();
await c.query('begin');
const checks=[]; const ok=(n,v)=>checks.push({check:n,PASS:!!v});
const oslo = `at time zone 'Europe/Oslo'`;

// 1. _apply_day_time: lørdag 2026-06-13 09:00 Oslo + lørdagsavvik 10:00 → 10:00
const t1=(await c.query(`select to_char(public._apply_day_time(
  ('2026-06-13 09:00'::timestamp ${oslo}), '{"6":"10:00","d":"09:00"}'::jsonb) ${oslo},'YYYY-MM-DD HH24:MI') v`)).rows[0].v;
ok('saturday override applied', t1==='2026-06-13 10:00');

// 2. søndag uten eget avvik faller tilbake til standard «d» (ikke forrige dags 10:00)
const t2=(await c.query(`select to_char(public._apply_day_time(
  ('2026-06-14 10:00'::timestamp ${oslo}), '{"6":"10:00","d":"09:00"}'::jsonb) ${oslo},'YYYY-MM-DD HH24:MI') v`)).rows[0].v;
ok('sunday reverts to default', t2==='2026-06-14 09:00');

// 3. tomt day_times endrer ingenting
const t3=(await c.query(`select public._apply_day_time(ts,'{}'::jsonb)=ts v from (select now() ts) s`)).rows[0].v;
ok('empty day_times is no-op', t3===true);

// manager-konto for RPC-ene
await c.query(`insert into public.coworkers (tag,name,title,color,role,pass_hash) values
  ('ZZT1','Tester En','Butikksjef','#004595','manager', extensions.crypt('pass1234', extensions.gen_salt('bf')))`);

// 4. add_task normaliserer fristen mot ukedagsavvik (lørdag 09:00 → 10:00)
const r4=(await c.query(`select to_char(due_at ${oslo},'HH24:MI') v, day_times from add_task('ZZT1','pass1234',
  jsonb_build_object('title','ZZT dagtid','recur_unit','day','due_at',
    to_char(('2026-06-13 09:00'::timestamp ${oslo}),'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'day_times','{"6":"10:00","d":"09:00"}'::jsonb))`)).rows[0];
ok('add_task normalizes to saturday time', r4.v==='10:00' && r4.day_times['6']==='10:00');
const taskId=(await c.query(`select id from tasks where title='ZZT dagtid'`)).rows[0].id;

// 5. update_task UTEN day_times (dra-flytting) beholder eksplisitt tid
await c.query(`update tasks set due_at=('2026-06-13 13:00'::timestamp ${oslo}) where id=$1`,[taskId]);
const r5=(await c.query(`select to_char(due_at ${oslo},'HH24:MI') v from update_task('ZZT1','pass1234',$1,
  jsonb_build_object('due_at', to_char(('2026-06-13 14:00'::timestamp ${oslo}),'YYYY-MM-DD"T"HH24:MI:SSOF')))`,[taskId])).rows[0];
ok('drag-reschedule keeps explicit time', r5.v==='14:00');

// 6. update_task MED day_times (modal-lagring) normaliserer igjen
const r6=(await c.query(`select to_char(due_at ${oslo},'HH24:MI') v from update_task('ZZT1','pass1234',$1,
  jsonb_build_object('due_at', to_char(('2026-06-13 09:00'::timestamp ${oslo}),'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'day_times','{"6":"10:15","d":"09:00"}'::jsonb))`,[taskId])).rows[0];
ok('modal save re-normalizes', r6.v==='10:15');

// 7. rollover: daglig oppgave gjort i går → ny frist i dag med dagens ukedagstid
const iso=(await c.query(`select extract(isodow from now() ${oslo})::int v`)).rows[0].v;
await c.query(`insert into tasks (title, recur_unit, recur_n, status, done, last_done_at, due_at, day_times) values
  ('ZZT rollover','day',1,'done',true,
   (((now() ${oslo})::date - 1)::text||' 12:00')::timestamp ${oslo},
   (((now() ${oslo})::date - 1)::text||' 09:00')::timestamp ${oslo},
   jsonb_build_object($1::text,'11:30','d','09:00'))`,[String(iso)]);
await c.query(`select rollover_recurring()`);
const r7=(await c.query(`select status, to_char(due_at ${oslo},'YYYY-MM-DD HH24:MI') v from tasks where title='ZZT rollover'`)).rows[0];
const today=(await c.query(`select (now() ${oslo})::date::text v`)).rows[0].v;
ok('rollover lands on today with weekday time', r7.status==='todo' && r7.v===today+' 11:30');

let allPass=true; checks.forEach(x=>{ if(!x.PASS) allPass=false; });
console.table(checks);
console.log(allPass?'\n✅ ALL PASS':'\n❌ FAIL');
await c.query('rollback');
await c.end();
process.exit(allPass?0:1);
