// End-to-end test of staff_status RPCs incl. the own-vs-manager auth gate.
// Creates throwaway accounts and rows inside a transaction that is rolled back.
// Usage: node --env-file=db/.env db/test_staff_status.mjs
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

// 1. self timed (pause 08:00, 15m)
const r1=(await c.query(`select * from set_staff_status('ZZT1','pass1234','ZZT1','pause',current_date,480,15)`)).rows[0];
ok('timed insert all_day=false', r1.all_day===false && r1.start_min===480 && r1.dur_min===15 && r1.tag==='ZZT1');
ok('one row for ZZT1 today', (await c.query(`select count(*)::int n from staff_status where tag='ZZT1' and day=current_date`)).rows[0].n===1);

// 2. self all-day syk → replaces the pause, all_day true, null start
const r2=(await c.query(`select * from set_staff_status('ZZT1','pass1234','ZZT1','syk',current_date,null,null)`)).rows[0];
ok('all-day syk', r2.all_day===true && r2.start_min===null && r2.kind==='syk');
ok('all-day replaced same-day rows', (await c.query(`select count(*)::int n from staff_status where tag='ZZT1' and day=current_date`)).rows[0].n===1);

// 3. coworker setting someone ELSE's status → denied
await throws('coworker cannot set others', ()=>c.query(`select set_staff_status('ZZT2','pass1234','ZZT1','lunsj',current_date,720,30)`));

// 4. manager setting another person → allowed
const r4=(await c.query(`select * from set_staff_status('ZZT1','pass1234','ZZT2','lunsj',current_date,720,30)`)).rows[0];
ok('manager sets for others', r4.tag==='ZZT2' && r4.kind==='lunsj' && r4.start_min===720);

// 5. wrong password → denied (account_role returns null)
await throws('wrong password denied', ()=>c.query(`select set_staff_status('ZZT1','nope','ZZT1','pause',current_date,600,15)`));

// 6. delete gate: coworker deleting another's row denied; owner deleting own allowed
await throws('coworker cannot delete others', ()=>c.query(`select delete_staff_status('ZZT2','pass1234',$1)`,[r2.id]));
await c.query(`select delete_staff_status('ZZT2','pass1234',$1)`,[r4.id]);   // ZZT2 deletes ZZT2's own
ok('owner deletes own row', (await c.query(`select count(*)::int n from staff_status where id=$1`,[r4.id])).rows[0].n===0);
await c.query(`select delete_staff_status('ZZT1','pass1234',$1)`,[r2.id]);   // manager deletes ZZT1's syk
ok('manager deletes any row', (await c.query(`select count(*)::int n from staff_status where id=$1`,[r2.id])).rows[0].n===0);

let allPass=true; checks.forEach(x=>{ if(!x.PASS) allPass=false; });
console.table(checks);
console.log(allPass?'\n✅ ALL PASS':'\n❌ FAIL');
await c.query('rollback');
await c.end();
process.exit(allPass?0:1);
