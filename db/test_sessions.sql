-- Regresjonstest for tasks_v18: sesjonstokener. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_sessions.sql
begin;

do $$
declare inv text; j jsonb; tok text; tok2 text;
begin
  select value into inv from public.app_config where key='invite_code';

  -- 1) Registrering returnerer {user, token} og logger inn
  j := public.register_account('ZZS1','Test Sesjon','Deltid','#004595','test1234', inv);
  tok := j->>'token';
  if tok is null or length(tok) < 32 then raise exception 'FAIL: register ga ikke token'; end if;
  if (j->'user'->>'tag') <> 'ZZS1' then raise exception 'FAIL: register ga ikke user'; end if;

  -- 2) Token gir rolle; søppel gjør det ikke; passord virker fortsatt (bakoverkomp.)
  if public.account_role('ZZS1', tok) <> 'coworker' then raise exception 'FAIL: token ikke godtatt'; end if;
  if public.account_role('ZZS1', 'garbage-token') is not null then raise exception 'FAIL: søppel godtatt'; end if;
  if public.account_role('ZZS1', 'test1234') <> 'coworker' then raise exception 'FAIL: passord ikke godtatt'; end if;

  -- 3) Tokenet lagres hashet (klartekst-token finnes ikke i tabellen)
  if exists (select 1 from public.sessions where token_hash = tok) then
    raise exception 'FAIL: token lagret i klartekst';
  end if;

  -- 4) login_account gir nytt token; logout invaliderer kun det tokenet
  j := public.login_account('ZZS1','test1234'); tok2 := j->>'token';
  perform public.logout_account('ZZS1', tok2);
  if public.account_role('ZZS1', tok2) is not null then raise exception 'FAIL: logout invaliderte ikke'; end if;
  if public.account_role('ZZS1', tok) is null then raise exception 'FAIL: logout drepte feil sesjon'; end if;

  -- 5) Passordbytte dreper alle sesjoner
  perform public.change_password('ZZS1','test1234','nytt1234');
  if public.account_role('ZZS1', tok) is not null then raise exception 'FAIL: passordbytte beholdt sesjoner'; end if;
  if public.account_role('ZZS1', 'test1234') is not null then raise exception 'FAIL: gammelt passord virker'; end if;
  if public.account_role('ZZS1', 'nytt1234') <> 'coworker' then raise exception 'FAIL: nytt passord virker ikke'; end if;

  -- 6) change_password godtar IKKE token som "gammelt passord"
  j := public.login_account('ZZS1','nytt1234'); tok := j->>'token';
  begin
    perform public.change_password('ZZS1', tok, 'kapret123');
    raise exception 'FAIL: token godtatt som passord ved bytte';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  raise notice 'OK: sesjonstokener virker';
end $$;

rollback;
