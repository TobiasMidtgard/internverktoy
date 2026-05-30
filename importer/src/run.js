import { parseRobots, isAllowed } from './robots.js';
import { listAllBikeProductUrls } from './crawl.js';
import { mapProductToBike } from './map.js';
import { makeClient, upsertBike, markDiscontinued } from './supabase.js';

const BASE = 'https://www.thansen.no';
const UA = 'VelodexImporter/1.0 (+https://github.com/TobiasMidtgard/velodex)';
const CATEGORIES = [ `${BASE}/sykkel/sykler/n14338` ];
const DELAY_MS = 1500;
const GRID_COLS = 5, GRID_DX = 340, GRID_DY = 460, GRID_X0 = 140, GRID_Y0 = 140;
const MIN_FOR_HEALTH = 5;     // need at least this many attempts to judge health
const MAX_FAIL_RATIO = 0.5;   // abort writes if more than half fail (spec §6)
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url){
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nb-NO,nb' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main(){
  const dryRun = process.argv.includes('--dry-run');
  const robots = parseRobots(await fetchText(`${BASE}/robots.txt`));
  const canFetch = url => { try { return isAllowed(robots, new URL(url).pathname); } catch { return false; } };

  for (const c of CATEGORIES){
    if (!canFetch(c)) throw new Error(`robots.txt disallows ${c} — aborting`);
  }

  const urls = await listAllBikeProductUrls(fetchText, CATEGORIES, { delayMs: DELAY_MS, sleep, canFetch });
  console.log(`Found ${urls.length} candidate bike URLs`);

  // 1) Fetch + parse everything first (no writes yet) so we can health-check before touching the DB.
  const bikes = []; let attempted = 0, failed = 0;
  for (const url of urls){
    if (!canFetch(url)) continue;
    attempted++;
    try {
      const html = await fetchText(url);
      const bike = mapProductToBike(html, { x: 0, y: 0 }); // position assigned densely below
      if (!bike.source_id || !bike.name){ failed++; console.warn(`skip (no id/name): ${url}`); }
      else bikes.push(bike);
    } catch (e){ failed++; console.warn(`error on ${url}: ${e.message}`); }
    await sleep(DELAY_MS);
  }

  // 2) Health gate (spec §6): abort WITHOUT writing if a large fraction failed.
  if (attempted >= MIN_FOR_HEALTH && failed / attempted > MAX_FAIL_RATIO){
    console.error(`Aborting: ${failed}/${attempted} pages failed to parse (> ${MAX_FAIL_RATIO*100}%). No writes performed.`);
    process.exit(1);
  }
  if (bikes.length === 0){
    console.error('Aborting: 0 bikes parsed. No writes performed.');
    process.exit(1);
  }

  // 3) Dense grid positions (only used on first insert; user-owned thereafter).
  bikes.forEach((b, i) => {
    b.x = GRID_X0 + (i % GRID_COLS) * GRID_DX;
    b.y = GRID_Y0 + Math.floor(i / GRID_COLS) * GRID_DY;
  });

  // 4) Write.
  const client = dryRun ? null : makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const seen = [];
  for (const b of bikes){
    seen.push(b.source_id);
    if (dryRun) console.log(`[dry-run] ${b.outlet?'(outlet) ':''}${b.name} — ${b.price} kr — ${b.availability}`);
    else await upsertBike(client, b);
  }
  let disc = 0;
  if (!dryRun && seen.length) disc = await markDiscontinued(client, seen);
  console.log(`Done. upserted=${bikes.length} failed=${failed} discontinued=${disc} dryRun=${dryRun}`);
}

main().catch(e => { console.error(e); process.exit(1); });
