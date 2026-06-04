-- Thansen Verktøykasse · Tasks v3 — assignee (tag a coworker)
-- Run once in the Supabase SQL editor (after tasks.sql + tasks_v2.sql).

alter table public.tasks add column if not exists assignee text;

create or replace function public.add_task(p_passcode text, p_task jsonb)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.tasks (title, notes, assignee, recur_unit, recur_n, due_at, done)
  values (
    coalesce(nullif(trim(p_task->>'title'), ''), 'Untitled'),
    nullif(p_task->>'notes', ''),
    nullif(p_task->>'assignee', ''),
    coalesce(p_task->>'recur_unit', 'none'),
    coalesce((p_task->>'recur_n')::int, 1),
    (p_task->>'due_at')::timestamptz,
    coalesce((p_task->>'done')::boolean, false)
  )
  returning * into r;
  return r;
end $$;

create or replace function public.update_task(p_passcode text, p_id uuid, p_task jsonb)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  update public.tasks set
    title      = coalesce(nullif(trim(p_task->>'title'), ''), title),
    notes      = case when p_task ? 'notes'    then nullif(p_task->>'notes', '')    else notes end,
    assignee   = case when p_task ? 'assignee' then nullif(p_task->>'assignee', '') else assignee end,
    recur_unit = coalesce(p_task->>'recur_unit', recur_unit),
    recur_n    = coalesce((p_task->>'recur_n')::int, recur_n),
    due_at     = case when p_task ? 'due_at'   then (p_task->>'due_at')::timestamptz else due_at end,
    done       = coalesce((p_task->>'done')::boolean, done)
  where id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;
