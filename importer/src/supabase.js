import { createClient } from '@supabase/supabase-js';

export function makeClient(url, serviceRoleKey){
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function upsertBike(client, bike){
  const { error } = await client.rpc('import_thansen_bike', { p: bike });
  if (error) throw new Error('upsertBike failed: ' + error.message);
}

export async function markDiscontinued(client, seenIds){
  const { data, error } = await client.rpc('mark_thansen_discontinued', { p_seen: seenIds });
  if (error) throw new Error('markDiscontinued failed: ' + error.message);
  return data;
}

// How many distinct Thansen products are currently active — used to sanity-check the
// discontinued-sweep against partial Algolia results. Counts products, not rows: since
// stores_v1 every product has one row per store, so a row count would grow with each
// new store and make every normal run look "partial".
export async function countActiveThansen(client){
  const { data, error } = await client.rpc('count_active_thansen');
  if (error) throw new Error('countActiveThansen failed: ' + error.message);
  return Number(data) || 0;
}
