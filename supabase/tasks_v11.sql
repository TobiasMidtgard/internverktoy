-- Thansen Verktøykasse · Tasks v11 — auto-flytt uutførte engangsoppgaver til i dag
-- Ikke-kritiske (priority <> 'high') engangsoppgaver som ikke er gjort og har
-- forfall før i dag, flyttes til i dag (samme klokkeslett). Kritiske blir stående
-- som "må gjøres" til de utføres. (Europe/Oslo.)
create or replace function public.rollover_incomplete()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with upd as (
    update public.tasks set
      due_at = (((now() at time zone 'Europe/Oslo')::date
                 + (due_at at time zone 'Europe/Oslo')::time) at time zone 'Europe/Oslo')
    where recur_unit = 'none' and status <> 'done' and priority <> 'high' and due_at is not null
      and (due_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date
    returning 1
  ) select count(*) into n from upd; return n;
end $$;
grant execute on function public.rollover_incomplete() to anon, authenticated;
