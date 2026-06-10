-- Thansen Verktøykasse · Tasks v22 — sjekklister nullstilles når gjentakende oppgaver ruller
-- Audit 2026-06-09, punkt 10 (P1): sjekkliste-status lagres som «- [x]» i notes, og
-- ingenting nullstilte dem ved rollover. Daglige/ukentlige rutiner (åpning/stenging)
-- dukket opp med gårsdagens punkter ferdig avhuket — staff hoppet over steg, eller måtte
-- manuelt avhuke alt hver dag. Nullstilles nå både ved rollover og når en gjentakende
-- oppgave manuelt settes tilbake fra done.

-- 1. rollover_recurring: som v21, + nullstill [x] → [ ] i notes for rullede rader
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
      set status = 'todo', done = false, due_at = nd,
          notes = regexp_replace(notes, '([-*]\s+)\[[xX]\]', '\1[ ]', 'g')     -- nullstill sjekklista
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 2. set_status: gjentakende oppgave som flyttes bort fra done får også blank sjekkliste
create or replace function public.set_status(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å endre status'; end if;
  if p_status not in ('todo','progress','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status, done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end,
    notes = case when p_status <> 'done' and status = 'done' and recur_unit <> 'none'
                 then regexp_replace(notes, '([-*]\s+)\[[xX]\]', '\1[ ]', 'g')
                 else notes end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;
