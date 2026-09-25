# Fagstoff til kunnskapsbasen

Hver kildeartikkel består av `<slug>.md` og `<slug>.metadata.json`. Dette er
offentlig fagstoff med offentlige kilder. Ansattopplysninger, kundedata,
interne skjermbilder og knappesekvenser skal fortsatt lagres gjennom den
innloggede wikien, ikke legges i dette offentlige GitHub-repositoriet.

## Redaksjonell struktur

Start i `selgerens-startside.md`. Artiklene skal hjelpe en selger å avklare
behov, gjøre et etterprøvbart oppslag og forklare produktvalget. Skill mellom
lovkrav, produsentkrav, offentlige kundevilkår og anbefalt arbeidsmåte.
Interne fullmakter eller systemtrinn må bekreftes før de beskrives som rutine.

- Bruk én tittel (`#`) som er identisk med `title` i metadata.
- Bruk korte avsnitt, mellomtitler og enkle lister. Wikiens Markdown-visning
  støtter ikke tabeller eller HTML.
- Oppgi `category`, søkeord i `tags`, `checked_at` og HTTPS-lenker i `sources`.
- Skriv interne artikkellenker som `[Les om olje]({{article:motorolje-og-spesifikasjoner}})`.
  Publiseringen løser disse til stabile artikkeladresser.
- Verifiser produktreferanser, regler og gjeldende vilkår ved oppdatering.
  En kontrollert produktreferanse er ikke en garanti for dagens lagerstatus.

## Publisering

Kjør fra repository-roten med Node og den lokale, gitignorerte databasekonfigurasjonen:

```sh
node --test tests/wiki-publish.test.mjs
node --env-file=db/.env db/publish-wiki.mjs
node --env-file=db/.env db/publish-wiki.mjs --apply
```

Første databasekommando viser en plan uten å lagre endringer. `--apply`
skriver hele settet i én transaksjon og kontrollerer innholdet ved å lese det
tilbake. Kun eksakte, urørte startmaler eller tidligere publisert innhold
med uendret kontrollsum kan erstattes. En tekst som noen har redigert i
wikien, stopper publiseringen og må sammenlignes og avklares manuelt.
Knappesekvenser erstattes aldri av denne jobben.

`published.json` inneholder ID og kontrollsum fra siste publisering og skal
committes sammen med fagstoffet. Sikkerhetskopier av erstattede rader ligger
i `db/backups/` og skal aldri committes. Databaseinnholdet blir tilgjengelig
umiddelbart; endringer i wikiens grensesnitt må også pushes og publiseres
gjennom GitHub Pages.

## Dekning

Håndboken har 41 kildeartikler om grunnleggende behovsavklaring, deleoppslag,
pærer, olje og andre bilvæsker, batterier, viskere, bremser, filtre,
varsler/diagnose, dekk/felger, barneseter, taktransport, tilhenger, sykkel,
elsykkel, bilpleie, MC/scooter, verktøy, festemidler/løft, camping, båt,
elektronikk, bilstereo, hage/fritid og sentrale kundevilkår. Den dekker også
kjemikalie-HMS, avfall, serviceinnlevering, personvern, varemottak og bruk
av kunnskapsbasen, Kasseoppgjør, ButikkPlanlegger og Velodex. Den
eksisterende medarbeiderartikkelen om dekk og lagrede knappesekvenser beholdes.

Håndboken er under utbygging. Intern opplæring i XAL, butikkens kassestenging,
mottakssystem, fullmakter, beredskap og serviceavtaler må fortsatt bekreftes
lokalt. HMS utover kjemikalier og en egen veiledning om produkttilbakekalling
gjenstår. En generell håndbok kan ikke erstatte oppdatert dokumentasjon for
hvert produkt eller lokal opplæring.

Verktøyveiledningene henviser til en kontrollert kodeversjon. De må revideres
når brukerflyt eller datalagring endres. Kasseoppgjør bruker foreløpig lokal
nettleserlagring; håndboken må ikke love sentral historikk eller sikkerhetskopi.
