import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSheets, formatTitle, mapHitToBike } from '../src/map.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures/algolia-bikes.json', import.meta.url), 'utf8'));
const mtb  = fix.hits[0];
const ebike = fix.hits[1];

test('parseSheets extracts mtb spec fields', () => {
  const s = parseSheets(mtb.sheets);
  assert.equal(s.model,       '26.21');
  assert.equal(s.color_name,  'Lilla');
  assert.equal(s.type,        'Mountainbike');
  assert.equal(s.gears,       '21');
  assert.equal(s.gear_brand,  'Shimano Tourney');
  assert.equal(s.wheel_size,  '26"');
  assert.equal(s.brake_front, 'Mekanisk skivebremse');
  assert.equal(s.tyre,        '26 x 2,00');
  assert.equal(s.weight_kg,   '13,5');
  assert.equal(s.warranty,    'Aluminium med 20 års garanti mot rammebrudd');
  assert.equal(s.motor,       null);
});
test('parseSheets extracts e-bike motor fields', () => {
  const s = parseSheets(ebike.sheets);
  assert.equal(s.model,   'E-2907');
  assert.equal(s.motor,   '36V-250W i bakhjul');
  assert.equal(s.battery, '36V-10,4Ah (375Wh) Li-Ion BMS');
  assert.equal(s.range_km,'Opp til 60 km');
});
test('parseSheets returns empty object for missing sheets', () => {
  assert.deepEqual(parseSheets(undefined), {});
});
test('formatTitle builds brand+type+model title', () => {
  assert.equal(formatTitle('X-ZITE', 'Mountainbike', '26.21'), 'X-ZITE Mountainbike 26.21');
  assert.equal(formatTitle('X-ZITE', 'Elsykkel MTB', 'E-2907'), 'X-ZITE Elsykkel MTB E-2907');
});
test('formatTitle falls back gracefully', () => {
  assert.equal(formatTitle('X-ZITE', undefined, undefined), 'X-ZITE');
  assert.equal(formatTitle(undefined, 'Mountainbike', '26.21'), 'Mountainbike 26.21');
});
test('mapHitToBike uses formatted title and populates specs', () => {
  const b = mapHitToBike(mtb, { x: 0, y: 0 });
  assert.equal(b.name, 'X-ZITE Mountainbike 26.21');
  assert.equal(b.descr, 'Mountainbike 26" 26.21 21-gir Lilla');
  assert.equal(b.color_name, 'Lilla');
  assert.equal(b.wheel_size, '26"');
  assert.ok(b.specs && typeof b.specs === 'object');
  assert.equal(b.specs.gears, '21');
  assert.equal(b.specs.brake_front, 'Mekanisk skivebremse');
  assert.equal(b.specs.tyre, '26 x 2,00');
  assert.equal(b.specs.weight_kg, '13,5');
});
test('mapHitToBike price, frame, source_id unchanged', () => {
  const b = mapHitToBike(mtb);
  assert.equal(b.price,        3999);
  assert.equal(b.frame,        '112642217');
  assert.equal(b.source_id,    '1356895');
  assert.equal(b.availability, 'InStock');
});
test('mapHitToBike spare_parts defaults to empty', () => {
  const b = mapHitToBike(mtb);
  assert.deepEqual(b.spare_parts, []);
  assert.equal(b.spare_parts_count, 30);
});
