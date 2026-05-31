import { fetchBikeHits, fetchSpareParts, defaultFetchJson } from './algolia.js';
import { mapHitToBike } from './map.js';
import { makeClient, upsertBike, markDiscontinued } from './supabase.js';

const GRID_COLS = 5, GRID_DX = 340, GRID_DY = 460, GRID_X0 = 140, GRID_Y0 = 140;
const SPARE_DELAY_MS = 800; // polite delay between per-model spare-part queries
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  const dryRun = process.argv.includes('--dry-run');

  // One query to Thansen's public Algolia index — the complete-bikes categories.
  const hits = await fetchBikeHits(defaultFetchJson);
  console.log(`Algolia returned ${hits.length} complete-bike products`);

  const bikes = hits.map(h => mapHitToBike(h)).filter(b => b.source_id && b.name && b.frame);

  // Safety: if mapping yielded nothing (API change / blocked key), abort WITHOUT writing.
  if (bikes.length === 0){
    console.error('Aborting: 0 bikes mapped. No writes performed.');
    process.exit(1);
  }

  // Enrich with spare parts — one Algolia query per UNIQUE model (cached across bikes).
  // A single model's lookup failure must not abort the whole run.
  const modelParts = new Map();
  for (const b of bikes){
    const model = b.specs?.model;
    if (!model || modelParts.has(model)) continue;
    try {
      const parts = await fetchSpareParts(defaultFetchJson, model);
      modelParts.set(model, parts);
      if (parts.length) console.log(`  spare parts for ${model}: ${parts.length} found`);
    } catch (e) {
      console.warn(`  spare parts lookup failed for ${model}: ${e.message}`);
      modelParts.set(model, []);
    }
    await sleep(SPARE_DELAY_MS);
  }
  bikes.forEach(b => { b.spare_parts = modelParts.get(b.specs?.model) || []; });

  // Dense grid positions — only used on first insert (user-owned thereafter).
  bikes.forEach((b, i) => {
    b.x = GRID_X0 + (i % GRID_COLS) * GRID_DX;
    b.y = GRID_Y0 + Math.floor(i / GRID_COLS) * GRID_DY;
  });

  const client = dryRun ? null : makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const seen = [];
  for (const b of bikes){
    seen.push(b.source_id);
    if (dryRun){
      console.log(`[dry-run] ${b.outlet ? '(outlet) ' : ''}${b.name} — ${b.price} kr — ${b.availability} — #${b.frame} — specs:${b.specs?.gears || '?'}gir parts:${b.spare_parts.length}`);
    } else {
      const { spare_parts_count, ...payload } = b; // spare_parts_count is not a DB column
      await upsertBike(client, payload);
    }
  }
  let disc = 0;
  if (!dryRun && seen.length) disc = await markDiscontinued(client, seen);
  console.log(`Done. upserted=${bikes.length} discontinued=${disc} dryRun=${dryRun}`);
}

main().catch(e => { console.error(e); process.exit(1); });
