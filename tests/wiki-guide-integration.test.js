const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../db/node_modules/jsdom');

const wikiHTML = fs.readFileSync(path.join(__dirname, '..', 'wiki.html'), 'utf8');
const guideScript = fs.readFileSync(path.join(__dirname, '..', 'wiki-guides.js'), 'utf8');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=';
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function guide(title = 'Finn riktig pære') {
  return {
    version: 1,
    start: { description: 'Åpne kjøretøylisten.', image: PNG },
    steps: [{
      title, kind: 'keys', keys: 'Ctrl+F7', label: '',
      description: 'Hold Ctrl mens du trykker F7.',
      result: 'Søkefeltet vises.', image: PNG, marker: { x: 25, y: 75 },
    }],
  };
}

function article(id, title = id, value = guide(title)) {
  return {
    id, title, category: 'XAL', tags: ['pærer'], body: 'Innledning',
    sources: [], guide: value, updated_at: '2026-09-21T12:00:00Z',
  };
}

// Run the real page and guide editor against inert, local RPC fixtures.
// JSDOM outside-only does not load or execute the page's external scripts.
function page(t) {
  const dom = new JSDOM(wikiHTML, {
    url: 'https://example.test/wiki.html',
    runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window;
  let user = { tag: 'manager', name: 'Testansatt', role: 'manager' };
  let handler = async () => [];
  const calls = [], messages = [], confirmations = [];
  window.TextEncoder = TextEncoder;
  window.confirm = message => { confirmations.push(message); return true; };
  window.THelper = {
    getUser: () => user,
    canManage: () => !!user && user.role === 'manager',
    clearSession: () => { user = null; },
    ensureUser: async () => user,
    icon: () => '',
    esc: value => String(value == null ? '' : value).replace(/[&<>"']/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    toast: message => messages.push(message),
    rpcAuth: async (name, args = {}) => {
      calls.push({ name, args: copy(args) });
      return handler(name, args);
    },
  };
  window.eval(guideScript);
  const main = Array.from(document.scripts).find(script =>
    !script.src && script.textContent.includes('const T=window.THelper'));
  assert.ok(main, 'The actual wiki page script is available');
  window.eval(main.textContent + '\nwindow.__guideIntegration={editor:guideEditor,cached:id=>articles[id]};');
  const editor = window.__guideIntegration.editor;
  const byId = id => document.getElementById(id);
  const enter = (element, value) => {
    element.value = value;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const card = index => byId('guideEditor').querySelector('[data-guide-index="' + index + '"]');
  return {
    window, document, editor, byId, card, enter, calls, messages, confirmations,
    rpc: callback => { handler = callback; },
    signedInAs: tag => { user = { tag, name: tag, role: 'manager' }; window.refreshAuth(); },
    cached: id => window.__guideIntegration.cached(id),
  };
}

test('a delayed private article is discarded after logout, including after another user signs in', async t => {
  for (const signInAgain of [false, true]) {
    const ui = page(t), response = deferred();
    ui.rpc(name => name === 'get_article' ? response.promise : []);
    const opening = ui.window.openArticle('private');
    await ui.window.toggleAuth();
    if (signInAgain) ui.signedInAs('another-manager');
    response.resolve(article('private', 'Skjermbilde som ikke skal vises'));
    await opening;
    assert.equal(ui.byId('articleModal').classList.contains('show'), false);
    assert.equal(ui.byId('aGuide').querySelector('img'), null);
    assert.equal(ui.cached('private'), undefined, 'Old-session data is not put back in the cache');
  }
});

test('a delayed editor response cannot restore private images after logout or a new login', async t => {
  for (const signInAgain of [false, true]) {
    const ui = page(t), response = deferred();
    ui.rpc(name => name === 'get_article' ? response.promise : []);
    const opening = ui.window.openEditor('private');
    await ui.window.toggleAuth();
    if (signInAgain) ui.signedInAs('another-manager');
    response.resolve(article('private'));
    await opening;
    assert.equal(ui.byId('editModal').classList.contains('show'), false);
    assert.equal(ui.byId('guideEditor').querySelector('img'), null);
    assert.equal(ui.cached('private'), undefined);
  }
});

test('the last article requested wins when replies arrive out of order', async t => {
  const ui = page(t), old = deferred(), recent = deferred();
  ui.rpc((name, args) => name === 'get_article'
    ? (args.p_id === 'old' ? old.promise : recent.promise) : []);
  const first = ui.window.openArticle('old');
  const second = ui.window.openArticle('recent');
  recent.resolve(article('recent', 'Siste valgte veiledning'));
  await second;
  old.resolve(article('old', 'Utdatert svar'));
  await first;
  assert.equal(ui.byId('aTitle').textContent, 'Siste valgte veiledning');
  assert.match(ui.byId('aGuide').textContent, /Siste valgte veiledning/);
  assert.equal(ui.cached('old'), undefined);
});

test('the last editor requested keeps its own content and save target', async t => {
  const ui = page(t), old = deferred(), recent = deferred();
  let written;
  ui.rpc((name, args) => {
    if (name === 'get_article') return args.p_id === 'old' ? old.promise : recent.promise;
    if (name === 'update_article') { written = copy(args); return null; }
    return [];
  });
  const first = ui.window.openEditor('old');
  const second = ui.window.openEditor('recent');
  recent.resolve(article('recent', 'Riktig artikkel'));
  await second;
  old.resolve(article('old', 'Skal ikke overskrive'));
  await first;
  assert.equal(ui.byId('fTitle').value, 'Riktig artikkel');
  assert.deepEqual(copy(ui.editor.getValue()), guide('Riktig artikkel'));
  await ui.window.saveArticle();
  assert.equal(written.p_id, 'recent');
  assert.equal(written.p_article.title, 'Riktig artikkel');
  assert.deepEqual(written.p_article.guide, guide('Riktig artikkel'));
});

test('delayed search and shortcut replies do not repopulate the page after logout', async t => {
  const ui = page(t), search = deferred(), links = deferred();
  await flush();
  ui.rpc(name => name === 'wiki_search_sections' ? search.promise : name === 'get_links' ? links.promise : []);
  const searching = ui.window.doSearch();
  const loadingLinks = ui.window.loadLinks();
  await ui.window.toggleAuth();
  search.resolve([{ id: 'private', title: 'Privat treff', category: 'XAL', snippet: 'Hemmelig beskrivelse',is_guide:true,step_count:2 }]);
  links.resolve([{ id: 'private-link', title: 'Privat snarvei', kind: 'xal', command: 'PRIVATE', category: 'XAL' }]);
  await Promise.all([searching, loadingLinks]);
  assert.match(ui.byId('results').textContent, /Logg inn/);
  assert.equal(ui.byId('sequences').hidden,true);
  assert.equal(ui.byId('sequenceResults').textContent,'');
  assert.doesNotMatch(ui.document.body.textContent, /Privat treff|Hemmelig beskrivelse|Privat snarvei|PRIVATE/);
});

test('a slower previous search does not replace the latest results', async t => {
  const ui = page(t), old = deferred(), recent = deferred();
  await flush();
  ui.rpc((name, args) => name === 'wiki_search_sections'
    ? (args.p_q === 'old' ? old.promise : recent.promise) : []);
  ui.byId('q').value = 'old';
  const first = ui.window.doSearch();
  ui.byId('q').value = 'recent';
  const second = ui.window.doSearch();
  recent.resolve([{ id: 'recent', title: 'Riktig søkeresultat', category: 'XAL', snippet: 'Nyeste søk' }]);
  await second;
  old.resolve([{ id: 'old', title: 'Feil søkeresultat', category: 'XAL', snippet: 'Gammelt søk' }]);
  await first;
  assert.match(ui.byId('results').textContent, /Riktig søkeresultat/);
  assert.doesNotMatch(ui.byId('results').textContent, /Feil søkeresultat/);
});

test('starting another marker cancels the first draft and keyboard movement stays with its step', async t => {
  const ui = page(t), value = guide('Første steg');
  value.steps.push({ ...copy(value.steps[0]), title: 'Andre steg', marker: { x: 70, y: 40 } });
  ui.rpc(name => name === 'get_article' ? article('two', 'To steg', value) : []);
  await ui.window.openEditor('two');
  ui.card(0).querySelector('[data-op="mark"]').click();
  ui.card(0).querySelector('[data-marking]').dispatchEvent(
    new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  ui.card(1).querySelector('[data-op="mark"]').click();
  assert.equal(ui.byId('guideEditor').querySelectorAll('[data-marking]').length, 1);
  assert.equal(ui.card(0).querySelector('[data-marking]'), null);
  assert.equal(ui.card(0).querySelector('.guide-marker').style.left, '25%');
  const picture = ui.card(1).querySelector('[data-marking]');
  picture.dispatchEvent(new ui.window.KeyboardEvent('keydown', {
    key: 'ArrowLeft', shiftKey: true, bubbles: true,
  }));
  picture.click(); // Keyboard activation emits a click with detail === 0.
  const saved = copy(ui.editor.getValue());
  assert.deepEqual(saved.steps[0].marker, { x: 25, y: 75 });
  assert.deepEqual(saved.steps[1].marker, { x: 60, y: 40 });
  assert.equal(ui.byId('guideEditor').querySelector('[data-marking]'), null);
});

test('Escape abandons a keyboard marker draft without closing the editor or changing the saved marker', async t => {
  const ui = page(t);
  ui.rpc(name => name === 'get_article' ? article('marker') : []);
  await ui.window.openEditor('marker');
  ui.card(0).querySelector('[data-op="mark"]').click();
  const picture = ui.card(0).querySelector('[data-marking]');
  picture.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  picture.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(ui.byId('editModal').classList.contains('show'), true);
  assert.equal(ui.byId('guideEditor').querySelector('[data-marking]'), null);
  assert.deepEqual(copy(ui.editor.getValue().steps[0].marker), { x: 25, y: 75 });
});

test('malformed stored marker coordinates cannot inject markup through the editor', async t => {
  const ui = page(t), value = guide();
  value.steps[0].marker = { x: '50"><img src=x onerror="evil()">', y: 50 };
  ui.rpc(name => name === 'get_article' ? article('malformed', 'Ugyldig markering', value) : []);
  await ui.window.openEditor('malformed');
  assert.equal(ui.byId('editModal').classList.contains('show'), false);
  assert.equal(ui.byId('guideEditor').querySelector('img, [onerror], script'), null);
  assert.ok(ui.messages.some(message => message.includes('Sekvensen kunne ikke åpnes')));
});

test('clipboard reading blocks save and discards its image when the editor changes guides', async t => {
  const ui = page(t), clipboard = deferred();
  ui.rpc((name, args) => name === 'get_article' ? article(args.p_id, args.p_id) : []);
  await ui.window.openEditor('first');
  Object.defineProperty(ui.window.navigator, 'clipboard', {
    configurable: true, value: { read: () => clipboard.promise },
  });
  const button = ui.card(0).querySelector('[data-op="paste"]');
  const pasting = ui.editor.click({ target: button });
  assert.throws(() => ui.editor.getValue(), /Vent til bildet/);
  await ui.window.openEditor('second');
  clipboard.resolve([{
    types: ['image/png'],
    getType: async () => new ui.window.Blob(['unneeded'], { type: 'image/png' }),
  }]);
  await pasting;
  assert.deepEqual(copy(ui.editor.getValue()), guide('second'));
  assert.equal(ui.byId('fTitle').value, 'second');
  assert.equal(ui.editor.pending, 0);
});

test('saving and reopening a new guide preserves its screenshots, actions and markers', async t => {
  const ui = page(t), value = guide('Åpne pærelisten');
  let stored, added;
  ui.rpc((name, args) => {
    if (name === 'add_article') {
      added = copy(args.p_article);
      stored = { ...article('created'), ...copy(args.p_article) };
      return copy(stored);
    }
    if (name === 'get_article') return copy(stored);
    return [];
  });
  await ui.window.openEditor(null, undefined, true);
  ui.enter(ui.byId('fTitle'), 'Pærer i Norsk Bildelkatalog');
  ui.editor.setValue(value);
  const result = ui.card(0).querySelector('[data-field="result"]');
  ui.enter(result, 'Pærelisten er åpen.');
  const expected = copy(value);
  expected.steps[0].result = 'Pærelisten er åpen.';
  await ui.window.saveArticle();
  await flush();
  assert.deepEqual(added.guide, expected);
  assert.equal(ui.calls.filter(call => call.name === 'add_article').length, 1);
  assert.equal(ui.byId('editModal').classList.contains('show'), false);
  assert.equal(ui.byId('articleModal').classList.contains('show'), true);
  assert.equal(ui.byId('aGuide').querySelectorAll('img').length, 2);
  assert.equal(ui.byId('aGuide').querySelector('.guide-marker').style.left, '25%');
  assert.match(ui.byId('aGuide').textContent, /Pærelisten er åpen/);
  await ui.window.openEditor('created');
  assert.equal(ui.byId('fTitle').value, 'Pærer i Norsk Bildelkatalog');
  assert.deepEqual(copy(ui.editor.getValue()), expected);
});

test('an RPC save failure keeps the editor, changed fields, screenshots and retry controls intact', async t => {
  const ui = page(t), save = deferred();
  ui.rpc(name => name === 'get_article' ? article('existing') : name === 'update_article' ? save.promise : []);
  await ui.window.openEditor('existing');
  const changed = 'Dette må ikke gå tapt ved lagringsfeil.';
  ui.enter(ui.card(0).querySelector('[data-field="result"]'), changed);
  const before = copy(ui.editor.getValue());
  const saving = ui.window.saveArticle();
  assert.equal(ui.byId('saveArticleBtn').disabled, true);
  assert.equal(ui.byId('editModal').querySelector('.bd').inert, true);
  save.reject(new Error('Simulert nettverksfeil'));
  await saving;
  assert.equal(ui.byId('editModal').classList.contains('show'), true);
  assert.deepEqual(copy(ui.editor.getValue()), before);
  assert.equal(ui.card(0).querySelector('[data-field="result"]').value, changed);
  assert.equal(ui.byId('guideEditor').querySelectorAll('img').length, 2);
  assert.equal(ui.byId('saveArticleBtn').disabled, false);
  assert.equal(ui.byId('saveArticleBtn').textContent, 'Lagre');
  assert.equal(ui.byId('editModal').querySelector('.bd').inert, false);
  assert.ok(ui.messages.some(message => message.includes('Simulert nettverksfeil')));
  ui.window.confirm = () => false;
  ui.window.closeModal('editModal');
  assert.equal(ui.byId('editModal').classList.contains('show'), true, 'The unsaved-change guard is retained');
});

test('search places guides in their own section without downloading screenshots until opened', async t => {
  const ui=page(t);await flush();
  ui.rpc((name,args)=>name==='get_article'?article(args.p_id,'Finn lagerstatus'):name==='wiki_search_sections'?[
    {id:'ordinary',title:'Vanlig artikkel',category:'Bildeler',snippet:'Om bilpærer',is_guide:false,step_count:0},
    {id:'sequence',title:'Finn lagerstatus',category:'XAL',snippet:'Start ved hovedmenyen',is_guide:true,step_count:3}
  ]:[]);
  await ui.window.doSearch();
  assert.equal(ui.byId('sequences').hidden,false);
  assert.match(ui.byId('sequenceResults').textContent,/Finn lagerstatus/);
  assert.match(ui.byId('sequenceResults').textContent,/3 steg/);
  assert.doesNotMatch(ui.byId('sequenceResults').textContent,/Vanlig artikkel/);
  assert.match(ui.byId('results').textContent,/Vanlig artikkel/);
  assert.doesNotMatch(ui.byId('results').textContent,/Finn lagerstatus/);
  assert.equal(ui.byId('sequenceCount').textContent,'1 knappesekvens');
  assert.equal(ui.byId('resCount').textContent,'1 artikkel');
  assert.equal(ui.byId('sequenceResults').querySelector('img'),null);
  assert.equal(ui.calls.some(c=>c.name==='get_article'),false);
  ui.byId('sequenceResults').querySelector('h3').click();await flush();
  assert.equal(ui.byId('aTitle').textContent,'Finn lagerstatus');
  assert.equal(ui.byId('articleModal').classList.contains('show'),true);
});

test('the sequence section stays discoverable when empty and errors clear both old result lists', async t => {
  const ui=page(t);await flush();
  ui.rpc(()=>[]);await ui.window.doSearch();
  assert.equal(ui.byId('sequences').hidden,false);
  assert.match(ui.byId('sequenceResults').textContent,/Ingen knappesekvenser ennå/);
  assert.equal(ui.byId('newGuideBtn').closest('section').id,'sequences');
  assert.equal(ui.byId('newBtn').closest('section').id,'articleSection');
  ui.byId('q').value='finn';ui.window.setCat('XAL');await flush();
  const request=ui.calls.filter(c=>c.name==='wiki_search_sections').at(-1);
  assert.deepEqual(request.args,{p_q:'finn',p_category:'XAL'});
  assert.match(ui.byId('sequenceResults').textContent,/Ingen knappesekvenser matcher/);
  ui.byId('results').textContent='OLD ARTICLE';ui.byId('sequenceResults').textContent='OLD GUIDE';
  ui.rpc(name=>{if(name==='wiki_search_sections')throw new Error('Nettverksfeil');return [];});
  await ui.window.doSearch();
  assert.doesNotMatch(ui.byId('results').textContent,/OLD/);
  assert.doesNotMatch(ui.byId('sequenceResults').textContent,/OLD/);
  assert.match(ui.byId('sequenceResults').textContent,/kunne ikke lastes/);
});

