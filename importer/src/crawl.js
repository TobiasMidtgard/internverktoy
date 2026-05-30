import * as cheerio from 'cheerio';

const PRODUCT_RE = /\/pn\d+(?:[/?#]|$)/;
// Only accept product URLs under the complete-bikes tree (bike-subset only, per spec).
const BIKE_PATH = '/sykkel/sykler/';

function safeAbs(href, base){
  try { return new URL(href, base).href.split('#')[0]; }
  catch { return null; }
}

export function extractProductUrls(html, base, pathPrefix = BIKE_PATH){
  const $ = cheerio.load(html);
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !PRODUCT_RE.test(href)) return;
    const abs = safeAbs(href, base);
    if (!abs) return;
    let path;
    try { path = new URL(abs).pathname; } catch { return; }
    if (!path.startsWith(pathPrefix)) return;   // skip accessories/cross-sell
    seen.add(abs);
  });
  return [...seen];
}

function pageNum(url){
  try { const v = new URL(url).searchParams.get('page'); return v ? parseInt(v, 10) : 1; }
  catch { return 1; }
}

// Next page = a proper rel="next", or the link to (currentPage + 1).
export function extractNextPage(html, base, currentUrl = base){
  const $ = cheerio.load(html);
  const want = pageNum(currentUrl) + 1;
  let relNext = null, numbered = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const rel = ($(el).attr('rel') || '').split(/\s+/);
    const abs = safeAbs(href, base);
    if (!abs) return;
    if (rel.includes('next') && !relNext) relNext = abs;
    if (/[?&]page=\d+/.test(href) && pageNum(abs) === want && !numbered) numbered = abs;
  });
  return relNext || numbered || null;
}

// Crawl each category, paginating, collecting bike product URLs.
// fetchText(url)->Promise<string>; canFetch(url)->bool (robots gate, optional).
export async function listAllBikeProductUrls(fetchText, categories, { delayMs = 1500, sleep, canFetch } = {}){
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const allow = canFetch || (() => true);
  const all = new Set();
  for (const cat of categories){
    let url = cat, guard = 0;
    while (url && guard++ < 30){
      if (!allow(url)) break;
      const html = await fetchText(url);
      extractProductUrls(html, url).forEach(u => all.add(u));
      const next = extractNextPage(html, url, url);
      url = (next && next !== url) ? next : null;   // stop if no advance
      if (url) await wait(delayMs);
    }
  }
  return [...all];
}
