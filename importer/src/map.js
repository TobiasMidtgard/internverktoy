const BASE = 'https://www.thansen.no';

export function parseSheets(sheets){
  if (!Array.isArray(sheets)) return {};
  const sheet = sheets.find(s => s.id === 6000);
  if (!sheet || !Array.isArray(sheet.fields)) return {};
  const get = id => (sheet.fields.find(f => f.id === id)?.value?.[0]) ?? null;
  const ws = get(21);
  return {
    model:       get(1),
    color_name:  get(2),
    type:        get(3),
    warranty:    get(7),
    gears:       get(10),
    gear_brand:  get(12),
    wheel_size:  ws ? ws + '"' : null,
    brake_front: get(31),
    brake_rear:  get(32),
    tyre:        get(52),
    weight_kg:   get(53),
    motor:       get(61) ?? null,
    battery:     get(63) ?? null,
    range_km:    get(64) ?? null,
  };
}

export function formatTitle(brand, type, model){
  return [brand, type, model].filter(Boolean).join(' ');
}

export function mapHitToBike(hit, { x = 0, y = 0 } = {}){
  const url   = hit.url || '';
  const abs   = url.startsWith('http') ? url : BASE + url;
  const specs = parseSheets(hit.sheets);
  const brand = hit.brand?.title || '';
  return {
    source_id:         String(url.match(/\/pn(\d+)(?:[/?#]|$)/)?.[1] || hit.objectID || '').trim(),
    name:              formatTitle(brand, specs.type, specs.model) || String(hit.title || '').trim(),
    descr:             String(hit.title || '').trim(),
    price:             Math.round(Number(hit.price) || 0),
    item_number:       String(hit.item_number || hit.item_number_thg || '').trim(),
    availability:      hit.in_stock ? 'InStock' : 'OutOfStock',
    image_url:         hit.image || null,
    source_url:        abs,
    outlet:            /outlet|tilbud/i.test(url),
    color_name:        specs.color_name || '',
    wheel_size:        specs.wheel_size || '',
    specs,
    spare_parts:       [],
    spare_parts_count: hit.supplementary_types?.spare_part?.product_count ?? 0,
    x, y,
  };
}
