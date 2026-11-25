-- stores_v1: flere butikker med tilgangsstyring — IKKE KJØRT ENNÅ.
-- Kjøres med: node --env-file=db/.env db/run.mjs supabase/stores_v1.sql
-- (Ta en backup først: node --env-file=db/.env db/backup.mjs)
--
-- Hva migreringen gjør:
--   1) Ny tabell stores + store_members (hvilke ansattkoder hører til hvilken butikk).
--      All eksisterende data flyttes til butikken «fredrikstad», og alle eksisterende
--      ansatte blir medlem der — ingenting endrer seg for dagens brukere.
--   2) tasks, planner_notes, staff_status og bikes får store_id (not null, FK).
--   3) Hver skrive-RPC sjekker at innlogget konto er medlem av butikken raden tilhører.
--      Rollen «dev» (TMID) har tilgang til alle butikker uten medlemskap.
--      Sjekken ligger i databasen, så den gjelder uansett hva klienten sender.
--   4) Velodex bytter fra felles redigeringskode til innlogget konto + butikkmedlemskap,
--      siden en felles kode ikke kan knyttes til én butikk.
--   5) Invitasjonskoden blir per butikk: registrering med en butikks kode gjør den nye
--      kontoen medlem av akkurat den butikken.
--
-- Rollen (coworker/manager/dev) er fortsatt global: en butikksjef er butikksjef i de
-- butikkene vedkommende er medlem av, og bare der.
--
-- Lesing: tasks, planner_notes og bikes er fortsatt offentlig lesbare via tabellene
-- (veggskjerm/visning uten innlogging, som før); sidene filtrerer på valgt butikk.
-- Ansatte og fravær (get_people) krever innlogging OG medlemskap i butikken.
--
-- NB for senere migreringer: endrer du en av funksjonene under med «create or replace»,
-- ta med _require_store-linja. Uten den kan hvem som helst med en konto skrive til
-- alle butikker. db/test_stores.sql fanger dette.

begin;

-- ---------------------------------------------------------------------------
-- 1) Butikker og medlemskap
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id          text primary key,
  name        text not null,
  invite_code text,
  created_at  timestamptz not null default now(),
  constraint stores_id_slug check (id ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  constraint stores_name_trimmed check (name = btrim(name) and name <> '')
);
create unique index if not exists stores_invite_code_key on public.stores (invite_code) where invite_code is not null;
alter table public.stores enable row level security;
-- Ingen select-policy: invitasjonskoden skal ikke kunne leses. Navnelista går via list_stores().
revoke all on public.stores from anon, authenticated;

create table if not exists public.store_members (
  store_id   text not null references public.stores(id) on delete cascade,
  tag        text not null references public.coworkers(tag) on delete cascade on update cascade,
  added_by   text,
  created_at timestamptz not null default now(),
  primary key (store_id, tag)
);
create index if not exists store_members_tag_idx on public.store_members (tag);
alter table public.store_members enable row level security;
revoke all on public.store_members from anon, authenticated;

insert into public.stores (id, name, invite_code)
values ('fredrikstad', 'Fredrikstad',
        (select value from public.app_config where key = 'invite_code'))
on conflict (id) do nothing;

insert into public.store_members (store_id, tag, added_by)
select 'fredrikstad', c.tag, 'stores_v1' from public.coworkers c
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) store_id på butikkdata (eksisterende rader → fredrikstad)
-- ---------------------------------------------------------------------------
alter table public.tasks         add column if not exists store_id text;
alter table public.planner_notes add column if not exists store_id text;
alter table public.staff_status  add column if not exists store_id text;
alter table public.bikes         add column if not exists store_id text;

update public.tasks         set store_id = 'fredrikstad' where store_id is null;
update public.planner_notes set store_id = 'fredrikstad' where store_id is null;
update public.staff_status  set store_id = 'fredrikstad' where store_id is null;
update public.bikes         set store_id = 'fredrikstad' where store_id is null;

do $$
declare t text;
begin
  foreach t in array array['tasks','planner_notes','staff_status','bikes'] loop
    execute format('alter table public.%I alter column store_id set not null', t);
    if not exists (select 1 from pg_constraint where conname = t || '_store_fk') then
      execute format('alter table public.%I add constraint %I foreign key (store_id) references public.stores(id) on update cascade',
                     t, t || '_store_fk');
    end if;
    execute format('create index if not exists %I on public.%I (store_id)', t || '_store_idx', t);
  end loop;
end $$;

