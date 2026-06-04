-- Thansen Helper · Tasks v2 — hourly recurrence + timestamp due + richer fields
-- Run once in the Supabase SQL editor (after tasks.sql).

-- 1. Allow the 'hour' unit ---------------------------------------------------
alter table public.tasks drop constraint if exists tasks_recur_unit_check;
alter table public.tasks add constraint tasks_recur_unit_check
  check (recur_unit in ('none','hour','day','week','month'));

-- 2. Track due as a timestamp (supports hourly), backfilled from due_date ----
alter table public.tasks add column if not exists due_at timestamptz;
update public.tasks
  set due_at = (due_date::timestamptz)
  where due_at is null and due_date is not null;

-- 3. Rewrite the write RPCs to use due_at ------------------------------------
create or replace function public.add_task(p_passcode text, p_task jsonb)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.tasks (title, notes, recur_unit, recur_n, due_at, done)
  values (
    coalesce(nullif(trim(p_task->>'title'), ''), 'Untitled'),
    nullif(p_task->>'notes', ''),
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
    notes      = case when p_task ? 'notes'  then nullif(p_task->>'notes', '') else notes end,
    recur_unit = coalesce(p_task->>'recur_unit', recur_unit),
    recur_n    = coalesce((p_task->>'recur_n')::int, recur_n),
    due_at     = case when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz else due_at end,
    done       = coalesce((p_task->>'done')::boolean, done)
  where id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

create or replace function public.complete_task(p_passcode text, p_id uuid)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  if r.recur_unit = 'none' then
    update public.tasks set done = true, last_done_at = now()
    where id = p_id returning * into r;
  else
    update public.tasks set
      last_done_at = now(),
      done = false,
      due_at = greatest(coalesce(due_at, now()), now())
               + (recur_n || ' ' || recur_unit)::interval
    where id = p_id returning * into r;
  end if;
  return r;
end $$;
