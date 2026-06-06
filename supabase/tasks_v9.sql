-- Thansen Verktøykasse · Tasks v9 — fjern 'review' (Godkjenning) fra statusflyten
update public.tasks set status = 'progress' where status = 'review';
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add  constraint tasks_status_check check (status in ('todo','progress','done'));

create or replace function public.set_status(p_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if p_status not in ('todo','progress','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status, done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;
grant execute on function public.set_status(uuid, text) to anon, authenticated;
