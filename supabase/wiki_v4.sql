-- Wiki v4: private, bounded screenshot guides alongside ordinary Markdown.
-- Run after wiki_v2.sql. No images are stored in body or the full-text index.
-- Limits: 6 MiB canonical JSON, 20 steps / 21 images, 600 KiB per data URL.
begin;

alter table public.wiki_articles add column if not exists guide jsonb;
comment on column public.wiki_articles.guide is
  'Versioned step guide with private compressed raster screenshots; read through get_article.';

-- Pure helpers inspect only the supplied value; no table access or image-returning RPC.
create or replace function public.wiki_guide_image_valid(p_image jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare src text; mime text; payload text; bytes bytea;
begin
  if p_image is null or p_image = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p_image) <> 'string' then return false; end if;
  src := p_image #>> '{}';
  if octet_length(src) > 614400 then return false; end if;
  mime := substring(src from '^data:image/(png|jpeg|webp);base64,');
  if mime is null then return false; end if;
  payload := substr(src, strpos(src, ',') + 1);
  if length(payload) % 4 <> 0 or payload !~ '^[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  begin
    bytes := decode(payload, 'base64');
  exception when others then return false;
  end;
  -- Verify that a declared raster MIME type has the corresponding file signature.
  return case mime
    when 'png' then substring(bytes from 1 for 8) = decode('89504e470d0a1a0a', 'hex')
    when 'jpeg' then substring(bytes from 1 for 3) = decode('ffd8ff', 'hex')
    when 'webp' then substring(bytes from 1 for 4) = decode('52494646', 'hex')
                     and substring(bytes from 9 for 4) = decode('57454250', 'hex')
    else false
  end;
end $$;

create or replace function public.wiki_guide_error(p_guide jsonb)
returns text language plpgsql immutable set search_path = pg_catalog, public as $$
declare initial jsonb; step jsonb; marker jsonb; field text; max_len int; n int := 0;
begin
  if p_guide is null or p_guide = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_guide) <> 'object' then return 'Veiledningen må være et objekt.'; end if;
  if octet_length(p_guide::text) > 6291456 then return 'Veiledningen kan være maksimalt 6 MiB.'; end if;
  if p_guide - array['version','start','steps'] <> '{}'::jsonb then return 'Veiledningen har ukjente felter.'; end if;
  if p_guide->'version' is distinct from '1'::jsonb then return 'Ukjent veiledningsversjon.'; end if;
  initial := p_guide->'start';
  if jsonb_typeof(initial) is distinct from 'object' then return 'Startpunkt mangler.'; end if;
  if initial - array['description','image'] <> '{}'::jsonb then return 'Startpunktet har ukjente felter.'; end if;
  if jsonb_typeof(initial->'description') is distinct from 'string'
     or nullif(btrim(initial->>'description'), '') is null
     or char_length(initial->>'description') > 2000 then
    return 'Startbeskrivelsen må ha 1–2000 tegn.';
  end if;
  if not public.wiki_guide_image_valid(initial->'image') then
    return 'Startbildet må være PNG, JPEG eller WebP, maksimalt 600 KiB som data-URL.';
  end if;
  if jsonb_typeof(p_guide->'steps') is distinct from 'array' then return 'Stegene må være en liste.'; end if;
  if jsonb_array_length(p_guide->'steps') not between 1 and 20 then return 'Veiledningen må ha 1–20 steg.'; end if;

  for step in select value from jsonb_array_elements(p_guide->'steps') loop
    n := n + 1;
    if jsonb_typeof(step) <> 'object' then return format('Steg %s må være et objekt.', n); end if;
    if step - array['title','kind','keys','label','description','result','image','marker'] <> '{}'::jsonb then
      return format('Steg %s har ukjente felter.', n);
    end if;
    foreach field in array array['title','keys','label','description','result'] loop
      max_len := case field when 'title' then 120 when 'keys' then 200 when 'label' then 200 else 2000 end;
      if jsonb_typeof(step->field) is distinct from 'string' then
        return format('Steg %s: %s må være tekst.', n, field);
      end if;
      if char_length(step->>field) > max_len then
        return format('Steg %s: %s kan ha maksimalt %s tegn.', n, field, max_len);
      end if;
    end loop;
    if nullif(btrim(step->>'title'), '') is null then return format('Steg %s mangler tittel.', n); end if;
    if jsonb_typeof(step->'kind') is distinct from 'string'
       or step->>'kind' not in ('keys','click','doubleclick','rightclick','type') then
      return format('Steg %s har ukjent handling.', n);
    end if;
    if step->>'kind' = 'keys' then
      if nullif(btrim(step->>'keys'), '') is null then return format('Steg %s mangler taster.', n); end if;
      if cardinality(string_to_array(step->>'keys', '+')) not between 1 and 8
         or exists(select 1 from unnest(string_to_array(step->>'keys', '+')) as key_part(value)
                   where nullif(btrim(key_part.value), '') is null) then
        return format('Steg %s: bruk 1–8 taster adskilt med +. Skriv plusstasten som Pluss.', n);
      end if;
    elsif nullif(btrim(step->>'label'), '') is null then
      return format('Steg %s mangler knapp eller tekst.', n);
    end if;
    if not public.wiki_guide_image_valid(step->'image') then
      return format('Bildet i steg %s må være PNG, JPEG eller WebP, maksimalt 600 KiB som data-URL.', n);
    end if;
    marker := step->'marker';
    if marker is not null and marker <> 'null'::jsonb then
      if jsonb_typeof(marker) <> 'object' then return format('Steg %s har ugyldig markør.', n); end if;
      if marker - array['x','y'] <> '{}'::jsonb
         or jsonb_typeof(marker->'x') is distinct from 'number'
         or jsonb_typeof(marker->'y') is distinct from 'number' then
        return format('Steg %s: markøren må ha numeriske x- og y-koordinater.', n);
      end if;
      if (marker->>'x')::numeric not between 0 and 100
         or (marker->>'y')::numeric not between 0 and 100 then
        return format('Steg %s: markøren må ligge innenfor bildet (0–100).', n);
      end if;
      if step->'image' is null or step->'image' = 'null'::jsonb then
        return format('Steg %s: markøren krever et bilde.', n);
      end if;
    end if;
  end loop;
  -- One optional start image + one optional image per step = at most 21 images.
  return null;
