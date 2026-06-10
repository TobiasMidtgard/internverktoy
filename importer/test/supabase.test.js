import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertBike, markDiscontinued, countActiveThansen } from '../src/supabase.js';

function fakeClient(){
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; } };
}

test('upsertBike calls import_thansen_bike with the payload', async () => {
  const c = fakeClient();
  await upsertBike(c, { source_id: 'P1', name: 'X', price: 100 });
  assert.deepEqual(c.calls[0], { name: 'import_thansen_bike', args: { p: { source_id: 'P1', name: 'X', price: 100 } } });
});
test('markDiscontinued passes seen ids as jsonb array', async () => {
  const c = fakeClient();
  await markDiscontinued(c, ['P1','P2']);
  assert.deepEqual(c.calls[0], { name: 'mark_thansen_discontinued', args: { p_seen: ['P1','P2'] } });
});
test('upsertBike throws on supabase error', async () => {
  const c = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
  await assert.rejects(() => upsertBike(c, { source_id: 'P1' }), /boom/);
});

test('countActiveThansen counts non-discontinued thansen bikes', async () => {
  const filters = [];
  const chain = {
    select: (cols, opts) => { filters.push({ cols, opts }); return chain; },
    eq: (k, v) => { filters.push({ k, v }); return chain; },
    then: (resolve) => resolve({ count: 42, error: null }),
  };
  const c = { from: (t) => { filters.push({ table: t }); return chain; } };
  const n = await countActiveThansen(c);
  assert.equal(n, 42);
  assert.ok(filters.some(f => f.table === 'bikes'));
  assert.ok(filters.some(f => f.k === 'discontinued' && f.v === false));
});
