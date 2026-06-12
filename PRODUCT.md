# Product

## Register

product

## Users

Ansatte i Thansen-butikken i Fredrikstad: butikkmedarbeidere, butikksjef og IT/dev. Norsk UI. Brukes i korte glimt mellom kunder, på mobil på lager/butikkgulv og på desktop på bakrommet/kasse-PC. Brukerne er ikke teknologer; de skal finne dagens oppgaver, registrere fravær, slå opp en sykkel eller en XAL-snarvei på sekunder.

## Product Purpose

Thansen Internverktøy (tidligere «Verktøykasse») er en intern verktøysuite på GitHub Pages med Supabase-backend: ButikkPlanlegger (oppgavetavle, ukesplan, fravær), Velodex (sykkelregister med strekkoder og Thansen-sync) og Kunnskapsbase (wiki + Snarveier for XAL-kommandoer og lenker). Suksess er at verktøyet forsvinner inn i arbeidsoppgaven: raskt, gjenkjennelig, til å stole på.

## Brand Personality

Presis, mekanisk, pålitelig — «Teknisk presisjon» (verkstedstegningen som designspråk, redesign 2026-06-12). Thansen-identiteten (blå #004595, gul #ffd400, rød #e30613) brukes funksjonelt. To registre: hub-en (index.html) er merkevareflate med opplevelseslag (Three.js-skjemategning, GSAP-koreografi, levende data) — verktøyene skal nås på under ett sekund uansett; verktøysidene er rolige produktflater der moderne følelse kommer fra presisjon og respons (mikro-interaksjoner), ikke fra effekter.

## Anti-references

- «AI-generert dashboard»: emoji som ikoner, indigo/lilla gradienter, glassmorphism, uniforme kort-grids med skygger. (Eksplisitt tilbakemelding fra eier.)
- Støyete/spretne animasjoner som stjeler oppmerksomhet i butikkbruk.
- Generisk SaaS-landingsside-estetikk; dette er et arbeidsverktøy.

## Design Principles

1. **Verktøyet forsvinner inn i oppgaven.** Alt skal kunne avleses i et glimt mellom to kunder.
2. **Bevegelse formidler tilstand.** 150–250 ms ease-out på tilstandsskift, lasting og feedback. Ingen lastekoreografi. Gledespunkter kun ved fullføringsøyeblikk (oppgave ferdig, kommando kopiert).
3. **I dag først.** Dagens oppgaver øverst og alltid synlige; uke- og månedshorisonter foldes bort til de trengs.
4. **Thansen-fargene er funksjonelle.** Gul = pris/CTA/markering, blå = interaktivt, rød = kun fare/feil. Nøytraler er tonet mot merkeblått.
5. **Ett vokabular i hele suiten.** Samme knapper, chips, modaler, toasts og ikonspråk i alle fire verktøy.

## Accessibility & Inclusion

AA-ambisjon: 40 px+ trykkflater, aria-labels på ikon-knapper, role/status på toasts, Escape lukker modaler. `prefers-reduced-motion` respekteres globalt. Må fungere på rimelige Android-telefoner; mørkt tema er et bevisst valg (vegg-/kassevisning uten blending) bekreftet av eier.
