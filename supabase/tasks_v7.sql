-- Thansen Verktøykasse · Tasks v7 — user accounts, roles, planner notes
-- Run once in the Supabase SQL editor (after tasks_v6.sql).
-- Roles: 'dev' (IT, highest) > 'manager' (Butikksjef) > 'coworker'.

create extension if not exists pgcrypto with schema extensions;

-- 1. Accounts on the coworkers table --------------------------------------
alter table public.coworkers add column if not exists pass_hash text;
update public.coworkers set role = 'manager' where role = 'admin';

-- TMID = IT/dev, above everyone (claims a password via register)
insert into public.coworkers (tag,name,color,title,role)
values ('TMID','Tobias (IT)','#7c3aed','BCT','dev')
on conflict (tag) do update set role = 'dev';

-- never expose the hash through the public REST view
revoke select on public.coworkers from anon, authenticated;
drop view if exists public.coworkers_public;
create view public.coworkers_public
  with (security_invoker = off) as
  select tag, name, color, title, role, created_at,
         (pass_hash is not null) as has_account
  from public.coworkers;
grant select on public.coworkers_public to anon, authenticated;

-- 2. Auth helpers ----------------------------------------------------------
create or replace function public.account_role(p_tag text, p_password text)
returns text language sql security definer set search_path = public, extensions as $$
  select role from public.coworkers
  where tag = upper(p_tag) and pass_hash is not null and pass_hash = crypt(p_password, pass_hash);
$$;

create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text)
returns public.coworkers_public language plpgsql security definer set search_path = public, extensions as $$
declare r public.coworkers_public; ex public.coworkers;
begin
  if char_length(upper(p_tag)) <> 4 then raise exception 'Koden må være 4 tegn'; end if;
  if length(coalesce(p_password,'')) < 4 then raise exception 'Passord må ha minst 4 tegn'; end if;
  select * into ex from public.coworkers where tag = upper(p_tag);
  if found then
    if ex.pass_hash is not null then raise exception 'Det finnes allerede en konto for denne koden'; end if;
    update public.coworkers set
      pass_hash = crypt(p_password, gen_salt('bf')),
      name = coalesce(nullif(trim(p_name),''), name),
      title = coalesce(nullif(p_title,''), title),
      color = coalesce(nullif(p_color,''), color)
    where tag = upper(p_tag);
  else
    insert into public.coworkers (tag,name,color,title,role,pass_hash)
    values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
            coalesce(nullif(p_color,''),'#004595'), coalesce(nullif(p_title,''),'Butikkmedarbeider'),
            'coworker', crypt(p_password, gen_salt('bf')));
  end if;
  select * into r from public.coworkers_public where tag = upper(p_tag);
  return r;
end $$;

create or replace function public.login_account(p_tag text, p_password text)
returns public.coworkers_public language plpgsql security definer set search_path = public, extensions as $$
declare r public.coworkers_public;
begin
  if public.account_role(p_tag,p_password) is null then raise exception 'Feil kode eller passord'; end if;
  select * into r from public.coworkers_public where tag = upper(p_tag);
  return r;
end $$;

