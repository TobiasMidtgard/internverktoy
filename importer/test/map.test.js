import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAvailability, detectOutlet, mapProductToBike } from '../src/map.js';

const f = n => readFileSync(new URL('./fixtures/'+n, import.meta.url), 'utf8');

test('normalizeAvailability strips schema URL', () => {
  assert.equal(normalizeAvailability('https://schema.org/InStock'), 'InStock');
  assert.equal(normalizeAvailability('http://schema.org/OutOfStock'), 'OutOfStock');
  assert.equal(normalizeAvailability(undefined), null);
});
test('detectOutlet matches breadcrumb/url keywords', () => {
  assert.equal(detectOutlet(['Sykkel','Outlet'], 'x'), true);
  assert.equal(detectOutlet(['Sykkel','Sykler'], 'https://x/tilbud/pn1'), true);
  assert.equal(detectOutlet(['Sykkel','Elsykler'], 'https://x/elsykler/pn1'), false);
});
test('mapProductToBike maps a normal product', () => {
  const b = mapProductToBike(f('sample-product.html'), { x: 40, y: 80 });
  assert.equal(b.source_id, '123456');   // canonical pn id from the URL
  assert.equal(b.name, 'X-ZITE E-Trekking 28"');
  assert.equal(b.price, 12999);             // integer NOK
  assert.equal(b.frame, '5712345678901');   // EAN -> barcode
  assert.equal(b.availability, 'InStock');
  assert.equal(b.outlet, false);
  assert.equal(b.x, 40); assert.equal(b.y, 80);
  assert.equal(b.source_url.includes('pn123456'), true);
});
test('mapProductToBike flags outlet + out-of-stock', () => {
  const b = mapProductToBike(f('sample-outlet-product.html'), { x: 0, y: 0 });
  assert.equal(b.outlet, true);
  assert.equal(b.availability, 'OutOfStock');
  assert.equal(b.price, 2499);
});
