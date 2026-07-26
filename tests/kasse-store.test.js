'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KasseDomain = require('../kasse-domain.js');
const STORE_SRC = fs.readFileSync(path.join(__dirname, '..', 'kasse-store.js'), 'utf8');

/* ---------- falsk localStorage + window i en isolert vm-kontekst ----------
   kasse-store.js er ikke UMD (den skriver rett til window.KasseStore), og Node
   har ingen localStorage. Vi bygger en egen kjøresone per test med
   vm.createContext, laster den virkelige kildekoden inn i den, og gir tilbake
   API-et den produserer. Isolert per kall, ikke delt via Node sitt globale
   objekt: node:test kan kjøre tester parallelt, og et felles window/
   localStorage ville gjort testene avhengige av rekkefølge. */
class FakeStorage {
  constructor(){ this._data = Object.create(null); this._failName = null; }
  _check(){
    if (this._failName){ const e = new Error('fake storage failure'); e.name = this._failName; throw e; }
  }
  getItem(k){ this._check(); return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; }
  setItem(k, v){ this._check(); this._data[k] = String(v); }
  removeItem(k){ delete this._data[k]; }
}

/* Verdier som kommer tilbake fra vm-sandkassa er skapt av SANDKASSENS EGNE
   Array/Object-konstruktører, ikke Node-prosessens. De er strukturelt like, men
   assert.deepEqual/deepStrictEqual sammenligner på tvers av realm og feiler da med
   «same structure but not reference-equal» selv når verdiene reelt sett er like.
   Trygt å JSON-rundtur-normalisere: alt datalaget produserer er JSON-verdier. */
const normalize = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;

function freshStore(){
  const storage = new FakeStorage();
  const sandbox = {
    console, KasseDomain, localStorage: storage,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(STORE_SRC, sandbox, { filename: 'kasse-store.js' });
  const raw = sandbox.KasseStore;
  const Store = {
    use: raw.use, driver: raw.driver, clearDraft: raw.clearDraft, KEYS: raw.KEYS,
    saveDraft: draft => raw.saveDraft(draft),
    getDraft: () => normalize(raw.getDraft()),
  };
  ['saveSession', 'listSessions', 'getSession', 'deleteSession', 'verifySession', 'getDenominations', 'saveDenominations']
    .forEach(fn => { Store[fn] = async (...args) => normalize(await raw[fn](...args)); });
  return { Store, storage };
}

const emptySections = () => ({
  safe:    { lines:[], total_ore:0, target_ore:1000000 },
  opening: { lines:[], total_ore:0 },
  closing: { lines:[], total_ore:0 },
});
const sessionStub = extra => Object.assign({ session_date:'2026-07-20', status:'saved', note:'', sections:emptySections() }, extra);

/* ---------- driver-dispatch ---------- */

test('driver: standard er local, use() bytter driver, ukjent driver kaster', async () => {
  const { Store } = freshStore();
  assert.equal(Store.driver(), 'local');
  assert.throws(() => Store.use('nope'), /Ukjent driver/);
  Store.use('supabase');
  assert.equal(Store.driver(), 'supabase');
  await assert.rejects(Store.listSessions(), /not-implemented/);
  Store.use('local');
  assert.equal(Store.driver(), 'local');
});

test('supabase-stubben kaster not-implemented på alle sju metodene', async () => {
  const { Store } = freshStore();
  Store.use('supabase');
  await assert.rejects(Store.saveSession({}), /not-implemented/);
  await assert.rejects(Store.listSessions(), /not-implemented/);
  await assert.rejects(Store.getSession('x'), /not-implemented/);
  await assert.rejects(Store.deleteSession('x'), /not-implemented/);
  await assert.rejects(Store.verifySession('x', { tag:'ABCD' }), /not-implemented/);
  await assert.rejects(Store.getDenominations(), /not-implemented/);
  await assert.rejects(Store.saveDenominations([]), /not-implemented/);
});

test('I1: supabase-stubben for getDenominations lover ALLE valører, ikke bare aktive', async () => {
  const { Store } = freshStore();
  Store.use('supabase');
  try {
    await Store.getDenominations();
    assert.fail('skulle kastet');
  } catch (err) {
    assert.match(err.message, /order by sort/);
    assert.doesNotMatch(err.message, /where active/);
  }
});

/* ---------- valører ---------- */

test('getDenominations faller tilbake til DEFAULT_DENOMS ved første oppstart, sortert på `sort`', async () => {
  const { Store } = freshStore();
  const list = await Store.getDenominations();
  assert.equal(list.length, KasseDomain.DEFAULT_DENOMS.length);
  assert.equal(list[0].id, 'note_1000');
  assert.equal(list[list.length - 1].id, 'coin_1');
});

test('saveDenominations avviser en ugyldig liste og lagrer ingenting', async () => {
  const { Store, storage } = freshStore();
  const bad = [{ id:'x', kind:'note', label:'X', value_ore:-5, sort:1, active:true }];
  await assert.rejects(Store.saveDenominations(bad), /./);
  assert.equal(storage.getItem('th.kasse.denoms.v1'), null);
});

test('saveDenominations dypkopierer: kallerens videre redigering av samme array smitter ikke inn i det lagrede', async () => {
  const { Store, storage } = freshStore();
  const good = JSON.parse(JSON.stringify(KasseDomain.DEFAULT_DENOMS));
  const returned = await Store.saveDenominations(good);
  assert.notEqual(returned, good);
  good[0].label = 'MUTERT-ETTER-LAGRING';
  const reread = JSON.parse(storage.getItem('th.kasse.denoms.v1'));
  assert.notEqual(reread[0].label, 'MUTERT-ETTER-LAGRING');
});

test('getDenominations validerer lagrede valører på lesesiden — håndredigert ugyldig data avvises', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.denoms.v1', JSON.stringify([
    { id:'bad', kind:'coin', label:'Bad', value_ore:100, gram_per_unit:-1, units_per_roll:10, sort:1, active:true },
  ]));
  await assert.rejects(Store.getDenominations(), /ugyldig/);
});

