import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {articleId, payloadHash, isUntouchedSeed, readArticles} from '../db/publish-wiki.mjs';

const CONTENT = fileURLToPath(new URL('../content/wiki/', import.meta.url));
const copy = value => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// These IDs already identify live articles. Moving their content must not create duplicates.
const existingIds = {
  'bilpaerer': '72450126-ade6-4c8c-8183-5858abbadaae',
  'reservedeler-og-passform': 'd427a57a-eda5-410c-927f-ac72086332e1',
  'barneseter-og-passform': '003eb507-157b-4aca-8761-c9977c4ab9e8',
  'bilvask-og-kjemi': '1223624a-5345-411f-b1ff-d909f79a4d6c',
  'sykkel-valg-og-storrelse': 'e8dea36d-eb2a-4c1e-9afd-5330ae504f86',
  'takstativ-og-taklast': '8bb9115d-115c-473c-8aab-e20f06fc36e0',
  'takboks-og-sykkeltransport': '4f748672-b23a-4ab7-81d0-a86432ca7ae7',
  'vindusviskere': '3baa6b85-5108-4d37-bcf7-fde3d1a89178',
  'mc-og-scooter': '254fa263-a940-4b17-8737-a1caf48f0021',
  'verktoy-og-forbruk': '1b2a9598-6656-47df-9518-08c24fea1ee5',
};

function seed(category = 'Bildeler') {
  return {
    title: `Oversikt: ${category}`,
    category,
    tags: [category.toLowerCase()],
    body: `## Kort om

Skriv en kort innledning om ${category.toLowerCase()}.

## Viktig å vite

- Punkt 1
- Punkt 2

## Vanlige spørsmål

**Spørsmål?**
Svar.

## Gode kilder

Legg til lenker under «Kilder».`,
    sources: [],
    guide: null,
  };
}

function article() {
  return {
    title: 'Motorolje: riktig spesifikasjon',
    category: 'Bildeler',
    tags: ['motorolje', 'OEM'],
    body: 'Kontroller motorens spesifikasjon.\n\nVelg deretter riktig olje.',
    sources: [
      {label: 'Produsenten', url: 'https://example.com/specification'},
      {label: 'Produktet', url: 'https://example.com/product'},
    ],
  };
}

function fixtureDirectory(t) {
  const base = resolve(tmpdir());
  const dir = mkdtempSync(resolve(base, 'wiki-publish-test-'));
  t.after(() => {
    // Only remove the exact temporary directory created for this test.
    assert.equal(dirname(resolve(dir)), base);
    assert.ok(basename(dir).startsWith('wiki-publish-test-'));
    rmSync(dir, {recursive: true, force: true});
  });
  return dir;
}

function writeArticle(dir, slug = 'testartikkel', changes = {}) {
  const metadata = {
    title: 'Trygg veiledning', category: 'Bildeler', tags: ['opplæring'],
    sources: [{label: 'Produsentens veiledning', url: 'https://example.com/guide'}],
    checked_at: '2026-09-25',
    ...changes.metadata,
  };
  const text = changes.text ?? '# ' + metadata.title + '\n\nHer begynner veiledningen.\n\n## Oppslag\n\n' + 'Kontroller passformen. '.repeat(180);
  writeFileSync(resolve(dir, slug + '.metadata.json'), JSON.stringify(metadata), 'utf8');
  writeFileSync(resolve(dir, slug + '.md'), text, 'utf8');
  return {metadata, text};
}

test('existing seed and bulb article IDs stay pinned to their live identifiers', () => {
  for (const [slug, id] of Object.entries(existingIds)) {
    assert.equal(articleId(slug), id, slug);
    assert.match(id, uuid);
  }
  assert.equal(new Set(Object.values(existingIds)).size, Object.keys(existingIds).length);
});

