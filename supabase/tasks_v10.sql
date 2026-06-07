-- Thansen Verktøykasse · Tasks v10 — varighet (duration_min) på oppgaver
alter table public.tasks add column if not exists duration_min int not null default 30;

create or replace function public.add_task(p_auth_tag text, p_auth_pw text, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.tasks (title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done, duration_min)
  values (coalesce(nullif(trim(p_task->>'title'),''),'Untitled'), nullif(p_task->>'notes',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x),'{}'),
    coalesce(p_task->>'recur_unit','none'), coalesce((p_task->>'recur_n')::int,1), (p_task->>'due_at')::timestamptz,
    coalesce(p_task->>'status','todo'), coalesce(p_task->>'priority','medium'), coalesce(p_task->>'status','todo')='done',
    coalesce((p_task->>'duration_min')::int, 30))
  returning * into r; return r;
end $$;

create or replace function public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.tasks set
    title=coalesce(nullif(trim(p_task->>'title'),''),title),
    notes=case when p_task ? 'notes' then nullif(p_task->>'notes','') else notes end,
    assignees=case when p_task ? 'assignees' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_task->'assignees') as x),'{}') else assignees end,
    recur_unit=coalesce(p_task->>'recur_unit',recur_unit), recur_n=coalesce((p_task->>'recur_n')::int,recur_n),
    due_at=case when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz else due_at end,
    status=coalesce(p_task->>'status',status), priority=coalesce(p_task->>'priority',priority),
    done=case when p_task ? 'status' then (p_task->>'status')='done' else done end,
    duration_min=case when p_task ? 'duration_min' then (p_task->>'duration_min')::int else duration_min end
  where id=p_id returning * into r;
  if not found then raise exception 'Task not found'; end if; return r;
end $$;