/* C2: gyldig JSON, men feil form. Dette var hullet forrige runde: en objekt-payload
   sluk stille forbi `stored && stored.length` og falt tilbake til standardvalørene
   uten varsel (en manager sine endringer forsvinner sporløst); en payload med en
   tallverdi kalt `length` kom forbi den samme sjekken og kræsjet lenger nede med en
   rå engelsk "list.slice is not a function". */
test('C2: getDenominations avviser en objekt-payload tydelig, faller ikke stille tilbake til standardvalørene', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.denoms.v1', JSON.stringify({ note_1000: { value_ore: 100000 } }));
  await assert.rejects(Store.getDenominations(), /feil format/);
});

test('C2: getDenominations avviser en payload med en tallverdi kalt `length` i stedet for å kræsje på .slice', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.denoms.v1', JSON.stringify({ length: 2, 0:{}, 1:{} }));
  await assert.rejects(Store.getDenominations(), /feil format/);
});

/* ---------- lesing: manglende nøkkel vs. skadet innhold ---------- */

test('listSessions: manglende nøkkel gir stille tom liste', async () => {
  const { Store } = freshStore();
  assert.deepEqual(await Store.listSessions(), []);
});

test('listSessions: en skadet (ikke-parsbar) øktliste kaster i stedet for å late som historikken er tom', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.sessions.v1', '{ikke gyldig json');
  await assert.rejects(Store.listSessions(), /kan ikke leses/);
  await assert.rejects(Store.getSession('x'), /kan ikke leses/);
});

test('listSessions: gyldig JSON, men feil form (objekt i stedet for liste), kaster med tydelig melding', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.sessions.v1', JSON.stringify({ oops:true }));
  await assert.rejects(Store.listSessions(), /feil format/);
});

test('I4: feilmeldingen for skadet data viser ikke lagringsnøkkelen til en ansatt', async () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.sessions.v1', '{ikke gyldig json');
  try {
    await Store.listSessions();
    assert.fail('skulle kastet');
  } catch (err) {
    assert.doesNotMatch(err.message, /th\.kasse\.sessions\.v1/);
  }
});

