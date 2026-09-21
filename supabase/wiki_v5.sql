-- Wiki v5: independent result sections for articles and button sequences.
-- Run after wiki_v4.sql. Existing wiki_search remains unchanged.
begin;

create or replace function public.wiki_search_sections(
  p_auth_tag text, p_auth_pw text, p_q text, p_category text default null)
returns table(
  id uuid, title text, category text, snippet text, rank real,
  is_guide boolean, step_count integer)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then
    raise exception 'Logg inn for å lese kunnskapsbasen';
  end if;
  return query
  with q as (
    select websearch_to_tsquery('norwegian', coalesce(nullif(trim(p_q),''),'')) as ts,
           coalesce(nullif(trim(p_q),''),'') as raw
  ), matches as (
    select a.id, a.title, a.category,
      left(regexp_replace(
        coalesce(nullif(btrim(a.body),''), public.wiki_guide_text(a.guide),''),
        '[[:space:]]+', ' ', 'g'), 220) as snippet,
      (ts_rank(a.tsv, q.ts) + coalesce(similarity(a.title, q.raw),0))::real as rank,
      (a.guide is not null) as is_guide,
      case when a.guide is not null and jsonb_typeof(a.guide->'steps') = 'array'
           then jsonb_array_length(a.guide->'steps') else 0 end as step_count,
      a.updated_at, (q.raw = '') as browse_all
    from public.wiki_articles a, q
    where (p_category is null or p_category = '' or a.category = p_category)
      and (q.raw = '' or a.tsv @@ q.ts or a.title % q.raw
           or a.body ilike '%'||q.raw||'%' or public.wiki_guide_text(a.guide) ilike '%'||q.raw||'%')
  ), ranked as (
    select m.*, row_number() over (
      partition by m.is_guide
      order by m.browse_all desc, m.rank desc, m.updated_at desc, m.id
    ) as section_row
    from matches m
  )
  select r.id, r.title, r.category, r.snippet, r.rank, r.is_guide, r.step_count
  from ranked r
  where r.section_row <= 60
  order by r.browse_all desc, r.rank desc, r.updated_at desc, r.id;
end $$;

-- A callable RPC still requires the application's session; no table read grants.
revoke all on function public.wiki_search_sections(text,text,text,text) from public;
grant execute on function public.wiki_search_sections(text,text,text,text)
  to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
