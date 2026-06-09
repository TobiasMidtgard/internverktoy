-- Thansen Verktøykasse · Tasks v12 — fix recurring rollover landing too far ahead
-- Bug: rollover_recurring fires only AFTER the period boundary has passed, so by
-- then now() is already ≥ one cycle past completion. The old formula
--   due_at = greatest(coalesce(due_at, now()), now()) + interval
-- therefore added a FULL extra cycle on top of now() and dropped the task's
-- original time-of-day / weekday / day-of-month alignment. A task completed on
-- time reappeared a whole period late (daily → +2 days, weekly → +2 weeks,
-- monthly → +2 months) — "completed tasks showing up on dates way afterwards".
--
-- Fix: advance the ORIGINAL due_at by whole cycles to the first occurrence after
-- now(). On time → exactly one cycle forward (alignment kept); if overdue → skip
-- the missed cycles to the next upcoming slot (no pile-up). This matches the
-- in-app promise: "i tide → 1 syklus frem; forsinkelse → neste kommende intervall".
-- Run after tasks_v8.sql (firing conditions are unchanged). Europe/Oslo.
create or replace function public.rollover_recurring()
returns int language plpgsql security definer set search_path = public as $$
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
    nd   := coalesce(r.due_at, now()) + step;          -- one cycle forward, alignment kept
    if step > interval '0' then                        -- guard against a non-positive step
      while nd <= now() loop                           -- overdue: skip missed cycles to next slot
        nd := nd + step;
      end loop;
    end if;
    update public.tasks
      set status = 'todo', done = false, due_at = nd
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.rollover_recurring() to anon, authenticated;
