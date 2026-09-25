# Kasseoppgjør: tell, lagre og kontroller oppgjøret

[Åpne Kasseoppgjør](https://tobiasmidtgard.github.io/internverktoy/kasse.html) for å registrere valørene i safe, åpning og lukking. Veiledningen beskriver funksjonene i dette verktøyet. Hvordan tellingen inngår i butikkens kassestenging, regnskapsavstemming og avviksbehandling, må følge bekreftet lokal rutine.

**Historikken lagres foreløpig i den aktuelle nettleseren på den aktuelle enheten.** Innlogging gjør ikke tellingene tilgjengelige på en annen PC eller telefon. Sletting av nettstedsdata kan fjerne oppgjørene. Bruk butikkens avtalte enhet og dokumentasjonsordning; verktøyet har ikke sentral sikkerhetskopi av disse tellingene. [Lagringsmåten i gjeldende versjon](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/kasse-store.js#L1)

## 1. Velg riktig telling og dato

Kontroller **Dato** og at du arbeider med riktig oppgjør. **Ny telling** starter en ny registrering. Les bekreftelsen nøye hvis du har ulagret arbeid. Skal du fortsette et allerede lagret oppgjør, finner du det gjennom **Historikk** og **Rediger**, når denne knappen er tilgjengelig.

Fanene **Safe**, **Åpning** og **Lukking** er separate deler av samme oppgjør. Bytt til den delen som faktisk skal telles; du trenger ikke opprette en ny telling bare for å gå fra åpning til lukking. [Oppsett og knapper](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/kasse.html#L274)

## 2. Skill antall, ruller, gram og kroner

- **Løse/Antall:** Antall mynter eller sedler av valøren på raden.
- **Ruller:** Antall hele myntruller i safen. Kontroller antallet mynter per rull som vises ved feltet.
- **Gram:** Myntvekt ved åpning eller lukking. Dette er et alternativ til manuell antallstelling for den aktuelle myntraden.
- **Verdi:** Kroner for hele raden, ikke antall penger.

Du kan legge sammen bunker i antallsfeltet, for eksempel **10+10+3**. På raden for hundrelapper betyr dette 23 sedler og 2 300 kroner. Skriver du beløp, bruker du **Verdi**. Kontroller alltid at radens samlede beløp stemmer med det du faktisk har telt.

For myntruller er regnestykket antall ruller ganger mynt per rull, pluss løse mynter. Eksempel: Med 25 mynter per rull gir to ruller og tre løse 20-kroner **53 mynter = 1 060 kroner**. Bruk bare dette eksemplet når den aktuelle rullstørrelsen faktisk er 25. Dersom du skriver samlet verdi på en rad med ruller, må beløpet også omfatte rullene. Ikke tell de samme myntene som både løse og hele ruller.

Ved veiing må riktig myntsort, kontrollert myntvekt og egnet vekt brukes. Følg lokal opplæring for tarering, slik at beholderen ikke regnes som mynt. En vektadvarsel må undersøkes, ikke bare ignoreres. Kontroller telledata manuelt når vekten er usikker. **Valører** er et administrativt oppsett og skal ikke endres for å få en konkret telling til å gå opp. [Beregning og valøroppsett](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/kasse-domain.js)

## 3. Les oppsummeringen riktig

**Avvik safe** sammenligner safeinnholdet med målet. Verktøyets nåværende standardmål er **10 000 kroner**; dette er innstillingen i denne løsningen, ikke et generelt krav til alle butikker. Ved et annet lokalt krav må ansvarlig avklare om verktøyet kan brukes.

**Endring i kassen** er lukking minus åpning. Tallet er ikke dagsomsetning eller ferdig regnskapsavstemming. Kontantuttak, innskudd, betalinger og andre bevegelser må håndteres i butikkens avstemningsrutine. En strek i oppsummeringen betyr at nødvendig tellegrunnlag mangler, ikke at beløpet er null.

Ved avvik teller du på nytt og kontrollerer fane, valør, enhet og eventuelle ruller. Registrer det du faktisk finner. Ikke legg inn oppdiktede penger for å få null i avviksfeltet.

## 4. Lagre og bekreft resultatet

Skriv et kort, saklig **Notat** når noe trenger forklaring, og velg **Lagre oppgjør**. Du må logge inn for å lagre. Rett markerte feltfeil først. Verktøyet kan lagre en telling med safeavvik etter bekreftelse, slik at den faktiske tellingen kan dokumenteres.

Kontroller at du får melding om vellykket lagring og status **Lagret**. Utkast eller tall som fortsatt står på skjermen, er ikke i seg selv bevis på at oppgjøret er lagret. Ved lagringsfeil: les meldingen og kontakt ansvarlig. Ikke slett nettstedsdata som et tilfeldig feilsøkingstiltak; der ligger historikken.

## 5. Godkjenning er en egen kontroll

**Godkjenn** vises for brukere med nødvendig ledertilgang på lagrede oppgjør. I denne versjonen kreves det at safen er talt og går opp, og at endringene er lagret. Den som talte, eller sist lagret endringer i tellingen, kan ikke godkjenne samme oppgjør. Les forklaringen ved en deaktivert knapp. [Godkjenningsvilkårene](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/kasse.html#L483)

Et godkjent oppgjør blir låst for redigering i grensesnittet. Oppdager du en feil etterpå, meld den etter butikkens rutine. En godkjenningsstatus bekrefter heller ikke automatisk at regnskapsavstemming eller øvrige stengingsoppgaver er utført.

## Historikk og overlevering

Åpne **Historikk**, velg riktig dato og oppgjør, og kontroller status før du fortsetter. Et lagret, ikke godkjent oppgjør kan åpnes med **Rediger** for å legge til eller rette opplysninger. Ved redigering brukes dagens valøroppsett. Hvis myntvekt eller rullstørrelse er endret siden oppgjøret ble lagret, kontroller alle berørte rader og summer før ny lagring. Arbeid med samme oppgjør i én fane om gangen.

Lagre igjen etter endring. En annen person med riktig tilgang må gjennomføre godkjenningen når vilkårene er oppfylt.

Ved overlevering oppgir du hvilket oppgjør det gjelder, hva som er telt, hva som gjenstår og eventuelle avvik. Bruk godkjent intern kanal. Ikke send bilder av kontantbeholdning eller kundedata til uvedkommende. [Historikk og videre redigering](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/kasse.html#L1356)
