const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../db/node_modules/jsdom');
const guides = require('../wiki-guides.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=';
const JPEG = 'data:image/jpeg;base64,/9j/2Q==';
const copy = value => JSON.parse(JSON.stringify(value));

function step(title, kind = 'keys', value = 'Enter') {
  return { ...guides.blankStep(), title, kind, [kind === 'keys' ? 'keys' : 'label']: value };
}

function guide(steps = [step('Åpne søket', 'keys', 'Ctrl+F7')]) {
  return { version: 1, start: { description: 'Åpne Norsk Bildelkatalog.', image: null }, steps };
}

function documentFor(t, html = '<main></main>') {
  const dom = new JSDOM(html, { url: 'https://example.test/wiki.html' });
  t.after(() => dom.window.close());
  return dom.window.document;
}

function editorFor(t, initial = null) {
  const document = documentFor(t, '<form><main></main></form>');
  const host = document.querySelector('main');
  let changes = 0;
  const editor = new guides.Editor(host, () => changes++);
  editor.setValue(initial);
  const card = index => host.querySelector(`[data-guide-index="${index}"]`);
  const field = (index, name) => card(index).querySelector(`[data-field="${name}"]`);
  const enter = (index, name, value) => {
    const input = field(index, name);
    assert.ok(input, `Feltet ${index}/${name} finnes`);
    input.value = value;
    input.dispatchEvent(new document.defaultView.Event(name === 'kind' ? 'change' : 'input', { bubbles: true }));
  };
  const click = (index, op) => {
    const target = index == null ? host : card(index);
    const button = target.querySelector(`[data-op="${op}"]`);
    assert.ok(button, `Knappen ${index}/${op} finnes`);
    button.click();
  };
  return { document, host, editor, card, field, enter, click, changes: () => changes };
}

function parsed(t, value) {
  return documentFor(t, guides.render(value));
}

test('blank drafts are independent and cannot be saved before required fields are filled', () => {
  const first = guides.blank();
  const second = guides.blank();
  first.start.description = 'Endret';
  first.steps[0].title = 'Endret steg';
  assert.equal(second.start.description, '');
  assert.equal(second.steps[0].title, '');
  assert.equal(second.steps.length, 1);
  assert.equal(second.steps[0].image, null);
  assert.equal(second.steps[0].marker, null);
  assert.throws(() => guides.validate(second));
  assert.notStrictEqual(guides.blankStep(), guides.blankStep());
});

test('a blank editor can be completed, saved, reopened and edited without losing screenshots or markers', t => {
  const ui = editorFor(t);
  assert.throws(() => ui.editor.getValue());
  ui.enter('start', 'description', 'Start i kjøretøylisten.');
  ui.enter(0, 'title', 'Åpne artikkelsøk');
  ui.enter(0, 'keys', 'Ctrl+F7');
  ui.enter(0, 'description', 'Hold Ctrl nede mens du trykker F7.');
  ui.enter(0, 'result', 'Søkefeltet vises.');
  const saved = ui.editor.getValue();
  saved.start.image = PNG;
  saved.steps[0].image = JPEG;
  saved.steps[0].marker = { x: 12.5, y: 87.25 };
  ui.editor.setValue(saved);
  assert.equal(ui.host.querySelectorAll('img').length, 2);
  ui.enter(0, 'description', 'Trykk Ctrl og F7 samtidig.');
  const edited = ui.editor.getValue();
  assert.deepEqual(edited, {
    ...saved,
    steps: [{ ...saved.steps[0], description: 'Trykk Ctrl og F7 samtidig.' }],
  });
  const reopened = editorFor(t, edited);
  assert.deepEqual(reopened.editor.getValue(), edited);
  assert.equal(reopened.field(0, 'result').value, 'Søkefeltet vises.');
  assert.equal(reopened.host.querySelector('.guide-marker').style.left, '12.5%');
  assert.ok(ui.changes() >= 6, 'Endringer i skjemaet varsles til lagringen');
});

test('editor input and output are independent copies of the saved guide', t => {
  const saved = guide([{ ...step('Velg pære'), image: PNG, marker: { x: 20, y: 80 } }]);
  const expected = copy(saved);
  const { editor } = editorFor(t, saved);
  saved.start.description = 'Mutert utenfra';
  saved.steps[0].marker.x = 99;
  assert.deepEqual(editor.getValue(), expected);
  const result = editor.getValue();
  result.steps.splice(0, 1);
  assert.deepEqual(editor.getValue(), expected);
});

test('moving steps keeps descriptions, actions, screenshots and markers with their step', t => {
  const first = { ...step('Først', 'keys', 'F7'), image: PNG, marker: { x: 10, y: 20 }, result: 'Første resultat' };
  const second = { ...step('Deretter', 'type', 'W5W'), image: JPEG, marker: { x: 30, y: 40 }, description: 'Skriv pærekoden' };
  const third = step('Til slutt', 'click', 'Søk');
  const ui = editorFor(t, guide([first, second, third]));
  assert.equal(ui.card(0).querySelector('[data-op="up"]').disabled, true);
  assert.equal(ui.card(2).querySelector('[data-op="down"]').disabled, true);
  ui.click(1, 'up');
  assert.deepEqual(ui.editor.getValue().steps, [second, first, third]);
  assert.equal(ui.document.activeElement, ui.field(0, 'title'));
  ui.click(0, 'down');
  assert.deepEqual(ui.editor.getValue().steps, [first, second, third]);
  const view = parsed(t, ui.editor.getValue());
  assert.deepEqual(Array.from(view.querySelectorAll('.guide-step h3'), node => node.textContent), ['Først', 'Deretter', 'Til slutt']);
  assert.deepEqual(Array.from(view.querySelectorAll('.guide-number'), node => node.textContent), ['1', '2', '3']);
});

test('new steps are appended, empty steps can be removed and the last step is protected', t => {
  const ui = editorFor(t, guide());
  assert.equal(ui.card(0).querySelector('[data-op="remove"]').disabled, true);
  ui.click(null, 'add');
  assert.equal(ui.host.querySelectorAll('[data-guide-index]').length, 3);
  assert.equal(ui.document.activeElement, ui.field(1, 'title'));
  ui.click(1, 'remove');
  assert.deepEqual(ui.editor.getValue(), guide());
  ui.click(0, 'remove');
  assert.equal(ui.editor.getValue().steps.length, 1);
  const full = editorFor(t, guide(Array.from({ length: 20 }, (_, i) => step(`Steg ${i + 1}`))));
  assert.equal(full.host.querySelector('[data-op="add"]').disabled, true);
  full.click(null, 'add');
  assert.equal(full.editor.getValue().steps.length, 20);
});

test('changing action type preserves hidden key and label values as well as attachments', t => {
  const original = { ...step('Åpne', 'keys', 'Ctrl+F7'), label: 'Åpne', image: PNG, marker: { x: 50, y: 25 } };
  const ui = editorFor(t, guide([original]));
  ui.enter(0, 'kind', 'click');
  assert.equal(ui.field(0, 'label').value, 'Åpne');
  assert.equal(ui.field(0, 'keys'), null);
  ui.enter(0, 'label', 'Søk');
  ui.enter(0, 'kind', 'type');
  assert.equal(ui.field(0, 'label').value, 'Søk');
  assert.ok(ui.card(0).querySelector('.guide-typed'));
  ui.enter(0, 'kind', 'keys');
  assert.equal(ui.field(0, 'keys').value, 'Ctrl+F7');
  assert.deepEqual(ui.editor.getValue().steps[0], { ...original, label: 'Søk' });
});

test('image removal clears its marker while removing only the marker keeps the image', t => {
  const ui = editorFor(t, {
    ...guide([{ ...step('Velg treff'), image: PNG, marker: { x: 25, y: 75 } }]),
    start: { description: 'Start her', image: JPEG },
  });
  ui.click(0, 'unmark');
  assert.equal(ui.editor.getValue().steps[0].image, PNG);
  assert.equal(ui.editor.getValue().steps[0].marker, null);
  ui.click(0, 'mark');
  ui.card(0).querySelector('[data-marking]').click();
  assert.deepEqual(ui.editor.getValue().steps[0].marker, { x: 50, y: 50 });
  ui.click(0, 'remove-image');
  assert.equal(ui.editor.getValue().steps[0].image, null);
  assert.equal(ui.editor.getValue().steps[0].marker, null);
  assert.equal(ui.editor.getValue().start.image, JPEG);
  ui.click('start', 'remove-image');
  assert.equal(ui.editor.getValue().start.image, null);
});

test('editor uses text fields, multiline descriptions, constrained file inputs and non-submit buttons', t => {
  const ui = editorFor(t, guide());
  assert.equal(ui.field(0, 'title').type, 'text');
  assert.equal(ui.field(0, 'keys').type, 'text');
  assert.equal(ui.field(0, 'title').maxLength, 120);
  assert.equal(ui.field(0, 'keys').maxLength, 200);
  for (const input of [ui.field('start', 'description'), ui.field(0, 'description'), ui.field(0, 'result')]) {
    assert.equal(input.tagName, 'TEXTAREA');
    assert.equal(input.maxLength, 2000);
  }
  for (const input of ui.host.querySelectorAll('[data-file]')) {
    assert.equal(input.type, 'file');
    assert.equal(input.accept, 'image/png,image/jpeg,image/webp');
    assert.ok(ui.host.querySelector(`label[for="${input.id}"]`));
  }
  for (const button of ui.host.querySelectorAll('button')) assert.equal(button.type, 'button');
  assert.deepEqual(Array.from(ui.field(0, 'kind').options, option => option.value), ['keys', 'click', 'doubleclick', 'rightclick', 'type']);
  ui.enter(0, 'kind', 'type');
  assert.equal(ui.field(0, 'label').type, 'text');
});

test('ordinary rendering includes start context, outcomes, images, numbering and completion', t => {
  const value = guide([
    { ...step('Åpne søket'), description: 'Finn riktig bil først.', result: 'Søkefeltet vises.', image: PNG, marker: { x: 0, y: 100 } },
    step('Velg varen', 'click', 'W5W'),
  ]);
  value.start.image = JPEG;
  const document = parsed(t, value);
  assert.equal(document.querySelector('.guide-start p').textContent, value.start.description);
  assert.equal(document.querySelector('.guide-result p').textContent, 'Søkefeltet vises.');
  assert.equal(document.querySelectorAll('.guide-step').length, 2);
  assert.equal(document.querySelectorAll('.guide-result').length, 1);
  assert.equal(document.querySelectorAll('img').length, 2);
  assert.equal(document.querySelectorAll('[data-guide-zoom]').length, 2);
  assert.equal(document.querySelector('.guide-marker').textContent, '1');
  assert.equal(document.querySelector('.guide-marker').style.top, '100%');
  assert.equal(document.querySelector('.guide-marker').style.left, '0%');
  assert.match(document.querySelector('.guide-finish').textContent, /alle 2 stegene/);
  for (const image of document.images) assert.ok(image.alt);
  assert.equal(guides.render(null), '');
});

test('simultaneous keys are separate keycaps while sequential presses remain separate steps', t => {
  const document = parsed(t, guide([step('Samtidig', 'keys', 'Ctrl+F7'), step('Deretter', 'keys', 'Enter')]));
  const [combo, next] = document.querySelectorAll('.guide-step');
  assert.deepEqual(Array.from(combo.querySelectorAll('kbd'), node => node.textContent), ['Ctrl', 'F7']);
  assert.equal(combo.querySelector('.guide-plus').getAttribute('aria-label'), 'og samtidig');
  assert.equal(next.querySelectorAll('kbd').length, 1);
  assert.match(next.querySelector('kbd').textContent, /Enter/);
  assert.equal(next.querySelector('.guide-plus'), null);
});

test('key aliases, arrow symbols and the named plus key are rendered without interpreting HTML', t => {
  const document = documentFor(t, guides.keycaps('Tab+Pil ned+Pluss+<img src=x onerror=evil>'));
  const keys = document.querySelectorAll('kbd');
  assert.equal(keys.length, 4);
  assert.equal(keys[0].textContent, '⇥Tab');
  assert.equal(keys[1].textContent, '↓Pil ned');
  assert.equal(keys[2].textContent, '+Pluss');
  assert.equal(keys[3].textContent, '<img src=x onerror=evil>');
  assert.equal(document.querySelector('img'), null);
});

test('click, double-click, right-click and typing use distinct labels and visual symbols', t => {
  const document = parsed(t, guide([
    step('Velg', 'click', 'Søk'),
    step('Åpne', 'doubleclick', 'Varen'),
    step('Meny', 'rightclick', 'Bildet'),
    step('Skriv koden', 'type', 'W5W'),
  ]));
  const [click, double, right, type] = document.querySelectorAll('.guide-action');
  assert.match(click.textContent, /Klikk \/ trykk/);
  assert.match(double.textContent, /Dobbeltklikk/);
  assert.match(right.textContent, /Høyreklikk/);
  for (const action of [click, double, right]) {
    assert.ok(action.querySelector('svg'));
    assert.ok(action.querySelector('.guide-button-symbol'));
    assert.equal(action.querySelector('kbd'), null);
  }
  assert.notEqual(click.querySelector('svg').innerHTML, right.querySelector('svg').innerHTML);
  assert.equal(type.querySelector('svg'), null);
  assert.equal(type.querySelector('.guide-typed').textContent, 'W5W');
  assert.match(type.textContent, /^Skriv/);
});

test('saved text is escaped in reader, image captions, form values and live action previews', t => {
  const payload = '\"><img src=x onerror="evil()"><script>evil()</script>&\'';
  const value = guide([{ ...step(payload, 'type', payload), description: payload, result: payload, image: PNG }]);
  value.start.description = payload;
  const document = parsed(t, value);
  assert.equal(document.querySelector('.guide-step h3').textContent, payload);
  assert.equal(document.querySelector('.guide-start p').textContent, payload);
  assert.equal(document.querySelector('.guide-result p').textContent, payload);
  assert.equal(document.querySelector('.guide-typed').textContent, payload);
  assert.equal(document.querySelector('img').alt, 'Etter steg 1: ' + payload);
  assert.equal(document.querySelectorAll('img').length, 1);
  assert.equal(document.querySelector('script, [onerror], [onload]'), null);
  const ui = editorFor(t, value);
  assert.equal(ui.field(0, 'title').value, payload);
  assert.equal(ui.field(0, 'description').value, payload);
  ui.enter(0, 'label', payload + ' Nytt');
  assert.equal(ui.card(0).querySelector('[data-action-preview]').textContent, 'Skriv' + payload + ' Nytt');
  assert.equal(ui.host.querySelector('script, [onerror], [onload]'), null);
});

test('invalid guide shapes, action types and missing action values fail validation and do not render steps', () => {
  const invalid = [null, {}, { ...guide(), version: 2 }, { ...guide(), start: null }, { ...guide(), steps: [] }, { ...guide(), steps: {} }];
  const mutate = fn => { const value = guide(); fn(value); invalid.push(value); };
  mutate(g => { g.start.description = '  '; });
  mutate(g => { g.steps[0] = null; });
  mutate(g => { g.steps[0].title = ''; });
  mutate(g => { g.steps[0].kind = '__proto__'; });
  mutate(g => { g.steps[0].kind = 'script'; });
  mutate(g => { g.steps[0].keys = ''; });
  mutate(g => { g.steps[0].description = 42; });
  mutate(g => { g.steps[0].result = null; });
  for (const kind of ['click', 'doubleclick', 'rightclick', 'type']) invalid.push(guide([step('Tom handling', kind, ' ')]));
  for (const value of invalid) {
    assert.throws(() => guides.validate(value));
    if (value !== null) {
      assert.doesNotMatch(guides.render(value), /<section\b/);
      assert.match(guides.render(value), /kan ikke vises/);
    }
  }
});

test('key combinations reject empty components and more than eight keys', () => {
  for (const keys of ['+', 'Ctrl+', '+F7', 'Ctrl++F7', 'Ctrl+ +F7', Array(9).fill('A').join('+')]) {
    assert.throws(() => guides.validate(guide([step('Trykk', 'keys', keys)])), keys);
  }
  for (const keys of ['Pluss', 'Ctrl+Pluss', Array(8).fill('A').join('+')]) {
    assert.doesNotThrow(() => guides.validate(guide([step('Trykk', 'keys', keys)])), keys);
  }
});

test('text and step-count limits permit the boundary and reject overflow', () => {
  for (const [location, field, max] of [['start', 'description', 2000], ['step', 'title', 120], ['step', 'keys', 200], ['step', 'label', 200], ['step', 'description', 2000], ['step', 'result', 2000]]) {
    const value = guide();
    const target = location === 'start' ? value.start : value.steps[0];
    target[field] = 'a'.repeat(max);
    assert.doesNotThrow(() => guides.validate(value), `${location}.${field} ved grensen`);
    target[field] += 'a';
    assert.throws(() => guides.validate(value), `${location}.${field} over grensen`);
  }
  assert.doesNotThrow(() => guides.validate(guide(Array.from({ length: 20 }, () => step('Steg')))));
  assert.throws(() => guides.validate(guide(Array.from({ length: 21 }, () => step('Steg')))));
});

test('images allow embedded raster data only and reject executable, remote, malformed and oversized values', () => {
  for (const src of [PNG, JPEG, 'data:image/webp;base64,UklGRg==']) assert.equal(guides.imageOK(src), true);
  const rejected = [
    null, {}, 'https://example.test/image.png', '//example.test/image.png', 'javascript:evil()',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/gif;base64,R0lGODlh',
    'data:image/png,plain', 'data:image/png;base64,', 'data:image/png;base64,AAAA\n',
    'data:image/png;base64,AAAA" onerror="evil()', 'data:image/png;base64,AAA@',
    'data:image/png;base64,' + 'A'.repeat(guides.MAX_IMAGE),
  ];
  for (const src of rejected) {
    assert.equal(guides.imageOK(src), false);
    if (src != null) {
      const value = guide([{ ...step('Bilde'), image: src }]);
      assert.throws(() => guides.validate(value));
      assert.doesNotMatch(guides.render(value), /<img\b/);
      value.steps[0].image = null;
      value.start.image = src;
      assert.throws(() => guides.validate(value));
    }
  }
});

test('per-image and total guide limits are both enforced', () => {
  const prefix = 'data:image/png;base64,';
  const image = prefix + 'A'.repeat(guides.MAX_IMAGE - prefix.length);
  assert.equal(guides.imageOK(image), true);
  assert.equal(guides.imageOK(image + 'A'), false);
  const value = guide(Array.from({ length: 9 }, () => ({ ...step('Bilde'), image })));
  value.start.image = image;
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < guides.MAX_GUIDE);
  assert.doesNotThrow(() => guides.validate(value));
  value.steps.push({ ...step('Ett bilde for mye'), image });
  assert.ok(Buffer.byteLength(JSON.stringify(value)) > guides.MAX_GUIDE);
  assert.throws(() => guides.validate(value), /for stor/);
});

