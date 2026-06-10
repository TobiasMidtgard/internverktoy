-- Regresjonstest for tasks_v19 + wiki_v2: persondata/wiki krever innlogging. Rulles tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_lockdown.sql
begin;

do $$
declare inv text; j jsonb; tok text; res jsonb; aid uuid;
begin
  -- 1) anon har ikke lenger SELECT på sensitive tabeller/views
  if has_table_privilege('anon','public.staff_status','select')     then raise exception 'FAIL: staff_status lesbar for anon'; end if;
  if has_table_privilege('anon','public.coworkers_public','select') then raise exception 'FAIL: coworkers_public lesbar for anon'; end if;
  if has_table_privilege('anon','public.wiki_articles','select')    then raise exception 'FAIL: wiki_articles lesbar for anon'; end if;
  if has_table_privilege('anon','public.wiki_suggestions','select') then raise exception 'FAIL: wiki_suggestions lesbar for anon'; end if;
  if has_table_privilege('anon','public.sessions','select')         then raise exception 'FAIL: sessions lesbar for anon'; end if;
  -- tavla skal fortsatt være lesbar (realtime)
  if not has_table_privilege('anon','public.tasks','select') then raise exception 'FAIL: tasks ble stengt ved et uhell'; end if;

  -- 2) get_people krever innlogging og returnerer begge nøkler
  select value into inv from public.app_config where key='invite_code';
  j := public.register_account('ZZL1','Test Laas','Deltid','#004595','test1234', inv);
  tok := j->>'token';
  res := public.get_people('ZZL1', tok);
  if res->'coworkers' is null or res->'staff_status' is null then raise exception 'FAIL: get_people mangler nøkler'; end if;
  begin
    perform public.get_people('ZZL1','feil-token');
    raise exception 'FAIL: get_people uten gyldig auth';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- 3) wiki_search/get_article krever innlogging
  perform public.wiki_search('ZZL1', tok, '', null);
  begin
    perform public.wiki_search('ZZL1','feil-token','',null);
    raise exception 'FAIL: wiki_search uten auth';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  select id into aid from public.wiki_articles limit 1;
  if aid is not null then
    perform public.get_article('ZZL1', tok, aid);
    begin
      perform public.get_article('ZZL1','feil-token', aid);
      raise exception 'FAIL: get_article uten auth';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end if;

  -- 4) get_suggestions krever manager (coworker avvises)
  begin
    perform public.get_suggestions('ZZL1', tok, 'open');
    raise exception 'FAIL: get_suggestions for coworker';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  raise notice 'OK: lockdown virker';
end $$;

rollback;
