'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../kasse-domain.js');

/* ---------- standardvalører ---------- */

test('DEFAULT_DENOMS har ni valører: fem sedler og fire mynter', () => {
  assert.equal(D.DEFAULT_DENOMS.length, 9);
  assert.equal(D.DEFAULT_DENOMS.filter(d => d.kind === 'note').length, 5);
  assert.equal(D.DEFAULT_DENOMS.filter(d => d.kind === 'coin').length, 4);
});

test('standardvalørene har riktige verdier i øre', () => {
  const byId = Object.fromEntries(D.DEFAULT_DENOMS.map(d => [d.id, d.value_ore]));
  assert.deepEqual(byId, {
    note_1000: 100000, note_500: 50000, note_200: 20000, note_100: 10000, note_50: 5000,
    coin_20: 2000, coin_10: 1000, coin_5: 500, coin_1: 100,
  });
});

test('alle myntene har riktig vekt og rullstørrelse (gulldata)', () => {
  const coins = D.DEFAULT_DENOMS.filter(d => d.kind === 'coin');
  const gram = Object.fromEntries(coins.map(d => [d.id, d.gram_per_unit]));
  assert.deepEqual(gram, { coin_20: 9.9, coin_10: 6.8, coin_5: 7.85, coin_1: 4.35 });
  const roll = Object.fromEntries(coins.map(d => [d.id, d.units_per_roll]));
  assert.deepEqual(roll, { coin_20: 25, coin_10: 40, coin_5: 40, coin_1: 50 });
});

test('sedlene har verken myntvekt eller rullstørrelse', () => {
  const notes = D.DEFAULT_DENOMS.filter(d => d.kind === 'note');
  for (const n of notes){
    assert.equal(n.gram_per_unit, null);
    assert.equal(n.units_per_roll, null);
  }
});

test('denomById returnerer null for ukjent id', () => {
  assert.equal(D.denomById(D.DEFAULT_DENOMS, 'coin_3'), null);
});

test('DEFAULT_DENOMS og hver valør er fryst mot endring', () => {
  assert.ok(Object.isFrozen(D.DEFAULT_DENOMS));
  const coin20 = D.denomById(D.DEFAULT_DENOMS, 'coin_20');
  assert.ok(Object.isFrozen(coin20));
  assert.throws(() => { coin20.value_ore = 1; }, TypeError);
  assert.throws(() => { D.DEFAULT_DENOMS.push({ id:'x' }); }, TypeError);
  assert.equal(D.denomById(D.DEFAULT_DENOMS, 'coin_20').value_ore, 2000);
});

test('KINDS og modulens eksportobjekt er fryst mot endring', () => {
  assert.ok(Object.isFrozen(D.KINDS));
  assert.throws(() => { D.KINDS.push('annet'); }, TypeError);
  assert.ok(Object.isFrozen(D));
});

/* ---------- validering ---------- */

const clone = list => JSON.parse(JSON.stringify(list));

test('standardvalørene er gyldige', () => {
  assert.deepEqual(D.validateDenoms(D.DEFAULT_DENOMS), { ok: true });
});

test('ugyldig input som ikke er en liste avvises med egen feilmelding', () => {
  for (const bad of [null, undefined, {}, 'valør', 42]) {
    const res = D.validateDenoms(bad);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Valørlista må være en liste.');
  }
});

test('tom liste avvises', () => {
  const res = D.validateDenoms([]);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Valørlista er tom.');
});

test('valør uten id avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  delete list[0].id;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /mangler id/i);
});

test('valør med tom id avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[0].id = '';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /mangler id/i);
});

test('id med bare mellomrom avvises som manglende', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[0].id = '   ';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /mangler id/i);
});

test('valør med id som ikke er en streng avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[0].id = 1000;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /mangler id/i);
});

test('duplikat id avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[1].id = list[0].id;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Duplikat valør-id/);
  assert.match(res.error, new RegExp(list[0].id));
});

test('id med mellomrom rundt seg avvises — den ville aldri blitt funnet av denomById', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[1].id = list[1].id + ' ';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /mellomrom/);
  assert.equal(D.denomById(list, list[1].id.trim()), null);   /* nettopp derfor */
});

test('valør uten etikett avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').label = '';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /etikett/i);
  assert.match(res.error, /note_100/);
});

test('etikett med bare mellomrom avvises som tom', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').label = '   ';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /etikett/i);
  assert.match(res.error, /note_100/);
});

test('duplikat etikett avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[1].label = list[0].label;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Duplikat etikett/);
  assert.match(res.error, new RegExp(list[0].label));
});

test('etikett med og uten omkringliggende mellomrom regnes som duplikat', () => {
  const list = clone(D.DEFAULT_DENOMS);
  list[1].label = list[0].label + ' ';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Duplikat etikett/);
});

test('ukjent valørtype avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').kind = 'bill';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /valørtype/);
  assert.match(res.error, /note_100/);
});

test('verdi på null eller negativ avvises', () => {
  const listNull = clone(D.DEFAULT_DENOMS);
  D.denomById(listNull, 'note_100').value_ore = 0;
  let res = D.validateDenoms(listNull);
  assert.equal(res.ok, false);
  assert.match(res.error, /Verdien/);
  assert.match(res.error, /note_100/);

  const listNeg = clone(D.DEFAULT_DENOMS);
  D.denomById(listNeg, 'note_100').value_ore = -10000;
  res = D.validateDenoms(listNeg);
  assert.equal(res.ok, false);
  assert.match(res.error, /Verdien/);
  assert.match(res.error, /note_100/);
});

test('verdi som ikke er et helt antall øre avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').value_ore = 100.5;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Verdien/);
  assert.match(res.error, /note_100/);
});

test('verdi over trygt heltallsområde avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').value_ore = 2 ** 53; // over Number.MAX_SAFE_INTEGER
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Verdien/);
  assert.match(res.error, /note_100/);
});

test('verdi som er NaN avvises uten å påstå at den er for lav', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').value_ore = NaN;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Verdien/);
  assert.match(res.error, /note_100/);
});

