-- Thansen Helper · Tasks tool migration
-- Run once in the Supabase SQL editor. Reuses the existing verify_passcode().

-- 1. Table -------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  notes        text,
  recur_unit   text not null default 'none'
                 check (recur_unit in ('none','day','week','month')),
  recur_n      int  not null default 1 check (recur_n >= 1),
  due_date     date,
  done         boolean not null default false,
  last_done_at timestamptz,
  created_at   timestamptz not null default now()
);

-- 2. RLS: anyone can read; writes only through the RPCs below ----------------
alter table public.tasks enable row level security;
drop policy if exists tasks_public_read on public.tasks;
create policy tasks_public_read on public.tasks for select using (true);

grant select on public.tasks to anon, authenticated;

-- 3. Realtime (idempotent) ---------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
end $$;

-- 4. Passcode-gated write RPCs (SECURITY DEFINER) ----------------------------
create or replace function public.add_task(p_passcode text, p_task jsonb)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.tasks (title, notes, recur_unit, recur_n, due_date, done)
  values (
    coalesce(nullif(trim(p_task->>'title'), ''), 'Untitled'),
    nullif(p_task->>'notes', ''),
    coalesce(p_task->>'recur_unit', 'none'),
    coalesce((p_task->>'recur_n')::int, 1),
    (p_task->>'due_date')::date,
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
    notes      = case when p_task ? 'notes'    then nullif(p_task->>'notes', '') else notes end,
    recur_unit = coalesce(p_task->>'recur_unit', recur_unit),
    recur_n    = coalesce((p_task->>'recur_n')::int, recur_n),
    due_date   = case when p_task ? 'due_date' then (p_task->>'due_date')::date  else due_date end,
    done       = coalesce((p_task->>'done')::boolean, done)
  where id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- Recurrence-aware completion: one-off -> done; recurring -> roll due_date forward
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
      due_date = (greatest(coalesce(due_date, current_date), current_date)
                  + (recur_n || ' ' || recur_unit)::interval)::date
    where id = p_id returning * into r;
  end if;
  return r;
end $$;

create or replace function public.delete_task(p_passcode text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  delete from public.tasks where id = p_id;
end $$;

grant execute on function public.add_task(text, jsonb)        to anon, authenticated;
grant execute on function public.update_task(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.complete_task(text, uuid)    to anon, authenticated;
grant execute on function public.delete_task(text, uuid)      to anon, authenticated;