test('localStorage helt utilgjengelig ved oppstart: modulen laster likevel, lesing degraderer stille', async () => {
  const sandbox = { console, KasseDomain, crypto: { randomUUID: () => 'uuid' } };
  sandbox.window = sandbox;
  sandbox.localStorage = undefined;
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(STORE_SRC, sandbox, { filename: 'kasse-store.js' }));
  const list = normalize(await sandbox.KasseStore.listSessions());
  assert.deepEqual(list, []);
});

/* ---------- summary(): forsvar mot skadede/gammelt-formede rader ---------- */

test('I2: en rad uten `sections` i det hele tatt vises med null i pengefeltene, ikke 0 og ikke en kræsj', async () => {
  const { Store, storage } = freshStore();
  const malformed = {
    id:'m1', session_date:'2026-07-18', status:'saved', note:'',
    counted_by:{ tag:'ABCD', name:'A B' }, counted_at:'2026-07-18T09:00:00.000Z',
  };
  storage.setItem('th.kasse.sessions.v1', JSON.stringify([malformed]));
  const [row] = await Store.listSessions();
  assert.equal(row.id, 'm1');
  assert.equal(row.safe_total_ore, null);
  assert.equal(row.safe_diff_ore, null);
  assert.equal(row.opening_total_ore, null);
  assert.equal(row.closing_total_ore, null);
});

test('en gyldig rad med faktisk 0 kr talt viser 0, ikke null — «ingenting talt» og «ukjent» er ikke det samme', async () => {
  const { Store } = freshStore();
  await Store.saveSession(sessionStub());
  const [row] = await Store.listSessions();
  assert.equal(row.safe_total_ore, 0);
  assert.equal(row.opening_total_ore, 0);
  assert.equal(row.closing_total_ore, 0);
  assert.equal(row.safe_diff_ore, -1000000);
});

test('I3: safe_diff_ore beregnes med KasseDomain.safeDiffOre, ikke en kopi av formelen i datalaget', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({
    sections: Object.assign(emptySections(), { safe: { lines:[], total_ore:1000000, target_ore:1000000 } }),
  }));
  const [row] = await Store.listSessions();
  assert.equal(row.safe_diff_ore, KasseDomain.safeDiffOre(saved));
  assert.equal(row.safe_diff_ore, 0);
});

test('summary tar med verified_by_tag i tillegg til verified_by_name', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  await Store.verifySession(saved.id, { tag:'MGR1', name:'Manager Én' });
  const [row] = await Store.listSessions();
  assert.equal(row.verified_by_tag, 'MGR1');
  assert.equal(row.verified_by_name, 'Manager Én');
});

/* ---------- saveSession / getSession / listSessions ---------- */

test('saveSession tildeler id når det mangler, og listSessions sorterer nyeste session_date først', async () => {
  const { Store } = freshStore();
  const s1 = await Store.saveSession(sessionStub({ session_date:'2026-07-18' }));
  assert.ok(s1.id);
  await Store.saveSession(sessionStub({ session_date:'2026-07-20' }));
  const all = await Store.listSessions();
  assert.equal(all.length, 2);
  assert.equal(all[0].session_date, '2026-07-20');
});

test('saveSession oppdaterer (upsert) på id i stedet for å duplisere raden', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub());
  saved.note = 'endret';
  await Store.saveSession(saved);
  const all = await Store.listSessions();
  assert.equal(all.length, 1);
  const got = await Store.getSession(saved.id);
  assert.equal(got.note, 'endret');
});

test('saveSession dypkopierer: kallerens videre redigering av objektet etter lagring smitter ikke inn i lagringen', async () => {
  const { Store, storage } = freshStore();
  const session = sessionStub();
  await Store.saveSession(session);
  session.note = 'MUTERT-ETTER-LAGRING';
  const reread = JSON.parse(storage.getItem('th.kasse.sessions.v1'))[0];
  assert.notEqual(reread.note, 'MUTERT-ETTER-LAGRING');
});