test('myntvekt på null eller mindre avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').gram_per_unit = 0;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Myntvekten/);
  assert.match(res.error, /coin_5/);
});

test('myntvekt som er Infinity avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').gram_per_unit = Infinity;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Myntvekten/);
  assert.match(res.error, /coin_5/);
});

test('myntvekt som er NaN gir en melding som ikke påstår at den er for lav', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').gram_per_unit = NaN; // f.eks. Number('7,85') fra et norsk komma-tastatur
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /tall/i);
  assert.match(res.error, /coin_5/);
});

test('myntvekt som tekststreng avvises selv om den kan tolkes som et tall', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').gram_per_unit = '7.85';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Myntvekten/);
  assert.match(res.error, /coin_5/);
});

test('rullstørrelse som ikke er et helt tall over null avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').units_per_roll = 2.5;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Rullstørrelsen/);
  assert.match(res.error, /coin_5/);
});

test('rullstørrelse på null avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').units_per_roll = 0;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Rullstørrelsen/);
  assert.match(res.error, /coin_5/);
});

test('rullstørrelse over trygt heltallsområde avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'coin_5').units_per_roll = 2 ** 53;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Rullstørrelsen/);
  assert.match(res.error, /coin_5/);
});

test('seddel som har myntvekt eller rullstørrelse avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  const note = D.denomById(list, 'note_50');
  note.gram_per_unit = 5;
  note.units_per_roll = 10;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Seddelen/);
  assert.match(res.error, /note_50/);
});

test('seddel med myntfeltene fraværende (ikke null) er gyldig', () => {
  const list = clone(D.DEFAULT_DENOMS);
  const note = D.denomById(list, 'note_50');
  delete note.gram_per_unit;
  delete note.units_per_roll;
  assert.deepEqual(D.validateDenoms(list), { ok: true });
});

test('sortering som ikke er et helt tall avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').sort = 1.5;
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Sortering/);
  assert.match(res.error, /note_100/);
});

test('aktiv-felt som ikke er boolsk avvises', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_100').active = 'ja';
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /Aktiv/);
  assert.match(res.error, /note_100/);
});

test('aktiv-felt som mangler helt regnes som aktiv', () => {
  const list = clone(D.DEFAULT_DENOMS).map(d => { delete d.active; return d; });
  assert.deepEqual(D.validateDenoms(list), { ok: true });
});

test('liste med noen inaktive valører er fortsatt gyldig', () => {
  const list = clone(D.DEFAULT_DENOMS);
  D.denomById(list, 'note_1000').active = false;
  D.denomById(list, 'coin_1').active = false;
  assert.deepEqual(D.validateDenoms(list), { ok: true });
});

test('liste der alle valører er inaktive avvises', () => {
  const list = clone(D.DEFAULT_DENOMS).map(d => Object.assign(d, { active: false }));
  const res = D.validateDenoms(list);
  assert.equal(res.ok, false);
  assert.match(res.error, /aktiv/i);
});

/* ---------- linjemate: løse + ruller ---------- */

const denoms = D.DEFAULT_DENOMS;
const line = extra => Object.assign({ denom_id:'coin_20', loose:0, rolls:0, grams:null, source:'manual' }, extra);

test('safe: løse mynter alene', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.unitsFor(line({ loose:15 }), d, 'safe'), 15);
});

test('safe: ruller ganges med rullstørrelsen og legges til de løse', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.unitsFor(line({ loose:15, rolls:4 }), d, 'safe'), 115);
});

test('safe: 4 ruller 20-kroner er 2 000 kr', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.lineValueOre(line({ rolls:4 }), d, 'safe'), 200000);
});

test('safe: sedler ignorerer rullefeltet', () => {
  const d = D.denomById(denoms, 'note_500');
  const l = line({ denom_id:'note_500', loose:6, rolls:99 });
  assert.equal(D.unitsFor(l, d, 'safe'), 6);
  assert.equal(D.lineValueOre(l, d, 'safe'), 300000);
});

test('åpning og lukking bruker antall og ignorerer ruller', () => {
  const d = D.denomById(denoms, 'coin_10');
  const l = line({ denom_id:'coin_10', loose:30, rolls:2 });
  assert.equal(D.unitsFor(l, d, 'opening'), 30);
  assert.equal(D.unitsFor(l, d, 'closing'), 30);
});

test('negative og desimale antall behandles som null eller avkortes', () => {
  const d = D.denomById(denoms, 'coin_1');
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', loose:-5 }), d, 'safe'), 0);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', loose:7.9 }), d, 'safe'), 7);
});

test('tom linje er null kroner', () => {
  const d = D.denomById(denoms, 'coin_5');
  assert.equal(D.lineValueOre(line({ denom_id:'coin_5' }), d, 'safe'), 0);
});

/* ---------- linjemate: robusthet mot mutasjon og ugyldig input ---------- */

test('safe: ruller på valører med annen rullstørrelse enn 25 telles riktig', () => {
  const d1 = D.denomById(denoms, 'coin_1');    // rullstørrelse 50
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', rolls:2 }), d1, 'safe'), 100);
  assert.equal(D.lineValueOre(line({ denom_id:'coin_1', rolls:2 }), d1, 'safe'), 10000);

  const d10 = D.denomById(denoms, 'coin_10');  // rullstørrelse 40
  assert.equal(D.unitsFor(line({ denom_id:'coin_10', rolls:3 }), d10, 'safe'), 120);
});

test('negative og desimale ruller behandles som null eller avkortes', () => {
  const d = D.denomById(denoms, 'coin_1');
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', loose:50, rolls:-3 }), d, 'safe'), 50);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', rolls:2.9 }), d, 'safe'), 100);
});

test('unitsFor uten valør er null enheter', () => {
  assert.equal(D.unitsFor(line({ loose:10, rolls:4 }), null, 'safe'), 0);
});

test('lineValueOre uten gyldig valør gir 0 kroner i stedet for å kaste', () => {
  assert.equal(D.lineValueOre(line({ loose:10 }), null, 'safe'), 0);
  assert.equal(D.lineValueOre(line({ loose:10 }), {}, 'safe'), 0);
});

