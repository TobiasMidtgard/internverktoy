-- Thansen Verktøykasse · Wiki v2 — kunnskapsbasen krever innlogging
-- Audit 2026-06-09, punkt 5 (P1): wiki_articles og wiki_suggestions (attribuerte
-- fritekstforslag fra ansatte) var lesbare for hele internett via anon-nøkkelen.
-- All lesing går nå via innloggings-gatede RPC-er.

-- 1. Steng direkte lesing
drop policy if exists wiki_read on public.wiki_articles;
revoke select on public.wiki_articles from anon, authenticated;
drop policy if exists wiki_sug_read on public.wiki_suggestions;
revoke select on public.wiki_suggestions from anon, authenticated;

-- 2. Søk krever innlogging (ny signatur; gammel droppes)
drop function if exists public.wiki_search(text, text);
create or replace function public.wiki_search(p_auth_tag text, p_auth_pw text, p_q text, p_category text default null)
returns table(id uuid, title text, category text, snippet text, rank real)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å lese kunnskapsbasen'; end if;
  return query
  with q as (
    select websearch_to_tsquery('norwegian', coalesce(nullif(trim(p_q),''),'')) as ts,
           coalesce(nullif(trim(p_q),''),'') as raw)
  select a.id, a.title, a.category,
    left(regexp_replace(coalesce(a.body,''), E'\\s+', ' ', 'g'), 220) as snippet,
    (ts_rank(a.tsv, q.ts) + coalesce(similarity(a.title, q.raw),0))::real as rank
  from public.wiki_articles a, q
  where (p_category is null or p_category = '' or a.category = p_category)
    and (q.raw = '' or a.tsv @@ q.ts or a.title % q.raw or a.body ilike '%'||q.raw||'%')
  order by (q.raw = '') desc, rank desc, a.updated_at desc
  limit 60;
end $$;

-- 3. Hent én artikkel (innlogget)
create or replace function public.get_article(p_auth_tag text, p_auth_pw text, p_id uuid)
returns public.wiki_articles language plpgsql security definer set search_path = public as $$
declare r public.wiki_articles;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å lese kunnskapsbasen'; end if;
  select * into r from public.wiki_articles where id = p_id;
  if not found then raise exception 'Artikkel ikke funnet'; end if;
  return r;
end $$;

-- 4. Forslagsliste (kun butikksjef/dev — den inneholder attribuert fritekst)
create or replace function public.get_suggestions(p_auth_tag text, p_auth_pw text, p_status text default 'open')
returns setof public.wiki_suggestions language plpgsql security definer set search_path = public as $$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  return query select * from public.wiki_suggestions
    where (p_status is null or status = p_status) order by created_at desc;
end $$;

grant execute on function public.wiki_search(text,text,text,text)   to anon, authenticated;
grant execute on function public.get_article(text,text,uuid)        to anon, authenticated;
grant execute on function public.get_suggestions(text,text,text)    to anon, authenticated;
