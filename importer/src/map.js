const BASE = 'https://www.thansen.no';

export function mapHitToBike(hit, { x = 0, y = 0 } = {}){
  const url = hit.url || '';
  const abs = url.startsWith('http') ? url : BASE + url;
  return {
    source_id: String(url.match(/pn(\d+)/)?.[1] || hit.objectID || '').trim(),
    name:       String(hit.title || '').trim(),
    price:      Math.round(Number(hit.price) || 0),
    frame:      String(hit.item_number || hit.item_number_thg || '').trim(),
    availability: hit.in_stock ? 'InStock' : 'OutOfStock',
    image_url:  hit.image || null,
    source_url: abs,
    outlet:     /outlet|tilbud/i.test(url),
    x, y
  };
}