test('valueOre ganger enheter med valørverdien', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.valueOre(5, d), 10000);
});

test('valueOre uten gyldig valør eller med uendelige enheter gir 0', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.valueOre(5, null), 0);
  assert.equal(D.valueOre(5, {}), 0);
  assert.equal(D.valueOre(Infinity, d), 0);
});

test('ukjent kind kaster i stedet for å telle stille feil', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.throws(() => D.unitsFor(line({ loose:5 }), d, 'Safe'), /Ukjent kind/);
  assert.throws(() => D.unitsFor(line({ loose:5 }), d, undefined), /Ukjent kind/);
  assert.throws(() => D.lineValueOre(line({ loose:5 }), d, 'safe '), /Ukjent kind/);
});

test('uendelig antall (f.eks. "1e999" fra et tallfelt) gir 0 enheter, ikke Infinity', () => {
  const d = D.denomById(denoms, 'coin_1');
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', loose:'1e999' }), d, 'safe'), 0);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', rolls:Infinity }), d, 'safe'), 0);
});

test('tom streng i løse-feltet gir 0 kroner', () => {
  const d = D.denomById(denoms, 'coin_5');
  assert.equal(D.lineValueOre(line({ denom_id:'coin_5', loose:'' }), d, 'safe'), 0);
});

/* ---------- vekt → antall ---------- */

test('vekt utleder antall mynt: 99 g 20-kroner er 10 mynter', () => {
  const d = D.denomById(denoms, 'coin_20');
  const l = line({ grams:99, source:'weight' });
  assert.equal(D.unitsFor(l, d, 'opening'), 10);
  assert.equal(D.lineValueOre(l, d, 'opening'), 20000);
});

test('vekt avrundes til nærmeste hele mynt', () => {
  const d = D.denomById(denoms, 'coin_1');           /* 4,35 g */
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:43.5, source:'weight' }), d, 'opening'), 10);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:45.0, source:'weight' }), d, 'opening'), 10);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:47.0, source:'weight' }), d, 'opening'), 11);
});

test('vekt null eller tom gir null mynter', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.unitsFor(line({ grams:0, source:'weight' }), d, 'opening'), 0);
  assert.equal(D.unitsFor(line({ grams:null, source:'weight' }), d, 'opening'), 0);
});

test('vekt brukes ikke når kilden er manuell', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.unitsFor(line({ loose:3, grams:99, source:'manual' }), d, 'opening'), 3);
});

test('vekt brukes ikke i safe-delen', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.unitsFor(line({ loose:3, grams:99, source:'weight' }), d, 'safe'), 3);
});

test('vekt brukes ikke på sedler', () => {
  const d = D.denomById(denoms, 'note_100');
  assert.equal(D.unitsFor(line({ denom_id:'note_100', loose:2, grams:99, source:'weight' }), d, 'opening'), 2);
});

/* ---------- vektkontroll ---------- */

test('vekt som treffer et helt antall mynt gir ingen advarsel', () => {
  const d = D.denomById(denoms, 'coin_20');          /* 9,9 g, grense 3,96 g */
  assert.equal(D.weightWarning(line({ grams:99, source:'weight' }), d, 'opening'), null);
});

test('vekt like innenfor grensen gir ingen advarsel', () => {
  const d = D.denomById(denoms, 'coin_20');          /* grense = 0,4 × 9,9 = 3,96 g */
  assert.equal(D.weightWarning(line({ grams:99 + 3.9, source:'weight' }), d, 'opening'), null);
});

test('vekt utenfor grensen gir advarsel', () => {
  const d = D.denomById(denoms, 'coin_20');
  const w = D.weightWarning(line({ grams:99 + 4.5, source:'weight' }), d, 'opening');
  assert.ok(w, 'forventet advarsel');
  assert.equal(w.units, 10);
  assert.ok(w.residual > w.limit);
});

test('vekt under nærmeste hele mynt gir også advarsel (Math.abs, ikke bare over)', () => {
  const d = D.denomById(denoms, 'coin_20');          /* 94,5 g er 4,5 g under 10 mynter */
  const w = D.weightWarning(line({ grams:94.5, source:'weight' }), d, 'opening');
  assert.ok(w, 'forventet advarsel ved undervekt');
  assert.equal(w.units, 10);
  assert.ok(w.residual > w.limit);
});

test('vektadvarselens antall stemmer alltid med unitsFor sitt antall (avrunding, ikke nedrunding)', () => {
  const d = D.denomById(denoms, 'coin_20');          /* 104,5 g: runder til 11, ville nedrundet til 10 */
  const l = line({ grams:104.5, source:'weight' });
  const units = D.unitsFor(l, d, 'opening');
  assert.equal(units, 11);
  const w = D.weightWarning(l, d, 'opening');
  assert.ok(w, 'forventet advarsel');
  assert.equal(w.units, units);
});

test('manuelle linjer gir aldri vektadvarsel', () => {
  const coin = D.denomById(denoms, 'coin_20');
  assert.equal(D.weightWarning(line({ grams:103.5, source:'manual' }), coin, 'opening'), null);
});

test('sedler gir aldri vektadvarsel, selv med en (ugyldig) positiv myntvekt', () => {
  /* note_100 har gram_per_unit:null og ville falt gjennom finite-sjekken uansett —
     det ville gjort kind-sjekken usynlig testet. Denne seddelen har en gyldig,
     positiv (men ugyldig for en seddel) myntvekt og en vekt som ville gitt et
     ekte utslag dersom kind-sjekken manglet, så testen er faktisk avhengig av den. */
  const bogusNote = { id:'note_100', kind:'note', value_ore:10000, gram_per_unit:9.9 };
  const l = line({ denom_id:'note_100', grams:103.5, source:'weight' });
  assert.equal(D.weightWarning(l, bogusNote, 'opening'), null);
});

/* ---------- vekt: kind-parameteren ---------- */