/* C1: en gammel, ikke-godkjent kopi som lagres over en rad som i mellomtiden er
   blitt godkjent (typisk fra en annen fane/enhet) skal IKKE kunne slette
   godkjenningen ved en hel rad-erstatning. */
test('C1: saveSession nekter å lagre over en godkjent rad — en gammel kopi kan ikke slette en godkjenning', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  const verified = await Store.verifySession(saved.id, { tag:'MGR1', name:'Manager Én' });
  assert.equal(verified.status, 'verified');

  /* `saved` er den gamle, ikke-godkjente kopien en annen fane fortsatt sitter med. */
  const staleCopy = Object.assign({}, saved, { note:'redigert i en annen fane etter godkjenning' });
  await assert.rejects(Store.saveSession(staleCopy), /godkjent/);

  const current = await Store.getSession(saved.id);
  assert.equal(current.status, 'verified');
  assert.deepEqual(current.verified_by, { tag:'MGR1', name:'Manager Én' });
  assert.notEqual(current.note, 'redigert i en annen fane etter godkjenning');
});

/* ---------- deleteSession ---------- */

test('deleteSession fjerner raden; sletting av en ukjent id er et stille no-op', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub());
  await Store.deleteSession(saved.id);
  assert.equal(await Store.getSession(saved.id), null);
  await Store.deleteSession('finnes-ikke');
});

test('deleteSession nekter å slette en godkjent rad', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  await Store.verifySession(saved.id, { tag:'MGR1', name:'Manager Én' });
  await assert.rejects(Store.deleteSession(saved.id), /kan ikke slettes/);
  assert.ok(await Store.getSession(saved.id));
});

test('I4: deleteSession sin skrivefeilmelding påstår ikke "full" — lista blir aldri større av en sletting', async () => {
  const { Store, storage } = freshStore();
  const saved = await Store.saveSession(sessionStub());
  storage._failName = 'SecurityError';
  try {
    await Store.deleteSession(saved.id);
    assert.fail('skulle kastet');
  } catch (err) {
    assert.doesNotMatch(err.message, /ledig lagringsplass/);
  } finally {
    storage._failName = null;
  }
});

/* ---------- verifySession ---------- */

test('verifySession krever en pålogget bruker med tag', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub());
  await assert.rejects(Store.verifySession(saved.id, null), /Mangler innlogget bruker/);
  await assert.rejects(Store.verifySession(saved.id, {}), /Mangler innlogget bruker/);
});

test('verifySession kaster på en ukjent id', async () => {
  const { Store } = freshStore();
  await assert.rejects(Store.verifySession('finnes-ikke', { tag:'MGR1', name:'M' }), /Fant ikke/);
});

test('verifySession avviser et utkast — kun lagrede oppgjør kan godkjennes', async () => {
  const { Store } = freshStore();
  const draft = await Store.saveSession(sessionStub({ status:'draft' }));
  await assert.rejects(Store.verifySession(draft.id, { tag:'MGR1', name:'M' }), /lagrede oppgjør/);
});

test('verifySession avviser å godkjenne på nytt et allerede godkjent oppgjør', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  await Store.verifySession(saved.id, { tag:'MGR1', name:'M' });
  await assert.rejects(Store.verifySession(saved.id, { tag:'MGR2', name:'M2' }), /lagrede oppgjør/);
});

test('verifySession avviser selvgodkjenning — telleren kan ikke godkjenne sin egen telling', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  await assert.rejects(Store.verifySession(saved.id, { tag:'ABCD', name:'Ansatt' }), /egen telling/);
});

test('verifySession lykkes for en annen bruker enn telleren, og setter status/verified_by/verified_at', async () => {
  const { Store } = freshStore();
  const saved = await Store.saveSession(sessionStub({ counted_by:{ tag:'ABCD', name:'Ansatt' } }));
  const verified = await Store.verifySession(saved.id, { tag:'MGR1', name:'Manager Én' });
  assert.equal(verified.status, 'verified');
  assert.deepEqual(verified.verified_by, { tag:'MGR1', name:'Manager Én' });
  assert.ok(verified.verified_at);
});

