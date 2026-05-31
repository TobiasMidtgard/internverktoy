import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchBikeHits } from '../src/algolia.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures/algolia-bikes.json', import.meta.url), 'utf8'));

test('fetchBikeHits filters to type=product and sends the node filter + creds', async () => {
  let captured;
  const fakeFetchJson = async (url, opts) => { captured = { url, opts }; return fix; };
  const hits = await fetchBikeHits(fakeFetchJson);
  assert.equal(hits.length, 2);                       // the no-url entry is filtered out
  assert.ok(hits.every(h => h.url));
  assert.ok(captured.url.includes('thansen_no_products'));
  assert.ok(captured.opts.body.includes('al_menu.lvl2:Sykkel > Sykler > Elsykler'));
  assert.ok(captured.opts.headers['X-Algolia-API-Key'].length > 0);
});

test('throws when Algolia returns no hits array', async () => {
  await assert.rejects(() => fetchBikeHits(async () => ({ message: 'boom' })), /no hits/i);
});