test('new IDs are stable RFC 4122 UUIDv5 values for the published URL namespace', () => {
  // Independent reference values generated with Python's uuid.uuid5(uuid.NAMESPACE_URL, url).
  const expected = {
    'motorolje-og-spesifikasjoner': '62ef6d11-b9dd-5f5d-a72d-59d460eb7a38',
    'batterier-og-ladere': '0f7ed195-1d0c-5918-932d-8c6f7fd32a20',
    'ny-testartikkel': '939a7751-1e99-5386-9d7b-a15991a99f43',
  };
  for (const [slug, id] of Object.entries(expected)) {
    assert.equal(articleId(slug), id);
    assert.equal(articleId(slug), articleId(slug));
    assert.match(id, uuid);
  }
  assert.notEqual(articleId('ny-testartikkel'), articleId('ny-testartikkel-2'));
});

test('a valid slug that matches an Object prototype property still gets its own UUID', () => {
  assert.match(articleId('constructor'), uuid);
  assert.notEqual(articleId('constructor'), articleId('ny-testartikkel'));
});

test('only the exact original seed content is recognized, including Norwegian category names', () => {
  for (const category of ['Bildeler', 'Barneseter', 'Bilvask', 'Sykkel', 'Takstativ', 'Takbokser', 'Vindusviskere', 'MC', 'Verktøy']) {
    const value = seed(category);
    assert.equal(isUntouchedSeed(value, category), true, category);
    assert.equal(isUntouchedSeed({...value, id: 'irrelevant', updated_at: '2026-09-25'}, category), true);
    assert.equal(isUntouchedSeed(value, 'Annen kategori'), false);
  }
});

test('every employee-editable seed field prevents it from being treated as untouched', () => {
  const variants = [
    value => { value.title += ' – vår butikk'; },
    value => { value.category = 'Generelt'; },
    value => { value.tags = ['bildeler', 'intern']; },
    value => { value.tags = []; },
    value => { value.tags = 'bildeler'; },
    value => { value.body += '\n'; },
    value => { value.body = value.body.replace('Punkt 1', 'Kontroller VIN'); },
    value => { value.body = value.body.replace(/\n/g, '\r\n'); },
    value => { value.sources = [{label: 'Ny kilde', url: 'https://example.com/'}]; },
    value => { value.guide = {version: 1, steps: []}; },
  ];
  for (const mutate of variants) {
    const value = seed();
    mutate(value);
    assert.equal(isUntouchedSeed(value, 'Bildeler'), false, JSON.stringify(value));
  }
});

test('empty-looking JSONB source values cannot authorize overwriting a seed', () => {
  for (const sources of ['', {length: 0}, {}, null, false, 0]) {
    assert.equal(isUntouchedSeed({...seed(), sources}, 'Bildeler'), false, JSON.stringify(sources));
  }
});

test('payload hashes are stable across JSON and PostgreSQL JSONB object-key order', () => {
  const value = article();
  const returnedByDatabase = {
    sources: value.sources.map(source => ({url: source.url, label: source.label})),
    body: value.body,
    tags: value.tags,
    category: value.category,
    title: value.title,
  };
  assert.match(payloadHash(value), /^[0-9a-f]{64}$/);
  assert.equal(payloadHash(value), payloadHash(copy(value)));
  assert.equal(payloadHash(value), payloadHash(returnedByDatabase));
});

test('canonical hashing also preserves nested data while ignoring its object-key order', () => {
  const value = article();
  value.sources[0].details = {language: 'no', review: {date: '2026-09-25', by: 'Fagansvarlig'}};
  const reordered = copy(value);
  reordered.sources[0].details = {review: {by: 'Fagansvarlig', date: '2026-09-25'}, language: 'no'};
  assert.equal(payloadHash(value), payloadHash(reordered));
  reordered.sources[0].details.review.by = 'Ansatt';
  assert.notEqual(payloadHash(value), payloadHash(reordered), 'Ansattes ekstra kildeopplysninger må ikke forsvinne fra endringskontrollen');
});