test('vektadvarsel: safe returnerer alltid null, selv ved stort avvik', () => {
  const d = D.denomById(denoms, 'coin_20');
  const l = line({ grams:103.5, source:'weight' });   /* ville gitt advarsel utenfor safe */
  assert.equal(D.weightWarning(l, d, 'safe'), null);
});

test('vektadvarsel: opening og closing gir samme resultat for samme linje', () => {
  const d = D.denomById(denoms, 'coin_20');
  const l = line({ grams:103.5, source:'weight' });
  const wOpening = D.weightWarning(l, d, 'opening');
  const wClosing = D.weightWarning(l, d, 'closing');
  assert.ok(wOpening);
  assert.deepEqual(wOpening, wClosing);
});

test('vektadvarsel kaster på ukjent kind, akkurat som unitsFor', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.throws(() => D.weightWarning(line({ grams:99, source:'weight' }), d, 'Safe'), /Ukjent kind/);
  assert.throws(() => D.weightWarning(line({ grams:99, source:'weight' }), d, undefined), /Ukjent kind/);
});

/* ---------- vekt: robusthet mot mutasjon og ugyldig input ---------- */

test('negativ vekt gir null mynter og ingen advarsel', () => {
  const d = D.denomById(denoms, 'coin_20');
  const l = line({ grams:-50, source:'weight' });
  assert.equal(D.unitsFor(l, d, 'opening'), 0);
  assert.equal(D.weightWarning(l, d, 'opening'), null);
});

test('uendelig eller ikke-numerisk vekt gir null mynter og ingen advarsel', () => {
  const d = D.denomById(denoms, 'coin_1');
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:Infinity, source:'weight' }), d, 'opening'), 0);
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:'1e999', source:'weight' }), d, 'opening'), 0);
  assert.equal(D.weightWarning(line({ denom_id:'coin_1', grams:Infinity, source:'weight' }), d, 'opening'), null);
  assert.equal(D.weightWarning(line({ denom_id:'coin_1', grams:'1e999', source:'weight' }), d, 'opening'), null);
});

test('vekt tastet med komma som desimalskilletegn tolkes som norsk desimaltall', () => {
  const d = D.denomById(denoms, 'coin_1');           /* 4,35 g */
  assert.equal(D.unitsFor(line({ denom_id:'coin_1', grams:'43,5', source:'weight' }), d, 'opening'), 10);
  assert.equal(D.lineValueOre(line({ denom_id:'coin_1', grams:'43,5', source:'weight' }), d, 'opening'), 1000);
});

test('valør med manglende myntvekt gir null mynter uten å krasje', () => {
  const list = clone(denoms);
  const d = D.denomById(list, 'coin_5');
  delete d.gram_per_unit;
  assert.equal(D.unitsFor(line({ denom_id:'coin_5', grams:100, source:'weight' }), d, 'opening'), 0);
  assert.equal(D.weightWarning(line({ denom_id:'coin_5', grams:100, source:'weight' }), d, 'opening'), null);
});

test('valør med myntvekt lik null gir null mynter uten å krasje', () => {
  const list = clone(denoms);
  const d = D.denomById(list, 'coin_5');
  d.gram_per_unit = 0;
  assert.equal(D.unitsFor(line({ denom_id:'coin_5', grams:100, source:'weight' }), d, 'closing'), 0);
  assert.equal(D.weightWarning(line({ denom_id:'coin_5', grams:100, source:'weight' }), d, 'closing'), null);
});

test('weightWarning med manglende linje eller valør gir null', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.equal(D.weightWarning(null, d, 'opening'), null);
  assert.equal(D.weightWarning(line({ grams:99, source:'weight' }), null, 'opening'), null);
});

test('vekt på en annen mynt enn 20-kroner bruker riktig myntvekt (coin_10)', () => {
  const d = D.denomById(denoms, 'coin_10');   /* 6,8 g */
  const l = line({ denom_id:'coin_10', grams:68, source:'weight' });
  assert.equal(D.unitsFor(l, d, 'closing'), 10);
  assert.equal(D.lineValueOre(l, d, 'closing'), 10000);
  assert.equal(D.weightWarning(l, d, 'closing'), null);
  const warnLine = line({ denom_id:'coin_10', grams:68 + 3, source:'weight' });   /* grense = 0,4 × 6,8 = 2,72 g */
  const w = D.weightWarning(warnLine, d, 'closing');
  assert.ok(w);
  assert.equal(w.units, 10);
});

test('vektgrense: akkurat på grensen varsler ikke (streng >, ikke >=)', () => {
  const d = { id:'coin_test', kind:'coin', value_ore:1000, gram_per_unit:10, units_per_roll:10 };
  const l = line({ denom_id:'coin_test', grams:54, source:'weight' });   /* 5 mynter × 10 g + grense 4 g nøyaktig */
  assert.equal(D.weightWarning(l, d, 'opening'), null);
});

test('vektgrense: rett over grensen varsler', () => {
  const d = { id:'coin_test', kind:'coin', value_ore:1000, gram_per_unit:10, units_per_roll:10 };
  const l = line({ denom_id:'coin_test', grams:54.01, source:'weight' });
  const w = D.weightWarning(l, d, 'opening');
  assert.ok(w);
  assert.equal(w.units, 5);
  assert.ok(w.residual > w.limit);
});

test('unitsFor kaster på ukjent kind selv for en vektlinje', () => {
  const d = D.denomById(denoms, 'coin_20');
  assert.throws(() => D.unitsFor(line({ grams:99, source:'weight' }), d, 'Safe'), /Ukjent kind/);
});

test('WEIGHT_TOLERANCE eksporteres og er 0,4', () => {
  assert.equal(D.WEIGHT_TOLERANCE, 0.4);
});

/* ---------- summer ---------- */

const sectionOf = lines => ({ lines, total_ore:0, target_ore:D.SAFE_TARGET_ORE });

