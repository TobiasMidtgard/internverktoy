import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractProductUrls, extractNextPage } from '../src/crawl.js';

const html = readFileSync(new URL('./fixtures/sample-listing.html', import.meta.url), 'utf8');
const BASE = 'https://www.thansen.no';

test('extractProductUrls returns absolute, de-duped product URLs', () => {
  const urls = extractProductUrls(html, BASE);
  assert.equal(urls.length, 3); // pn111, pn222, pn333 — dedupe pn111
  assert.ok(urls.every(u => u.startsWith('https://www.thansen.no/')));
  assert.ok(urls.includes('https://www.thansen.no/sykkel/sykler/elsykler/x-zite-a/n14338/pn111'));
});
test('extractNextPage finds pagination link', () => {
  assert.equal(extractNextPage(html, BASE), 'https://www.thansen.no/sykkel/sykler?page=2');
});
