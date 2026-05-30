import { parseRobots, isAllowed } from './robots.js';
import { listAllBikeProductUrls } from './crawl.js';
import { mapProductToBike } from './map.js';
import { makeClient, upsertBike, markDiscontinued } from './supabase.js';

const BASE = 'https://www.thansen.no';
const UA = 'VelodexImporter/1.0 (+https://github.com/TobiasMidtgard/velodex)';
const CATEGORIES = [
  `${BASE}/sykkel/sykler/n14338`,        // complete-bikes hub (paginates into subcategories)
];
const DELAY_MS = 1500;
const GRID_COLS = 5, GRID_DX = 340, GRID_DY = 460, GRID_X0 = 140, GRID_Y0 = 140;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url){
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nb-NO,nb' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main(){
  const dryRun = process.argv.includes('--dry-run');
  // 1. robots gate
  const robots = parseRobots(await fetchText(`${BASE}/robots.txt`));
  for (const c of CATEGORIES){
    if (!isAllowed(robots, new URL(c).pathname)) throw new Error(`robots.txt disallows ${c} — aborting`);
  }
  // 2. enumerate product urls
  const urls = await listAllBikeProductUrls(fetchText, CATEGORIES, { delayMs: DELAY_MS, sleep });
  console.log(`Found ${urls.length} candidate bike URLs`);
  // 3. fetch + parse + upsert
  const client = dryRun ? null : makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const seen = []; let ok = 0, failed = 0;
  for (let i = 0; i < urls.length; i++){
    const url = urls[i];
    if (!isAllowed(robots, new URL(url).pathname)){ continue; }
    try {
      const html = await fetchText(url);
      const x = GRID_X0 + (i % GRID_COLS) * GRID_DX;
      const y = GRID_Y0 + Math.floor(i / GRID_COLS) * GRID_DY;
      const bike = mapProductToBike(html, { x, y });
      if (!bike.source_id || !bike.name){ failed++; console.warn(`skip (no id/name): ${url}`); continue; }
      seen.push(bike.source_id);
      if (dryRun) console.log(`[dry-run] ${bike.outlet?'(outlet) ':''}${bike.name} — ${bike.price} kr — ${bike.availability}`);
      else await upsertBike(client, bike);
      ok++;
    } catch (e){ failed++; console.warn(`error on ${url}: ${e.message}`); }
    await sleep(DELAY_MS);
  }
  // 4. discontinue the rest (safety: never on empty)
  let disc = 0;
  if (!dryRun && seen.length) disc = await markDiscontinued(client, seen);
  console.log(`Done. upserted=${ok} failed=${failed} discontinued=${disc} dryRun=${dryRun}`);
  if (ok === 0) process.exit(1); // treat a zero-result run as failure (don't silently no-op)
}

main().catch(e => { console.error(e); process.exit(1); });