test('seksjonssum legger sammen alle linjene', () => {
  const s = sectionOf([
    line({ denom_id:'note_1000', loose:2 }),      /* 2 000 kr */
    line({ denom_id:'note_500',  loose:6 }),      /* 3 000 kr */
    line({ denom_id:'coin_20',   loose:15, rolls:4 }),  /* 115 × 20 = 2 300 kr */
    line({ denom_id:'coin_10',   loose:30, rolls:2 }),  /* 110 × 10 = 1 100 kr */
  ]);
  assert.equal(D.sectionTotalOre(s, denoms, 'safe'), 840000);
});

test('seksjonssum hopper over linjer med ukjent valør', () => {
  const s = sectionOf([ line({ denom_id:'coin_3', loose:10 }), line({ denom_id:'note_100', loose:1 }) ]);
  assert.equal(D.sectionTotalOre(s, denoms, 'safe'), 10000);
});

test('alle ni valører fulltalt gir eksakt heltall i øre, uten flyttallsdrift', () => {
  const s = sectionOf(denoms.map(d => line({ denom_id:d.id, loose:7 })));
  const expected = denoms.reduce((sum, d) => sum + 7 * d.value_ore, 0);
  const total = D.sectionTotalOre(s, denoms, 'opening');
  assert.equal(total, expected);
  assert.ok(Number.isInteger(total));
});

/* ---------- avvik ---------- */

const sessionWith = (safe, opening, closing) => ({
  sections: {
    safe:    { lines:[], total_ore:safe,    target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[], total_ore:opening },
    closing: { lines:[], total_ore:closing },
  },
});

test('safe-avvik er null når safen stemmer', () => {
  assert.equal(D.safeDiffOre(sessionWith(1000000, 0, 0)), 0);
});

test('safe-avvik er negativt når det mangler penger', () => {
  assert.equal(D.safeDiffOre(sessionWith(840000, 0, 0)), -160000);
});

test('safe-avvik er positivt når det er for mye penger', () => {
  assert.equal(D.safeDiffOre(sessionWith(1005000, 0, 0)), 5000);
});

test('endring i kassen er lukking minus åpning', () => {
  assert.equal(D.dayChangeOre(sessionWith(1000000, 200000, 475000)), 275000);
});

/* ---------- recalc ---------- */

test('recalc fyller units og value_ore på hver linje og summerer seksjonen', () => {
  const session = D.newSession(denoms, '2026-07-25');
  const safeLine = session.sections.safe.lines.find(l => l.denom_id === 'coin_20');
  safeLine.loose = 15; safeLine.rolls = 4;
  D.recalc(session, denoms);
  assert.equal(safeLine.units, 115);
  assert.equal(safeLine.value_ore, 230000);
  assert.equal(session.sections.safe.total_ore, 230000);
  assert.equal(session.sections.opening.total_ore, 0);
});

/* ---------- egne tester: robusthet (oppgave 4) ---------- */

test('seksjonssum er 0 for manglende seksjon eller seksjon uten linjeliste', () => {
  assert.equal(D.sectionTotalOre(null, denoms, 'safe'), 0);
  assert.equal(D.sectionTotalOre(undefined, denoms, 'safe'), 0);
  assert.equal(D.sectionTotalOre({ lines:'ikke en liste', total_ore:0 }, denoms, 'safe'), 0);
});

test('recalc rører ikke en manglende seksjon og krasjer ikke', () => {
  const session = { sections: {
    safe:    { lines:[ line({ denom_id:'coin_20', loose:5 }) ], total_ore:0, target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[], total_ore:0 },
    /* closing mangler helt */
  } };
  D.recalc(session, denoms);
  assert.equal(session.sections.safe.total_ore, 10000);
  assert.equal(session.sections.closing, undefined);
});

test('recalc nullstiller units og value_ore igjen når et antall settes til null', () => {
  const l = line({ denom_id:'coin_10', loose:30 });
  const session = { sections: {
    safe:    { lines:[], total_ore:0, target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[l], total_ore:0 },
    closing: { lines:[], total_ore:0 },
  } };
  D.recalc(session, denoms);
  assert.equal(l.units, 30);
  assert.equal(l.value_ore, 30000);
  l.loose = 0;
  D.recalc(session, denoms);
  assert.equal(l.units, 0);
  assert.equal(l.value_ore, 0);
  assert.equal(session.sections.opening.total_ore, 0);
});

test('safe-avvik uten target_ore behandler målet som null', () => {
  assert.equal(D.safeDiffOre({ sections:{
    safe:{ lines:[], total_ore:5000 }, opening:{ lines:[], total_ore:0 }, closing:{ lines:[], total_ore:0 },
  } }), 5000);
});

test('recalc summerer faktisk value_ore-feltene, ikke en uavhengig beregning (dupliserte valør-id-er telles begge)', () => {
  const first = line({ denom_id:'coin_20', loose:5 });
  const second = line({ denom_id:'coin_20', loose:3 });
  const session = { sections: {
    safe:    { lines:[first, second], total_ore:0, target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[], total_ore:0 },
    closing: { lines:[], total_ore:0 },
  } };
  D.recalc(session, denoms);
  assert.equal(session.sections.safe.total_ore, session.sections.safe.lines.reduce((s, x) => s + x.value_ore, 0));
  assert.equal(session.sections.safe.total_ore, 16000);
});

/* ---------- økt ---------- */

test('ny økt har tre deler med én linje per aktiv valør', () => {
  const s = D.newSession(denoms, '2026-07-25');
  assert.equal(s.session_date, '2026-07-25');
  assert.equal(s.status, 'draft');
  for (const kind of D.KINDS) assert.equal(s.sections[kind].lines.length, 9, kind);
});

test('ny økt har mål kun på safe', () => {
  const s = D.newSession(denoms, '2026-07-25');
  assert.equal(s.sections.safe.target_ore, 1000000);
  assert.equal(s.sections.opening.target_ore, undefined);
  assert.equal(s.sections.closing.target_ore, undefined);
});

test('ny økt hopper over deaktiverte valører', () => {
  const list = clone(denoms);
  D.denomById(list, 'note_200').active = false;
  const s = D.newSession(list, '2026-07-25');
  assert.equal(s.sections.safe.lines.length, 8);
  assert.equal(s.sections.safe.lines.some(l => l.denom_id === 'note_200'), false);
});

