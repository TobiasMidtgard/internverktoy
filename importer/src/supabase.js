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
