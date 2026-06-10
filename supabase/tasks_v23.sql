-- Thansen Verktøykasse · Tasks v23 — dags-tildelinger: flytt med datoen, atomiske endringer
-- Audit 2026-06-09, punkt 11 (P1): (a) flyttet man fristen på en engangsoppgave ble
-- tildelingen stående på den gamle datoen og «forsvant»; (b) drag-drop/fjern bygde hele
-- dagslista fra klient-state — to samtidige endringer mistet den ene (last write wins).
-- Nå migrerer update_task tildelingen til ny dato, og add/remove skjer atomisk på serveren.

-- 1. update_task: flytter day_assignees-nøkkelen når fristen på en engangsoppgave endres
create or replace function public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; old_key text; new_key text; merged jsonb;
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
  return r;
end $$;

-- 2. Atomisk legg-til av én ansvarlig på én dag (immun mot samtidige endringer)
create or replace function public.add_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  if not exists (select 1 from public.coworkers where tag = upper(p_tag)) then
    raise exception 'Ukjent ansattkode: %', upper(p_tag);
  end if;
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || jsonb_build_object(k,
         (select jsonb_agg(distinct v) from (
            select jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) as v
            union select upper(p_tag)) s))
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- 3. Atomisk fjerning av én ansvarlig på én dag
create or replace function public.remove_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || case when exists (select 1 from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                         where v <> upper(p_tag))
            then jsonb_build_object(k,
                   (select jsonb_agg(v) from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                    where v <> upper(p_tag)))
            else '{}'::jsonb end
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

grant execute on function public.add_day_assignee(text,text,uuid,date,text)    to anon, authenticated;
grant execute on function public.remove_day_assignee(text,text,uuid,date,text) to anon, authenticated;
