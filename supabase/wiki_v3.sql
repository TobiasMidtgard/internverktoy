-- Thansen Verktøykasse · Wiki v3 — Snarveier (lenkekatalog + XAL-kommandoer)
-- Kunnskapsbasen får en strukturert katalog over interne verktøy: nettsider vi
-- bruker (kind='url', klikkbar lenke) og XAL-snarveier (kind='xal', kopierbar
-- kommando/funksjonstast/menysti). Lesing krever innlogging (som wiki_v2);
-- endring krever butikksjef/dev. Ekte innhold legges inn via UI-et eller i
-- seed-blokken nederst.

create table if not exists public.wiki_links (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default 'url' check (kind in ('url','xal')),
  url         text,                          -- kind='url'
  command     text,                          -- kind='xal' (funksjonstast/menysti)
  description text not null default '',
  category    text not null default 'Generelt',
  sort_order  int  not null default 0,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  check (kind <> 'url' or url is not null),
  check (kind <> 'xal' or command is not null)
);
alter table public.wiki_links enable row level security;   -- ingen policies: lesing kun via RPC

-- Alle innloggede kan liste snarveiene
create or replace function public.get_links(p_auth_tag text, p_auth_pw text)
returns setof public.wiki_links language plpgsql security definer set search_path = public as $$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å se snarveier'; end if;
  return query select * from public.wiki_links order by category, sort_order, title;
end $$;

create or replace function public.add_link(p_auth_tag text, p_auth_pw text, p_link jsonb)
returns public.wiki_links language plpgsql security definer set search_path = public as $$
declare r public.wiki_links;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.wiki_links (title, kind, url, command, description, category, sort_order, updated_by)
  values (coalesce(nullif(trim(p_link->>'title'),''),'Uten tittel'),
          coalesce(nullif(p_link->>'kind',''),'url'),
          nullif(trim(coalesce(p_link->>'url','')),''),
          nullif(trim(coalesce(p_link->>'command','')),''),
          coalesce(p_link->>'description',''),
          coalesce(nullif(p_link->>'category',''),'Generelt'),
          coalesce((p_link->>'sort_order')::int,0),
          upper(p_auth_tag))
  returning * into r; return r;
end $$;

create or replace function public.update_link(p_auth_tag text, p_auth_pw text, p_id uuid, p_link jsonb)
returns public.wiki_links language plpgsql security definer set search_path = public as $$
declare r public.wiki_links;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.wiki_links set
    title       = coalesce(nullif(trim(p_link->>'title'),''), title),
    kind        = coalesce(nullif(p_link->>'kind',''), kind),
    url         = case when p_link ? 'url'         then nullif(trim(coalesce(p_link->>'url','')),'') else url end,
    command     = case when p_link ? 'command'     then nullif(trim(coalesce(p_link->>'command','')),'') else command end,
    description = case when p_link ? 'description' then coalesce(p_link->>'description','') else description end,
    category    = coalesce(nullif(p_link->>'category',''), category),
    sort_order  = coalesce((p_link->>'sort_order')::int, sort_order),
    updated_by  = upper(p_auth_tag), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Snarvei ikke funnet'; end if; return r;
end $$;

create or replace function public.delete_link(p_auth_tag text, p_auth_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.wiki_links where id = p_id; end $$;

grant execute on function public.get_links(text,text)              to anon, authenticated;
grant execute on function public.add_link(text,text,jsonb)         to anon, authenticated;
grant execute on function public.update_link(text,text,uuid,jsonb) to anon, authenticated;
grant execute on function public.delete_link(text,text,uuid)       to anon, authenticated;

-- Seed (idempotent — kjøres bare når katalogen er tom). Fyll på med ekte
-- XAL-snarveier og lenker her, eller legg dem inn via UI-et.
insert into public.wiki_links (title, kind, url, description, category, sort_order)
select * from (values
  ('Thansen.no', 'url', 'https://www.thansen.no', 'Nettbutikken — produktsøk, lager og priser.', 'Nettsider', 0)
) v(title, kind, url, description, category, sort_order)
where not exists (select 1 from public.wiki_links limit 1);