-- Samme Thansen-produkt finnes nå én gang per butikk (egen plassering/rammenummer per butikk).
drop index if exists public.bikes_source_uidx;
create unique index if not exists bikes_store_source_uidx
  on public.bikes (store_id, source, source_id) where source is not null;

-- ---------------------------------------------------------------------------
-- 3) Tilgangshjelpere
-- ---------------------------------------------------------------------------

-- Kaster hvis kontoen ikke er gyldig innlogget eller ikke har tilgang til butikken.
-- Returnerer rollen, så kallere kan gjøre egne rollesjekker uten et ekstra oppslag.
create or replace function public._require_store(p_auth_tag text, p_auth_pw text, p_store text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text;
begin
  v_role := public.account_role(p_auth_tag, p_auth_pw);
  if v_role is null then raise exception 'Logg inn først'; end if;
  if p_store is null or not exists (select 1 from public.stores where id = p_store) then
    raise exception 'Ukjent butikk';
  end if;
  if v_role <> 'dev' and not exists (select 1 from public.store_members
                                     where store_id = p_store and tag = upper(p_auth_tag)) then
    raise exception 'Du har ikke tilgang til denne butikken';
  end if;
  return v_role;
end $function$;

create or replace function public._require_store_manager(p_auth_tag text, p_auth_pw text, p_store text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text;
begin
  v_role := public._require_store(p_auth_tag, p_auth_pw, p_store);
  if v_role not in ('manager','dev') then raise exception 'Krever butikksjef-tilgang'; end if;
  return v_role;
end $function$;

-- Butikksjef kan bare forvalte ansatte som deler minst én butikk med seg (dev: alle).
create or replace function public._require_manager_of(p_auth_tag text, p_auth_pw text, p_target text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text;
begin
  v_role := public.account_role(p_auth_tag, p_auth_pw);
  if coalesce(v_role,'') not in ('manager','dev') then raise exception 'Krever butikksjef-tilgang'; end if;
  if v_role <> 'dev' and not exists (
       select 1 from public.store_members a join public.store_members b on a.store_id = b.store_id
       where a.tag = upper(p_auth_tag) and b.tag = upper(p_target)) then
    raise exception 'Denne ansatte hører ikke til din butikk';
  end if;
  return v_role;
end $function$;

revoke all on function public._require_store(text,text,text) from public, anon, authenticated;
revoke all on function public._require_store_manager(text,text,text) from public, anon, authenticated;
revoke all on function public._require_manager_of(text,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Butikk-RPC-er
-- ---------------------------------------------------------------------------

-- Butikkvelgeren. Innlogget: butikkene kontoen er medlem av (dev: alle).
-- Ikke innlogget (tag/token null): alle butikker, kun for visning — dataene de viser
-- er uansett offentlig lesbare.
create or replace function public.list_stores(p_auth_tag text default null, p_auth_pw text default null)
 returns table (id text, name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text;
begin
  if p_auth_tag is null then
    return query select s.id, s.name from public.stores s order by s.name;
    return;
  end if;
  v_role := public.account_role(p_auth_tag, p_auth_pw);
  if v_role is null then raise exception 'Logg inn først'; end if;
  if v_role = 'dev' then
    return query select s.id, s.name from public.stores s order by s.name;
  else
    return query select s.id, s.name from public.stores s
      join public.store_members m on m.store_id = s.id and m.tag = upper(p_auth_tag)
      order by s.name;
  end if;
end $function$;

create or replace function public.create_store(p_auth_tag text, p_auth_pw text, p_id text, p_name text)
 returns table (id text, name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id text := lower(btrim(coalesce(p_id,'')));
begin
  if public.account_role(p_auth_tag, p_auth_pw) is distinct from 'dev' then raise exception 'Krever IT-tilgang'; end if;
  if v_id !~ '^[a-z0-9][a-z0-9-]{1,31}$' then raise exception 'Butikk-id: 2–32 tegn, a–z, 0–9 og bindestrek'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Butikken må ha et navn'; end if;
  if exists (select 1 from public.stores s where s.id = v_id) then raise exception 'Butikken finnes allerede'; end if;
  insert into public.stores (id, name) values (v_id, btrim(p_name));
  -- Thansen-katalogen kopieres inn med én gang, så Velodex ikke er tom til neste natt.
  -- Kortene starter i arkivet (non_display) — butikken legger selv ut det som står i butikken.
  insert into public.bikes (store_id, source, source_id, name, price, frame, item_number, availability,
                            image_url, source_url, outlet, specs, spare_parts, wheel_size, color, color_name,
                            descr, items, display_status, x, y, hidden, discontinued, last_synced)
  select distinct on (b.source_id)
         v_id, b.source, b.source_id, b.name, b.price, '', b.item_number, b.availability,
         b.image_url, b.source_url, b.outlet, b.specs, b.spare_parts, b.wheel_size, b.color, b.color_name,
         b.descr, '[]'::jsonb, 'non_display', b.x, b.y, b.outlet, b.discontinued, b.last_synced
  from public.bikes b where b.source = 'thansen'
  order by b.source_id, b.last_synced desc nulls last;
  return query select s.id, s.name from public.stores s where s.id = v_id;
end $function$;

-- Legg en eksisterende ansatt til en butikk (butikksjef i den butikken, eller dev).
create or replace function public.add_store_member(p_auth_tag text, p_auth_pw text, p_store text, p_tag text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  if not exists (select 1 from public.coworkers where tag = upper(p_tag)) then
    raise exception 'Ukjent ansattkode: %', upper(p_tag);
  end if;
  insert into public.store_members (store_id, tag, added_by)
  values (p_store, upper(p_tag), upper(p_auth_tag)) on conflict do nothing;
end $function$;

create or replace function public.remove_store_member(p_auth_tag text, p_auth_pw text, p_store text, p_tag text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  delete from public.store_members where store_id = p_store and tag = upper(p_tag);
end $function$;

-- Invitasjonskoden er nå per butikk. Gammel signatur droppes (den skrev til app_config).
drop function if exists public.set_invite_code(text, text, text);
create or replace function public.set_invite_code(p_auth_tag text, p_auth_pw text, p_store text, p_new text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  if length(coalesce(btrim(p_new),'')) < 4 then raise exception 'Koden må ha minst 4 tegn'; end if;
  if exists (select 1 from public.stores where invite_code = btrim(p_new) and id <> p_store) then
    raise exception 'Koden er allerede i bruk av en annen butikk';
  end if;
  update public.stores set invite_code = btrim(p_new) where id = p_store;
end $function$;

create or replace function public.get_invite_code(p_auth_tag text, p_auth_pw text, p_store text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  return (select invite_code from public.stores where id = p_store);
end $function$;

-- ---------------------------------------------------------------------------
-- 5) Konto: registrering knytter ny konto til butikken invitasjonskoden tilhører
-- ---------------------------------------------------------------------------
create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text, p_invite text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare ex public.coworkers; v_store text;
begin
  select id into v_store from public.stores
   where invite_code is not null and invite_code = btrim(coalesce(p_invite,''));
  if v_store is null then
    raise exception 'Feil invitasjonskode — spør butikksjefen';
  end if;
  if upper(p_tag) !~ '^[A-ZÆØÅ0-9]{4}$' then raise exception 'Koden må være 4 tegn (A-Å eller 0-9)'; end if;
  if length(coalesce(p_password,'')) < 4 then raise exception 'Passord må ha minst 4 tegn'; end if;
  select * into ex from public.coworkers where tag = upper(p_tag);
  if found then
    if ex.pass_hash is not null then raise exception 'Det finnes allerede en konto for denne koden'; end if;
    if coalesce(ex.role,'coworker') <> 'coworker' then
      raise exception 'Denne kontoen må aktiveres av IT (TMID)';
    end if;
    update public.coworkers set pass_hash = crypt(p_password, gen_salt('bf')),
      name  = coalesce(nullif(trim(p_name),''), name),
      title = coalesce(nullif(p_title,''), title),
      color = coalesce(public._clean_color(nullif(p_color,''), null), color)
    where tag = upper(p_tag);
  else
    insert into public.coworkers (tag,name,color,title,role,pass_hash)
    values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
            coalesce(public._clean_color(nullif(p_color,''), null), '#004595'),
            coalesce(nullif(p_title,''),'Butikkmedarbeider'), 'coworker', crypt(p_password, gen_salt('bf')));
  end if;
  insert into public.store_members (store_id, tag, added_by)
  values (v_store, upper(p_tag), 'invite') on conflict do nothing;
  return public._issue_session(p_tag);
end $function$;

-- ---------------------------------------------------------------------------
-- 6) Ansatte (ButikkPlanlegger)
-- ---------------------------------------------------------------------------
drop function if exists public.get_people(text, text);
create or replace function public.get_people(p_auth_tag text, p_auth_pw text, p_store text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store(p_auth_tag, p_auth_pw, p_store);
  return jsonb_build_object(
    'coworkers', coalesce((select jsonb_agg(to_jsonb(c) order by c.tag)
                           from public.coworkers_public c
                           where exists (select 1 from public.store_members m
                                         where m.store_id = p_store and m.tag = c.tag)), '[]'::jsonb),
    'staff_status', coalesce((select jsonb_agg(to_jsonb(s))
                              from public.staff_status s
                              where s.store_id = p_store
                                and s.day >= (now() at time zone 'Europe/Oslo')::date - 30), '[]'::jsonb)
  );
end $function$;

-- Ny ansatt i butikken — eller, finnes koden fra før (ansatt i en annen butikk),
-- legges vedkommende til denne butikken i stedet.
drop function if exists public.add_coworker(text, text, text, text, text, text);
create or replace function public.add_coworker(p_auth_tag text, p_auth_pw text, p_store text, p_tag text, p_name text, p_color text, p_title text)
 returns coworkers_public
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.coworkers_public;
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  if upper(p_tag) !~ '^[A-ZÆØÅ0-9]{4}$' then raise exception 'Koden må være 4 tegn (A-Å eller 0-9)'; end if;
  insert into public.coworkers (tag,name,color,title)
  values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#004595'),
          coalesce(nullif(p_title,''),'Butikkmedarbeider'))
  on conflict (tag) do nothing;
  insert into public.store_members (store_id, tag, added_by)
  values (p_store, upper(p_tag), upper(p_auth_tag)) on conflict do nothing;
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $function$;

create or replace function public.update_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
 returns coworkers_public
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.coworkers_public;
begin
  perform public._require_manager_of(p_auth_tag, p_auth_pw, p_tag);
  update public.coworkers set name=coalesce(nullif(trim(p_name),''),name),
    color=coalesce(public._clean_color(nullif(p_color,''), null), color),
    title=coalesce(nullif(p_title,''),title)
  where tag=upper(p_tag);
  if not found then raise exception 'Coworker not found'; end if;
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $function$;

-- «Fjern ansatt» fjerner fra butikken. Står vedkommende ikke i noen butikk etterpå,
-- slettes kontoen (som før). Dev-kontoer slettes aldri herfra.
drop function if exists public.delete_coworker(text, text, text);
create or replace function public.delete_coworker(p_auth_tag text, p_auth_pw text, p_store text, p_tag text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  delete from public.store_members where store_id = p_store and tag = upper(p_tag);
  if not exists (select 1 from public.store_members where tag = upper(p_tag)) then
    delete from public.coworkers where tag = upper(p_tag) and role <> 'dev';
  end if;
end $function$;

create or replace function public.reset_password(p_auth_tag text, p_auth_pw text, p_target text, p_new text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare target_role text; v_role text;
begin
  v_role := public._require_manager_of(p_auth_tag, p_auth_pw, p_target);
  if length(coalesce(p_new,'')) < 4 then raise exception 'Nytt passord må ha minst 4 tegn'; end if;
  select role into target_role from public.coworkers where tag = upper(p_target);
  if not found then raise exception 'Ukjent ansattkode'; end if;
  -- en manager skal ikke kunne overta dev-kontoen via passord-nullstilling
  if target_role = 'dev' and v_role <> 'dev' then
    raise exception 'Kun IT (dev) kan nullstille dev-kontoer';
  end if;
  update public.coworkers set pass_hash = crypt(p_new, gen_salt('bf')) where tag = upper(p_target);
  delete from public.sessions where tag = upper(p_target);   -- logg ut alle enheter
end $function$;

-- ---------------------------------------------------------------------------
-- 7) Oppgaver
-- ---------------------------------------------------------------------------
drop function if exists public.add_task(text, text, jsonb);
create or replace function public.add_task(p_auth_tag text, p_auth_pw text, p_store text, p_task jsonb)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.tasks;
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  insert into public.tasks (store_id, title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done, duration_min, day_times)
  values (p_store, coalesce(nullif(trim(p_task->>'title'),''),'Untitled'), nullif(p_task->>'notes',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x),'{}'),
    coalesce(p_task->>'recur_unit','none'), coalesce((p_task->>'recur_n')::int,1),
    public._apply_day_time((p_task->>'due_at')::timestamptz, coalesce(p_task->'day_times','{}'::jsonb)),
    coalesce(p_task->>'status','todo'), coalesce(p_task->>'priority','medium'), coalesce(p_task->>'status','todo')='done',
    coalesce((p_task->>'duration_min')::int, 30),
    coalesce(p_task->'day_times','{}'::jsonb))
  returning * into r; return r;
end $function$;

create or replace function public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.tasks; old_key text; new_key text; merged jsonb; nt jsonb; ndue timestamptz;
begin
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  perform public._require_store_manager(p_auth_tag, p_auth_pw, r.store_id);

  if (p_task ? 'due_at') and r.recur_unit = 'none' and r.due_at is not null
     and nullif(p_task->>'due_at','') is not null then
    old_key := to_char(r.due_at at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    new_key := to_char((p_task->>'due_at')::timestamptz at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    if old_key <> new_key and (coalesce(r.day_assignees,'{}'::jsonb) ? old_key) then
      merged := coalesce(r.day_assignees,'{}'::jsonb);
      merged := jsonb_set(merged, array[new_key],
                  coalesce((select jsonb_agg(distinct x)
                            from jsonb_array_elements(coalesce(merged->new_key,'[]'::jsonb) || (merged->old_key)) as x),
                           '[]'::jsonb)) - old_key;
      update public.tasks set day_assignees = merged where id = p_id;
    end if;
  end if;

  nt   := case when p_task ? 'day_times' then coalesce(p_task->'day_times','{}'::jsonb) else r.day_times end;
  ndue := case when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz else r.due_at end;
  -- normaliser kun ved modal-lagring (payload med day_times); dra-flytting beholder eksplisitt tid
  if p_task ? 'day_times' then ndue := public._apply_day_time(ndue, nt); end if;

  update public.tasks set
    title=coalesce(nullif(trim(p_task->>'title'),''),title),
    notes=case when p_task ? 'notes' then nullif(p_task->>'notes','') else notes end,
    assignees=case when p_task ? 'assignees' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_task->'assignees') as x),'{}') else assignees end,
    recur_unit=coalesce(p_task->>'recur_unit',recur_unit), recur_n=coalesce((p_task->>'recur_n')::int,recur_n),
    due_at=ndue, day_times=nt,
    status=coalesce(p_task->>'status',status), priority=coalesce(p_task->>'priority',priority),
    done=case when p_task ? 'status' then (p_task->>'status')='done' else done end,
    duration_min=case when p_task ? 'duration_min' then (p_task->>'duration_min')::int else duration_min end
  where id=p_id returning * into r;
  return r;
end $function$;

create or replace function public.delete_task(p_auth_tag text, p_auth_pw text, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_store text;
begin
  select store_id into v_store from public.tasks where id = p_id;
  if not found then return; end if;
  perform public._require_store_manager(p_auth_tag, p_auth_pw, v_store);
  delete from public.tasks where id = p_id;
end $function$;

create or replace function public.set_status(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.tasks;
begin
  perform public._require_store(p_auth_tag, p_auth_pw, (select store_id from public.tasks where id = p_id));
  if p_status not in ('todo','progress','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status, done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end,
    notes = case when p_status <> 'done' and status = 'done' and recur_unit <> 'none'
                 then regexp_replace(notes, '([-*]\s+)\[[xX]\]', '\1[ ]', 'g')
                 else notes end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$;

create or replace function public.toggle_check(p_auth_tag text, p_auth_pw text, p_id uuid, p_ci integer)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.tasks; lines text[]; i int; cnt int := -1;
begin
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  perform public._require_store(p_auth_tag, p_auth_pw, r.store_id);
  if r.notes is null then return r; end if;
  lines := string_to_array(r.notes, E'\n');
  for i in 1 .. coalesce(array_length(lines, 1), 0) loop
    if lines[i] ~ '^\s*[-*]\s+\[[ xX]\]\s+' then
      cnt := cnt + 1;
      if cnt = p_ci then
        if lines[i] ~ '\[[xX]\]' then lines[i] := regexp_replace(lines[i], '\[[xX]\]', '[ ]');
        else lines[i] := regexp_replace(lines[i], '\[ \]', '[x]'); end if;
      end if;
    end if;
  end loop;
  update public.tasks set notes = array_to_string(lines, E'\n') where id = p_id returning * into r;
  return r;
end $function$;

create or replace function public.set_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_assignees jsonb)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.tasks;
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, (select store_id from public.tasks where id = p_id));
  update public.tasks set assignees=coalesce((select array_agg(x) from jsonb_array_elements_text(p_assignees) as x),'{}') where id=p_id returning * into r;
  if not found then raise exception 'Task not found'; end if; return r;
end $function$;

create or replace function public.set_day_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tags jsonb)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  arr    jsonb := coalesce(p_tags, '[]'::jsonb);
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, (select store_id from public.tasks where id = p_id));
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )                 -- keep other recent days
    || case when jsonb_array_length(arr) > 0
            then jsonb_build_object(k, arr) else '{}'::jsonb end  -- set/remove this day
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$;

create or replace function public.add_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.tasks;
  v_store text := (select store_id from public.tasks where id = p_id);
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, v_store);
  if not exists (select 1 from public.coworkers where tag = upper(p_tag)) then
    raise exception 'Ukjent ansattkode: %', upper(p_tag);
  end if;
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || jsonb_build_object(k,
         (select jsonb_agg(distinct v) from (
            select jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) as v
            union select upper(p_tag)) s))
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$;

create or replace function public.remove_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
 returns tasks
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, (select store_id from public.tasks where id = p_id));
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || case when exists (select 1 from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                         where v <> upper(p_tag))
            then jsonb_build_object(k,
                   (select jsonb_agg(v) from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                    where v <> upper(p_tag)))
            else '{}'::jsonb end
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$;

-- ---------------------------------------------------------------------------
-- 8) Ukenotater
-- ---------------------------------------------------------------------------
drop function if exists public.add_planner_note(text, text, integer, text, text);
create or replace function public.add_planner_note(p_auth_tag text, p_auth_pw text, p_store text, p_weekday integer, p_body text, p_color text)
 returns planner_notes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r public.planner_notes;