/* ---------- utkast ---------- */

test('saveDraft/getDraft/clearDraft: rundtur, og saveDraft returnerer true ved suksess', () => {
  const { Store } = freshStore();
  assert.equal(Store.getDraft(), null);
  assert.equal(Store.saveDraft({ hello:'world' }), true);
  assert.deepEqual(Store.getDraft(), { hello:'world' });
  Store.clearDraft();
  assert.equal(Store.getDraft(), null);
});

test('getDraft degraderer stille til null ved skadet JSON i stedet for å kaste', () => {
  const { Store, storage } = freshStore();
  storage.setItem('th.kasse.draft.v1', 'ikke json');
  assert.equal(Store.getDraft(), null);
});

test('I6: saveDraft returnerer false ved skrivefeil, slik at sidelaget kan oppdage det', () => {
  const { Store, storage } = freshStore();
  storage._failName = 'QuotaExceededError';
  assert.equal(Store.saveDraft({ x:1 }), false);
  storage._failName = null;
});

/* ---------- listSessions: filter og grense ---------- */

test('listSessions: from/to filtrerer på session_date, limit begrenser antall, nyeste dato øverst', async () => {
  const { Store } = freshStore();
  for (const d of ['2026-07-01', '2026-07-10', '2026-07-20']) await Store.saveSession(sessionStub({ session_date:d }));
  const ranged = await Store.listSessions({ from:'2026-07-05', to:'2026-07-15' });
  assert.deepEqual(ranged.map(r => r.session_date), ['2026-07-10']);
  const limited = await Store.listSessions({ limit:2 });
  assert.equal(limited.length, 2);
  assert.equal(limited[0].session_date, '2026-07-20');
});

test('listSessions: limit:0 gir null rader, tolkes ikke som «ingen grense»', async () => {
  const { Store } = freshStore();
  await Store.saveSession(sessionStub());
  const rows = await Store.listSessions({ limit:0 });
  assert.deepEqual(rows, []);
});

test('listSessions: en rad uten session_date overlever et datofilter i stedet for å forsvinne stille', async () => {
  const { Store, storage } = freshStore();
  await Store.saveSession(sessionStub({ session_date:'2026-07-10' }));
  const all = JSON.parse(storage.getItem('th.kasse.sessions.v1'));
  all.push({ id:'nd1', status:'saved', note:'', sections:emptySections() }); // ingen session_date
  storage.setItem('th.kasse.sessions.v1', JSON.stringify(all));
  const ranged = await Store.listSessions({ from:'2026-07-01', to:'2026-07-31' });
  assert.ok(ranged.some(r => r.id === 'nd1'), 'raden uten dato skal fortsatt vises');
});

/* ---------- skrivefeil: meldingene sier bare det vi faktisk vet (I4/I5) ---------- */

test('saveSession: kvotefeil nevner lagringsplass og henviser til en butikksjef, ikke til brukerens feil', async () => {
  const { Store, storage } = freshStore();
  storage._failName = 'QuotaExceededError';
  try {
    await Store.saveSession(sessionStub());
    assert.fail('skulle kastet');
  } catch (err) {
    assert.match(err.message, /ledig lagringsplass/);
    assert.match(err.message, /butikksjef/);
  } finally {
    storage._failName = null;
  }
});

test('saveSession: en skrivefeil som ikke er kvote påstår ikke «full»', async () => {
  const { Store, storage } = freshStore();
  storage._failName = 'SecurityError';
  try {
    await Store.saveSession(sessionStub());
    assert.fail('skulle kastet');
  } catch (err) {
    assert.doesNotMatch(err.message, /ledig lagringsplass/);
  } finally {
    storage._failName = null;
  }
});

/* ---------- deepCopy: en sirkulær struktur gir en lesbar feil ---------- */

test('saveSession på en sirkulær struktur gir en norsk feil i stedet for en rå TypeError', async () => {
  const { Store } = freshStore();
  const circular = sessionStub();
  circular.self = circular;
  await assert.rejects(Store.saveSession(circular), /Kunne ikke kopiere/);
});
