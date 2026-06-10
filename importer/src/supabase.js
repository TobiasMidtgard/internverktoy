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

// How many thansen-sourced bikes are currently active — used to sanity-check the
// discontinued-sweep against partial Algolia results.
export async function countActiveThansen(client){
  const { count, error } = await client
    .from('bikes')
    .select('uid', { count: 'exact', head: true })
    .eq('source', 'thansen')
    .eq('discontinued', false);
  if (error) throw new Error('countActiveThansen failed: ' + error.message);
  return count ?? 0;
}
