# Velodex: finn sykkelen, les detaljene og kontroller identiteten

Velodex samler sykkelopplysninger i kort og et søkbart bibliotek. Verktøyet hjelper deg å finne modell, spesifikasjoner og registrert identitet. Et kort er samtidig bare en registrering: kontroller den fysiske sykkelen og butikkens faktiske ordre- og lageropplysninger før du lover en bestemt vare til kunden.

Veiledningen er kontrollert 25. september 2026 mot den dokumenterte kodeversjonen. [Åpne Velodex](https://tobiasmidtgard.github.io/internverktoy/bikes.html).

## Finn sykkelen i biblioteket

I visningsmodus velger du **Sykler**. Søkefeltet heter **Søk etter sykler…**, og søker i navn, hjulstørrelse, farge, varenummer og rammenummer. Begynn med varenummer hvis du kjenner det; bruk modellnavn og størrelse når du må orientere deg.

Trykk på et treff for å finne kortet på arbeidsflaten. Dobbelttrykk på kortet for detaljer. Du kan dra bakgrunnen for å flytte utsnittet; **Nullstill visning** tilbakestiller utsnitt og zoom. Den knappen sletter ikke syklene. [Dokumenterte knapper og betjening](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L501-L540), [bibliotek og søk](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L994-L1048).

Biblioteket i visningsmodus skjuler sykler som er markert skjult, utgått eller ikke på utstilling. **Ingen treff** betyr derfor ikke nødvendigvis at modellen aldri har vært registrert eller ikke finnes fysisk. Kontroller søkeordet og få hjelp fra den som vedlikeholder registeret.

## Les varenummer og rammenummer riktig

**Varenummer** identifiserer produktet i varesystemet. **Rammenummer** brukes til å skille en bestemt fysisk sykkel fra andre eksemplarer. To sykler av samme modell kan ha samme varenummer og forskjellige rammenumre.

I detaljvisningen finner du tilgjengelige spesifikasjoner, pris, beskrivelse og eventuelt tilleggsutstyr. Sammenlign registrert størrelse, farge og rammenummer med sykkelen foran deg. Et likt bilde eller modellnavn er utilstrekkelig når flere eksemplarer står sammen. [Dokumenterte detaljer og identifikatorer](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L1272-L1316).

Registrerte spesifikasjoner hjelper ved oppslag, men erstatter ikke kontroll av passform og tilstand. Bruk [sykkelvalg og størrelse]({{article:sykkel-valg-og-storrelse}}) når kunden skal velge sykkel.

## Kontroller hva strekkoden faktisk inneholder

Trykk på strekkoden for større visning, og bruk **Lukk** for å gå tilbake. Strekkoden bygger på rammenummer når dette er registrert. Hvis rammenummer mangler, brukes varenummer. Detaljvisningen merker feltet **RAMME** eller **VARENR**.

Les denne merkingen før skanning. En kode med rammenummer skal ikke behandles som om den alltid var produktets varenummer. Kontroller også at mottakersystemet forventer den aktuelle identifikatoren. Å vise eller skanne koden i en annen applikasjon er ikke i seg selv dokumentasjon på at et salg, en reservasjon eller en utlevering er registrert. [Dokumentert strekkodevisning](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L1236-L1255).

## Bruk reservedelsoppslaget som en inngang

For kort med tilknyttet thansen-side finnes **Åpne hos Thansen** og **Reservedeler**. Reservedelspanelet har **Søk reservedeler…** og viser tilgjengelige importerte deler med blant annet varenummer. Lenken **Vis alle reservedeler hos Thansen →** åpner sykkelens thansen-side, hvor du kan undersøke videre.

En tom liste beviser ikke at reservedelen ikke kan skaffes. Sammenlign modell og komponentmerking, og kontroller kompatibiliteten i produktdokumentasjonen. [Dokumentert reservedelspanel](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L1323-L1361). Se også [sykkelens slitedeler]({{article:sykkel-slitedeler}}).

## Skill utstilling fra lager og reservasjon

**På utstilling** og **Ikke på utstilling** bestemmer hvordan sykkelen håndteres i utstillingsoversikten. Dette bekrefter ikke at sykkelen er klar for salg, kontrollert eller ledig for reservasjon.

Merket **På lager** på importerte kort bygger på tilgjengelighetsinformasjon i importen. Informasjonen dokumenterer ingen fysisk telling av denne butikkens sykler. Bekreft faktisk tilgjengelighet, pris og eventuell reservasjon i riktig system før du gir kunden et løfte. [Dokumentert import av produktopplysninger](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/importer/src/map.js#L27-L50).

## Redigering krever egen tilgang

Knappen **Kun visning** åpner **Lås opp redigering**. Velodex bruker en egen redigeringskode; tilgang til andre verktøy er ikke automatisk samme tilgang. Når redigering er låst opp, endres knappen til **Redigering**, og **Sykler** blir **+ Ny sykkel**. Trykk **Redigering** når du vil låse igjen. [Dokumentert tilgang og knappetekster](https://github.com/TobiasMidtgard/internverktoy/blob/9e2a07eeb0cab20ba34bc8c775b3628920395b87/bikes.html#L1400-L1448).

Få lokal avklaring om hvem som vedlikeholder registeret. Meld feil med modell, varenummer og hva som ikke stemmer. Ikke endre rammenummer eller slette et kort bare for å få en kundesak videre.
