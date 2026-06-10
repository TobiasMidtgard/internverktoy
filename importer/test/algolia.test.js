import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchBikeHits } from '../src/algolia.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures/algolia-bikes.json', import.meta.url), 'utf8'));

test('fetchBikeHits filters to bike categories and sends al_menu + creds', async () => {
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

test('fetchBikeHits pages through nbPages and merges hits', async () => {
  const pages = [
    { nbPages: 3, hits: [{ url: '/a' }, { url: '/b' }] },
    { nbPages: 3, hits: [{ url: '/c' }] },
    { nbPages: 3, hits: [{ url: '/d' }, { url: null }] },   // null-url filtered out
  ];
  const requested = [];
  const fake = async (url, opts) => { const b = JSON.parse(opts.body); requested.push(b.page); return pages[b.page]; };
  const hits = await fetchBikeHits(fake);
  assert.deepEqual(requested, [0, 1, 2]);
  assert.deepEqual(hits.map(h => h.url), ['/a', '/b', '/c', '/d']);
});

import { fetchSpareParts } from '../src/algolia.js';

test('fetchSpareParts queries Reservedeler by model and returns item array', async () => {
  const spareFixture = {
    nbHits: 2,
    hits: [
      { title:'Forgaffel MTB 26.21', item_number:'230209069', price:599,
        url:'/sykkel/reservedeler/forgafler/forgaffel-mtb-26.21/pn230209069',
        node_tree:[{name:'Sykkel'},{name:'Reservedeler'},{name:'Forgafler'}] },
      { title:'Drop out MTB 26.21', item_number:'220111095', price:149,
        url:'/sykkel/reservedeler/ramme-rammedeler/drop-out/pn220111095',
        node_tree:[{name:'Sykkel'},{name:'Reservedeler'},{name:'Ramme & rammedeler'}] }
    ]
  };
  let captured;
  const fake = async (url, opts) => { captured = {url,opts}; return spareFixture; };
  const parts = await fetchSpareParts(fake, '26.21');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].title,       'Forgaffel MTB 26.21');
  assert.equal(parts[0].item_number, '230209069');
  assert.equal(parts[0].price,       599);
  assert.equal(parts[0].category,    'Forgafler');
  assert.ok(captured.opts.body.includes('Reservedeler'));
  assert.ok(captured.opts.body.includes('26.21'));
});
test('fetchSpareParts returns empty array when model is blank', async () => {
  const parts = await fetchSpareParts(async () => ({}), '');
  assert.deepEqual(parts, []);
});
