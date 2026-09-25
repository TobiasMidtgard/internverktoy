# ButikkPlanlegger: finn ansvaret ditt og overlever uferdige oppgaver

ButikkPlanlegger viser oppgaver, ansvarlige og frister. Bruk den til å se hva som er avtalt, markere faktisk fremdrift og oppdage det som må avklares. Verktøyet bestemmer ikke hvilke åpningsrutiner eller andre arbeidsoppgaver butikken skal ha; innholdet må være avtalt lokalt.

Veiledningen er kontrollert 25. september 2026 mot den dokumenterte kodeversjonen. [Åpne ButikkPlanlegger](https://tobiasmidtgard.github.io/internverktoy/tasks.html).

## Finn riktig dag og dine oppgaver

Logg inn med din tildelte konto. Innloggingsknappen øverst har teksten **Logg inn** som hjelpetekst når du ikke er innlogget. Velg deretter en visning:

- **Tavle** grupperer oppgavene i **Gjøremål**, **Pågår** og **Fullført**.
- **Ukesplan** gir oversikt over den valgte uken og hvem som er satt opp.
- **I dag** viser dagens plan som en tidsoversikt.

Bruk medarbeiderfilteret og velg **Mine oppgaver** med din kode. Gå tilbake til **Alle medarbeidere** når du trenger helheten. Filteret endrer bare hva du ser; det tildeler ingen oppgave til deg. Kontroller dato og ansvarlige, særlig i en ukesplan som kan vise en annen uke. [Dokumenterte visninger og navigasjon](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L210-L228), [medarbeiderfilteret](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L509-L524).

Et tomt filtrert resultat er ikke en bekreftelse på at det ikke finnes arbeid. Fjern filteret og avklar med den som fordeler oppgavene hvis planen virker ufullstendig.

## Les oppgaven før du starter

Åpne oppgavekortet for **Oppgavedetaljer**. Les frist, prioritet, gjentakelse og **Beskrivelse & Sjekkliste**. Kontroller hvem som er satt opp. Gjentakende oppgaver kan ha forskjellige ansvarlige på forskjellige dager.

Avklar uklare formuleringer før du begynner: Hva skal være ferdig? Hvilke varer eller områder gjelder oppgaven? Kreves opplæring, utstyr eller godkjenning? En kort tittel gir ikke automatisk svar på dette. [Dokumentert detaljvisning](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L1412-L1438).

## Oppdater sjekkliste og status hver for seg

Kryss av et sjekkpunkt når akkurat det arbeidet er utført. Endringen sendes når du trykker på boksen. Se etter bekreftelsen **Sjekkliste oppdatert**, og følg opp en eventuell feilmelding. En avkrysset sjekkliste endrer ikke automatisk hele oppgavens status. [Dokumentert sjekklistefunksjon](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L1016-L1034).

I detaljvisningen bruker du **Endre Status**. Valgene er **Gjøremål (Ikke startet)**, **Pågår** og **Fullført / Arkivert**. Statusendringen sendes når du velger; det finnes ingen ekstra lagringsknapp i dette feltet. Marker hele oppgaven fullført først når det avtalte resultatet er oppnådd. [Dokumenterte statusvalg](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L264-L278), [lagring av status](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L1451-L1458).

Ikke bruk fullføring til å rydde bort en oppgave du ikke rakk. Ikke anta at et klikk ble lagret hvis verktøyet viser en feil.

## Rettigheter og tydelig overlevering

Innloggede medarbeidere kan bruke sjekklisten og endre status. Oppretting, redigering, sletting og endring av ansvar krever butikksjef- eller IT/dev-tilgang. **Ny Oppgave** og **Rediger** vises derfor ikke for alle. Be ansvarlig person oppdatere planen når du mangler tilgang. [Dokumentert rollevisning](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L602-L618), [lagring og sletting av oppgaver](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L1502-L1530).

Ved overlevering bør neste person få fire opplysninger: hva som er gjort, hva som gjenstår, hva som hindrer videre arbeid og hvilket neste steg som er avtalt. Bruk butikkens avtalte kanal og få oppgavebeskrivelsen oppdatert ved behov. Ikke legg unødvendige kundeopplysninger i oppgaven.

Eksempel: Du har kontrollert og fylt på to av tre hyller, men siste vare har et uavklart antall. Behold korrekt fremdriftsstatus, la det uferdige sjekkpunktet stå åpent og overlever varenummer, funn og hvor varen ligger. Be den som fordeler arbeidet avklare hvem som følger opp.

## Bruk varsler som hjelp

**Varsler** åpner **Varslingssenter**, som viser oppgaver med kort eller utgått frist. **Oppdater statusvarsler** beregner visningen på nytt; knappen fullfører ikke oppgavene. Kontroller selve oppgaven og avtal prioritering når flere ting haster. [Dokumentert varslingspanel](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/tasks.html#L236-L247).
