-- Regresjonstest for tasks_v25: reset_password. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_reset_password.sql
begin;

insert into public.coworkers (tag,name,color,title,role,pass_hash) values
  ('ZZM2','Manager','#004595','Butikksjef','manager', extensions.crypt('mgr12345', extensions.gen_salt('bf'))),
  ('ZZC2','Coworker','#004595','Deltid','coworker',   extensions.crypt('gammelt1', extensions.gen_salt('bf'))),
  ('ZZD2','Devkonto','#004595','IT','dev',            extensions.crypt('dev12345', extensions.gen_salt('bf')));

do $$
begin
  -- 1) Manager nullstiller coworker-passord; gamle sesjoner dør, nytt passord virker
  insert into public.sessions (tag, token_hash, expires_at) values ('ZZC2','hash', now() + interval '1 day');
  perform public.reset_password('ZZM2','mgr12345','ZZC2','nytt1234');
  if public.account_role('ZZC2','gammelt1') is not null then raise exception 'FAIL: gammelt passord virker'; end if;
  if public.account_role('ZZC2','nytt1234') <> 'coworker' then raise exception 'FAIL: nytt passord virker ikke'; end if;
  if exists (select 1 from public.sessions where tag='ZZC2') then raise exception 'FAIL: sesjoner ikke drept'; end if;

  -- 2) Manager kan IKKE nullstille dev-kontoen (ville vært privilegie-eskalering)
  begin
    perform public.reset_password('ZZM2','mgr12345','ZZD2','kapret12');
    raise exception 'FAIL: manager nullstilte dev';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  if public.account_role('ZZD2','dev12345') <> 'dev' then raise exception 'FAIL: dev-passordet ble endret'; end if;

  -- 3) Coworker kan ikke nullstille noen
  begin
    perform public.reset_password('ZZC2','nytt1234','ZZM2','kapret12');
    raise exception 'FAIL: coworker nullstilte manager';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  raise notice 'OK: reset_password virker';
end $$;

rollback;
