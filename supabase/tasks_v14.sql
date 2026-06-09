-- Thansen Verktøykasse · Tasks v14 — staff status (vaktstyring)
-- Register employees as Pause/Lunsj/Ærend/Kurs (timed) or Syk/Ferie/Fri (all-day),
-- per day. One table feeds both the weekly planner and the sidebar "now" status.
-- Access: any logged-in user may set/clear their OWN status; manager/dev anyone's.
-- Run after tasks_v7.sql (uses account_role). Reading is open like tasks/notes.

create table if not exists public.staff_status (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  kind text not null check (kind in ('pause','lunsj','arend','kurs','syk','ferie','fri')),
  day date not null,
  start_min int,                -- minutes from midnight (timed); null for all-day
  dur_min int,                  -- duration in minutes (timed); null for all-day
  all_day boolean not null default false,
  author text,
  created_at timestamptz not null default now()
);
create index if not exists staff_status_day_idx on public.staff_status (day);

alter table public.staff_status enable row level security;
drop policy if exists staff_status_read on public.staff_status;
create policy staff_status_read on public.staff_status for select using (true);
grant select on public.staff_status to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='staff_status')
  then execute 'alter publication supabase_realtime add table public.staff_status'; end if; end $$;

-- Set a status. All-day kinds replace the person's other rows that day (Syk wins).
-- Timed kinds are simply added (a person can have several timed blocks per day).
create or replace function public.set_staff_status(
  p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_day date, p_start_min int, p_dur_min int)
returns public.staff_status language plpgsql security definer set search_path = public as $$
declare role text; rec public.staff_status;
begin
  role := public.account_role(p_auth_tag, p_auth_pw);
  if role is null then raise exception 'Logg inn for å sette status'; end if;
  if upper(p_tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun Butikksjef kan sette status for andre'; end if;
  if p_kind not in ('pause','lunsj','arend','kurs','syk','ferie','fri') then raise exception 'Ugyldig status'; end if;
  if p_kind in ('syk','ferie','fri') then
    delete from public.staff_status where tag = upper(p_tag) and day = p_day;
    insert into public.staff_status (tag, kind, day, all_day, author)
      values (upper(p_tag), p_kind, p_day, true, upper(p_auth_tag)) returning * into rec;
  else
    insert into public.staff_status (tag, kind, day, start_min, dur_min, all_day, author)
      values (upper(p_tag), p_kind, p_day, greatest(0, least(1439, coalesce(p_start_min,0))),
              least(1440, greatest(5, coalesce(p_dur_min,15))), false, upper(p_auth_tag)) returning * into rec;
  end if;
  return rec;
end $$;

create or replace function public.delete_staff_status(p_auth_tag text, p_auth_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare role text; rec public.staff_status;
begin
  role := public.account_role(p_auth_tag, p_auth_pw);
  if role is null then raise exception 'Logg inn'; end if;
  select * into rec from public.staff_status where id = p_id;
  if not found then return; end if;
  if upper(rec.tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun egen status eller Butikksjef kan fjerne'; end if;
  delete from public.staff_status where id = p_id;
end $$;

grant execute on function public.set_staff_status(text,text,text,text,date,int,int) to anon, authenticated;
grant execute on function public.delete_staff_status(text,text,uuid)                 to anon, authenticated;
