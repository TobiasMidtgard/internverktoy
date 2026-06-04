-- Thansen Verktøykasse · Tasks v4 — open cross-off (no passcode)
-- Lets anyone tick a task / checklist item done; add/edit/delete stay admin-only.
-- Run once in the Supabase SQL editor (after tasks.sql, _v2, _v3).

-- Mark a task done / not-done. Recurring tasks roll their due_at forward on completion.
create or replace function public.set_done(p_id uuid, p_done boolean)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  if p_done then
    if r.recur_unit = 'none' then
      update public.tasks set done = true, last_done_at = now()
      where id = p_id returning * into r;
    else
      update public.tasks set
        last_done_at = now(), done = false,
        due_at = greatest(coalesce(due_at, now()), now()) + (recur_n || ' ' || recur_unit)::interval
      where id = p_id returning * into r;
    end if;
  else
    update public.tasks set done = false where id = p_id returning * into r;
  end if;
  return r;
end $$;

-- Flip the ci-th "- [ ] / - [x]" checkbox inside a task's description (notes).
create or replace function public.toggle_check(p_id uuid, p_ci int)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare r public.tasks; lines text[]; i int; cnt int := -1;
begin
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  if r.notes is null then return r; end if;
  lines := string_to_array(r.notes, E'\n');
  for i in 1 .. coalesce(array_length(lines, 1), 0) loop
    if lines[i] ~ '^\s*[-*]\s+\[[ xX]\]\s+' then
      cnt := cnt + 1;
      if cnt = p_ci then
        if lines[i] ~ '\[[xX]\]'
          then lines[i] := regexp_replace(lines[i], '\[[xX]\]', '[ ]');
          else lines[i] := regexp_replace(lines[i], '\[ \]', '[x]');
        end if;
      end if;
    end if;
  end loop;
  update public.tasks set notes = array_to_string(lines, E'\n') where id = p_id returning * into r;
  return r;
end $$;

grant execute on function public.set_done(uuid, boolean) to anon, authenticated;
grant execute on function public.toggle_check(uuid, int) to anon, authenticated;
