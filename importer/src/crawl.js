import * as cheerio from 'cheerio';

const PRODUCT_RE = /\/pn\d+(?:[/?#]|$)/;

export function extractProductUrls(html, base){
  const $ = cheerio.load(html);
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !PRODUCT_RE.test(href)) return;
    const abs = new URL(href, base).href.split('#')[0];
    seen.add(abs);
  });
  return [...seen];
}

export function extractNextPage(html, base){
  const $ = cheerio.load(html);
  let next = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/[?&]page=\d+/.test(href) || /rel=["']?next/.test($(el).attr('rel')||'')) {
      if (!next) next = new URL(href, base).href;
    }
  });
  return next;
}

// Integration: crawl each complete-bike category, paginating, collecting product URLs.
// fetchText(url) -> Promise<string>. Caller injects it (real fetch in run.js).
export async function listAllBikeProductUrls(fetchText, categories, { delayMs = 1500, sleep } = {}){
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const all = new Set();
  for (const cat of categories){
    let url = cat, guard = 0;
    while (url && guard++ < 30){
      const html = await fetchText(url);
      extractProductUrls(html, url).forEach(u => all.add(u));
      url = extractNextPage(html, url);
      if (url) await wait(delayMs);
    }
  }
  return [...all];
}