end $$;

create or replace function public.wiki_guide_text(p_guide jsonb)
returns text language plpgsql immutable set search_path = pg_catalog, public as $$
declare result text := ''; step jsonb; field text;
begin
  if p_guide is null or jsonb_typeof(p_guide) <> 'object' then return ''; end if;
  if jsonb_typeof(p_guide#>'{start,description}') = 'string' then
    result := p_guide#>>'{start,description}';
  end if;
  if jsonb_typeof(p_guide->'steps') = 'array' then
    for step in select value from jsonb_array_elements(p_guide->'steps') loop
      foreach field in array array['title','keys','label','description','result'] loop
        if jsonb_typeof(step->field) = 'string' then result := concat_ws(' ', result, step->>field); end if;
      end loop;
    end loop;
  end if;
  return btrim(result);
end $$;

revoke all on function public.wiki_guide_image_valid(jsonb) from public;
revoke all on function public.wiki_guide_error(jsonb) from public;
revoke all on function public.wiki_guide_text(jsonb) from public;
grant execute on function public.wiki_guide_image_valid(jsonb) to anon, authenticated, service_role;
grant execute on function public.wiki_guide_error(jsonb) to anon, authenticated, service_role;
grant execute on function public.wiki_guide_text(jsonb) to anon, authenticated, service_role;

-- Enforce bounds even for non-RPC writes. Existing ordinary articles have NULL guides.
alter table public.wiki_articles drop constraint if exists wiki_articles_guide_valid;
alter table public.wiki_articles add constraint wiki_articles_guide_valid
  check (public.wiki_guide_error(guide) is null);
alter table public.wiki_articles enable row level security;
drop policy if exists wiki_read on public.wiki_articles;
revoke select on public.wiki_articles from public, anon, authenticated;

create or replace function public.add_article(p_auth_tag text, p_auth_pw text, p_article jsonb)
returns public.wiki_articles language plpgsql security definer set search_path = public as $$
declare r public.wiki_articles; next_guide jsonb; validation_error text;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  next_guide := nullif(p_article->'guide', 'null'::jsonb);
  validation_error := public.wiki_guide_error(next_guide);
  if validation_error is not null then raise exception '%', validation_error using errcode = '22023'; end if;
  insert into public.wiki_articles (title, category, tags, body, sources, updated_by, guide)
  values (coalesce(nullif(trim(p_article->>'title'),''),'Uten tittel'),
          coalesce(nullif(p_article->>'category',''),'Generelt'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_article->'tags','[]'::jsonb)) as x),'{}'),
          coalesce(p_article->>'body',''),
          coalesce(p_article->'sources','[]'::jsonb),
          upper(p_auth_tag),
          next_guide)
  returning * into r; return r;
end $$;

create or replace function public.update_article(p_auth_tag text, p_auth_pw text, p_id uuid, p_article jsonb)
returns public.wiki_articles language plpgsql security definer set search_path = public as $$
declare r public.wiki_articles; next_guide jsonb; validation_error text;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if p_article ? 'guide' then
    next_guide := nullif(p_article->'guide', 'null'::jsonb);
    validation_error := public.wiki_guide_error(next_guide);
    if validation_error is not null then raise exception '%', validation_error using errcode = '22023'; end if;
  end if;
  update public.wiki_articles set
    title    = coalesce(nullif(trim(p_article->>'title'),''), title),
    category = coalesce(nullif(p_article->>'category',''), category),
    tags     = case when p_article ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_article->'tags') as x),'{}') else tags end,
    body     = case when p_article ? 'body' then p_article->>'body' else body end,
    sources  = case when p_article ? 'sources' then p_article->'sources' else sources end,
    guide    = case when p_article ? 'guide' then next_guide else guide end,
    updated_by = upper(p_auth_tag), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Artikkel ikke funnet'; end if; return r;
end $$;

-- get_article already returns wiki_articles and therefore includes the new column.
-- It retains its login gate. No new reader API exposes screenshots.
create or replace function public.wiki_tsv_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.tsv := to_tsvector('norwegian',
    coalesce(new.title,'') || ' ' || coalesce(new.body,'') || ' '
    || array_to_string(coalesce(new.tags,'{}'),' ') || ' ' || public.wiki_guide_text(new.guide));
  return new;
end $$;

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
    left(regexp_replace(coalesce(nullif(btrim(a.body),''), public.wiki_guide_text(a.guide),''), '[[:space:]]+', ' ', 'g'), 220) as snippet,
    (ts_rank(a.tsv, q.ts) + coalesce(similarity(a.title, q.raw),0))::real as rank
  from public.wiki_articles a, q
  where (p_category is null or p_category = '' or a.category = p_category)
    and (q.raw = '' or a.tsv @@ q.ts or a.title % q.raw
         or a.body ilike '%'||q.raw||'%' or public.wiki_guide_text(a.guide) ilike '%'||q.raw||'%')
  order by (q.raw = '') desc, rank desc, a.updated_at desc
  limit 60;
end $$;

grant execute on function public.add_article(text,text,jsonb) to anon, authenticated;
grant execute on function public.update_article(text,text,uuid,jsonb) to anon, authenticated;
grant execute on function public.wiki_search(text,text,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
