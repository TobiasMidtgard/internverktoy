-- Regresjonstest for tasks_v21: rollover lander på riktig slot. Rulles alltid tilbake.
-- (rollover_recurring() ruller også ekte done-oppgaver inne i transaksjonen,
--  men alt rulles tilbake.)
-- Bruk: node --env-file=db/.env db/run.mjs db/test_rollover_v21.sql
begin;

do $$
declare
  oslo_today date := (now() at time zone 'Europe/Oslo')::date;
  d_id uuid; w_id uuid; h_id uuid; t public.tasks;
begin
  -- Daglig: fullført i går, frist i går 09:00 → skal lande PÅ I DAG 09:00 (ikke i morgen)
  insert into public.tasks (title, recur_unit, recur_n, status, done, last_done_at, due_at)
  values ('test-daglig', 'day', 1, 'done', true, now() - interval '1 day',
          ((oslo_today - 1) + time '09:00') at time zone 'Europe/Oslo')
  returning id into d_id;

  -- Ukentlig: fullført for 8 dager siden, frist for 8 dager siden 10:00
  -- → skal lande på i går (siste tapte slot), ikke om 6 dager
  insert into public.tasks (title, recur_unit, recur_n, status, done, last_done_at, due_at)
  values ('test-ukentlig', 'week', 1, 'done', true, now() - interval '8 days',
          ((oslo_today - 8) + time '10:00') at time zone 'Europe/Oslo')
  returning id into w_id;

  -- Time-basert: fullført for 3 timer siden, frist for 2 timer siden
  -- → skal lande på neste LEDIGE slot (i fremtiden, maks ett steg frem)
  insert into public.tasks (title, recur_unit, recur_n, status, done, last_done_at, due_at)
  values ('test-time', 'hour', 1, 'done', true, now() - interval '3 hours', now() - interval '2 hours')
  returning id into h_id;

  perform public.rollover_recurring();

  select * into t from public.tasks where id = d_id;
  if t.status <> 'todo' then raise exception 'FAIL: daglig ikke rullet'; end if;
  if (t.due_at at time zone 'Europe/Oslo')::date <> oslo_today then
    raise exception 'FAIL: daglig landet på % (skulle vært i dag)', (t.due_at at time zone 'Europe/Oslo')::date;
  end if;
  if (t.due_at at time zone 'Europe/Oslo')::time <> time '09:00' then
    raise exception 'FAIL: daglig mistet klokkeslettet (%)', (t.due_at at time zone 'Europe/Oslo')::time;
  end if;

  select * into t from public.tasks where id = w_id;
  if (t.due_at at time zone 'Europe/Oslo')::date <> oslo_today - 1 then
    raise exception 'FAIL: ukentlig landet på % (skulle vært i går)', (t.due_at at time zone 'Europe/Oslo')::date;
  end if;

  select * into t from public.tasks where id = h_id;
  if t.due_at <= now() then raise exception 'FAIL: time-slot i fortiden'; end if;
  if t.due_at > now() + interval '1 hour' then raise exception 'FAIL: time-slot hoppet for langt'; end if;

  raise notice 'OK: rollover lander riktig';
end $$;

rollback;