test('all published content fields and list ordering affect the employee-edit digest', () => {
  const original = article();
  const originalHash = payloadHash(original);
  const variants = [
    value => { value.title += '!'; },
    value => { value.category = 'Olje'; },
    value => { value.tags.push('etterfylling'); },
    value => { value.tags.reverse(); },
    value => { value.body += '\n'; },
    value => { value.sources[0].label += ' – kontrollert'; },
    value => { value.sources[0].url += '?version=2'; },
    value => { value.sources.reverse(); },
    value => { value.sources[0].note = 'Lagt til av ansatt'; },
  ];
  for (const mutate of variants) {
    const value = copy(original);
    mutate(value);
    assert.notEqual(payloadHash(value), originalHash, JSON.stringify(value));
  }
  assert.equal(payloadHash(original), originalHash, 'Hashing endrer ikke originalobjektet');
});

test('database identity, timestamps and search bookkeeping do not change the content digest', () => {
  const value = article();
  assert.equal(payloadHash(value), payloadHash({
    ...value,
    id: articleId('ny-testartikkel'),
    slug: 'ny-testartikkel',
    updated_at: '2026-09-25T12:00:00Z',
    created_at: '2026-09-20T12:00:00Z',
    updated_by: 'Ansatt',
    tsv: "'motorolje':1",
  }));
});

