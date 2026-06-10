-- Regresjonstest for tasks_v22: sjekklister nullstilles ved rollover. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_checklist_reset.sql
begin;

do $$
declare
  oslo_today date := (now() at time zone 'Europe/Oslo')::date;
  inv text; j jsonb; tok text;
  d_id uuid; t public.tasks;
begin
  -- Daglig rutine fullført i går, med avhukede punkter
  insert into public.tasks (title, recur_unit, recur_n, status, done, last_done_at, due_at, notes)
  values ('test-rutine', 'day', 1, 'done', true, now() - interval '1 day',
          ((oslo_today - 1) + time '08:00') at time zone 'Europe/Oslo',
          E'Morgenrutine:\n- [x] Lås opp\n- [X] Tell kassa\n- [ ] Sett ut skilt\nHusk: * [x] stjernepunkt')
  returning id into d_id;

  perform public.rollover_recurring();

  select * into t from public.tasks where id = d_id;
  if t.notes like '%[x]%' or t.notes like '%[X]%' then
    raise exception 'FAIL: sjekkliste ikke nullstilt: %', t.notes;
  end if;
  if t.notes not like '%- [ ] Lås opp%' or t.notes not like '%- [ ] Tell kassa%' then
    raise exception 'FAIL: sjekklistepunkter ødelagt: %', t.notes;
  end if;
  if t.notes not like '%Morgenrutine:%' then raise exception 'FAIL: øvrig tekst ødelagt'; end if;

  -- Manuell done -> todo på gjentakende oppgave nullstiller også
  select value into inv from public.app_config where key='invite_code';
  j := public.register_account('ZZR1','Test Reset','Deltid','#004595','test1234', inv);
  tok := j->>'token';
  perform public.set_status('ZZR1', tok, d_id, 'done');
  update public.tasks set notes = replace(notes, '- [ ] Lås opp', '- [x] Lås opp') where id = d_id;
  perform public.set_status('ZZR1', tok, d_id, 'todo');
  select * into t from public.tasks where id = d_id;
  if t.notes like '%[x]%' then raise exception 'FAIL: done->todo nullstilte ikke'; end if;

  raise notice 'OK: sjekklister nullstilles riktig';
end $$;

rollback;
