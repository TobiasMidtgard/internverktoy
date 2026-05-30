import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractJsonLd, findProduct, findBreadcrumb, parseProduct } from '../src/parse.js';

const html = readFileSync(new URL('./fixtures/sample-product.html', import.meta.url), 'utf8');

test('extractJsonLd returns all ld+json blocks', () => {
  const blocks = extractJsonLd(html);
  assert.equal(blocks.length, 3);
});
test('findProduct picks the Product block', () => {
  const p = findProduct(extractJsonLd(html));
  assert.equal(p.name, 'X-ZITE E-Trekking 28"');
  assert.equal(p.sku, 'P123456');
  assert.equal(p.offers.price, '12999.00');
});
test('findBreadcrumb returns ordered names', () => {
  assert.deepEqual(findBreadcrumb(extractJsonLd(html)), ['Sykkel','Sykler','Elsykler']);
});
test('parseProduct returns product + breadcrumb', () => {
  const r = parseProduct(html);
  assert.equal(r.product.gtin, '5712345678901');
  assert.deepEqual(r.breadcrumb, ['Sykkel','Sykler','Elsykler']);
});
test('parseProduct throws when no Product block', () => {
  assert.throws(() => parseProduct('<html></html>'), /no Product/i);
});
