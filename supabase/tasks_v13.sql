-- Thansen Verktøykasse · Tasks v13 — per-day (per-occurrence) assignment
-- Replaces permanent task-wide assignees with assignment keyed by (task, date).
-- day_assignees maps an ISO date -> array of coworker tags, e.g.
--   {"2026-06-08":["ALEX","MORT"], "2026-06-09":["SIRI"]}
-- The legacy assignees/assignee columns are kept (to avoid a destructive schema
-- change and stale RPCs erroring) but emptied and no longer drive the UI.
-- Run after tasks_v7.sql (uses _require_manager). Europe/Oslo for pruning.

-- 1. Column ----------------------------------------------------------------
alter table public.tasks
  add column if not exists day_assignees jsonb not null default '{}'::jsonb;

-- 2. One-time "unassign every task" ---------------------------------------
update public.tasks
  set assignees = '{}'::text[], assignee = null, day_assignees = '{}'::jsonb;

-- 3. Write one day's list for a task --------------------------------------
-- Empty p_tags removes that date's key. Keys older than 60 days are pruned on
-- each write so the JSON can't grow without bound.
create or replace function public.set_day_assignees(
  p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tags jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  arr    jsonb := coalesce(p_tags, '[]'::jsonb);
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )                 -- keep other recent days
    || case when jsonb_array_length(arr) > 0
            then jsonb_build_object(k, arr) else '{}'::jsonb end  -- set/remove this day
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

grant execute on function public.set_day_assignees(text, text, uuid, date, jsonb) to anon, authenticated;
