-- Kasseoppgjør v1 — IKKE KJØRT.
--
-- Skrives nå slik at datalaget i kasse-store.js har en konkret kontrakt å kobles mot
-- senere. Produksjonsbasen er live med ekte data; kjøring er et eget, godkjent steg.
--
-- Mønsteret følger tasks/wiki i denne suiten: lesing er offentlig, skriving går gjennom
-- RPC som verifiserer ansattkode + sesjonstoken (samme signatur som THelper.rpcAuth sender).
--
-- Reglene under er ikke pyntekonstruksjoner. Hver enkelt tilsvarer noe kasse-domain.js
-- eller kasse-store.js håndhever i dag, og som må fortsette å gjelde når skrivingen
-- flytter til serveren — ellers flytter vi bare feilene ut av rekkevidde for testene.


-- ---------------------------------------------------------------------------
-- Valører
-- ---------------------------------------------------------------------------
-- Speiler KasseDomain.validateDenoms. Merk at lesing IKKE skal filtrere på active:
-- kasse-domain.js sin syncLines beholder en linje for en valør som er slått av så
-- lenge det står tall i den, og den linja finnes bare hvis denomById kan slå opp
-- valøren i hele lista. Filtrer man bort inaktive her, forsvinner talte penger.

create table if not exists money_denominations (
  id             text primary key,
  kind           text not null check (kind in ('note','coin')),
  label          text not null,
  value_ore      integer not null check (value_ore > 0),
  gram_per_unit  numeric(6,2) check (gram_per_unit is null or gram_per_unit > 0),
  units_per_roll integer check (units_per_roll is null or units_per_roll > 0),
  sort           integer not null default 0,
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),

  -- id-er slås opp råe. En id med mellomrom rundt seg validerer fint og blir så
  -- aldri funnet — den valøren teller null i stillhet.
  constraint denom_id_trimmed check (id = btrim(id) and id <> ''),
  -- Etiketten er det eneste som identifiserer raden for den som teller. To rader
  -- som begge viser «20 kr» er en fullverdig tellefelle.
  constraint denom_label_trimmed check (label = btrim(label) and label <> ''),
  constraint denom_coin_needs_weight_and_roll check (
    kind <> 'coin' or (gram_per_unit is not null and units_per_roll is not null)),
  -- En seddel som bærer myntfelt blir frosset inn i denom_snapshot og ser
  -- autoritativ ut et år senere.
  constraint denom_note_has_no_coin_fields check (
    kind <> 'note' or (gram_per_unit is null and units_per_roll is null))
);

create unique index if not exists money_denominations_label_key
  on money_denominations (label);


-- ---------------------------------------------------------------------------
-- Oppgjør
-- ---------------------------------------------------------------------------

create table if not exists money_count_sessions (
  id                uuid primary key default gen_random_uuid(),
  session_date      date not null,
  status            text not null default 'saved' check (status in ('saved','verified')),
  note              text not null default '',

  counted_by_tag    text,
  counted_by_name   text,
  counted_at        timestamptz not null default now(),
  verified_by_tag   text,
  verified_by_name  text,
  verified_at       timestamptz,

  -- Toppnivåkolonner så historikklista er rask uten å tolke jsonb. Speiler
  -- summary() i kasse-store.js felt for felt.
  safe_total_ore    integer not null default 0,
  safe_diff_ore     integer not null default 0,
  opening_total_ore integer not null default 0,
  closing_total_ore integer not null default 0,

  -- Detaljene: et oppgjør leses alltid som ett dokument.
  sections          jsonb not null,
  -- Valørkonfigurasjonen slik den var da økten ble lagret. Uten denne ville en
  -- senere endring av en myntvekt stille skrevet om gamle tellinger.
  denom_snapshot    jsonb not null,

  created_at        timestamptz not null default now(),

  -- Et godkjent oppgjør har navn og tidspunkt på seg, eller er ikke godkjent.
  constraint verified_has_signature check (
    status <> 'verified' or (verified_by_tag is not null and verified_at is not null)),
  -- Den som talte kan ikke godkjenne sin egen telling.
  constraint verified_by_someone_else check (
    verified_by_tag is null or verified_by_tag is distinct from counted_by_tag),
  constraint sections_is_object check (jsonb_typeof(sections) = 'object'),
  constraint denom_snapshot_is_array check (jsonb_typeof(denom_snapshot) = 'array')
);

create index if not exists money_count_sessions_date_idx
  on money_count_sessions (session_date desc, counted_at desc);


-- ---------------------------------------------------------------------------
-- Tilgang
-- ---------------------------------------------------------------------------

alter table money_denominations  enable row level security;
alter table money_count_sessions enable row level security;

create policy money_denominations_read  on money_denominations  for select using (true);
create policy money_count_sessions_read on money_count_sessions for select using (true);
-- Ingen insert/update/delete-policy: all skriving går gjennom security definer-RPC.


-- ---------------------------------------------------------------------------
-- RPC-ene supabase-driveren i kasse-store.js skal kalle
-- ---------------------------------------------------------------------------
--
--   save_money_count(p_auth_tag text, p_auth_pw text, p_session jsonb)
--       returns money_count_sessions
--   verify_money_count(p_auth_tag text, p_auth_pw text, p_id uuid)
--       returns money_count_sessions
--   delete_money_count(p_auth_tag text, p_auth_pw text, p_id uuid)
--       returns void
--   save_money_denominations(p_auth_tag text, p_auth_pw text, p_list jsonb)
--       returns setof money_denominations
--
-- Rollekrav: lagring for alle innloggede; godkjenning, sletting og valørendring
-- for manager+. Rollesjekken ligger i dag KUN i sidekoden (THelper.canManage), og
-- det er ikke en sikkerhetsgrense — den må håndheves på nytt inne i disse RPC-ene.
--
-- Regler save_money_count og delete_money_count MÅ håndheve, fordi kasse-store.js
-- håndhever dem i dag og en tapt regel her er tapt uten at noe sier fra:
--   * Et oppgjør med status 'verified' kan ikke lagres over og ikke slettes.
--     Grunnen til å nekte i stedet for å flette: en fletting ville latt beløpene
--     endres etter godkjenning mens raden fortsatt viser at en butikksjef har
--     signert på andre tall.
--   * verify_money_count skal avvise et oppgjør som ikke har status 'saved',
--     og avvise at den som talte godkjenner selv.
--
-- Samtidighet: kasse-store.js har «siste skriving vinner» mellom faner. En
-- upsert her arver det med mindre en revisjonskolonne innføres nå. Vurder
-- `if_match_updated_at` som parameter til save_money_count.