create or replace function public.change_password(p_tag text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.account_role(p_tag,p_old) is null then raise exception 'Feil nåværende passord'; end if;
  if length(coalesce(p_new,'')) < 4 then raise exception 'Nytt passord må ha minst 4 tegn'; end if;
  update public.coworkers set pass_hash = crypt(p_new, gen_salt('bf')) where tag = upper(p_tag);
end $$;

-- only dev may change roles
create or replace function public.set_role(p_auth_tag text, p_auth_pw text, p_target text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.account_role(p_auth_tag,p_auth_pw) <> 'dev' then raise exception 'Krever IT-tilgang'; end if;
  if p_role not in ('coworker','manager','dev') then raise exception 'Ugyldig rolle'; end if;
  update public.coworkers set role = p_role where tag = upper(p_target);
end $$;

-- 3. Rebuild management RPCs with account auth (manager+) -------------------
drop function if exists public.add_task(text, jsonb);
drop function if exists public.update_task(text, uuid, jsonb);
drop function if exists public.delete_task(text, uuid);
drop function if exists public.set_assignees(text, uuid, jsonb);
drop function if exists public.add_coworker(text, text, text, text);
drop function if exists public.add_coworker(text, text, text, text, text);
drop function if exists public.update_coworker(text, text, text, text, text);
drop function if exists public.delete_coworker(text, text);

create or replace function public._require_manager(p_auth_tag text, p_auth_pw text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.account_role(p_auth_tag,p_auth_pw),'') not in ('manager','dev')
  then raise exception 'Krever butikksjef-tilgang'; end if;
end $$;

create or replace function public.add_task(p_auth_tag text, p_auth_pw text, p_task jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.tasks (title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done)
  values (coalesce(nullif(trim(p_task->>'title'),''),'Untitled'), nullif(p_task->>'notes',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x),'{}'),
    coalesce(p_task->>'recur_unit','none'), coalesce((p_task->>'recur_n')::int,1), (p_task->>'due_at')::timestamptz,
    coalesce(p_task->>'status','todo'), coalesce(p_task->>'priority','medium'), coalesce(p_task->>'status','todo')='done')
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
    done=case when p_task ? 'status' then (p_task->>'status')='done' else done end
  where id=p_id returning * into r;
  if not found then raise exception 'Task not found'; end if; return r;
end $$;

create or replace function public.delete_task(p_auth_tag text, p_auth_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.tasks where id=p_id; end $$;

create or replace function public.set_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_assignees jsonb)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.tasks set assignees=coalesce((select array_agg(x) from jsonb_array_elements_text(p_assignees) as x),'{}')
  where id=p_id returning * into r;
  if not found then raise exception 'Task not found'; end if; return r;
end $$;

create or replace function public.add_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers_public language plpgsql security definer set search_path = public as $$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.coworkers (tag,name,color,title) values (upper(p_tag),
    coalesce(nullif(trim(p_name),''),'Ansatt'), coalesce(nullif(p_color,''),'#004595'),
    coalesce(nullif(p_title,''),'Butikkmedarbeider'));
  select * into r from public.coworkers_public where tag=upper(p_tag);
  return r;
end $$;

create or replace function public.update_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers_public language plpgsql security definer set search_path = public as $$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.coworkers set name=coalesce(nullif(trim(p_name),''),name), color=coalesce(nullif(p_color,''),color),
    title=coalesce(nullif(p_title,''),title) where tag=upper(p_tag);
  if not found then raise exception 'Coworker not found'; end if;
  select * into r from public.coworkers_public where tag=upper(p_tag);
  return r;
end $$;

create or replace function public.delete_coworker(p_auth_tag text, p_auth_pw text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.coworkers where tag=upper(p_tag); end $$;

-- 4. Planner notes ---------------------------------------------------------
create table if not exists public.planner_notes (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),  -- 0=Mon … 6=Sun
  body text not null,
  color text not null default '#ffd400',
  author text,
  created_at timestamptz not null default now()
);
alter table public.planner_notes enable row level security;
drop policy if exists planner_notes_read on public.planner_notes;
create policy planner_notes_read on public.planner_notes for select using (true);
grant select on public.planner_notes to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='planner_notes')
  then execute 'alter publication supabase_realtime add table public.planner_notes'; end if; end $$;

create or replace function public.add_planner_note(p_auth_tag text, p_auth_pw text, p_weekday int, p_body text, p_color text)
returns public.planner_notes language plpgsql security definer set search_path = public as $$
declare r public.planner_notes;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å legge igjen notat'; end if;
  insert into public.planner_notes (weekday, body, color, author)
  values (p_weekday, coalesce(nullif(trim(p_body),''),'…'), coalesce(nullif(p_color,''),'#ffd400'), upper(p_auth_tag))
  returning * into r; return r;
end $$;

create or replace function public.delete_planner_note(p_auth_tag text, p_auth_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare role text; note public.planner_notes;
begin
  role := public.account_role(p_auth_tag,p_auth_pw);
  if role is null then raise exception 'Logg inn'; end if;
  select * into note from public.planner_notes where id=p_id;
  if not found then return; end if;
  if note.author <> upper(p_auth_tag) and role not in ('manager','dev') then raise exception 'Kun forfatter eller leder kan slette'; end if;
  delete from public.planner_notes where id=p_id;
end $$;

grant execute on function public.account_role(text,text)                         to anon, authenticated;
grant execute on function public.register_account(text,text,text,text,text)      to anon, authenticated;
grant execute on function public.login_account(text,text)                        to anon, authenticated;
grant execute on function public.change_password(text,text,text)                 to anon, authenticated;
grant execute on function public.set_role(text,text,text,text)                   to anon, authenticated;
grant execute on function public.add_task(text,text,jsonb)                       to anon, authenticated;
grant execute on function public.update_task(text,text,uuid,jsonb)               to anon, authenticated;
grant execute on function public.delete_task(text,text,uuid)                     to anon, authenticated;
grant execute on function public.set_assignees(text,text,uuid,jsonb)             to anon, authenticated;
grant execute on function public.add_coworker(text,text,text,text,text,text)     to anon, authenticated;
grant execute on function public.update_coworker(text,text,text,text,text,text)  to anon, authenticated;
grant execute on function public.delete_coworker(text,text,text)                 to anon, authenticated;
grant execute on function public.add_planner_note(text,text,int,text,text)       to anon, authenticated;
grant execute on function public.delete_planner_note(text,text,uuid)             to anon, authenticated;
