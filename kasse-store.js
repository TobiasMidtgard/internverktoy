/* Kasseoppgjør — datalag. Én kontrakt, to drivere:
   'local'    — localStorage, aktiv i dag
   'supabase' — stub. Hver metode navngir tabellen eller RPC-en den skal treffe.
   Radformene er allerede snake_case, øre-heltall og ISO-datoer, slik at påkoblingen
   skjer inne i driveren uten endringer i sidekoden.

   Lagringsbudsjett: én økt veier omtrent 4,3 kB som JSON. Ved én økt per dag er det
   rundt 1,5 MB i året — nettleserens localStorage-kvote (typisk 5 MB) nås et sted
   mellom to og tre år frem i tid. Det er IKKE en grunn til å beskjære historikken
   automatisk her: å slette pengeposter for å frigjøre plass er verre enn feilen det
   unngår. Svaret er Supabase-driveren — local-driveren er ment å vare til den er
   klar, ikke lenger. */
window.KasseStore = (function () {
  'use strict';

  const K_SESSIONS = 'th.kasse.sessions.v1';
  const K_DENOMS   = 'th.kasse.denoms.v1';
  const K_DRAFT    = 'th.kasse.draft.v1';

  /* Skiller «nøkkelen finnes ikke» (helt normalt — første oppstart, tom historikk)
     fra «nøkkelen finnes, men innholdet er ikke gyldig JSON» (skadet, f.eks. av en
     håndredigering eller en avbrutt skriving). Det første gir fallback i stillhet.
     Det andre kaster: ellers ville en skadet øktliste sett ut som en tom historikk,
     og neste lagring ville skrevet over de skadede — men kanskje delvis
     gjenopprettbare — rådataene for godt. Et pengeregister skal ikke late som
     ingenting skjedde. Manglende/blokkert localStorage (privat modus e.l.) gir
     samme stille fallback som en manglende nøkkel — det er et miljøproblem, ikke
     et datatapsproblem, og skal ikke stoppe siden fra å laste.
     `label` er et menneskelig navn på det som leses (ikke lagringsnøkkelen — en
     ansatt skal ikke måtte forholde seg til «th.kasse.sessions.v1») som brukes i
     feilmeldingen når innholdet er skadet. */
  const readJson = (key, fallback, label) => {
    let raw;
    try { raw = localStorage.getItem(key); }
    catch { return fallback; }
    if (raw == null) return fallback;
    try { return JSON.parse(raw); }
    catch {
      throw new Error((label || 'Lagrede data') + ' kan ikke leses akkurat nå. Dataene er ' +
        'trolig ikke tapt, men ikke lagre noe nytt her før en butikksjef eller IT har sett på det.');
    }
  };
  /* Fanger opp navnet på lagringsfeilen der nettleseren gir oss ett, i stedet for å
     kollapse alt til én boolsk «nei». Kvotefeil (typisk QuotaExceededError) er noe
     annet enn blokkert lagring (f.eks. Safari privat modus, som kan gi SecurityError)
     eller en feil i selve JSON.stringify (f.eks. en sirkulær struktur — en feil i
     appen, ikke noe brukeren gjorde). Returnerer true ved suksess, ellers
     feilnavnet nettleseren oppga (eller 'unknown'). */
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (err) { return (err && err.name) || 'unknown'; }
  };
  /* Ordlegger en mislykket skriving for den som står med kassen, ikke for en
     utvikler: påstår «full» kun når nettleseren faktisk sa det (QuotaExceededError),
     ikke som en gjetning. Rådet er likt uansett årsak — ikke prøv gjentatte ganger,
     si fra til en butikksjef — for det er det eneste stedet en localStorage-feil kan
     følges opp fra i dag. */
  const saveFailMessage = reason =>
    (reason === 'QuotaExceededError' ? 'Nettleseren har ikke mer ledig lagringsplass. '
                                      : 'Lagring i nettleseren feilet. ') +
    'Oppgjøret ble IKKE lagret — si fra til en butikksjef.';

  /* Øktlista skal alltid være en liste. Gyldig JSON kan likevel ha feil form (f.eks.
     et objekt igjen etter en håndredigering) — samme resonnement som readJson over:
     kast en tydelig feil her, i stedet for å la .find/.filter/.map lenger ned
     kræsje med en kryptisk TypeError, eller — verre — stille telle en feilformet
     verdi som en tom liste. */
  const readSessions = () => {
    const all = readJson(K_SESSIONS, [], 'Listen over lagrede oppgjør');
    if (!Array.isArray(all)) throw new Error('Listen over lagrede oppgjør har feil format og kan ' +
      'ikke brukes. Ikke lagre noe nytt her — si fra til en butikksjef.');
    return all;
  };
  /* Samme vaktpost for valørlista — dette var selve hullet forrige runde lot stå:
     getDenominations sjekket `stored && stored.length`, ikke Array.isArray, så et
     objekt (sant, men uten .length) falt tilbake til standardvalørene i stillhet
     (en manager sine endringer forsvinner uten varsel), og et objekt MED en
     tallverdi kalt `length` kom forbi den sjekken og kræsjet lenger ned på
     `.slice is not a function` — en rå engelsk feil forbi all den norske
     meldingsteksten ellers i fila. */
  const readDenoms = () => {
    const stored = readJson(K_DENOMS, null, 'Valørlista');
    if (stored != null && !Array.isArray(stored)) throw new Error('Valørlista har feil format og ' +
      'kan ikke brukes. Si fra til en butikksjef før du lagrer et oppgjør.');
    return stored;
  };

  const deepCopy = v => {
    try { return JSON.parse(JSON.stringify(v)); }
    catch (err) {
      /* JSON.stringify feiler kun på noe uventet (sirkulær struktur, BigInt o.l.) —
         det er en feil i appen som kalte hit, ikke i tallene brukeren har talt. Men
         feilen kan boble helt ut til en toast, så den får en norsk innpakning. */
      throw new Error('Kunne ikke kopiere dataene (' + ((err && err.message) || 'ukjent feil') + ').');
    }
  };
  /* crypto.randomUUID krever sikker kontekst (https), som GitHub Pages alltid er —
     reserven under dekker kun svært gamle nettlesere. Id-er lages ett om gangen,
     synkront, av en ansatt som lagrer én telling om gangen: kollisjonsvinduet i
     reserven (millisekund + ~31 bits tilfeldighet) er i praksis null for den bruken. */
  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const numOrNull = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

  /* Sammendragsraden historikklista viser — speiler toppnivåkolonnene i
     money_count_sessions, slik at Supabase-driveren kan returnere samme form uten å
     tolke jsonb. Defensiv helt ned: én rad fra en eldre versjon, eller en
     håndredigert rad som mangler deler av sections, skal fortsatt vises med det den
     faktisk har — ikke velte hele historikklista for alle de andre radene. */
  const summary = raw => {
    const s = raw || {};
    const sections = s.sections || {};
    const safe = sections.safe || {}, opening = sections.opening || {}, closing = sections.closing || {};
    const safeTotal = numOrNull(safe.total_ore);
    return {
      id: s.id,
      session_date: s.session_date,
      status: s.status,
      note: s.note || '',
      counted_by_tag:  s.counted_by ? s.counted_by.tag : null,
      counted_by_name: s.counted_by ? s.counted_by.name : null,
      counted_at: s.counted_at,
      verified_by_tag:  s.verified_by ? s.verified_by.tag : null,
      verified_by_name: s.verified_by ? s.verified_by.name : null,
      safe_total_ore: safeTotal,
      /* KasseDomain.safeDiffOre — samme testede formel som resten av appen bruker,
         ikke en ny kopi av den her. Kalles bare når vi faktisk har et safe_total_ore:
         en rad uten det er ikke «et avvik på null» (som ville tegnet det grønne
         haketegnet for et balansert oppgjør i historikklista) — den er ukjent,
         altså null, ikke 0. */
      safe_diff_ore: safeTotal === null ? null : KasseDomain.safeDiffOre(s),
      opening_total_ore: numOrNull(opening.total_ore),
      closing_total_ore: numOrNull(closing.total_ore),
    };
  };

  /* Alle mutasjoner under er en les-hele-lista → endre → skriv-hele-lista, uten
     låsing eller transaksjon. To faner/enheter som lagrer samtidig kan la den ene
     overskrive den andre sin rad — akseptert her for et lite, internt verktøy med
     typisk én person om gangen per oppgjør. Fremtidens Supabase-upsert (se stubben
     under) har samme siste-skriving-vinner-semantikk, ingen optimistisk låsing er
     planlagt der heller — denne driveren lover altså ikke mer enn den fremtidige. */
  const local = {
    async saveSession(session){
      const all = readSessions();
      const row = deepCopy(session);
      if (!row.id) row.id = uid();
      const i = all.findIndex(s => s.id === row.id);
      if (i >= 0){
        /* Et godkjent oppgjør er et avsluttet, revidert tall. En hel rad-erstatning
           her ville stille visket ut godkjenningen — og kunnet bytte de godkjente
           beløpene med tall en manager aldri så — hvis en fane som fortsatt holder
           en gammel, ikke-godkjent kopi lagrer etter at godkjenningen skjedde et
           annet sted. Nekt i stedet: den som lagrer må laste siden på nytt og
           forholde seg til at oppgjøret er godkjent. */
        if (all[i].status === 'verified')
          throw new Error('Oppgjøret er godkjent og kan ikke lagres over. Last siden på nytt.');
        all[i] = row;
      } else {
        all.unshift(row);
      }
      const w = writeJson(K_SESSIONS, all);
      if (w !== true) throw new Error(saveFailMessage(w));
      return row;
    },
    async listSessions(opts){
      const o = opts || {};
      let all = readSessions();
      /* En rad uten session_date beholdes i et datofiltrert utvalg i stedet for å
         forsvinne stille — samme linje som summary(): en skadet eller gammelt-
         formet rad skal vises, ikke gjemmes, selv når historikken filtreres. */
      if (o.from) all = all.filter(s => s.session_date == null || s.session_date >= o.from);
      if (o.to)   all = all.filter(s => s.session_date == null || s.session_date <= o.to);
      all.sort((a, b) =>
        String(b.session_date || '').localeCompare(String(a.session_date || '')) ||
        String(b.counted_at || '').localeCompare(String(a.counted_at || '')));
      /* `!= null`, ikke sannhetssjekk: limit:0 betyr faktisk «null rader», ikke
         «ingen grense» — en enkel `if (o.limit)` ville tolket 0 som fraværende. */
      if (o.limit != null) all = all.slice(0, o.limit);
      return all.map(summary);
    },
    async getSession(id){
      return readSessions().find(s => s.id === id) || null;
    },
    async deleteSession(id){
      const all = readSessions();
      const row = all.find(s => s.id === id);
      /* Samme grense som saveSession: et godkjent oppgjør er et avsluttet, revidert
         tall og skal ikke kunne forsvinne sporløst denne veien heller. */
      if (row && row.status === 'verified')
        throw new Error('Godkjente oppgjør kan ikke slettes.');
      const kept = all.filter(s => s.id !== id);
      /* Lista blir aldri større av en sletting, så en kvotefeil her er i praksis
         utelukket — meldingen påstår derfor ikke «full» slik saveFailMessage kan,
         bare at skrivingen feilet. */
      const w = writeJson(K_SESSIONS, kept);
      if (w !== true) throw new Error('Kunne ikke slette oppgjøret (lagring i nettleseren feilet). ' +
        'Prøv igjen, eller si fra til en butikksjef.');
    },
    async verifySession(id, user){
      if (!user || !user.tag) throw new Error('Mangler innlogget bruker for godkjenning.');
      const all = readSessions();
      const row = all.find(s => s.id === id);
      if (!row) throw new Error('Fant ikke oppgjøret.');
      /* «Godkjenn» gjelder et lagret oppgjør (se spesifikasjonen, kap. 6.2) — verken
         et upublisert utkast eller et allerede godkjent oppgjør skal kunne
         godkjennes på nytt via denne veien. UI-et skjuler knappen i begge
         tilfeller, men driveren skal ikke stole blindt på det — dette er
         pengedata. */
      if (row.status !== 'saved') throw new Error('Bare lagrede oppgjør kan godkjennes.');
      /* Selvgodkjenning gir ingen reell kontroll — én person kunne da telle og
         godkjenne alene. tag-sammenligningen koster ingenting og krever ikke en
         rolle på brukeren. Den egentlige manager+-sjekken (hvem som i det hele tatt
         FÅR trykke «Godkjenn») skjer i sidelaget via THelper.canManage() —
         user-objektet som når hit er {tag, name}, uten rolle, akkurat som
         counted_by, så driveren har ikke grunnlag for å håndheve selve rollen uten
         å utvide den kontrakten. Det stoler den bevisst på at sidelaget gjør
         riktig, slik kommentaren over også sier om statussjekken. */
      if (row.counted_by && row.counted_by.tag === user.tag)
        throw new Error('Den som talte kan ikke godkjenne sin egen telling.');
      row.status = 'verified';
      row.verified_by = { tag:user.tag, name:user.name };
      row.verified_at = new Date().toISOString();
      const w = writeJson(K_SESSIONS, all);
      if (w !== true) throw new Error(saveFailMessage(w));
      return row;
    },
    async getDenominations(){
      const stored = readDenoms();
      const list = (stored && stored.length) ? stored : deepCopy(KasseDomain.DEFAULT_DENOMS);
      /* Sortert her, én gang: resten av appen bygger linjer og rader i listerekkefølge,
         så en valør lagt til i valørarket havner der `sort` sier, ikke nederst. */
      const sorted = list.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      /* Validert på lesesiden akkurat som på skrivesiden: lagringen kan være
         håndredigert eller skrevet av en eldre versjon, og en ugyldig valør (f.eks.
         negativ verdi eller manglende myntvekt) skal ikke gli rett inn i
         pengematematikken i resten av appen uten en advarsel. */
      const check = KasseDomain.validateDenoms(sorted);
      if (!check.ok) throw new Error('Lagret valørliste er ugyldig: ' + check.error);
      return sorted;
    },
    async saveDenominations(list){
      const check = KasseDomain.validateDenoms(list);
      if (!check.ok) throw new Error(check.error);
      /* Dypkopi før lagring, samme som saveSession: den lagrede (og returnerte)
         lista skal ikke dele identitet med kallerens array. Fortsetter kalleren å
         redigere sin kopi etterpå (f.eks. et redigeringsvindu som lever videre),
         skal ikke det stille endre det som allerede er «lagret». */
      const row = deepCopy(list);
      const w = writeJson(K_DENOMS, row);
      if (w !== true) throw new Error(saveFailMessage(w));
      return row;
    },
  };

  const supabase = {
    async saveSession(){ throw new Error('not-implemented: RPC save_money_count(p_auth_tag, p_auth_pw, p_session jsonb) → upsert i money_count_sessions'); },
    async listSessions(){ throw new Error('not-implemented: select toppnivåkolonner fra money_count_sessions, order by session_date desc, counted_at desc'); },
    async getSession(){ throw new Error('not-implemented: select * fra money_count_sessions where id = ? (inkl. sections og denom_snapshot)'); },
    async deleteSession(){ throw new Error('not-implemented: RPC delete_money_count(p_auth_tag, p_auth_pw, p_id)'); },
    async verifySession(){ throw new Error('not-implemented: RPC verify_money_count(p_auth_tag, p_auth_pw, p_id)'); },
    /* Ingen `where active` her: local-driveren returnerer ALLE valører, aktive og
       ikke, fordi kasse-domain.js sin denomById/syncLines slår opp i hele lista —
       en linje for en deaktivert valør skal fortsatt kunne verdsettes (og vises i
       valørarket for reaktivering), ikke telles som 0. Et server-side filter her
       ville stille forkastet talte penger. Stubbens tekst ER spesifikasjonen for
       den fremtidige implementasjonen, så filteret er bevisst utelatt. */
    async getDenominations(){ throw new Error('not-implemented: select * fra money_denominations order by sort (alle rader, ikke bare aktive)'); },
    async saveDenominations(){ throw new Error('not-implemented: RPC save_money_denominations(p_auth_tag, p_auth_pw, p_list jsonb)'); },
  };

  const drivers = { local, supabase };
  let active = 'local';

  const METHOD_NAMES = ['saveSession','listSessions','getSession','deleteSession','verifySession','getDenominations','saveDenominations'];
  /* Selvsjekkende kontraktsparitet: uten dette er metodelista tre steder å
     vedlikeholde i takt (local, supabase, dispatch-loopen lenger ned) — glemmer
     noen å legge en ny metode til én av driverne, skal det feile høylytt med én
     gang her ved innlasting, ikke som en kryptisk TypeError første gang noen
     bytter driver og treffer den manglende metoden. */
  METHOD_NAMES.forEach(fn => {
    if (typeof local[fn] !== 'function' || typeof supabase[fn] !== 'function')
      throw new Error('KasseStore: metoden "' + fn + '" mangler i local- eller supabase-driveren.');
  });

  /* Utkast er alltid lokalt og synkroniseres aldri: en telefon som låser seg midt
     i tellingen skal ikke koste en ny telling. Et skadet eller ulesbart utkast er
     til gjengjeld ikke noe å kaste feil over — verste konsekvens er én telling på
     nytt, ikke tapt historikk — så getDraft degraderer stille til «intet utkast»
     i stedet for å arve readJson sin strenge feiling mot skadet JSON.
     saveDraft returnerer true/false synkront (ikke en Promise): false betyr at
     skrivingen feilet, akkurat idet et låst utkast skulle spart brukeren for en ny
     telling. Sidelaget bør sjekke returverdien og varsle — ikke anta at kallet
     alltid lykkes. */
  const saveDraft  = draft => writeJson(K_DRAFT, draft) === true;
  const getDraft   = () => { try { return readJson(K_DRAFT, null, 'Utkastet'); } catch { return null; } };
  const clearDraft = () => { try { localStorage.removeItem(K_DRAFT); } catch {} };

  const api = {
    use(name){ if (!drivers[name]) throw new Error('Ukjent driver: ' + name); active = name; },
    driver: () => active,
    saveDraft, getDraft, clearDraft,
    KEYS: { sessions:K_SESSIONS, denoms:K_DENOMS, draft:K_DRAFT },
  };
  METHOD_NAMES.forEach(fn => { api[fn] = (...args) => drivers[active][fn](...args); });
  return api;
})();
