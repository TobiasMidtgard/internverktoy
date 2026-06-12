# Design — «Teknisk presisjon»

Redesignet 2026-06-12 (spec: `docs/superpowers/specs/2026-06-12-thansen-redesign-design.md`).
Suiten snakker ett språk: verkstedstegningen. Hub-en (index.html) er merkevareflate med
GSAP + Three.js-opplevelse; verktøysidene er produktflater der verktøyet forsvinner inn i oppgaven.

## Theme

Mørkt tema (eierbeslutning, kasse-/veggvisning). Nøytraler tonet mot merkeblått, aldri ren svart/hvit.
Hub-heroen bruker dypblå `--th-blue-deep:#06101f` med blåkopirutenett (`--th-grid`).

## Color

Kanonisk kilde: `:root`-tokens i shared.js (`--th-*`). index.html duplerer de malingskritiske
tokenene i egen `<style>` som fallback (shared.js lastes nederst i body).

- Brand: `--th-brand:#004595`, `--th-brand-2:#2684e6` (interaktiv blå: lenker, linjer, ikoner)
- Fylte knapper: `--th-blue-btn:#1666c4` — hvit tekst = 5.6:1 (AA), flate mot panel = 3.1:1.
  `#2684e6` med hvit tekst feiler AA (3.8:1) og skal ikke brukes som knappefyll.
- Accent: `--th-yellow:#ffd400` (CTA/markering/fokus, ≤10 % av flaten), `--th-red:#e30613` (kun fare)
- Flater: bg `#0f1318`, panel `#161b22`, kort `#1b212a`, hover `#222a35`; hub-dyp `#06101f`
- Linjer: `#2a323d`; blålinje `rgba(38,132,230,.28)`; tekst `#f1f4f8`; sekundær `#97a3b2`
- Lys interaktiv blå for tekst på hover-tints: `#7db8f0` (AA på alle suite-flater)
- tasks.html (Tailwind, frosset bygg): `thansen-500:#004595` er KUN fyllfarge; som tekst i mørkt
  tema overstyres den til `#5b9bd5` i sidens style-blokk.

## Typography

- **Schibsted Grotesk** (Google Fonts, 400–900): alt UI og display. Norsk-designet grotesk; identitet.
- **Martian Mono** (400–700): alle måledata — priser, antall, varenumre, tidspunkter, ukenumre,
  XAL-kommandoer — samt mikro-etiketter (10–11px, 600, uppercase, letter-spacing .08–.14em, `.th-kicker`).
  Mono settes 80–90 % av omkringliggende størrelse (bred font).
- Verktøysider: fast rem-skala, trinn 1.125–1.2, body 15–16px, hierarki via vekt (500/700/800).
- Hub: flytende `clamp()`-display (hero opptil ~9.5vw, trinnforhold ≥1.25).
- Inputfelter aldri under 16px (iOS-zoom).

## Motifs

- **Tittelblokker**: mono-indeks (`01 / SYKKELREGISTER`), hårlinje, displaynavn — seksjons- og sidehoder.
- **Registreringsmerker**: 1px hjørnetikker på nøkkelpaneler (`.th-dialog::before/::after`-mønsteret);
  gule ved interaksjon.
- **Punkterte ledelinjer**: etikett … verdi-rader (spesifikasjonsark, kilder).
- **Blåkopirutenett**: svakt rutenett på hero/lerret/arbeidsflater (3–7 % opasitet).

## Shape & Elevation

- Radius: `--th-radius:10px` (kontroller), `--th-radius-lg:14px` (kort/paneler), 999px chips.
- 1px border er primær avgrensning; skygger små og lave (`--th-shadow`), kun på flytende lag.
- Ingen gradienter/backdrop-blur på flater. Ingen fargede side-striper; bruk prikk, full ramme
  eller bakgrunnstone. Fargekoding (medarbeidere) = 2px underlinje, ikke fylt bakgrunn.

## Motion

To registre, ett vokabular:

**Verktøy (tilstand, ikke pynt)** — CSS, `--th-dur:180ms`, `--th-dur-slow:240ms`, `--th-ease`
(ease-out-expo-aktig), aldri bounce: trykk scale(.98), hover-løft 1–2px, modal fade+scale .96,
panel-glid, underlinje-vekst på søkefokus, ring på skjemafokus, skeleton-shimmer (`.th-skel`),
tall-pop ved verdiendring (`th-tick-pop`), strek-tegning ved fullføring/kopiering (`th-draw`).
Inngangsstagger kun ved første datalast (eksisterende vakter).

**Hub (merkevaretillatelse)** — GSAP 3.15 (core/ScrollTrigger/SplitText/DrawSVG, defer fra CDN,
aldri en forutsetning): førstegangs-preloader ≤1.6s per økt (sessionStorage `th.intro`),
SplitText-tegnstagger på display, magnetiske portaler (quickTo, ±8px), egen peker (prikk + ring,
kun hover+fine pointer), pinnet rulleseksjon med DrawSVG-skjemaer (kun ≥861px), 450ms blå sluse
ved portalnavigasjon (kun rene venstreklikk, vaktbikkje rydder ved avbrudd).
Three.js 0.184 (ES-modul): prosedyrisk wireframe-sykkel, additiv blå, støvfelt, peker-parallakse;
pauser ved skjult fane/utenfor viewport; DPR-tak 2; statisk SVG-fallback ved redusert bevegelse,
manglende WebGL eller importfeil.

`prefers-reduced-motion`: global kill-switch i shared.js + JS-gating av all hub-bevegelse.

## Components

- Knapper: primær (`--th-blue-btn` fylt, hvit tekst), CTA (gul fylt, mørk tekst, kun viktigste
  handling), ghost (1px border), danger (rød). Trykk-feedback på alle.
- Chips: pill, 1px border, aktiv = blå fylt (`--th-blue-btn`); min-height 40px på touch.
- Modal/sheet: tittelblokk-kicker + hårlinje, hjørnetikker, overlay uten blur, Escape lukker.
- Toast: bunnsentrert, statusprikk, `role=status`, glir opp (`.th-toast`).
- Skjemafelter: mono mikro-etiketter, ring-fokus (`0 0 0 3px rgba(38,132,230,.18)`); søkefelt
  bruker underlinje-vekst.
- Ikoner: `T.icon(name)` i shared.js (strek, 1em, currentColor, aria-hidden). Aldri emoji.
- Fokus: global gul `:focus-visible`-outline (shared.js), følger elementets egen radius.
- Strekkodeflater er alltid hvite (skannbarhet).

## Accessibility

AA: 40px+ trykkflater (touch-medieregler per side), aria-labels på ikonknapper, `role=status`
på toasts, Escape-stabler bevart, tastaturaktivering av role=button, skip-lenke på hub,
tekstkontrast ≥4.5:1 (verifiserte par dokumentert i spec §10 + review-funn).
