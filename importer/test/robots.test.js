import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRobots, isAllowed } from '../src/robots.js';

const txt = readFileSync(new URL('./fixtures/sample-robots.txt', import.meta.url), 'utf8');

test('product + category paths are allowed for our UA', () => {
  const r = parseRobots(txt);
  assert.equal(isAllowed(r, '/sykkel/sykler/elsykler/x/n14338/pn111'), true);
  assert.equal(isAllowed(r, '/sykkel/sykler'), true);
});
test('disallowed store-stock + ajax paths are blocked', () => {
  const r = parseRobots(txt);
  assert.equal(isAllowed(r, '/instockstatus?pn=1'), false);
  assert.equal(isAllowed(r, '/ajax/whatever'), false);
});
