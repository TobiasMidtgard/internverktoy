-- Thansen Verktøykasse · Tasks v5 — board/planner: status, priority, multi-assignee, coworkers
-- Run once in the Supabase SQL editor (after tasks.sql, _v2, _v3, _v4).

-- 1. New task columns -------------------------------------------------------
alter table public.tasks add column if not exists status    text   not null default 'todo';
alter table public.tasks add column if not exists priority  text   not null default 'medium';
alter table public.tasks add column if not exists assignees text[] not null default '{}';

-- carry the old single assignee into the array
update public.tasks set assignees = array[assignee]
  where assignee is not null and coalesce(array_length(assignees,1),0) = 0;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add  constraint tasks_status_check   check (status   in ('todo','progress','review','done'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add  constraint tasks_priority_check check (priority in ('low','medium','high'));

-- keep done in sync with status for any legacy rows
update public.tasks set done = (status = 'done');

-- 2. Coworkers (4-letter codes, colours) ------------------------------------
create table if not exists public.coworkers (
  tag        text primary key,
  name       text not null,
  color      text not null default '#004595',
  role       text not null default 'coworker',
  created_at timestamptz not null default now()
);
alter table public.coworkers enable row level security;
drop policy if exists coworkers_read on public.coworkers;
create policy coworkers_read on public.coworkers for select using (true);
grant select on public.coworkers to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='coworkers')
  then execute 'alter publication supabase_realtime add table public.coworkers'; end if;
end $$;

insert into public.coworkers (tag,name,color,role) values
  ('SJEF','Butikksjef','#004595','admin'),
  ('MORT','Morten Hansen','#e30613','coworker'),
  ('EMIL','Emil Sætre','#10b981','coworker'),
  ('KRIS','Kristin Berg','#f59e0b','coworker')
on conflict (tag) do nothing;

-- 3. Write RPCs (admin) — add/update now handle status/priority/assignees ----
create or replace function public.add_task(p_passcode text, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.tasks (title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done)
  values (
    coalesce(nullif(trim(p_task->>'title'), ''), 'Untitled'),
    nullif(p_task->>'notes', ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x), '{}'),
    coalesce(p_task->>'recur_unit', 'none'),
    coalesce((p_task->>'recur_n')::int, 1),
    (p_task->>'due_at')::timestamptz,
    coalesce(p_task->>'status', 'todo'),
    coalesce(p_task->>'priority', 'medium'),
    coalesce(p_task->>'status','todo') = 'done'
  ) returning * into r;
  return r;
end $$;

create or replace function public.update_task(p_passcode text, p_id uuid, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  update public.tasks set
    title      = coalesce(nullif(trim(p_task->>'title'), ''), title),
    notes      = case when p_task ? 'notes'     then nullif(p_task->>'notes', '') else notes end,
    assignees  = case when p_task ? 'assignees' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_task->'assignees') as x), '{}') else assignees end,
    recur_unit = coalesce(p_task->>'recur_unit', recur_unit),
    recur_n    = coalesce((p_task->>'recur_n')::int, recur_n),
    due_at     = case when p_task ? 'due_at'    then (p_task->>'due_at')::timestamptz else due_at end,
    status     = coalesce(p_task->>'status', status),
    priority   = coalesce(p_task->>'priority', priority),
    done       = case when p_task ? 'status'    then (p_task->>'status') = 'done' else done end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- assignment is admin-only
create or replace function public.set_assignees(p_passcode text, p_id uuid, p_assignees jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  update public.tasks
    set assignees = coalesce((select array_agg(x) from jsonb_array_elements_text(p_assignees) as x), '{}')
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- 4. Status change — OPEN (colleagues can move their cards without admin) -----
create or replace function public.set_status(p_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if p_status not in ('todo','progress','review','done') then raise exception 'bad status'; end if;
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  if p_status = 'done' and r.recur_unit <> 'none' then
    update public.tasks set
      last_done_at = now(), status = 'todo', done = false,
      due_at = greatest(coalesce(due_at, now()), now()) + (recur_n || ' ' || recur_unit)::interval
    where id = p_id returning * into r;
  else
    update public.tasks set
      status = p_status, done = (p_status = 'done'),
      last_done_at = case when p_status = 'done' then now() else last_done_at end
    where id = p_id returning * into r;
  end if;
  return r;
end $$;

-- 5. Coworker CRUD (admin) ---------------------------------------------------
create or replace function public.add_coworker(p_passcode text, p_tag text, p_name text, p_color text)
returns public.coworkers language plpgsql security definer set search_path = public as $$
declare r public.coworkers;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.coworkers (tag, name, color)
  values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'), coalesce(nullif(p_color,''),'#004595'))
  returning * into r;
  return r;
end $$;

create or replace function public.delete_coworker(p_passcode text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  delete from public.coworkers where tag = upper(p_tag);
end $$;

grant execute on function public.set_assignees(text, uuid, jsonb)        to anon, authenticated;
grant execute on function public.set_status(uuid, text)                  to anon, authenticated;
grant execute on function public.add_coworker(text, text, text, text)    to anon, authenticated;
grant execute on function public.delete_coworker(text, text)             to anon, authenticated;
