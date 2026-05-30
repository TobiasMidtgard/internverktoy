import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapHitToBike } from '../src/map.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures/algolia-bikes.json', import.meta.url), 'utf8'));

test('mapHitToBike maps an Algolia hit to a bike payload', () => {
  const b = mapHitToBike(fix.hits[0], { x: 40, y: 80 });
  assert.equal(b.source_id, '1037962');
  assert.equal(b.name, 'X-ZITE El-sykkel 24" Junior');
  assert.equal(b.price, 8999);
  assert.equal(b.frame, '230203170');
  assert.equal(b.availability, 'InStock');
  assert.equal(b.image_url, 'https://dyncdn.thg.dk/img/a.jpg');
  assert.equal(b.source_url, 'https://www.thansen.no/sykkel/sykler/elsykler-junior/x-zite-el-sykkel-24/n14360/pn1037962');
  assert.equal(b.outlet, false);
  assert.equal(b.x, 40); assert.equal(b.y, 80);
});

test('mapHitToBike: out-of-stock, price rounds to int', () => {
  const b = mapHitToBike(fix.hits[1]);
  assert.equal(b.availability, 'OutOfStock');
  assert.equal(b.price, 4999);
  assert.equal(b.source_id, '1100001');
});
