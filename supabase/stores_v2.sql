-- stores_v2: automatisk plassering i Velodex av sykler som er på lager i butikken — IKKE KJØRT.
-- Krever stores_v1. Kjøres med: node --env-file=db/.env db/run.mjs supabase/stores_v2.sql
--
-- Hver butikk kan få et Thansen-butikknummer (stores.thansen_store_id). Den nattlige
-- importen sender med hvilke Thansen-butikker hvert produkt er på lager i
-- (p->'stock_stores', en liste med butikknumre). Er produktet på lager i butikken og
-- har aldri vært plassert automatisk der før, legges kortet ut på lerretet i første
-- ledige rute.
--
-- Regler:
--   * Bare én automatisk plassering per sykkel per butikk (bikes.auto_placed_at). Fjerner
--     noen kortet fra utstillingen (f.eks. fordi sykkelen står på lageret bak), blir det
--     ikke lagt ut igjen neste natt.
--   * Importen fjerner aldri kort: en sykkel som er utsolgt i systemet kan fortsatt stå
--     fysisk i butikken. Lagerstatus vises som før på kortet.
--   * Sender importen ikke stock_stores (feltet er ukjent eller hentingen feilet),
--     endres ingen plassering — da oppfører importen seg som før.

begin;

alter table public.stores add column if not exists thansen_store_id text;
alter table public.stores add column if not exists auto_place boolean not null default true;
alter table public.bikes  add column if not exists auto_placed_at timestamptz;

-- Første ledige rute i samme rutenett som importen bruker (importer/src/run.js:
-- 5 kolonner, 340 × 460 px, start 140,140). En rute er opptatt hvis et kort på
-- utstilling har øvre venstre hjørne innenfor samme rute.
create or replace function public._next_free_slot(p_store text)
 returns table (x double precision, y double precision)
 language sql
 stable
 set search_path to 'public'
as $function$
  select (140 + (i % 5) * 340)::double precision, (140 + (i / 5) * 460)::double precision
  from generate_series(0, 4999) as i
  where not exists (
    select 1 from public.bikes b
    where b.store_id = p_store and b.display_status = 'on_display'
      and not b.hidden and not b.discontinued
      and b.x > 140 + (i % 5) * 340 - 300 and b.x < 140 + (i % 5) * 340 + 300
      and b.y > 140 + (i / 5) * 460 - 420 and b.y < 140 + (i / 5) * 460 + 420)
  order by i
  limit 1
$function$;
revoke all on function public._next_free_slot(text) from public, anon, authenticated;

-- Legg ut én butikks rad for et produkt hvis det er på lager der og ikke er plassert før.
create or replace function public._auto_place_bike(p_uid uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b public.bikes; slot record;
begin
  select * into b from public.bikes where uid = p_uid for update;
  if not found or b.auto_placed_at is not null or b.hidden or b.discontinued then return false; end if;
  if b.display_status = 'on_display' then
    update public.bikes set auto_placed_at = now() where uid = p_uid;   -- står allerede ute
    return false;
  end if;
  select * into slot from public._next_free_slot(b.store_id);
  update public.bikes set display_status = 'on_display', x = slot.x, y = slot.y,
                          auto_placed_at = now(), updated_at = now()
   where uid = p_uid;
  return true;
end $function$;
revoke all on function public._auto_place_bike(uuid) from public, anon, authenticated;

-- Importen: som i stores_v1, pluss automatisk plassering når stock_stores er med.
create or replace function public.import_thansen_bike(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record;
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
    -- butikker med automatisk plassering starter i arkivet og legges ut under
    case when s.id = 'fredrikstad' and not (s.auto_place and s.thansen_store_id is not null
                                            and jsonb_typeof(p->'stock_stores') = 'array')
         then 'on_display' else 'non_display' end,
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

  if jsonb_typeof(p->'stock_stores') = 'array' then
    for r in
      select b.uid from public.bikes b join public.stores s on s.id = b.store_id
      where b.source = 'thansen' and b.source_id = p->>'source_id'
        and s.auto_place and s.thansen_store_id is not null
        and p->'stock_stores' ? s.thansen_store_id
        and b.auto_placed_at is null
      order by b.store_id
    loop
      perform public._auto_place_bike(r.uid);
    end loop;
  end if;
end $function$;

-- Butikksjef setter Thansen-butikknummeret og slår automatisk plassering av/på.
create or replace function public.set_store_thansen(p_auth_tag text, p_auth_pw text, p_store text, p_thansen_id text, p_auto boolean)
 returns table (thansen_store_id text, auto_place boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store_manager(p_auth_tag, p_auth_pw, p_store);
  if nullif(btrim(coalesce(p_thansen_id,'')),'') is not null and btrim(p_thansen_id) !~ '^[A-Za-z0-9_-]{1,32}$' then
    raise exception 'Ugyldig Thansen-butikknummer';
  end if;
  update public.stores s set thansen_store_id = nullif(btrim(coalesce(p_thansen_id,'')),''),
                             auto_place = coalesce(p_auto, s.auto_place)
   where s.id = p_store;
  return query select s.thansen_store_id, s.auto_place from public.stores s where s.id = p_store;
end $function$;

create or replace function public.get_store_thansen(p_auth_tag text, p_auth_pw text, p_store text)
 returns table (thansen_store_id text, auto_place boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_store(p_auth_tag, p_auth_pw, p_store);
  return query select s.thansen_store_id, s.auto_place from public.stores s where s.id = p_store;
end $function$;

-- Butikkene med automatisk plassering (importen bruker dette for å vite hvilke
-- butikknumre den skal hente lager for).
create or replace function public.auto_place_stores()
 returns table (id text, thansen_store_id text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.thansen_store_id from public.stores s
  where s.auto_place and s.thansen_store_id is not null order by s.id
$function$;

revoke all on function public.set_store_thansen(text,text,text,text,boolean) from public;
revoke all on function public.get_store_thansen(text,text,text) from public;
grant execute on function public.set_store_thansen(text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.get_store_thansen(text,text,text) to anon, authenticated;
revoke all on function public.auto_place_stores() from public, anon, authenticated;
grant execute on function public.auto_place_stores() to service_role;

commit;

notify pgrst, 'reload schema';
