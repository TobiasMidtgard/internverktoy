-- Thansen Verktøykasse · Tasks v8 — completed tasks linger; daily rollover
-- Completing no longer instantly re-schedules a recurring task; it stays in
-- "Fullført" until its period ends (end of day for daily) or it's dragged out.
-- Run after tasks_v7.sql.

-- Completing just marks done — no immediate roll-forward anymore.
create or replace function public.set_status(p_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if p_status not in ('todo','progress','review','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status,
    done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- Bring recurring "done" tasks back to "todo" once their period has rolled over
-- (per Europe/Oslo): daily at end of day, weekly next week, monthly next month.
create or replace function public.rollover_recurring()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with upd as (
    update public.tasks set
      status = 'todo', done = false,
      due_at = greatest(coalesce(due_at, now()), now()) + (recur_n || ' ' || recur_unit)::interval
    where recur_unit <> 'none' and status = 'done' and last_done_at is not null and (
         (recur_unit = 'day'   and (last_done_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date)
      or (recur_unit = 'week'  and date_trunc('week',  last_done_at at time zone 'Europe/Oslo') < date_trunc('week',  now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'month' and date_trunc('month', last_done_at at time zone 'Europe/Oslo') < date_trunc('month', now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'hour'  and last_done_at < now() - interval '1 hour')
    )
    returning 1
  ) select count(*) into n from upd;
  return n;
end $$;

grant execute on function public.set_status(uuid, text)      to anon, authenticated;
grant execute on function public.rollover_recurring()        to anon, authenticated;
