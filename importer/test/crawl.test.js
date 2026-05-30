import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractProductUrls, extractNextPage } from '../src/crawl.js';

const html = readFileSync(new URL('./fixtures/sample-listing.html', import.meta.url), 'utf8');
const BASE = 'https://www.thansen.no';

test('extractProductUrls returns absolute, de-duped, bike-only product URLs', () => {
  const urls = extractProductUrls(html, BASE);
  assert.equal(urls.length, 2); // pn111, pn222 (dedupe pn111); helmet pn333 excluded (not /sykkel/sykler/)
  assert.ok(urls.every(u => u.startsWith('https://www.thansen.no/sykkel/sykler/')));
  assert.ok(urls.includes('https://www.thansen.no/sykkel/sykler/elsykler/x-zite-a/n14338/pn111'));
  assert.ok(!urls.some(u => u.includes('pn333')));
});
test('extractNextPage finds the NEXT numbered page', () => {
  assert.equal(extractNextPage(html, BASE), 'https://www.thansen.no/sykkel/sykler?page=2');
});
