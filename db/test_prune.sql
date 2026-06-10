-- Regresjonstest for tasks_v24: prune_old_data. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_prune.sql
begin;

do $$
declare
  old_once uuid; old_recur uuid; fresh_once uuid; ss_old uuid; ss_new uuid;
begin
  insert into public.tasks (title, recur_unit, status, done, last_done_at)
  values ('gammel-engang', 'none', 'done', true, now() - interval '100 days') returning id into old_once;
  insert into public.tasks (title, recur_unit, status, done, last_done_at)
  values ('gammel-gjentakende', 'day', 'done', true, now() - interval '100 days') returning id into old_recur;
  insert into public.tasks (title, recur_unit, status, done, last_done_at)
  values ('fersk-engang', 'none', 'done', true, now() - interval '5 days') returning id into fresh_once;
  insert into public.staff_status (tag, kind, day, all_day, author)
  values ('ZZZZ','ferie', (now() at time zone 'Europe/Oslo')::date - 100, true, 'ZZZZ') returning id into ss_old;
  insert into public.staff_status (tag, kind, day, all_day, author)
  values ('ZZZZ','ferie', (now() at time zone 'Europe/Oslo')::date - 5, true, 'ZZZZ') returning id into ss_new;
  insert into public.sessions (tag, token_hash, expires_at) values ('ZZZZ','x', now() - interval '1 day');

  perform public.prune_old_data();

  if exists (select 1 from public.tasks where id = old_once) then raise exception 'FAIL: gammel engangsoppgave ikke slettet'; end if;
  if not exists (select 1 from public.tasks where id = old_recur) then raise exception 'FAIL: gjentakende oppgave slettet!'; end if;
  if not exists (select 1 from public.tasks where id = fresh_once) then raise exception 'FAIL: fersk oppgave slettet!'; end if;
  if exists (select 1 from public.staff_status where id = ss_old) then raise exception 'FAIL: gammel status ikke slettet'; end if;
  if not exists (select 1 from public.staff_status where id = ss_new) then raise exception 'FAIL: fersk status slettet!'; end if;
  if exists (select 1 from public.sessions where tag='ZZZZ') then raise exception 'FAIL: utløpt sesjon ikke slettet'; end if;

  raise notice 'OK: prune_old_data virker';
end $$;

rollback;
