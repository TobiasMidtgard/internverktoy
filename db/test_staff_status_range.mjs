// End-to-end test of set_staff_status_range (tasks_v26) incl. auth gate and validation.
// Creates throwaway accounts and rows inside a transaction that is rolled back.
// Usage: node --env-file=db/.env db/test_staff_status_range.mjs
import pg from 'pg';
const cfg = { host: process.env.PGHOST, port: +(process.env.PGPORT||5432), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE||'postgres', ssl:{rejectUnauthorized:false} };
const c = new pg.Client(cfg);
await c.connect();
await c.query('begin');
const checks=[]; const ok=(n,c)=>checks.push({check:n,PASS:!!c});
// savepoint so an expected error doesn't abort the whole transaction
const throws = async (n, fn)=>{
  await c.query('savepoint sp');
  try{ await fn(); ok(n+' (should throw)', false); await c.query('release savepoint sp'); }
  catch(e){ ok(n, true); await c.query('rollback to savepoint sp'); }
};

// throwaway accounts: ZZT1 (manager), ZZT2 (coworker) — inserted directly so the
// test doesn't depend on the invite code that register_account now requires
await c.query(`insert into public.coworkers (tag,name,title,color,role,pass_hash) values
  ('ZZT1','Tester En','Butikksjef','#004595','manager', extensions.crypt('pass1234', extensions.gen_salt('bf'))),
  ('ZZT2','Tester To','Butikkmedarbeider','#004595','coworker', extensions.crypt('pass1234', extensions.gen_salt('bf')))`);

// fast man–søn-uke så helgedekningen er deterministisk
const monday = `date_trunc('week', current_date)::date`;

// 1. self: 7-dagers ferie (man–søn) → 7 all_day-rader, inkl. lørdag+søndag
const r1=(await c.query(`select * from set_staff_status_range('ZZT2','pass1234','ZZT2','ferie',${monday},${monday}+6) order by day`)).rows;
ok('7 days inserted', r1.length===7);
ok('all rows all_day ferie', r1.every(r=>r.all_day===true && r.kind==='ferie' && r.start_min===null && r.tag==='ZZT2'));
const dows=(await c.query(`select array_agg(distinct extract(isodow from day)::int order by extract(isodow from day)::int) a
  from staff_status where tag='ZZT2' and day between ${monday} and ${monday}+6`)).rows[0].a;
ok('weekend included (isodow 1-7)', JSON.stringify(dows)===JSON.stringify([1,2,3,4,5,6,7]));

// 2. replaces existing statuses on covered days (timed pause on Wednesday wiped)
await c.query(`select set_staff_status('ZZT2','pass1234','ZZT2','pause',${monday}+2,480,15)`);
await c.query(`select set_staff_status_range('ZZT2','pass1234','ZZT2','syk',${monday}+2,${monday}+3)`);
const wed=(await c.query(`select count(*)::int n, min(kind) k from staff_status where tag='ZZT2' and day=${monday}+2`)).rows[0];
ok('covered day replaced (one row, syk)', wed.n===1 && wed.k==='syk');

// 3. validation
await throws('timed kind rejected', ()=>c.query(`select set_staff_status_range('ZZT2','pass1234','ZZT2','pause',${monday},${monday}+1)`));
await throws('inverted range rejected', ()=>c.query(`select set_staff_status_range('ZZT2','pass1234','ZZT2','ferie',${monday}+1,${monday})`));
await throws('over 60 days rejected', ()=>c.query(`select set_staff_status_range('ZZT2','pass1234','ZZT2','ferie',${monday},${monday}+60)`));

// 4. auth gate: coworker for others denied, manager for others allowed, wrong password denied
await throws('coworker cannot set others', ()=>c.query(`select set_staff_status_range('ZZT2','pass1234','ZZT1','ferie',${monday},${monday}+1)`));
const r4=(await c.query(`select * from set_staff_status_range('ZZT1','pass1234','ZZT2','fri',${monday}+10,${monday}+11)`)).rows;
ok('manager sets range for others', r4.length===2 && r4.every(r=>r.tag==='ZZT2' && r.kind==='fri' && r.author==='ZZT1'));
await throws('wrong password denied', ()=>c.query(`select set_staff_status_range('ZZT1','nope','ZZT1','ferie',${monday},${monday}+1)`));

// 5. single-day range works (from = to)
const r5=(await c.query(`select * from set_staff_status_range('ZZT2','pass1234','ZZT2','fri',${monday}+20,${monday}+20)`)).rows;
ok('single-day range', r5.length===1 && r5[0].kind==='fri');

let allPass=true; checks.forEach(x=>{ if(!x.PASS) allPass=false; });
console.table(checks);
console.log(allPass?'\n✅ ALL PASS':'\n❌ FAIL');
await c.query('rollback');
await c.end();
process.exit(allPass?0:1);
