-- Wiki v5 regression tests. Run with db/run.mjs after wiki_v5.sql.
-- Only temporary fixtures are written, and the entire test transaction is rolled back.
begin;

do $$
declare
  png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9WQAAAAASUVORK5CYII=';
  fixture_category text := 'wiki-sections-' || gen_random_uuid()::text;
  other_category text := fixture_category || '-other';
  search_marker text := 'WIKISECTIONS' || replace(gen_random_uuid()::text,'-','');
  guide jsonb; token text; guide_id uuid; other_id uuid; row_json jsonb; fields text[];
  articles_count int; guides_count int; total_count int; result_row record; legacy_row record;
begin
  if exists(select 1 from public.coworkers where tag='ZZW1') then
    raise exception 'FAIL: test tag ZZW1 already exists; no existing account will be changed';
  end if;
  insert into public.coworkers(tag,name,role,pass_hash)
    values ('ZZW1','Temporary wiki section reader','coworker',
      extensions.crypt('section-test-only',extensions.gen_salt('bf')));
  token := public.login_account('ZZW1','section-test-only')->>'token';
  if token is null then raise exception 'FAIL: reader session missing'; end if;

  -- Both missing and invalid sessions must fail before returning any search rows.
  begin
    perform public.wiki_search_sections(null,null,'',null);
    raise exception 'FAIL: missing session accepted';
  exception when others then
    if sqlerrm <> 'Logg inn for å lese kunnskapsbasen' then raise; end if;
  end;
  begin
    perform public.wiki_search_sections('ZZW1','bad-token','',null);
    raise exception 'FAIL: bad session accepted';
  exception when others then
    if sqlerrm <> 'Logg inn for å lese kunnskapsbasen' then raise; end if;
  end;

  guide := jsonb_build_object(
    'version',1,
    'start',jsonb_build_object('description', 'QSECTIONGUIDE Start ved hovedmenyen. ' || search_marker,'image',png),
    'steps',jsonb_build_array(
      jsonb_build_object('title','Åpne varebildet','kind','keys','keys','Ctrl+F7','label','',
        'description','Trykk tastene samtidig.','result','Varebildet åpnes.','image',png,'marker',null),
      jsonb_build_object('title','Lagre varen','kind','click','keys','','label','Lagre',
        'description','Kontroller feltene.','result','Varen lagres.','image',null,'marker',null)));
  insert into public.wiki_articles(title,category,body,guide,updated_at)
    values ('Temporary button sequence',fixture_category,'',guide,now()-interval '1 day')
    returning id into guide_id;
  insert into public.wiki_articles(title,category,body,guide)
    values ('Temporary sequence with introduction',other_category,
      'Kort ingress for en knappesekvens. ' || search_marker,guide)
    returning id into other_id;

  -- The ordinary articles are newer, so a shared 60-row limit would hide the guide.
  insert into public.wiki_articles(title,category,body)
    select 'Temporary article ' || n,fixture_category,'QSECTIONBODY W5W ' || search_marker
    from generate_series(1,61) n;

  select count(*) filter(where not s.is_guide), count(*) filter(where s.is_guide), count(*)
    into articles_count,guides_count,total_count
    from public.wiki_search_sections('ZZW1',token,'',fixture_category) s;
  if articles_count <> 60 or guides_count <> 1 or total_count <> 61 then
    raise exception 'FAIL: 61 articles hid the sequence or per-section cap is wrong';
  end if;
  if exists(select 1 from public.wiki_search_sections('ZZW1',token,'',fixture_category) s
            where (not s.is_guide and s.step_count <> 0) or (s.is_guide and s.step_count <> 2)) then
    raise exception 'FAIL: section classification or step count';
  end if;

  select * into result_row
    from public.wiki_search_sections('ZZW1',token,'QSECTIONGUIDE',fixture_category) s where s.id=guide_id;
  if not found or result_row.is_guide is not true or result_row.step_count <> 2
     or result_row.snippet not like 'QSECTIONGUIDE Start ved hovedmenyen.%' then
    raise exception 'FAIL: guide text search or empty-introduction snippet';
  end if;
  select * into legacy_row
    from public.wiki_search('ZZW1',token,'QSECTIONGUIDE',fixture_category) s where s.id=guide_id;
  if not found or result_row.rank is distinct from legacy_row.rank
     or result_row.snippet is distinct from legacy_row.snippet then
    raise exception 'FAIL: legacy search match/rank/snippet changed';
  end if;

  select count(*) into total_count
    from public.wiki_search_sections('ZZW1',token,'Ctrl+F7',fixture_category) s where s.id=guide_id;
  if total_count <> 1 then raise exception 'FAIL: key-sequence text is not searchable'; end if;
  select count(*) into total_count
    from public.wiki_search_sections('ZZW1',token,'W5W',fixture_category) s where not s.is_guide;
  if total_count <> 60 then raise exception 'FAIL: ordinary body search regressed'; end if;

  -- Existing introductory Markdown does not turn a guide into an ordinary article.
  select * into result_row from public.wiki_search_sections('ZZW1',token,'',other_category) s where s.id=other_id;
  if not found or result_row.is_guide is not true or result_row.step_count <> 2
     or result_row.snippet not like 'Kort ingress for en knappesekvens.%' then
    raise exception 'FAIL: non-empty guide introduction classification/snippet';
  end if;
  if exists(select 1 from public.wiki_search_sections('ZZW1',token,'',fixture_category) s where s.id=other_id) then
    raise exception 'FAIL: category filter leaks other-category sequence';
  end if;
  select count(*) into total_count from public.wiki_search_sections('ZZW1',token,'',fixture_category || '-missing');
  if total_count <> 0 then raise exception 'FAIL: empty category result'; end if;
  select count(*) into total_count from public.wiki_search_sections('ZZW1',token,null,fixture_category);
  if total_count <> 61 then raise exception 'FAIL: NULL query does not browse sections'; end if;
  select count(*) into guides_count
    from public.wiki_search_sections('ZZW1',token,search_marker,'') s
    where s.id in (guide_id,other_id) and s.is_guide;
  if guides_count <> 2 then raise exception 'FAIL: empty category must include both sections/categories'; end if;

  -- The wire contract contains metadata only; no guide JSON, images or article body.
  for row_json in select to_jsonb(s) from public.wiki_search_sections('ZZW1',token,'',fixture_category) s loop
    select array_agg(k.key order by k.key) into fields from jsonb_object_keys(row_json) as k(key);
    if fields is distinct from array['category','id','is_guide','rank','snippet','step_count','title'] then
      raise exception 'FAIL: unexpected section result fields';
    end if;
    if row_json::text like '%data:image/%' or row_json::text like '%iVBORw0KGgo%' then
      raise exception 'FAIL: image data leaked in section result';
    end if;
  end loop;
  select count(*) into total_count
    from public.wiki_search_sections('ZZW1',token,'iVBORw0KGgo',fixture_category) s;
  if total_count <> 0 then raise exception 'FAIL: image base64 is searchable'; end if;
  if has_table_privilege('anon','public.wiki_articles','select')
     or has_table_privilege('authenticated','public.wiki_articles','select') then
    raise exception 'FAIL: section RPC opened direct article reads';
  end if;

  -- Legacy callers still receive only their original five fields and at most 60 rows.
  select count(*) into total_count from public.wiki_search('ZZW1',token,'',fixture_category);
  if total_count <> 60 then raise exception 'FAIL: legacy search limit changed'; end if;
  select to_jsonb(s) into row_json from public.wiki_search('ZZW1',token,'',fixture_category) s limit 1;
  select array_agg(k.key order by k.key) into fields from jsonb_object_keys(row_json) as k(key);
  if fields is distinct from array['category','id','rank','snippet','title'] then
    raise exception 'FAIL: legacy result shape changed';
  end if;

  -- Both partitions must be capped independently when both contain more than 60 rows.
  insert into public.wiki_articles(title,category,body,guide)
    select 'Temporary additional sequence ' || n,fixture_category,'',guide from generate_series(1,60) n;
  select count(*) filter(where not s.is_guide), count(*) filter(where s.is_guide), count(*)
    into articles_count,guides_count,total_count
    from public.wiki_search_sections('ZZW1',token,'',fixture_category) s;
  if articles_count <> 60 or guides_count <> 60 or total_count <> 120 then
    raise exception 'FAIL: sections must return at most 60 articles and 60 sequences';
  end if;
  raise notice 'OK: wiki sections are private, independently capped, searchable and metadata-only';
end $$;
rollback;
