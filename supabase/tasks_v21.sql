-- Thansen Verktøykasse · Tasks v21 — rollover kjøres server-side (pg_cron) og hopper
-- ikke lenger over dagens forekomst
-- Audit 2026-06-09, punkt 9 (P1): rollover kjørte bare når noen åpnet siden, og
-- catch-up-løkka (while nd <= now()) hoppet over DAGENS slot hvis ingen klient kjørte
-- før oppgavens klokkeslett: en daglig oppgave fullført i går kl. 18, åpnet i dag kl. 14,
-- ble datert i MORGEN i stedet for i dag (og dagens runde forsvant).

-- 1. Riktig catch-up: land på siste TAPTE slot for dag/uke/måned (vises som OVERTID),
--    men neste LEDIGE slot for time-baserte oppgaver.
create or replace function public.rollover_recurring()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  step interval;
  nd timestamptz;
begin
  for r in
    select id, due_at, recur_n, recur_unit
    from public.tasks
    where recur_unit <> 'none' and status = 'done' and last_done_at is not null and (
         (recur_unit = 'day'   and (last_done_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date)
      or (recur_unit = 'week'  and date_trunc('week',  last_done_at at time zone 'Europe/Oslo') < date_trunc('week',  now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'month' and date_trunc('month', last_done_at at time zone 'Europe/Oslo') < date_trunc('month', now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'hour'  and last_done_at < now() - interval '1 hour')
    )
  loop
    step := (r.recur_n || ' ' || r.recur_unit)::interval;
    nd   := coalesce(r.due_at, now()) + step;          -- én syklus frem, behold justeringen
    if step > interval '0' then
      if r.recur_unit = 'hour' then
        while nd <= now() loop nd := nd + step; end loop;                      -- neste ledige time-slot
      else
        while ((nd + step) at time zone 'Europe/Oslo')::date <= (now() at time zone 'Europe/Oslo')::date loop
          nd := nd + step;                                                     -- siste tapte dags-slot
        end loop;
      end if;
    end if;
    update public.tasks
      set status = 'todo', done = false, due_at = nd
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 2. Kjør rollover på serveren hvert 10. minutt — uavhengig av om noen har siden åpen
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('rollover-tasks'); exception when others then null; end $$;
select cron.schedule('rollover-tasks', '*/10 * * * *',
  'select public.rollover_recurring(); select public.rollover_incomplete();');

-- 3. Klientene trenger ikke (og får ikke) trigge rollover lenger
revoke execute on function public.rollover_recurring()  from anon, authenticated;
revoke execute on function public.rollover_incomplete() from anon, authenticated;
