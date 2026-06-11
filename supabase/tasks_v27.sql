-- Thansen Verktøykasse · Tasks v27 — ulike tider per ukedag for gjentakende oppgaver
-- Butikken åpner f.eks. senere på lørdag: «klargjør kassen» skal stå 10:00 lørdag
-- og 09:00 ellers. tasks får day_times jsonb: {"6":"10:00","d":"09:00"} der nøkkel
-- er ISO-ukedag (1=man … 7=søn) og "d" er standardtiden (skrives av UI-et når
-- avvik finnes). Tiden tolkes i Europe/Oslo, som resten av rolloveren.
--   * rollover_recurring normaliserer alltid neste frist mot day_times, så et
--     lørdagsavvik «smitter» ikke over på søndag/mandag.
--   * add_task/update_task normaliserer fristen ved lagring fra modalen
--     (update_task KUN når payloaden har day_times — dra-flytting i ukesplanen
--     sender bare due_at og skal få stå som eksplisitt engangsjustering).

alter table public.tasks add column if not exists day_times jsonb not null default '{}'::jsonb;

-- effektiv frist: samme Oslo-dato, klokkeslett fra ukedagsavvik → standard («d») → uendret
create or replace function public._apply_day_time(p_due timestamptz, p_times jsonb)
returns timestamptz language sql immutable as $$
  select case
    when p_due is null or p_times is null or p_times = '{}'::jsonb then p_due
    else (
      ( to_char(p_due at time zone 'Europe/Oslo','YYYY-MM-DD') || ' ' ||
        coalesce( p_times->>(extract(isodow from p_due at time zone 'Europe/Oslo')::int::text),
                  p_times->>'d',
                  to_char(p_due at time zone 'Europe/Oslo','HH24:MI') )
      )::timestamp at time zone 'Europe/Oslo')
  end
$$;

create or replace function public.rollover_recurring()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  step interval;
  nd timestamptz;
begin
  for r in
    select id, due_at, recur_n, recur_unit, day_times
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
        nd := public._apply_day_time(nd, r.day_times);  -- ukedagstid (avvik eller standard)
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

create or replace function public.add_task(p_auth_tag text, p_auth_pw text, p_task jsonb)
returns tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.tasks (title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done, duration_min, day_times)
  values (coalesce(nullif(trim(p_task->>'title'),''),'Untitled'), nullif(p_task->>'notes',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x),'{}'),
    coalesce(p_task->>'recur_unit','none'), coalesce((p_task->>'recur_n')::int,1),
    public._apply_day_time((p_task->>'due_at')::timestamptz, coalesce(p_task->'day_times','{}'::jsonb)),
    coalesce(p_task->>'status','todo'), coalesce(p_task->>'priority','medium'), coalesce(p_task->>'status','todo')='done',
    coalesce((p_task->>'duration_min')::int, 30),
    coalesce(p_task->'day_times','{}'::jsonb))
  returning * into r; return r;
end $$;

create or replace function public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb)
returns tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; old_key text; new_key text; merged jsonb; nt jsonb; ndue timestamptz;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;

  if (p_task ? 'due_at') and r.recur_unit = 'none' and r.due_at is not null
     and nullif(p_task->>'due_at','') is not null then
    old_key := to_char(r.due_at at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    new_key := to_char((p_task->>'due_at')::timestamptz at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    if old_key <> new_key and (coalesce(r.day_assignees,'{}'::jsonb) ? old_key) then
      merged := coalesce(r.day_assignees,'{}'::jsonb);
      merged := jsonb_set(merged, array[new_key],
                  coalesce((select jsonb_agg(distinct x)
                            from jsonb_array_elements(coalesce(merged->new_key,'[]'::jsonb) || (merged->old_key)) as x),
                           '[]'::jsonb)) - old_key;
      update public.tasks set day_assignees = merged where id = p_id;
    end if;
  end if;

  nt   := case when p_task ? 'day_times' then coalesce(p_task->'day_times','{}'::jsonb) else r.day_times end;
  ndue := case when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz else r.due_at end;
  -- normaliser kun ved modal-lagring (payload med day_times); dra-flytting beholder eksplisitt tid
  if p_task ? 'day_times' then ndue := public._apply_day_time(ndue, nt); end if;

  update public.tasks set
    title=coalesce(nullif(trim(p_task->>'title'),''),title),
    notes=case when p_task ? 'notes' then nullif(p_task->>'notes','') else notes end,
    assignees=case when p_task ? 'assignees' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_task->'assignees') as x),'{}') else assignees end,
    recur_unit=coalesce(p_task->>'recur_unit',recur_unit), recur_n=coalesce((p_task->>'recur_n')::int,recur_n),
    due_at=ndue, day_times=nt,
    status=coalesce(p_task->>'status',status), priority=coalesce(p_task->>'priority',priority),
    done=case when p_task ? 'status' then (p_task->>'status')='done' else done end,
    duration_min=case when p_task ? 'duration_min' then (p_task->>'duration_min')::int else duration_min end
  where id=p_id returning * into r;
  return r;
end $$;

notify pgrst, 'reload schema';