test('the source-controlled articles validate and produce one unique payload per metadata file', () => {
  const values = readArticles();
  const names = readdirSync(CONTENT).filter(name => name.endsWith('.metadata.json'));
  assert.equal(values.length, names.length);
  assert.ok(values.length > 0);
  assert.equal(new Set(values.map(value => value.id)).size, values.length);
  assert.equal(new Set(values.map(value => value.slug)).size, values.length);
  for (const value of values) {
    const metadata = JSON.parse(readFileSync(resolve(CONTENT, value.slug + '.metadata.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(value.id, articleId(value.slug));
    assert.match(value.id, uuid);
    assert.equal(value.title, metadata.title);
    assert.equal(value.category, metadata.category);
    assert.deepEqual(value.tags, metadata.tags);
    assert.deepEqual(value.sources, metadata.sources);
    assert.doesNotMatch(value.body, /^# /, 'Publisert brødtekst skal ikke duplisere artikkeltittelen');
    assert.doesNotMatch(value.body, /\{\{article:/, 'Ingen uerstattede interne lenkemarkører');
    assert.ok(value.body.split(/\s+/).length >= 350);
    for (const source of value.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username, '');
      assert.equal(url.password, '');
      assert.ok(source.label);
    }
  }
});

test('every internal article link resolves to a payload in the same publication set', () => {
  const values = readArticles();
  const ids = new Map(values.map(value => [value.slug, value.id]));
  let references = 0;
  for (const value of values) {
    const source = readFileSync(resolve(CONTENT, value.slug + '.md'), 'utf8');
    for (const [, slug] of source.matchAll(/\{\{article:([a-z0-9-]+)\}\}/g)) {
      references++;
      assert.ok(ids.has(slug), `${value.slug} peker til upublisert artikkel ${slug}`);
      const target = 'https://tobiasmidtgard.github.io/internverktoy/wiki.html?article=' + ids.get(slug);
      assert.ok(value.body.includes(target), `${value.slug} mangler korrekt lenke til ${slug}`);
    }
  }
  assert.ok(references > 0, 'Startsiden må faktisk koble leseren til fagartiklene');
});

test('article loading normalizes UTF-8 BOM and Windows line endings without losing the ingress', t => {
  const dir = fixtureDirectory(t);
  const {metadata, text} = writeArticle(dir);
  writeFileSync(resolve(dir, 'testartikkel.metadata.json'), '\uFEFF' + JSON.stringify(metadata), 'utf8');
  writeFileSync(resolve(dir, 'testartikkel.md'), '\uFEFF' + text.replace(/\n/g, '\r\n'), 'utf8');
  const [value] = readArticles(dir);
  assert.equal(value.title, metadata.title);
  assert.ok(value.body.startsWith('Her begynner veiledningen.\n\n## Oppslag'));
  assert.doesNotMatch(value.body, /\r|\uFEFF/);
  assert.equal(value.body, text.replace(/^#.*\n/, '').trim());
});

test('valid internal links resolve using the target article stable ID', t => {
  const dir = fixtureDirectory(t);
  writeArticle(dir, 'maaltittel');
  const {text} = writeArticle(dir, 'startside');
  writeFileSync(resolve(dir, 'startside.md'), text + '\n[Les fagartikkelen]({{article:maaltittel}}).', 'utf8');
  const values = readArticles(dir);
  const start = values.find(value => value.slug === 'startside');
  assert.ok(start.body.endsWith('[Les fagartikkelen](https://tobiasmidtgard.github.io/internverktoy/wiki.html?article=' + articleId('maaltittel') + ').'));
  assert.doesNotMatch(start.body, /\{\{/);
});

test('a Markdown file without metadata cannot satisfy an internal article link', t => {
  const dir = fixtureDirectory(t);
  const {text} = writeArticle(dir);
  writeFileSync(resolve(dir, 'foreldreloes.md'), '# Denne filen blir ikke publisert.\n', 'utf8');
  writeFileSync(resolve(dir, 'testartikkel.md'), text + '\n[Les mer]({{article:foreldreloes}})', 'utf8');
  assert.throws(() => readArticles(dir), /Unknown article link/);
});

test('missing and malformed internal article links fail validation before any publication', t => {
  const dir = fixtureDirectory(t);
  const {text} = writeArticle(dir);
  for (const token of ['{{article:mangler}}', '{{article:bad_slug}}', '{{article:../utenfor}}', '{{article:}}', '{{article:testartikkel']) {
    writeFileSync(resolve(dir, 'testartikkel.md'), text + '\n[Les mer](' + token + ')', 'utf8');
    assert.throws(() => readArticles(dir), undefined, token);
  }
});

test('a metadata entry without a body file is rejected', t => {
  const dir = fixtureDirectory(t);
  writeArticle(dir);
  writeFileSync(resolve(dir, 'mangler.metadata.json'), JSON.stringify({title: 'Mangler tekst'}), 'utf8');
  assert.throws(() => readArticles(dir));
});

test('title mismatches, unsafe filenames, missing review dates and incomplete drafts are rejected', t => {
  const cases = [
    {metadata: {title: ''}},
    {metadata: {category: ''}},
    {metadata: {checked_at: undefined}},
    {metadata: {checked_at: '25.09.2026'}},
    {text: '# Feil tittel\n\n' + 'Forklaring '.repeat(360)},
    {text: '# Trygg veiledning\n\nFor kort.'},
    {text: '# Trygg veiledning\n\nTODO\n' + 'Forklaring '.repeat(360)},
    {text: '# Trygg veiledning\n\nSkriv en kort innledning\n' + 'Forklaring '.repeat(360)},
  ];
  const dir = fixtureDirectory(t);
  for (const changes of cases) {
    writeArticle(dir, 'testartikkel', changes);
    assert.throws(() => readArticles(dir), undefined, JSON.stringify(changes.metadata || changes.text.slice(0, 55)));
  }
  const unsafeDir = fixtureDirectory(t);
  writeArticle(unsafeDir, 'Bad_slug');
  assert.throws(() => readArticles(unsafeDir), /Invalid slug/);
});

test('metadata requires tags and HTTPS sources without embedded credentials', t => {
  const dir = fixtureDirectory(t);
  const cases = [
    {tags: []}, {tags: 'bildeler'}, {tags: [42]},
    {sources: []}, {sources: {}},
    {sources: [{label: '', url: 'https://example.com/'}]},
    ...['http://example.com/', 'javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:secret@example.com/'].map(url => ({sources: [{label: 'Kilde', url}]})),
  ];
  for (const metadata of cases) {
    writeArticle(dir, 'testartikkel', {metadata});
    assert.throws(() => readArticles(dir), undefined, JSON.stringify(metadata));
  }
});