test('de tre delene deler ikke linjeobjekter', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines[0].loose = 5;
  assert.equal(s.sections.opening.lines[0].loose, 0);
});

test('syncLines legger til nye valører og beholder tall som er tastet inn', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines.find(l => l.denom_id === 'coin_20').loose = 12;
  const list = clone(denoms).concat([
    { id:'coin_50', kind:'coin', label:'50 kr mynt', value_ore:5000, gram_per_unit:12.5, units_per_roll:20, sort:55, active:true },
  ]);
  D.syncLines(s, list);
  assert.equal(s.sections.safe.lines.length, 10);
  assert.equal(s.sections.safe.lines.find(l => l.denom_id === 'coin_20').loose, 12);
  assert.equal(s.sections.safe.lines.find(l => l.denom_id === 'coin_50').loose, 0);
});

test('syncLines fjerner linjer for deaktiverte valører', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const list = clone(denoms);
  D.denomById(list, 'coin_1').active = false;
  D.syncLines(s, list);
  assert.equal(s.sections.safe.lines.some(l => l.denom_id === 'coin_1'), false);
});

/* ---------- finalize ---------- */

const user = { tag:'MORT', name:'Morten Berg' };

test('finalize regner ut summer, setter teller og tidsstempel, og status blir lagret', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines.find(l => l.denom_id === 'note_1000').loose = 10;
  const out = D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z');
  assert.equal(out.sections.safe.total_ore, 1000000);
  assert.equal(out.status, 'saved');
  assert.deepEqual(out.counted_by, { tag:'MORT', name:'Morten Berg' });
  assert.equal(out.counted_at, '2026-07-25T09:00:00.000Z');
});

test('finalize rører ikke originalen', () => {
  const s = D.newSession(denoms, '2026-07-25');
  D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z');
  assert.equal(s.status, 'draft');
  assert.equal(s.counted_by, null);
});

test('finalize beholder opprinnelig teller og tidspunkt ved ny lagring', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const first = D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z');
  const second = D.finalizeSession(first, denoms, { tag:'ANNA', name:'Anna Lie' }, '2026-07-25T17:00:00.000Z');
  assert.deepEqual(second.counted_by, { tag:'MORT', name:'Morten Berg' });
  assert.equal(second.counted_at, '2026-07-25T09:00:00.000Z');
});

test('finalize beholder godkjent status', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.status = 'verified';
  assert.equal(D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z').status, 'verified');
});

test('valørsnapshotet fryses: senere endring av myntvekt rører ikke lagret økt', () => {
  const list = clone(denoms);
  const s = D.newSession(list, '2026-07-25');
  const saved = D.finalizeSession(s, list, user, '2026-07-25T09:00:00.000Z');
  D.denomById(list, 'coin_20').gram_per_unit = 42;
  assert.equal(D.denomById(saved.denom_snapshot, 'coin_20').gram_per_unit, 9.9);
});

/* ---------- egne tester: robusthet (oppgave 5) ---------- */

test('en ny linje har fullt feltsett: loose, rolls, grams og source, ikke bare loose', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const l = s.sections.opening.lines.find(x => x.denom_id === 'coin_20');
  assert.deepEqual(l, { denom_id:'coin_20', loose:0, rolls:0, grams:null, source:'manual' });
});

test('ny økt med tom valørliste gir tomme seksjoner uten å krasje', () => {
  const s = D.newSession([], '2026-07-25');
  for (const kind of D.KINDS) assert.deepEqual(s.sections[kind].lines, []);
});

test('ny økt der alle valører er inaktive gir tomme seksjoner', () => {
  const list = clone(denoms).map(d => Object.assign(d, { active:false }));
  const s = D.newSession(list, '2026-07-25');
  for (const kind of D.KINDS) assert.equal(s.sections[kind].lines.length, 0);
});

test('syncLines beholder grams og source på en vektlinje, ikke bare loose', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const l = s.sections.opening.lines.find(x => x.denom_id === 'coin_20');
  l.grams = 103.5; l.source = 'weight';
  D.syncLines(s, denoms);
  const after = s.sections.opening.lines.find(x => x.denom_id === 'coin_20');
  assert.equal(after.grams, 103.5);
  assert.equal(after.source, 'weight');
});

test('syncLines kalt to ganger på rad er stabil', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines.find(x => x.denom_id === 'coin_10').loose = 7;
  D.syncLines(s, denoms);
  D.syncLines(s, denoms);
  assert.equal(s.sections.safe.lines.length, 9);
  assert.equal(s.sections.safe.lines.find(x => x.denom_id === 'coin_10').loose, 7);
});

test('finalize dypkopierer: å endre en linje på resultatet rører ikke originalens linjeobjekt', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const out = D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z');
  out.sections.safe.lines[0].loose = 999;
  assert.equal(s.sections.safe.lines[0].loose, 0);
});

test('denom_snapshot er uavhengig i begge retninger: å endre snapshotet rører ikke inndata-lista', () => {
  const list = clone(denoms);
  const s = D.newSession(list, '2026-07-25');
  const saved = D.finalizeSession(s, list, user, '2026-07-25T09:00:00.000Z');
  D.denomById(saved.denom_snapshot, 'coin_20').gram_per_unit = 999;
  assert.equal(D.denomById(list, 'coin_20').gram_per_unit, 9.9);
});

/* ---------- formatering ---------- */

test('formatOre grupperer tusen med ikke-brytende mellomrom og legger på kr', () => {
  assert.equal(D.formatOre(0), '0 kr');
  assert.equal(D.formatOre(100000), '1 000 kr');
  assert.equal(D.formatOre(1000000), '10 000 kr');
  assert.equal(D.formatOre(123456700), '1 234 567 kr');
});

test('formatOre viser desimaler kun når beløpet ikke er hele kroner', () => {
  assert.equal(D.formatOre(50), '0,50 kr');
  assert.equal(D.formatOre(100050), '1 000,50 kr');
});