test('markers require an image and finite percentage coordinates inside the image', () => {
  for (const marker of [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 12.5, y: 87.25 }]) {
    assert.doesNotThrow(() => guides.validate(guide([{ ...step('Marker'), image: PNG, marker }])));
  }
  for (const marker of [{ x: -1, y: 0 }, { x: 0, y: 101 }, { x: NaN, y: 10 }, { x: 10, y: Infinity }, { x: '10', y: 20 }, {}, 'left:0;position:fixed']) {
    const value = guide([{ ...step('Marker'), image: PNG, marker }]);
    assert.throws(() => guides.validate(value));
    assert.doesNotMatch(guides.render(value), /guide-marker/);
  }
  assert.throws(() => guides.validate(guide([{ ...step('Uten bilde'), marker: { x: 50, y: 50 } }])));
});

test('reader mounting is idempotent and zoom retains the image and marker with a working close control', t => {
  const document = parsed(t, guide([{ ...step('Se treffet'), image: PNG, marker: { x: 25, y: 75 } }]));
  const host = document.body;
  document.defaultView.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  document.defaultView.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new document.defaultView.Event('close'));
  };
  guides.mountReader(host);
  guides.mountReader(host);
  const picture = host.querySelector('[data-guide-zoom]');
  picture.focus();
  picture.querySelector('img').click();
  assert.equal(host.querySelectorAll('dialog').length, 1);
  const dialog = host.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('img').src, PNG);
  assert.equal(dialog.querySelector('.guide-marker').style.top, '75%');
  assert.equal(dialog.querySelector('[data-guide-zoom]'), null);
  dialog.querySelector('[data-size]').click();
  assert.equal(dialog.classList.contains('fit'), false);
  dialog.querySelector('[data-close]').click();
  assert.equal(host.querySelector('dialog'), null);
  assert.equal(document.activeElement, picture);
  picture.setAttribute('data-marking', 'true');
  picture.click();
  assert.equal(host.querySelector('dialog'), null);
});
