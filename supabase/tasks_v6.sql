-- Thansen Verktøykasse · Tasks v6 — coworker job title + profile editing
-- Run once in the Supabase SQL editor (after tasks_v5.sql).

alter table public.coworkers add column if not exists title text not null default 'Butikkmedarbeider';

create or replace function public.add_coworker(p_passcode text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers language plpgsql security definer set search_path = public as $$
declare r public.coworkers;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  insert into public.coworkers (tag, name, color, title)
  values (upper(p_tag),
          coalesce(nullif(trim(p_name),''),'Ansatt'),
          coalesce(nullif(p_color,''),'#004595'),
          coalesce(nullif(p_title,''),'Butikkmedarbeider'))
  returning * into r;
  return r;
end $$;

create or replace function public.update_coworker(p_passcode text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers language plpgsql security definer set search_path = public as $$
declare r public.coworkers;
begin
  if not public.verify_passcode(p_passcode) then raise exception 'Invalid passcode'; end if;
  update public.coworkers set
    name  = coalesce(nullif(trim(p_name),''), name),
    color = coalesce(nullif(p_color,''), color),
    title = coalesce(nullif(p_title,''), title)
  where tag = upper(p_tag)
  returning * into r;
  if not found then raise exception 'Coworker not found'; end if;
  return r;
end $$;

grant execute on function public.add_coworker(text,text,text,text,text)    to anon, authenticated;
grant execute on function public.update_coworker(text,text,text,text,text) to anon, authenticated;
