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

test('countActiveThansen counts distinct products via count_active_thansen', async () => {
  const c = { rpc: async (name, args) => { assert.equal(name, 'count_active_thansen'); assert.equal(args, undefined); return { data: 42, error: null }; } };
  assert.equal(await countActiveThansen(c), 42);
});
test('countActiveThansen throws on supabase error', async () => {
  const c = { rpc: async () => ({ data: null, error: { message: 'nope' } }) };
  await assert.rejects(() => countActiveThansen(c), /nope/);
});
