import * as cheerio from 'cheerio';

export function extractJsonLd(html){
  const $ = cheerio.load(html);
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed && Array.isArray(parsed['@graph'])) out.push(...parsed['@graph']);
      else out.push(parsed);
    } catch { /* skip malformed block */ }
  });
  return out;
}

const isType = (o, t) => o && (o['@type'] === t || (Array.isArray(o['@type']) && o['@type'].includes(t)));

export function findProduct(blocks){ return blocks.find(b => isType(b, 'Product')) || null; }

export function findBreadcrumb(blocks){
  const bc = blocks.find(b => isType(b, 'BreadcrumbList'));
  if (!bc || !Array.isArray(bc.itemListElement)) return [];
  return bc.itemListElement
    .slice().sort((a,b)=>(a.position||0)-(b.position||0))
    .map(i => i.name || (i.item && i.item.name) || '').filter(Boolean);
}

export function parseProduct(html){
  const blocks = extractJsonLd(html);
  const product = findProduct(blocks);
  if (!product) throw new Error('no Product JSON-LD found');
  return { product, breadcrumb: findBreadcrumb(blocks) };
}
