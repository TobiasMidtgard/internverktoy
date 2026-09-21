const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const wiki = read('wiki.html'), shared = read('shared.js');
const esc = shared.slice(shared.indexOf('  const esc ='), shared.indexOf('\n', shared.indexOf("}[c]));")) + 1);
const markdown = wiki.slice(wiki.indexOf('/* ---------- markdown ---------- */'), wiki.indexOf('/* ---------- auth ---------- */'));
const context = vm.createContext({URL});
vm.runInContext(esc + '\n' + markdown + '\nthis.render = md;', context);
const md = context.render;

test('renders an HTTPS image as an accessible, linked figure', () => {
  const html = md('![Sokkel fra undersiden](https://example.com/socket.svg?size=2&view=base)');
  assert.match(html, /^<figure class="md-figure">/);
  assert.match(html, /href="https:\/\/example.com\/socket.svg\?size=2&amp;view=base"/);
  assert.match(html, /<img src="https:\/\/example.com\/socket.svg\?size=2&amp;view=base" alt="Sokkel fra undersiden" loading="lazy" decoding="async">/);
  assert.match(html, /<figcaption>Sokkel fra undersiden/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.ok(!html.includes('&amp;amp;'));
});

test('permits only safe relative image paths within the article image directory', () => {
  for (const src of ['content/wiki/images/socket.svg', './content/wiki/images/socket-detail.png']) {
    assert.match(md('![Sokkel](' + src + ')'), /<img /);
  }
  for (const src of ['../socket.svg', 'content/wiki/images/../secret.svg', 'content/wiki/images/%2e%2e/secret.svg', '/content/wiki/images/socket.svg', 'content/wiki/images/socket.html']) {
    assert.doesNotMatch(md('![Sokkel](' + src + ')'), /<(img|figure|a)\b/);
  }
});

test('rejects active protocols, insecure URLs, credentials, controls and attribute injection', () => {
  for (const src of ['javascript:alert', 'data:image/svg+xml,evil', 'http://example.com/x.svg', '//example.com/x.svg', 'https://name:password@example.com/x.svg', 'https://example.com/x.svg"onerror="evil', 'https://example.com/x\\x.svg', 'https://example.com/\u0001x.svg']) {
    assert.doesNotMatch(md('![Sokkel](' + src + ')'), /<(img|figure|a)\b/);
  }
  const html=md('![' + '"><svg/onload=evil>' + '](https://example.com/socket.svg)');
  assert.doesNotMatch(html, /<svg|onload="/);
  assert.match(html, /alt="&quot;&gt;&lt;svg\/onload=evil&gt;"/);
});

test('figures close lists and preserve the following heading and paragraph', () => {
  const html=md('- Før bildet\n![Sokkel](content/wiki/images/socket.svg)\n# Etter bildet\nTekst.');
  assert.match(html, /<\/li><\/ul><figure/);
  assert.match(html, /<\/figure><h2>Etter bildet<\/h2><p>Tekst\.<\/p>$/);
  assert.match(md('![](content/wiki/images/socket.svg)'), /alt="Illustrasjon"/);
});

test('preserves existing Markdown text, links and HTML escaping', () => {
  const html=md('# Tittel\n**Fet** og *kursiv* og \x60kode\x60\n[Les mer](https://example.com/)\n<script>evil</script>');
  assert.match(html, /<h2>Tittel<\/h2>/);
  assert.match(html, /<strong>Fet<\/strong> og <em>kursiv<\/em> og <code>kode<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\/" target="_blank" rel="noopener">Les mer<\/a>/);
  assert.ok(html.includes('&lt;script&gt;evil&lt;/script&gt;'));
  assert.doesNotMatch(html, /<script>/);
});

test('the bulb article has three rendered figures and preserves its ingress', () => {
  const article=read('content/wiki/bilpaerer.md').replace(/^#.*\n/,'').trim();
  const html=md(article);
  assert.equal((html.match(/<figure\b/g)||[]).length,3);
  assert.equal((html.match(/<img\b/g)||[]).length,3);
  assert.match(html, /^<p>Riktig bilpære bestemmes/);
  for (const filename of ['paerekoder.svg','bajonettsokler.svg','pinol-og-glassokkel.svg']) {
    assert.ok(html.includes('/content/wiki/images/'+filename));
  }
});
