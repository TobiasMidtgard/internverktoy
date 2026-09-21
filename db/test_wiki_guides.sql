-- Wiki v4 regression tests. Intended for db/run.mjs after wiki_v4.sql.
-- Fixtures, accounts, sessions and articles exist only inside this transaction.
-- A failure rolls back its statement; the connection closing also rolls back BEGIN.
begin;

create function pg_temp.assert_guide_invalid(value jsonb, label text)
returns void language plpgsql as $$
declare message text;
begin
  message := public.wiki_guide_error(value);
  if message is null then raise exception 'FAIL: invalid guide accepted (%)', label; end if;
  if message like '%data:image/%' then raise exception 'FAIL: validator echoed image data (%)', label; end if;
end $$;

do $$
declare
  png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9WQAAAAASUVORK5CYII=';
  valid jsonb; changed jsonb; bad jsonb; step jsonb; many jsonb; item jsonb;
  manager_token text; reader_token text; msg text; found_count int;
  aid uuid; plain_id uuid; r public.wiki_articles; before_title text; summary text;
begin
  valid := jsonb_build_object(
    'version', 1,
    'start', jsonb_build_object('description','QGUIDEONLY Start ved hovedmenyen.', 'image',png),
    'steps', jsonb_build_array(jsonb_build_object(
      'title','Åpne varebildet', 'kind','keys', 'keys','Ctrl+F7', 'label','',
      'description','Trykk tastene samtidig.', 'result','Varebildet åpnes.', 'image',png,
      'marker',jsonb_build_object('x',12.5,'y',100))));
  step := valid#>'{steps,0}';
  if public.wiki_guide_error(valid) is not null then raise exception 'FAIL: valid guide rejected: %', public.wiki_guide_error(valid); end if;
  if public.wiki_guide_error(null) is not null or public.wiki_guide_error('null'::jsonb) is not null then
    raise exception 'FAIL: ordinary NULL guide rejected';
  end if;
  if not public.wiki_guide_image_valid(to_jsonb(png)) then raise exception 'FAIL: PNG rejected'; end if;
  if not public.wiki_guide_image_valid(to_jsonb('data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA='::text)) then
    raise exception 'FAIL: WebP signature rejected';
  end if;

  perform pg_temp.assert_guide_invalid('[]'::jsonb, 'guide type');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{version}','2'), 'version');
  perform pg_temp.assert_guide_invalid(valid || '{"hidden":{"image":"bad"}}'::jsonb, 'unknown guide key');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start}','null'), 'missing start');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,description}','""'), 'empty start');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,description}',to_jsonb(repeat('a',2001))), 'start text limit');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,marker}','{"x":1,"y":1}'), 'start marker is forbidden');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps}','{}'), 'steps type');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps}','[]'), 'empty guide');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps}','[null]'), 'step type');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,title}','" "'), 'empty title');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,title}',to_jsonb(repeat('a',121))), 'title limit');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,keys}',to_jsonb(repeat('a',201))), 'keys limit');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,label}',to_jsonb(repeat('a',201))), 'label limit');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,description}',to_jsonb(repeat('a',2001))), 'description limit');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,result}',to_jsonb(repeat('a',2001))), 'result limit');
  perform pg_temp.assert_guide_invalid(valid #- '{steps,0,result}', 'missing text field');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,description}','false'), 'non-string text');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,kind}','"script"'), 'unknown kind');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,keys}','" "'), 'keys required');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,keys}','"Ctrl+ +F7"'), 'empty key component');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,keys}','"A+B+C+D+E+F+G+H+I"'), 'more than eight keys');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,kind}','"click"'), 'click label required');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,kind}','"type"'), 'typed text required');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,extra}','"bad"'), 'unknown step field');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,marker,x}','101'), 'marker out of range');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,marker,y}','-0.1'), 'negative marker');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,marker,x}','"2"'), 'string coordinate');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,marker}','{"x":2}'), 'missing coordinate');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,marker,onclick}','"bad"'), 'unknown marker field');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,image}','null'), 'marker needs after image');

  for item in select to_jsonb(src) from unnest(array[
    'https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PHNjcmlwdD4=', 'javascript:alert(1)',
    'data:image/png;base64,PHN2Zz4=', 'data:image/png;base64,a===',
    'data:image/png;base64,AA A', 'data:image/png;base64,',
    'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUg=='
  ]) as src loop
    perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,image}',item), 'invalid start image');
    perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps,0,image}',item), 'invalid step image');
  end loop;
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,image}',to_jsonb(png || ',extra')), 'trailing data URL content');
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{start,image}',to_jsonb(png || repeat('A',614400))), 'per-image size limit');

  -- Exact maximum step count with no images is accepted; the next step is rejected.
  select jsonb_agg((step - 'marker') || '{"image":null}'::jsonb) into many from generate_series(1,20);
  changed := jsonb_set(valid,'{steps}',many);
  if public.wiki_guide_error(changed) is not null then raise exception 'FAIL: 20 steps rejected'; end if;
  perform pg_temp.assert_guide_invalid(jsonb_set(valid,'{steps}',many || jsonb_build_array(step)), '21 steps rejected');

  -- Each image-sized string is below 600 KiB, but their total exceeds 6 MiB.
  select jsonb_agg(jsonb_set(step,'{image}',to_jsonb('data:image/png;base64,' || repeat('A',600000))))
    into many from generate_series(1,11);
  bad := jsonb_set(valid,'{steps}',many);
  if public.wiki_guide_error(bad) is distinct from 'Veiledningen kan være maksimalt 6 MiB.' then
    raise exception 'FAIL: total size is not checked before image parsing';
  end if;

  -- All non-key actions use their label and preserve optional missing image/marker.
  for msg in select unnest(array['click','doubleclick','rightclick','type']) loop
    changed := jsonb_set(valid,'{steps}',jsonb_build_array(
      (step - array['image','marker']) || jsonb_build_object('kind',msg,'keys','','label','Varenummer')));
    if public.wiki_guide_error(changed) is not null then raise exception 'FAIL: % action rejected', msg; end if;
  end loop;
  summary := public.wiki_guide_text(valid);
  if summary not like '%Ctrl+F7%' or summary not like '%Varebildet åpnes.%' then raise exception 'FAIL: guide text missing'; end if;
  if summary like '%data:image%' or summary like '%iVBORw0KGgo%' or summary like '%base64%' then
    raise exception 'FAIL: image entered searchable guide text';
  end if;

  if exists(select 1 from public.coworkers where tag in ('ZZG1','ZZG2')) then
    raise exception 'FAIL: test tags ZZG1/ZZG2 already exist; no existing account will be changed';
  end if;
  insert into public.coworkers(tag,name,role,pass_hash) values
    ('ZZG1','Temporary wiki guide manager','manager',extensions.crypt('guide-test-only',extensions.gen_salt('bf'))),
    ('ZZG2','Temporary wiki guide reader','coworker',extensions.crypt('guide-test-only',extensions.gen_salt('bf')));
  manager_token := public.login_account('ZZG1','guide-test-only')->>'token';
  reader_token := public.login_account('ZZG2','guide-test-only')->>'token';
  if manager_token is null or reader_token is null then raise exception 'FAIL: test session missing'; end if;

  -- Authorisation must win over malformed guide validation for both write RPCs.
  begin
    perform public.add_article('ZZG2',reader_token,jsonb_build_object('guide','[]'::jsonb));
    raise exception 'FAIL: coworker write accepted';
  exception when others then
    if sqlerrm <> 'Krever butikksjef-tilgang' then raise; end if;
  end;
  begin
    perform public.update_article('ZZG1','bad-token',gen_random_uuid(),jsonb_build_object('guide','[]'::jsonb));
    raise exception 'FAIL: unauthenticated update accepted';
  exception when others then
    if sqlerrm <> 'Krever butikksjef-tilgang' then raise; end if;
  end;

  r := public.add_article('ZZG1',manager_token,jsonb_build_object(
    'title','Temporary guide backend test','category','XAL','body','','tags',jsonb_build_array('guide-test'),'guide',valid));
  aid := r.id;
  if r.guide is distinct from valid or r.updated_by <> 'ZZG1' or r.body <> '' then raise exception 'FAIL: guide not saved atomically'; end if;
  if r.tsv::text ~* 'base64|iVBORw0KGgo' then raise exception 'FAIL: screenshot entered tsv'; end if;
  r := public.get_article('ZZG2',reader_token,aid);
  if r.guide is distinct from valid then raise exception 'FAIL: reader cannot load guide'; end if;
  begin
    perform public.get_article('ZZG2','bad-token',aid);
    raise exception 'FAIL: anonymous guide read accepted';
  exception when others then
    if sqlerrm <> 'Logg inn for å lese kunnskapsbasen' then raise; end if;
  end;
  if has_table_privilege('anon','public.wiki_articles','select')
     or has_table_privilege('authenticated','public.wiki_articles','select') then
    raise exception 'FAIL: direct wiki reads expose screenshots';
  end if;

  select count(*), max(s.snippet) into found_count,summary
    from public.wiki_search('ZZG2',reader_token,'QGUIDEONLY','XAL') s where s.id=aid;
  if found_count <> 1 or summary not like 'QGUIDEONLY%' then raise exception 'FAIL: guide-only search/snippet'; end if;
  select count(*) into found_count from public.wiki_search('ZZG2',reader_token,'iVBORw0KGgo','XAL') s where s.id=aid;
  if found_count <> 0 then raise exception 'FAIL: search matches image data'; end if;

  -- Legacy clients keep guides when the key is absent.
  r := public.update_article('ZZG1',manager_token,aid,'{"body":"Updated ordinary Markdown."}'::jsonb);
  if r.guide is distinct from valid or r.body <> 'Updated ordinary Markdown.' then raise exception 'FAIL: omitted guide lost data'; end if;
  before_title := r.title;
  begin
    perform public.update_article('ZZG1',manager_token,aid,jsonb_build_object('title','Must not persist','guide','[]'::jsonb));
    raise exception 'FAIL: invalid guide accepted by update';
  exception when sqlstate '22023' then null;
  end;
  select * into r from public.wiki_articles where id=aid;
  if r.title <> before_title or r.guide is distinct from valid then raise exception 'FAIL: invalid update partially wrote'; end if;

  begin
    perform public.add_article('ZZG1',manager_token,jsonb_build_object('title','Invalid guide fixture','guide','[]'::jsonb));
    raise exception 'FAIL: invalid guide accepted by add';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.wiki_articles set guide='[]'::jsonb where id=aid;
    raise exception 'FAIL: direct write bypassed guide constraint';
  exception when check_violation then null;
  end;

  -- Explicit JSON null removes the guide; ordinary article creation is unchanged.
  r := public.update_article('ZZG1',manager_token,aid,'{"guide":null}'::jsonb);
  if r.guide is not null then raise exception 'FAIL: explicit null did not remove guide'; end if;
  r := public.add_article('ZZG1',manager_token,'{"title":"Temporary ordinary article","body":"W5W and P21W"}'::jsonb);
  plain_id := r.id;
  if r.guide is not null then raise exception 'FAIL: ordinary article acquired a guide'; end if;
  select count(*) into found_count from public.wiki_search('ZZG2',reader_token,'W5W',null) s where s.id=plain_id;
  if found_count <> 1 then raise exception 'FAIL: existing body search regressed'; end if;

  raise notice 'OK: wiki guides validate, save atomically, remain private and keep images out of search';
end $$;
rollback;