test('formatOre viser minus for negative beløp', () => {
  assert.equal(D.formatOre(-160000), '-1 600 kr');
});

test('formatDiffOre setter fortegn også på positive avvik', () => {
  assert.equal(D.formatDiffOre(5000), '+50 kr');
  assert.equal(D.formatDiffOre(-160000), '-1 600 kr');
  assert.equal(D.formatDiffOre(0), '0 kr');
});

test('formatGrams bruker desimalkomma og én desimal', () => {
  assert.equal(D.formatGrams(99), '99,0 g');
  assert.equal(D.formatGrams(103.46), '103,5 g');
});

/* ---------- egne tester: robusthet (oppgave 6) ---------- */

test('formatOre avkortes mot null ved ikke-heltall øre, som toCount ellers i modulen', () => {
  assert.equal(D.formatOre(123.7), '1,23 kr');
  assert.equal(D.formatOre(-123.7), '-1,23 kr');
});

test('formatOre gir 0 kr for NaN og undefined i stedet for å krasje eller skrive "NaN kr"', () => {
  assert.equal(D.formatOre(NaN), '0 kr');
  assert.equal(D.formatOre(undefined), '0 kr');
});

test('formatOre grupperer riktig med flere tusenskiller (milliarder)', () => {
  assert.equal(D.formatOre(100000000000), '1 000 000 000 kr');
});

test('tusenskilletegnet er et ikke-brytende mellomrom (U+00A0), ikke et vanlig mellomrom', () => {
  assert.equal(D.formatOre(1000000), '10 000 kr');
  assert.equal(D.formatOre(1000000).charCodeAt(2), 0xA0);
});

test('formatOre og formatDiffOre viser "0 kr" for minus null, ikke "-0 kr"', () => {
  assert.equal(D.formatOre(-0), '0 kr');
  assert.equal(D.formatDiffOre(-0), '0 kr');
});

test('formatDiffOre setter pluss også for beløp under én krone', () => {
  assert.equal(D.formatDiffOre(50), '+0,50 kr');
});

test('formatGrams runder halvveis oppover ved .05-grensen', () => {
  assert.equal(D.formatGrams(0.05), '0,1 g');
  assert.equal(D.formatGrams(0.15), '0,2 g');
});

test('formatGrams behandler negativ vekt som "ingen vekt registrert", samme kontrakt som toGrams', () => {
  assert.equal(D.formatGrams(-5), '0,0 g');
  assert.equal(D.formatGrams(-0.03), '0,0 g');
});

test('formatOre nullstiller enkeltsifret øre-rest med en ledende null (5 øre er 0,05 kr, ikke 0,5 kr)', () => {
  assert.equal(D.formatOre(5), '0,05 kr');
  assert.equal(D.formatOre(105), '1,05 kr');
});

/* ---------- revisjon: samme harding i hele modulen ---------- */

/* -- 1: syncLines skal ikke forkaste talte penger på en deaktivert valør -- */

test('syncLines beholder en linje for en deaktivert valør når den har en telling, og fjerner den kun når den er tom', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines.find(l => l.denom_id === 'coin_1').loose = 5;
  const list = clone(denoms);
  D.denomById(list, 'coin_1').active = false;
  D.syncLines(s, list);
  assert.equal(s.sections.safe.lines.some(l => l.denom_id === 'coin_1'), true);
  assert.equal(s.sections.safe.lines.find(l => l.denom_id === 'coin_1').loose, 5);
});

test('recalc og syncLines er enige om summen for en nettopp deaktivert valør med telte penger', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.sections.safe.lines.find(l => l.denom_id === 'coin_20').loose = 5;
  const list = clone(denoms);
  D.denomById(list, 'coin_20').active = false;
  D.recalc(s, list);
  const totalBefore = s.sections.safe.total_ore;
  D.syncLines(s, list);
  D.recalc(s, list);
  assert.equal(s.sections.safe.total_ore, totalBefore);
  assert.equal(s.sections.safe.total_ore, 10000);
});

/* -- 2: syncLines skal tåle det samme rotete inndataet recalc allerede tåler -- */

test('syncLines på en manglende økt, en økt uten seksjoner, eller en seksjon uten linjeliste krasjer ikke', () => {
  assert.doesNotThrow(() => D.syncLines(null, denoms));
  assert.doesNotThrow(() => D.syncLines({}, denoms));
  const session = { sections: {
    safe:    { lines:'ikke en liste', total_ore:0, target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[], total_ore:0 },
    /* closing mangler helt */
  } };
  assert.doesNotThrow(() => D.syncLines(session, denoms));
  assert.equal(session.sections.opening.lines.length, 9);
  assert.equal(session.sections.safe.lines, 'ikke en liste');
});

test('syncLines med en ugyldig (ikke-liste) valørliste krasjer ikke', () => {
  const s = D.newSession(denoms, '2026-07-25');
  assert.doesNotThrow(() => D.syncLines(s, null));
  assert.doesNotThrow(() => D.syncLines(s, undefined));
});

test('newSession med en ugyldig (ikke-liste) valørliste gir tomme seksjoner uten å krasje', () => {
  assert.doesNotThrow(() => D.newSession(null, '2026-07-25'));
  const s = D.newSession(undefined, '2026-07-25');
  for (const kind of D.KINDS) assert.deepEqual(s.sections[kind].lines, []);
});

/* -- 3: formatOre skal ikke la Infinity gjennom, og valueOre skal ikke overflowe -- */

test('formatOre gir 0 kr for Infinity og -Infinity i stedet for "Infinity,NaN kr"', () => {
  assert.equal(D.formatOre(Infinity), '0 kr');
  assert.equal(D.formatOre(-Infinity), '0 kr');
  assert.equal(D.formatDiffOre(Infinity), '+0 kr');
});

test('valueOre gir 0 når produktet overskrider trygt heltallsområde, i stedet for et tall JSON.stringify ikke kan lagre', () => {
  const d = D.denomById(denoms, 'note_100');   // value_ore 10000
  const result = D.valueOre(1e300, d);
  assert.equal(result, 0);
  assert.equal(JSON.stringify({ total_ore: result }), '{"total_ore":0}');
});

