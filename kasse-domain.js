/* Kasseoppgjør — pengematematikk, øktlivssyklus og norsk tallformatering.
   Ingen DOM, ingen lagring, ingen nettverk. Alle beløp er heltall i øre. Gram
   er den eneste desimalverdien, og gram inngår aldri direkte i en sum — gram
   utleder et heltall antall mynt, som gir beløpet.
   UMD: window.KasseDomain i nettleseren, module.exports i Node (tester). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasseDomain = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SAFE_TARGET_ORE = 1000000;   /* 10 000 kr */
  const WEIGHT_TOLERANCE = 0.4;      /* andel av myntvekta før vekten flagges */
  const KINDS = Object.freeze(['safe', 'opening', 'closing']);
  /* Kjente øktstatuser. Whitelistet av samme grunn som KINDS: finalizeSession
     skal vite nøyaktig hvilke verdier som betyr noe, i stedet for stille å la
     enhver ukjent streng (f.eks. en skrivefeil) gli gjennom som om den var en
     gyldig status. */
  const STATUSES = Object.freeze(['draft', 'saved', 'verified']);

  /* Standardverdier ved første oppstart. Redigerbare i appen (manager+) — se kasse-store.js. */
  const DEFAULT_DENOMS = [
    { id:'note_1000', kind:'note', label:'1000 kr', value_ore:100000, gram_per_unit:null, units_per_roll:null, sort:10, active:true },
    { id:'note_500',  kind:'note', label:'500 kr',  value_ore:50000,  gram_per_unit:null, units_per_roll:null, sort:20, active:true },
    { id:'note_200',  kind:'note', label:'200 kr',  value_ore:20000,  gram_per_unit:null, units_per_roll:null, sort:30, active:true },
    { id:'note_100',  kind:'note', label:'100 kr',  value_ore:10000,  gram_per_unit:null, units_per_roll:null, sort:40, active:true },
    { id:'note_50',   kind:'note', label:'50 kr',   value_ore:5000,   gram_per_unit:null, units_per_roll:null, sort:50, active:true },
    { id:'coin_20',   kind:'coin', label:'20 kr',   value_ore:2000,   gram_per_unit:9.9,  units_per_roll:25,   sort:60, active:true },
    { id:'coin_10',   kind:'coin', label:'10 kr',   value_ore:1000,   gram_per_unit:6.8,  units_per_roll:40,   sort:70, active:true },
    { id:'coin_5',    kind:'coin', label:'5 kr',    value_ore:500,    gram_per_unit:7.85, units_per_roll:40,   sort:80, active:true },
    { id:'coin_1',    kind:'coin', label:'1 kr',    value_ore:100,    gram_per_unit:4.35, units_per_roll:50,   sort:90, active:true },
  ];

  /* DEFAULT_DENOMS er konstant for programmets levetid. denomById gir fra seg
     levende referanser til elementene, så både lista og hvert element fryses
     her — forbrukere leser dem eller dypkopierer før de endrer noe. */
  DEFAULT_DENOMS.forEach(Object.freeze);
  Object.freeze(DEFAULT_DENOMS);

  function validateDenoms(list){
    if (!Array.isArray(list)) return { ok:false, error:'Valørlista må være en liste.' };
    if (!list.length) return { ok:false, error:'Valørlista er tom.' };
    const seenIds = new Set();
    const seenLabels = new Set();
    let hasActive = false;
    for (const d of list){
      if (!d || typeof d.id !== 'string' || !d.id.trim()) return { ok:false, error:'En valør mangler id.' };
      /* Etiketter tastes av mennesker og sammenlignes trimmet, men id-er slås opp
         råe med denomById. En id med mellomrom rundt seg ville validert fint og så
         aldri blitt funnet — den valøren hadde telt null i stillhet. Avvis den. */
      const id = d.id;
      if (id !== id.trim()) return { ok:false, error:'Valør-id kan ikke ha mellomrom rundt seg: ' + id.trim() };
      if (seenIds.has(id)) return { ok:false, error:'Duplikat valør-id: ' + id };
      seenIds.add(id);
      if (typeof d.label !== 'string' || !d.label.trim()) return { ok:false, error:'Valøren ' + id + ' mangler etikett.' };
      const label = d.label.trim();
      if (seenLabels.has(label)) return { ok:false, error:'Duplikat etikett: ' + label };
      seenLabels.add(label);
      if (d.kind !== 'note' && d.kind !== 'coin') return { ok:false, error:'Ukjent valørtype på ' + id + '.' };
      if (!Number.isSafeInteger(d.value_ore) || d.value_ore <= 0) return { ok:false, error:'Verdien på ' + id + ' må være et helt antall øre over null.' };
      if (d.kind === 'coin'){
        if (!Number.isFinite(d.gram_per_unit) || d.gram_per_unit <= 0) return { ok:false, error:'Myntvekten på ' + id + ' må være et tall over null.' };
        if (!Number.isSafeInteger(d.units_per_roll) || d.units_per_roll <= 0) return { ok:false, error:'Rullstørrelsen på ' + id + ' må være et helt tall over null.' };
      } else if (d.gram_per_unit != null || d.units_per_roll != null){
        return { ok:false, error:'Seddelen ' + id + ' kan ikke ha myntvekt eller rullstørrelse.' };
      }
      if (!Number.isInteger(d.sort)) return { ok:false, error:'Sorteringen på ' + id + ' må være et helt tall.' };
      if (d.active !== undefined && typeof d.active !== 'boolean') return { ok:false, error:'Aktiv-feltet på ' + id + ' må være true eller false.' };
      if (d.active !== false) hasActive = true;
    }
    if (!hasActive) return { ok:false, error:'Valørlista har ingen aktive valører.' };
    return { ok:true };
  }

  const denomById = (denoms, id) => (Array.isArray(denoms) ? denoms.find(d => d.id === id) : null) || null;

  /* Trygt heltall ≥ 0 fra et telle-felt (løse/ruller). Ikke-tall, negative,
     desimale og ikke-endelige verdier (f.eks. tastet "1e999") blir til 0 —
     ellers ville Infinity/NaN sildre inn i en sum og JSON.stringify ville
     lagret den som "null", altså en stille tom rad i utkastet. */
  const toCount = v => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };

  /* Trygt positivt endelig gram-tall fra vektfeltet. Godtar komma som
     desimalskilletegn (norsk tastatur, f.eks. "103,5") i tillegg til punktum.
     Sidelaget skal sende det rå feltinnholdet hit UBEHANDLET — normaliseringen
     skjer kun her, én gang, testet. (Tidligere sto det her at nettleserlaget
     allerede hadde normalisert kommaet før det nådde denne funksjonen. Det er
     ikke sant: et <input type="number"> forkaster komma-tegnet før noe
     JavaScript ser verdien i det hele tatt, så et gramfelt av den typen
     multipliserte hvert komma-tastet tall med ti i stillhet. Gramfeltet i
     kasse.html er derfor type="text", ikke type="number" — se kasse.html.)
     Manglende, null, negative og ikke-endelige verdier (f.eks. tastet
     "1e999") blir til 0 gram — «ingen vekt registrert» — ellers ville en
     divisjon lenger ned kunne gi Infinity eller NaN antall mynt. Gram er
     eneste desimalverdien i modulen og skal aldri avkortes slik toCount gjør. */
  const toGrams = v => {
    const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  /* Antall mynt en vekt tilsvarer for én valør. Forutsetter gyldige line og
     denom — det er kallernes ansvar å garantere (unitsFor og weightWarning
     sjekker begge dette selv før de kaller hit). Gir 0 ved manglende/ugyldig
     myntvekt (gram_per_unit) eller vekt, aldri Infinity/NaN ved divisjon. */
  function unitsFromWeight(line, denom){
    const gpu = denom.gram_per_unit;
    if (!Number.isFinite(gpu) || gpu <= 0) return 0;
    const grams = toGrams(line.grams);
    return grams ? Math.round(grams / gpu) : 0;
  }

  /* Antall enheter på en linje.
     safe:            løse + ruller × rullstørrelse (ruller kun på mynt)
     opening/closing: antall, eller — når line.source er 'weight' og valøren
                       er en mynt — grammene på vekta delt på myntvekta og
                       avrundet til nærmeste hele mynt. Sedler og safe-delen
                       bruker aldri vekt.
     kind må være en av KINDS — noe annet er en programmeringsfeil (alle kall
     i appen bruker literals fra den fryste lista) og skal kaste høylytt,
     ikke telle stille feil mot et fastsatt kassemål. */
  function unitsFor(line, denom, kind){
    if (!KINDS.includes(kind)) throw new Error('Ukjent kind: ' + kind + '.');
    if (!line || !denom) return 0;
    const loose = toCount(line.loose);
    if (kind === 'safe' && denom.kind === 'coin'){
      const rolls = toCount(line.rolls);
      return loose + rolls * (denom.units_per_roll || 0);
    }
    if (denom.kind === 'coin' && line.source === 'weight'){
      return unitsFromWeight(line, denom);
    }
    return loose;
  }

  /* Sjekker om vekta lander nær et helt antall mynt — i praksis fanger den et
     feiltastet gram-tall. Sjekken er en ren desimaltest: den er strukturelt
     blind for feil som selv utgjør et helt antall mynt (feil tarering, feil
     valør lagt på vekta, en utenlandsk mynt i bollen), fordi avviket per
     definisjon er begrenset til under en halv myntvekt. Advarselen blokkerer
     ingenting, den er bare et hint til den som teller. Samme (line, denom,
     kind)-signatur som unitsFor, og null for kind 'safe' — safe-delen bruker
     aldri vekt. null også for notes, manuelle linjer og manglende/ugyldig
     vekt eller myntvekt. */
  function weightWarning(line, denom, kind){
    if (!KINDS.includes(kind)) throw new Error('Ukjent kind: ' + kind + '.');
    if (kind === 'safe' || !line || !denom || denom.kind !== 'coin' || line.source !== 'weight') return null;
    const gpu = denom.gram_per_unit;
    if (!Number.isFinite(gpu) || gpu <= 0) return null;
    const grams = toGrams(line.grams);
    if (!grams) return null;
    const units = unitsFromWeight(line, denom);
    const residual = Math.abs(grams - units * gpu);
    const limit = WEIGHT_TOLERANCE * gpu;
    return residual > limit ? { units, residual, limit } : null;
  }

  /* units × valørverdi i øre — eneste stedet som skal gjøre denne gangen;
     recalc og radvisningen kaller denne i stedet for å gange selv.
     Manglende/ugyldig valør eller ikke-endelige units gir 0, ikke NaN
     (en NaN-sum ville også blitt lagret som "null" av JSON.stringify).
     Produktet sjekkes mot Number.isSafeInteger av samme grunn som toCounts
     kommentar oppgir for sin egen sjekk: units kommer fra et tallfelt, og et
     urealistisk stort men endelig tall (f.eks. 1e300 tastet ved et uhell,
     som toCount ikke avviser fordi det faktisk er endelig) ville gitt et
     produkt utenfor trygt heltallsområde — samme stille "null"-lagring som
     en NaN-sum, bare nådd via en annen vei. */
  function valueOre(units, denom){
    if (!denom || !Number.isFinite(denom.value_ore)) return 0;
    if (!Number.isFinite(units)) return 0;
    const total = units * denom.value_ore;
    return Number.isSafeInteger(total) ? total : 0;
  }

  const lineValueOre = (line, denom, kind) => valueOre(unitsFor(line, denom, kind), denom);

  /* Summen av en seksjon (safe/opening/closing) i øre. Linjer som peker på en
     id som ikke lenger finnes i valørlista telles som 0 i stedet for å kaste. */
  function sectionTotalOre(section, denoms, kind){
    if (!section || !Array.isArray(section.lines)) return 0;
    return section.lines.reduce((sum, line) => {
      const d = denomById(denoms, line.denom_id);
      return d ? sum + lineValueOre(line, d, kind) : sum;
    }, 0);
  }

  /* Begge leser felt to nivåer ned (session.sections.X.felt) og skal være like
     defensive hele veien ned — en manglende seksjon gir 0, ikke en kastet feil,
     akkurat som et manglende total_ore/target_ore-felt allerede gjorde. */
  const safeDiffOre = session => {
    const safe = (session && session.sections && session.sections.safe) || {};
    return (safe.total_ore || 0) - (safe.target_ore || 0);
  };
  const dayChangeOre = session => {
    const sections = (session && session.sections) || {};
    const opening = sections.opening || {}, closing = sections.closing || {};
    return (closing.total_ore || 0) - (opening.total_ore || 0);
  };

  const emptyLine = denom => ({ denom_id: denom.id, loose:0, rolls:0, grams:null, source:'manual' });
  /* Samme forsvar som denomById og sectionTotalOre: en ugyldig valørliste
     (null, undefined, feil type) gir en tom liste i stedet for å kaste. */
  const activeDenoms = denoms => Array.isArray(denoms) ? denoms.filter(d => d.active !== false) : [];
  const deepCopy = value => JSON.parse(JSON.stringify(value));

  /* Sant når linja faktisk har en telling på seg — brukes til å avgjøre om en
     linje for en deaktivert valør er trygg å fjerne (se syncLines). */
  const lineHasData = line => !!line && (toCount(line.loose) > 0 || toCount(line.rolls) > 0 || toGrams(line.grams) > 0);

  function newSession(denoms, dateStr){
    const lines = () => activeDenoms(denoms).map(emptyLine);
    return {
      id:null, session_date:dateStr, status:'draft', note:'',
      counted_by:null, counted_at:null, verified_by:null, verified_at:null,
      sections:{
        safe:    { lines: lines(), total_ore:0, target_ore: SAFE_TARGET_ORE },
        opening: { lines: lines(), total_ore:0 },
        closing: { lines: lines(), total_ore:0 },
      },
      denom_snapshot: null,
    };
  }

  /* Etter en endring i valørlista: behold tall som er tastet inn, legg til nye
     valører, og fjern tomme linjer for valører som er slått av. En linje som
     faktisk holder en telling beholdes selv om valøren er deaktivert — recalc
     verdsetter den uansett (denomById slår opp i hele lista, ikke bare de
     aktive), så å slette linja her ville stille forkastet talte penger. Kall
     recalc etter syncLines — denne lar total_ore på seksjonen stå foreldet. */
  function syncLines(session, denoms){
    if (!session || !session.sections) return session;
    const active = activeDenoms(denoms);
    const activeIds = new Set(active.map(d => d.id));
    for (const kind of KINDS){
      const section = session.sections[kind];
      if (!section || !Array.isArray(section.lines)) continue;
      const byId = new Map(section.lines.map(l => [l.denom_id, l]));
      const keptInactive = section.lines.filter(l => !activeIds.has(l.denom_id) && lineHasData(l));
      section.lines = active.map(d => byId.get(d.id) || emptyLine(d)).concat(keptInactive);
    }
    return session;
  }

  /* Skriver utledede felt tilbake på økten, slik at en lagret post er lesbar
     uten å regne på nytt. */
  function recalc(session, denoms){
    for (const kind of KINDS){
      const section = session.sections[kind];
      if (!section || !Array.isArray(section.lines)){
        if (section) section.total_ore = 0;   /* ikke la et foreldet tall bli stående */
        continue;
      }
      section.lines.forEach(line => {
        const d = denomById(denoms, line.denom_id);
        line.units = d ? unitsFor(line, d, kind) : 0;
        line.value_ore = d ? valueOre(line.units, d) : 0;
      });
      section.total_ore = section.lines.reduce((s, l) => s + (l.value_ore || 0), 0);
    }
    return session;
  }

  /* Gjør en økt klar for lagring: utledede felt fylles, valørkonfigurasjonen fryses,
     og teller/tidspunkt settes én gang — en ny lagring skal ikke overskrive hvem som talte.
     Statusen whitelistes mot STATUSES akkurat som kind whitelistes mot KINDS: en status
     utenfor lista er en programmeringsfeil (skjemaet har endret seg, eller en skrivefeil
     et sted satte en ugyldig verdi), ikke en bruker-inndata som skal tolkes best mulig —
     så den kaster, i stedet for stille å behandle en hvilken som helst ukjent streng som
     om den var 'saved'. En kjent, ikke-'verified' status blir 'saved'. counted_by og
     counted_at settes kun sammen og kun når user faktisk har en tag — en bruker uten tag
     (f.eks. et tomt {}-objekt) skal verken låse feltet til et tomt objekt for alltid
     (JSON.stringify({tag:undefined}) blir "{}", som er sant og ville blokkert enhver
     senere, gyldig registrering) eller etterlate et tidsstempel uten en teller. */
  function finalizeSession(session, denoms, user, nowIso){
    const out = deepCopy(session);
    if (!STATUSES.includes(out.status)) throw new Error('Ukjent status: ' + out.status + '.');
    recalc(out, denoms);
    out.denom_snapshot = deepCopy(denoms);
    out.status = out.status === 'verified' ? 'verified' : 'saved';
    if (!out.counted_by && user && user.tag){
      out.counted_by = { tag:user.tag, name:user.name };
      out.counted_at = nowIso;
    }
    return out;
  }

  /* Formateres for hånd, ikke med Intl: nettleser og Node skal gi identisk streng,
     slik at testene faktisk dekker det brukeren ser. Norsk: ikke-brytende
     mellomrom (U+00A0) som tusenskille — en vanlig mellomrom ville latt
     beløpet brekke midt i tallet i en trang tabellcelle — komma som
     desimalskille. Øre avkortes mot null, ikke rundes: dette er alltid et
     heltall øre fra modulens egen regning (valueOre er eneste multiplikasjon,
     og den er nå selv sikret mot overflow), så avkorting er et no-op i
     praksis. Skulle noen likevel en dag sende inn et gjennomsnitt eller annet
     ikke-heltall øre-beløp, avkortes det mot null i stedet for å rundes —
     ikke en avrundingsfunksjon. */
  function formatOre(ore){
    const raw = Number(ore);
    const n = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    const neg = n < 0, abs = Math.abs(n);
    const kroner = Math.floor(abs / 100), rest = abs % 100;
    const grouped = String(kroner).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const dec = rest === 0 ? '' : ',' + String(rest).padStart(2, '0');
    return (neg ? '-' : '') + grouped + dec + ' kr';
  }

  const formatDiffOre = ore => (Number(ore) > 0 ? '+' : '') + formatOre(ore);
  /* toGrams, ikke Number(...) direkte: dette formaterer samme rå, lagrede
     grams-felt som toGrams har kontrakten for (komma som desimalskille,
     negativt/ikke-endelig blir 0 gram) — å parse det annerledes her ville
     brutt kontrakten for akkurat det feltet den ble skrevet for. */
  const formatGrams = g => (Math.round(toGrams(g) * 10) / 10).toFixed(1).replace('.', ',') + ' g';

  return Object.freeze({ SAFE_TARGET_ORE, WEIGHT_TOLERANCE, KINDS, STATUSES, DEFAULT_DENOMS, validateDenoms, denomById,
                         toCount, toGrams,
                         unitsFor, valueOre, lineValueOre, weightWarning,
                         sectionTotalOre, safeDiffOre, dayChangeOre, recalc,
                         emptyLine, newSession, syncLines, finalizeSession,
                         formatOre, formatDiffOre, formatGrams });
});