begin
  perform public._require_store(p_auth_tag, p_auth_pw, p_store);
  insert into public.planner_notes (store_id, weekday, body, color, author)
  values (p_store, p_weekday, coalesce(nullif(trim(p_body),''),'…'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#ffd400'), upper(p_auth_tag))
  returning * into r; return r;
end $function$;

create or replace function public.delete_planner_note(p_auth_tag text, p_auth_pw text, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare role text; note public.planner_notes;
begin
  select * into note from public.planner_notes where id=p_id;
  if not found then return; end if;
  role := public._require_store(p_auth_tag, p_auth_pw, note.store_id);
  if note.author <> upper(p_auth_tag) and role not in ('manager','dev') then raise exception 'Kun forfatter eller leder kan slette'; end if;
  delete from public.planner_notes where id=p_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 9) Fravær / vaktstatus
-- ---------------------------------------------------------------------------
drop function if exists public.set_staff_status(text, text, text, text, date, integer, integer);
create or replace function public.set_staff_status(p_auth_tag text, p_auth_pw text, p_store text, p_tag text, p_kind text, p_day date, p_start_min integer, p_dur_min integer)
 returns staff_status
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare role text; rec public.staff_status;
begin
  role := public._require_store(p_auth_tag, p_auth_pw, p_store);
  if upper(p_tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun Butikksjef kan sette status for andre'; end if;
  if not exists (select 1 from public.store_members where store_id = p_store and tag = upper(p_tag))
     and upper(p_tag) <> upper(p_auth_tag) then
    raise exception 'Ansatt % hører ikke til denne butikken', upper(p_tag); end if;
  if p_kind not in ('pause','lunsj','arend','kurs','syk','ferie','fri') then raise exception 'Ugyldig status'; end if;
  if p_kind in ('syk','ferie','fri') then
    delete from public.staff_status where tag = upper(p_tag) and day = p_day and store_id = p_store;
    insert into public.staff_status (store_id, tag, kind, day, all_day, author)
      values (p_store, upper(p_tag), p_kind, p_day, true, upper(p_auth_tag)) returning * into rec;
  else
    insert into public.staff_status (store_id, tag, kind, day, start_min, dur_min, all_day, author)
      values (p_store, upper(p_tag), p_kind, p_day, greatest(0, least(1439, coalesce(p_start_min,0))),
              least(1440, greatest(5, coalesce(p_dur_min,15))), false, upper(p_auth_tag)) returning * into rec;
  end if;
  return rec;
end $function$;

drop function if exists public.set_staff_status_range(text, text, text, text, date, date);
create or replace function public.set_staff_status_range(p_auth_tag text, p_auth_pw text, p_store text, p_tag text, p_kind text, p_from date, p_to date)
 returns setof staff_status
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare role text; d date;
begin
  role := public._require_store(p_auth_tag, p_auth_pw, p_store);
  if upper(p_tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun Butikksjef kan sette status for andre'; end if;
  if not exists (select 1 from public.store_members where store_id = p_store and tag = upper(p_tag))
     and upper(p_tag) <> upper(p_auth_tag) then
    raise exception 'Ansatt % hører ikke til denne butikken', upper(p_tag); end if;
  if p_kind not in ('syk','ferie','fri') then
    raise exception 'Kun heldagsfravær (syk/ferie/fri) kan registreres over flere dager'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Ugyldig datoperiode'; end if;
  if p_to - p_from + 1 > 60 then raise exception 'Maks 60 dager om gangen'; end if;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    -- samme erstatningsregel som set_staff_status: heldagsstatus rydder dagen
    delete from public.staff_status where tag = upper(p_tag) and day = d and store_id = p_store;
    return query insert into public.staff_status (store_id, tag, kind, day, all_day, author)
      values (p_store, upper(p_tag), p_kind, d, true, upper(p_auth_tag)) returning *;
  end loop;
end $function$;

create or replace function public.delete_staff_status(p_auth_tag text, p_auth_pw text, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare role text; rec public.staff_status;
begin
  select * into rec from public.staff_status where id = p_id;
  if not found then return; end if;
  role := public._require_store(p_auth_tag, p_auth_pw, rec.store_id);
  if upper(rec.tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun egen status eller Butikksjef kan fjerne'; end if;
  delete from public.staff_status where id = p_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 10) Velodex: konto + butikk i stedet for felles redigeringskode
-- ---------------------------------------------------------------------------
drop function if exists public.add_bike(text, jsonb);
drop function if exists public.update_bike(text, uuid, jsonb);
drop function if exists public.delete_bike(text, uuid);
drop function if exists public.clone_bike(text, uuid, text);
drop function if exists public.verify_passcode(text);
delete from public.app_config where key = 'edit_passcode';

create or replace function public.add_bike(p_auth_tag text, p_auth_pw text, p_store text, p_data jsonb)
 returns bikes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare rec public.bikes;
begin
  perform public._require_store(p_auth_tag, p_auth_pw, p_store);
  insert into public.bikes (store_id,name,wheel_size,color,color_name,price,frame,item_number,descr,items,x,y)
  values (
    p_store,
    coalesce(p_data->>'name',''),
    coalesce(p_data->>'wheel_size',''),
    coalesce(p_data->>'color','#f4b942'),
    coalesce(p_data->>'color_name','—'),
    coalesce((p_data->>'price')::int,0),
    coalesce(p_data->>'frame',''),
    coalesce(p_data->>'item_number',''),
    coalesce(p_data->>'descr','No description provided.'),
    coalesce(p_data->'items','[]'::jsonb),
    coalesce((p_data->>'x')::double precision,0),
    coalesce((p_data->>'y')::double precision,0)
  ) returning * into rec;
  return rec;
end $function$;

create or replace function public.update_bike(p_auth_tag text, p_auth_pw text, p_uid uuid, p_data jsonb)
 returns bikes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare rec public.bikes;
begin
  perform public._require_store(p_auth_tag, p_auth_pw, (select store_id from public.bikes where uid = p_uid));
  update public.bikes set
    name=coalesce(p_data->>'name',name), wheel_size=coalesce(p_data->>'wheel_size',wheel_size),
    color=coalesce(p_data->>'color',color), color_name=coalesce(p_data->>'color_name',color_name),
    price=coalesce((p_data->>'price')::int,price), frame=coalesce(p_data->>'frame',frame),
    item_number=coalesce(p_data->>'item_number',item_number),
    descr=coalesce(p_data->>'descr',descr), items=coalesce(p_data->'items',items),
    hidden=coalesce((p_data->>'hidden')::boolean,hidden),
    display_status=coalesce(p_data->>'display_status',display_status),
    x=coalesce((p_data->>'x')::double precision,x), y=coalesce((p_data->>'y')::double precision,y),
    updated_at=now()
  where uid=p_uid returning * into rec;
  return rec;
end $function$;

create or replace function public.delete_bike(p_auth_tag text, p_auth_pw text, p_uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_store text;
begin
  select store_id into v_store from public.bikes where uid = p_uid;
  if not found then return; end if;
  perform public._require_store(p_auth_tag, p_auth_pw, v_store);
  delete from public.bikes where uid = p_uid;
end $function$;

create or replace function public.clone_bike(p_auth_tag text, p_auth_pw text, p_uid uuid, p_frame text)
 returns bikes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare rec public.bikes;
begin
  perform public._require_store(p_auth_tag, p_auth_pw, (select store_id from public.bikes where uid = p_uid));
  insert into public.bikes (store_id, name, wheel_size, color, color_name, price, frame, item_number,
                            descr, items, x, y, image_url, specs, spare_parts, source_url,
                            availability, outlet, hidden, discontinued, display_status)
  select store_id, name, wheel_size, color, color_name, price, coalesce(p_frame, ''), item_number,
         descr, items, x + 48, y + 48, image_url, specs, spare_parts, source_url,
         availability, outlet, false, discontinued, 'on_display'
  from public.bikes where uid = p_uid
  returning * into rec;
  if rec.uid is null then raise exception 'bike not found'; end if;
  return rec;
end $function$;

-- Nattlig import (service_role): samme produkt upsertes i hver butikk. Nye produkter
-- legges på lerretet i fredrikstad (som før) og i arkivet i andre butikker, så en ny
-- butikk ikke får hele Thansen-katalogen strødd utover lerretet.
create or replace function public.import_thansen_bike(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.bikes (
    store_id, source, source_id, name, price, frame, item_number, availability, image_url, source_url, outlet,
    specs, spare_parts,
    wheel_size, color, color_name, descr, items,
    display_status, x, y, hidden, discontinued, last_synced
  )
  select
    s.id, 'thansen', p->>'source_id', coalesce(p->>'name',''), coalesce((p->>'price')::int,0),
    coalesce(p->>'frame',''), coalesce(p->>'item_number',''),
    p->>'availability', p->>'image_url', p->>'source_url',
    coalesce((p->>'outlet')::boolean,false),
    coalesce(p->'specs','{}'::jsonb), coalesce(p->'spare_parts','[]'::jsonb),
    coalesce(p->>'wheel_size',''), coalesce(p->>'color','#3fb6a8'), coalesce(p->>'color_name','—'),
    coalesce(p->>'descr',''), '[]'::jsonb,
    case when s.id = 'fredrikstad' then 'on_display' else 'non_display' end,
    coalesce((p->>'x')::double precision,0), coalesce((p->>'y')::double precision,0),
    coalesce((p->>'outlet')::boolean,false), false, now()
  from public.stores s
  -- frame er bevisst IKKE med i upserten: rammenummeret redigeres av bruker
  on conflict (store_id, source, source_id) where source is not null do update set
    name=excluded.name, price=excluded.price, item_number=excluded.item_number,
    availability=excluded.availability, image_url=excluded.image_url,
    source_url=excluded.source_url, outlet=excluded.outlet,
    specs=excluded.specs, spare_parts=excluded.spare_parts,
    discontinued=false, last_synced=now();
end $function$;

-- Importens sikkerhetssjekk sammenligner med antall PRODUKTER, ikke rader (én rad per butikk).
create or replace function public.count_active_thansen()
 returns integer
 language sql
 security definer
 set search_path to 'public'
as $function$
  select count(distinct source_id)::int from public.bikes where source = 'thansen' and discontinued = false;
$function$;
revoke all on function public.count_active_thansen() from public, anon, authenticated;
grant execute on function public.count_active_thansen() to service_role;

-- ---------------------------------------------------------------------------
-- 11) Rettigheter
-- ---------------------------------------------------------------------------
-- Nye funksjoner får execute for PUBLIC som standard i Postgres — strammes inn eksplisitt.
do $$
declare f text;
begin
  foreach f in array array[
    'list_stores(text,text)',
    'create_store(text,text,text,text)',
    'add_store_member(text,text,text,text)',
    'remove_store_member(text,text,text,text)',
    'set_invite_code(text,text,text,text)',
    'get_invite_code(text,text,text)',
    'get_people(text,text,text)',
    'add_coworker(text,text,text,text,text,text,text)',
    'delete_coworker(text,text,text,text)',
    'add_task(text,text,text,jsonb)',
    'add_planner_note(text,text,text,integer,text,text)',
    'set_staff_status(text,text,text,text,text,date,integer,integer)',
    'set_staff_status_range(text,text,text,text,text,date,date)',
    'add_bike(text,text,text,jsonb)',
    'update_bike(text,text,uuid,jsonb)',
    'delete_bike(text,text,uuid)',
    'clone_bike(text,text,uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- Opprydding funnet i oppsettsgjennomgangen: anon/authenticated har hatt full
-- tabellrettighet (insert/update/delete/truncate) på flere tabeller. RLS stopper
-- insert/update/delete i dag, men truncate går utenom RLS. All skriving går via RPC,
-- så kun select trengs der lesing er offentlig.
revoke insert, update, delete, truncate, references, trigger on
  public.bikes, public.tasks, public.planner_notes, public.wiki_links,
  public.coworkers, public.coworkers_public, public.staff_status,
  public.wiki_articles, public.wiki_suggestions
  from anon, authenticated;
-- prune_old_data sletter data og kjøres av pg_cron; ingen grunn til at anon skal kunne kalle den.
revoke execute on function public.prune_old_data() from public, anon, authenticated;

-- invite_code i app_config er erstattet av stores.invite_code
delete from public.app_config where key = 'invite_code';

commit;

notify pgrst, 'reload schema';
