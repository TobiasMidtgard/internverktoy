# Design

## Theme

Mørkt tema (eierbeslutning, kasse-/veggvisning). Nøytraler er tonet mot merkeblått, aldri ren svart/hvit.

## Color

Kanonisk kilde: `:root`-tokens i shared.js (`--th-*`). Alle sider skal bruke disse verdiene.

- Brand: `--th-brand: #004595` (Thansen-blå), `--th-brand-2: #2684e6` (interaktiv blå)
- Accent: `--th-yellow: #ffd400` (pris/CTA/markering, sparsomt), `--th-red: #e30613` (kun fare; liten tekst bruker lysere `#ff8089`)
- Flater: bg `#0f1318`, panel `#161b22`, kort `#1b212a`, hover `#222a35`, header `#11151b`
- Linjer: `#2a323d`; tekst `#f1f4f8`; sekundær `#97a3b2`
- Semantikk: suksess `#10b981`/`#63d297`, advarsel `#f59e0b`, info = interaktiv blå

Strategi: Restrained. Gul bærer maks ~10 % av flaten.

## Typography

- Suite: Inter (med system-ui-fallback), fast rem-skala, trinn ca. 1.15–1.2. Body 15–16 px.
- Velodex beholder Space Grotesk (identitet) + IBM Plex Mono (strekkoder, priser, varenumre — bærende).
- Hierarki via vekt (600/700/800) mer enn størrelse; micro-labels 10–12 px bold uppercase med letter-spacing.

## Shape & Elevation

- Radius: 8–10 px på kontroller, 12–14 px på kort/paneler, 999 px på chips.
- 1 px border (`--th-line`) er primær avgrensning; skygger små og lave (`0 6px 18px -8px rgba(0,0,0,.5)`), kun på flytende lag (modaler, drag).
- Ingen gradienter eller backdrop-blur på flater. Ingen fargede side-striper (border-left-aksent); bruk prikk, full ramme eller bakgrunnstone i stedet.

## Motion

- Tokens: `--th-dur: 180ms`, `--th-dur-slow: 240ms`, `--th-ease: cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo-aktig). Ingen bounce/elastic.
- Tilstand, ikke pynt: hover-løft på kort (1–2 px + skygge), trykk-feedback (scale .98), modal inn med fade + scale fra .96, panel-sheets glir inn fra kant, toasts glir opp.
- Lister/kort får kort fade-up ved datainnlasting (maks ~6 staggret, 20 ms mellomrom). Ingen side-lastingskoreografi.
- Skeleton-shimmer ved første lasting, ikke spinnere.
- Gledespunkter: hake-sveip når oppgave fullføres; kopier-knapp blinker grønt med hake ved kopiert XAL-kommando.
- Global `@media (prefers-reduced-motion: reduce)` skrur av animasjoner og transisjoner.

## Components

- Knapper: primær (blå fylt, hvit tekst), CTA (gul fylt, mørk tekst, kun viktigste handling), ghost (1 px border), danger (rød border/tekst, fylt ved hover). Trykk-feedback på alle.
- Chips: pill, 1 px border, aktiv = blå fylt.
- Kort: panelflate, 1 px border, hover-løft; aldri kort-i-kort.
- Modal: sentrert sheet, overlay `rgba(6,9,13,.72)` uten blur, fade+scale inn, Escape lukker.
- Toast: bunn-sentrert/bunn-venstre, glir opp, statusprikk i stedet for side-stripe.
- Ikoner: delt SVG-bibliotek `T.icon(name)` i shared.js (Lucide-stil strek, 1 em, currentColor). Aldri emoji som UI-ikon.
- Tomtilstander forklarer neste handling; skeletons ved lasting.
