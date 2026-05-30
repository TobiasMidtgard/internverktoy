import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertBike, markDiscontinued } from '../src/supabase.js';

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
