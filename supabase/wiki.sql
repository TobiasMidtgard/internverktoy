-- Thansen Verktøykasse · Kunnskapsbase (wiki) — artikler, forslag, norsk fulltekst-søk
-- Run once in the Supabase SQL editor (after tasks_v7.sql — uses account_role/_require_manager).

create extension if not exists pg_trgm with schema extensions;

-- 1. Artikler --------------------------------------------------------------
create table if not exists public.wiki_articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'Generelt',
  tags        text[] not null default '{}',
  body        text not null default '',
  sources     jsonb not null default '[]',   -- [{label,url}]
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  tsv tsvector generated always as (
    to_tsvector('norwegian',
      coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || array_to_string(coalesce(tags,'{}'),' '))
  ) stored
);
create index if not exists wiki_tsv_idx        on public.wiki_articles using gin(tsv);
create index if not exists wiki_title_trgm_idx on public.wiki_articles using gin(title extensions.gin_trgm_ops);

alter table public.wiki_articles enable row level security;
drop policy if exists wiki_read on public.wiki_articles;
create policy wiki_read on public.wiki_articles for select using (true);
grant select on public.wiki_articles to anon, authenticated;

-- 2. Forslag (alle innloggede kan foreslå; ledere/IT vurderer) --------------
create table if not exists public.wiki_suggestions (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid references public.wiki_articles(id) on delete set null,
  article_title text,
  body          text not null,
  author        text,
  status        text not null default 'open' check (status in ('open','applied','dismissed')),
  created_at    timestamptz not null default now()
);
alter table public.wiki_suggestions enable row level security;
drop policy if exists wiki_sug_read on public.wiki_suggestions;
create policy wiki_sug_read on public.wiki_suggestions for select using (true);
grant select on public.wiki_suggestions to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wiki_articles')
  then execute 'alter publication supabase_realtime add table public.wiki_articles'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wiki_suggestions')
  then execute 'alter publication supabase_realtime add table public.wiki_suggestions'; end if;
end $$;

-- 3. Robust søk: norsk fulltekst + trigram (skrivefeil/delord), uthevet utdrag
create or replace function public.wiki_search(p_q text, p_category text default null)
returns table(id uuid, title text, category text, snippet text, rank real)
language sql security definer set search_path = public, extensions as $$
  with q as (
    select websearch_to_tsquery('norwegian', coalesce(nullif(trim(p_q),''),'')) as ts,
           coalesce(nullif(trim(p_q),''),'') as raw)
  select a.id, a.title, a.category,
    ts_headline('norwegian', coalesce(a.body,''), q.ts,
      'MaxFragments=2,MinWords=6,MaxWords=22,StartSel=«HLS»,StopSel=«HLE»') as snippet,
    (ts_rank(a.tsv, q.ts) + coalesce(similarity(a.title, q.raw),0))::real as rank
  from public.wiki_articles a, q
  where (p_category is null or p_category = '' or a.category = p_category)
    and (q.raw = '' or a.tsv @@ q.ts or a.title % q.raw or a.body ilike '%'||q.raw||'%')
  order by (q.raw = '') desc, rank desc, a.updated_at desc
  limit 60;
$$;
grant execute on function public.wiki_search(text, text) to anon, authenticated;

-- 4. Redigering (Butikksjef + IT) ------------------------------------------
create or replace function public.add_article(p_auth_tag text, p_auth_pw text, p_article jsonb)
returns public.wiki_articles language plpgsql security definer set search_path = public as $$
declare r public.wiki_articles;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.wiki_articles (title, category, tags, body, sources, updated_by)
  values (coalesce(nullif(trim(p_article->>'title'),''),'Uten tittel'),
          coalesce(nullif(p_article->>'category',''),'Generelt'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_article->'tags','[]'::jsonb)) as x),'{}'),
          coalesce(p_article->>'body',''),
          coalesce(p_article->'sources','[]'::jsonb),
          upper(p_auth_tag))
  returning * into r; return r;
end $$;

create or replace function public.update_article(p_auth_tag text, p_auth_pw text, p_id uuid, p_article jsonb)
returns public.wiki_articles language plpgsql security definer set search_path = public as $$
declare r public.wiki_articles;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.wiki_articles set
    title    = coalesce(nullif(trim(p_article->>'title'),''), title),
    category = coalesce(nullif(p_article->>'category',''), category),
    tags     = case when p_article ? 'tags'    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_article->'tags') as x),'{}') else tags end,
    body     = case when p_article ? 'body'     then p_article->>'body' else body end,
    sources  = case when p_article ? 'sources'  then p_article->'sources' else sources end,
    updated_by = upper(p_auth_tag), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Artikkel ikke funnet'; end if; return r;
end $$;

create or replace function public.delete_article(p_auth_tag text, p_auth_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.wiki_articles where id = p_id; end $$;

-- 5. Forslag: alle innloggede kan sende; ledere/IT vurderer ----------------
create or replace function public.add_suggestion(p_auth_tag text, p_auth_pw text, p_article_id uuid, p_article_title text, p_body text)
returns public.wiki_suggestions language plpgsql security definer set search_path = public as $$
declare r public.wiki_suggestions;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å foreslå'; end if;
  insert into public.wiki_suggestions (article_id, article_title, body, author)
  values (p_article_id, nullif(trim(p_article_title),''), coalesce(nullif(trim(p_body),''),'…'), upper(p_auth_tag))
  returning * into r; return r;
end $$;

create or replace function public.resolve_suggestion(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if p_status not in ('applied','dismissed','open') then raise exception 'Ugyldig status'; end if;
  update public.wiki_suggestions set status = p_status where id = p_id;
end $$;

grant execute on function public.add_article(text,text,jsonb)               to anon, authenticated;
grant execute on function public.update_article(text,text,uuid,jsonb)        to anon, authenticated;
grant execute on function public.delete_article(text,text,uuid)             to anon, authenticated;
grant execute on function public.add_suggestion(text,text,uuid,text,text)    to anon, authenticated;
grant execute on function public.resolve_suggestion(text,text,uuid,text)     to anon, authenticated;

-- 6. Seed kategorier + skjelett-artikler (kun hvis tomt) -------------------
insert into public.wiki_articles (title, category, tags, body)
select 'Oversikt: '||c, c, array[lower(c)],
  E'## Kort om\n\nSkriv en kort innledning om '||lower(c)||E'.\n\n## Viktig å vite\n\n- Punkt 1\n- Punkt 2\n\n## Vanlige spørsmål\n\n**Spørsmål?**\nSvar.\n\n## Gode kilder\n\nLegg til lenker under «Kilder».'
from unnest(array['Bildeler','Dekk','Sykkel','Bilvask','Barneseter','Takbokser','Takstativ','Vindusviskere','Verktøy','MC']) as c
where not exists (select 1 from public.wiki_articles limit 1);