test('en absurd stor telling gir 0 kr på linja i stedet for et JSON-usikkert tall', () => {
  const d = D.denomById(denoms, 'note_100');
  const l = line({ denom_id:'note_100', loose:1e300 });
  assert.equal(D.lineValueOre(l, d, 'safe'), 0);
});

/* -- 4: formatGrams skal dele kontrakt med toGrams -- */

test('formatGrams tolker komma som desimalskilletegn, samme kontrakt som toGrams', () => {
  assert.equal(D.formatGrams('103,5'), '103,5 g');
  assert.equal(D.formatGrams('99'), '99,0 g');
});

test('formatGrams gir 0,0 g for uendelig eller ikke-numerisk input, ikke "Infinity g"', () => {
  assert.equal(D.formatGrams(Infinity), '0,0 g');
  assert.equal(D.formatGrams('boots'), '0,0 g');
});

/* -- 6: safeDiffOre og dayChangeOre skal være like defensive som total_ore/target_ore selv -- */

test('safe-avvik på en økt uten safe-seksjon gir 0 i stedet for å kaste', () => {
  assert.equal(D.safeDiffOre({ sections:{} }), 0);
  assert.equal(D.safeDiffOre({}), 0);
});

test('endring i kassen på en økt uten opening- eller closing-seksjon gir 0 i stedet for å kaste', () => {
  assert.equal(D.dayChangeOre({ sections:{} }), 0);
  assert.equal(D.dayChangeOre({}), 0);
});

/* -- 7: recalc skal ikke la et foreldet total_ore stå igjen på en seksjon den hopper over -- */

test('recalc nullstiller et foreldet total_ore på en seksjon den hopper over', () => {
  const session = { sections: {
    safe:    { lines:'ikke en liste', total_ore:99999, target_ore:D.SAFE_TARGET_ORE },
    opening: { lines:[], total_ore:0 },
    closing: { lines:[], total_ore:0 },
  } };
  D.recalc(session, denoms);
  assert.equal(session.sections.safe.total_ore, 0);
});

/* -- 8: finalizeSession skal whitelist-e status akkurat som KINDS whitelister kind -- */

test('STATUSES eksporteres, er fryst, og inneholder de tre kjente øktstatusene', () => {
  assert.deepEqual(D.STATUSES, ['draft', 'saved', 'verified']);
  assert.ok(Object.isFrozen(D.STATUSES));
});

test('finalize kaster på en status utenfor STATUSES, akkurat som unitsFor kaster på en kind utenfor KINDS', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.status = 'verifyed';   // skrivefeil
  assert.throws(() => D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z'), /Ukjent status/);
});

test('finalize på en kjent, ikke-godkjent status blir alltid saved', () => {
  const s = D.newSession(denoms, '2026-07-25');
  s.status = 'saved';
  assert.equal(D.finalizeSession(s, denoms, user, '2026-07-25T09:00:00.000Z').status, 'saved');
});

/* -- 9: en teller uten tag skal ikke låse counted_by, og counted_at skal ikke stå alene -- */

test('finalize med en teller uten tag lar counted_by og counted_at stå urørt, i stedet for å låse dem for alltid', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const out = D.finalizeSession(s, denoms, {}, '2026-07-25T09:00:00.000Z');
  assert.equal(out.counted_by, null);
  assert.equal(out.counted_at, null);
  const second = D.finalizeSession(out, denoms, user, '2026-07-25T17:00:00.000Z');
  assert.deepEqual(second.counted_by, { tag:'MORT', name:'Morten Berg' });
  assert.equal(second.counted_at, '2026-07-25T17:00:00.000Z');
});

test('finalize uten noen bruker i det hele tatt lar counted_by og counted_at stå urørt', () => {
  const s = D.newSession(denoms, '2026-07-25');
  const out = D.finalizeSession(s, denoms, null, '2026-07-25T09:00:00.000Z');
  assert.equal(out.counted_by, null);
  assert.equal(out.counted_at, null);
});

/* -- 10: toCount/toGrams eksporteres, slik at sidelaget kan gjenbruke den testede
   inndata-klampingen i stedet for å skrive sin egen (kodegjennomgangsfunn:
   kasse.html hadde egen Math.max(0, Math.trunc(...))-logikk for antall/ruller,
   og egen komma-erstatning for gram, som ikke lenger var i takt med denne
   kontrakten etter at gramfeltet gikk fra type="number" til type="text"). -- */

test('toCount eksporteres og klamper til et ikke-negativt heltall', () => {
  assert.equal(D.toCount(7.9), 7);
  assert.equal(D.toCount(-5), 0);
  assert.equal(D.toCount('12'), 12);
  assert.equal(D.toCount('0'), 0);
});

test('toCount gir 0 for ikke-tall og ikke-endelige verdier', () => {
  assert.equal(D.toCount('abc'), 0);
  assert.equal(D.toCount(Infinity), 0);
  assert.equal(D.toCount(NaN), 0);
  assert.equal(D.toCount(undefined), 0);
  assert.equal(D.toCount(null), 0);
});

test('toGrams eksporteres og godtar komma som desimalskilletegn', () => {
  assert.equal(D.toGrams('103,5'), 103.5);
  assert.equal(D.toGrams('103.5'), 103.5);
  assert.equal(D.toGrams(99), 99);
});

test('toGrams behandler null, negativ og ikke-positiv vekt som «ingen vekt registrert» (0)', () => {
  assert.equal(D.toGrams(0), 0);
  assert.equal(D.toGrams(-1), 0);
  assert.equal(D.toGrams(null), 0);
  assert.equal(D.toGrams(undefined), 0);
});

test('toGrams gir 0 for ikke-tall og ikke-endelige verdier, inkludert "1e999"', () => {
  assert.equal(D.toGrams('abc'), 0);
  assert.equal(D.toGrams(Infinity), 0);
  assert.equal(D.toGrams('1e999'), 0);
});
