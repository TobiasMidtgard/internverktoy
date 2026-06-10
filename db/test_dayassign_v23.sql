-- Regresjonstest for tasks_v23: dags-tildelinger. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_dayassign_v23.sql
begin;

-- midlertidig manager-konto for å kalle RPC-ene
insert into public.coworkers (tag,name,color,title,role,pass_hash)
values ('ZZMG','Test Manager','#004595','Butikksjef','manager', extensions.crypt('test1234', extensions.gen_salt('bf')));
insert into public.coworkers (tag,name,color,title,role) values
  ('ZZA9','Ansatt A','#004595','Deltid','coworker'),
  ('ZZB9','Ansatt B','#004595','Deltid','coworker');

do $$
declare
  oslo_today date := (now() at time zone 'Europe/Oslo')::date;
  tid uuid; t public.tasks; k_today text; k_tmrw text;
begin
  k_today := to_char(oslo_today, 'YYYY-MM-DD');
  k_tmrw  := to_char(oslo_today + 1, 'YYYY-MM-DD');

  insert into public.tasks (title, recur_unit, status, due_at)
  values ('test-tildeling', 'none', 'todo', (oslo_today + time '12:00') at time zone 'Europe/Oslo')
  returning id into tid;

  -- 1) Atomisk legg-til: to tillegg på rad mister ingen
  t := public.add_day_assignee('ZZMG','test1234', tid, oslo_today, 'ZZA9');
  t := public.add_day_assignee('ZZMG','test1234', tid, oslo_today, 'ZZB9');
  if not (t.day_assignees->k_today @> '"ZZA9"' and t.day_assignees->k_today @> '"ZZB9"') then
    raise exception 'FAIL: add_day_assignee mistet noen: %', t.day_assignees;
  end if;
  -- duplikat-tillegg gir ikke dobbel oppføring
  t := public.add_day_assignee('ZZMG','test1234', tid, oslo_today, 'ZZA9');
  if jsonb_array_length(t.day_assignees->k_today) <> 2 then
    raise exception 'FAIL: duplikat ble lagt til: %', t.day_assignees;
  end if;

  -- 2) Atomisk fjerning
  t := public.remove_day_assignee('ZZMG','test1234', tid, oslo_today, 'ZZA9');
  if t.day_assignees->k_today @> '"ZZA9"' then raise exception 'FAIL: fjerning virket ikke'; end if;
  if not (t.day_assignees->k_today @> '"ZZB9"') then raise exception 'FAIL: fjerning tok feil person'; end if;

  -- 3) Flytting av frist migrerer tildelingen til ny dato
  t := public.update_task('ZZMG','test1234', tid,
         jsonb_build_object('due_at', to_char((oslo_today + 1 + time '12:00') at time zone 'Europe/Oslo',
                                              'YYYY-MM-DD"T"HH24:MI:SSOF')));
  if t.day_assignees ? k_today then raise exception 'FAIL: gammel dato henger igjen: %', t.day_assignees; end if;
  if not (t.day_assignees->k_tmrw @> '"ZZB9"') then
    raise exception 'FAIL: tildeling fulgte ikke datoen: %', t.day_assignees;
  end if;

  -- 4) Ukjent ansattkode avvises
  begin
    perform public.add_day_assignee('ZZMG','test1234', tid, oslo_today, 'XXXX');
    raise exception 'FAIL: ukjent kode akseptert';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  raise notice 'OK: dags-tildelinger virker';
end $$;

rollback;
